"use client";

import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Loader2,
  MoveHorizontal,
  RefreshCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";
import { getFileUrl } from "./api-client";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

/**
 * Viewer for the ORIGINAL document, loaded through a short-lived signed URL.
 * PDFs are rendered with pdf.js on a canvas (no browser plug-in, no frames);
 * the page container is positioned so that future field highlights (bounding
 * boxes from the extraction) can be overlaid in page coordinates.
 */
export function DocumentViewer({ documentId, mimeType }: { documentId: string; mimeType: string | null }) {
  const { t } = useI18n();
  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = `${documentId}:${reloadKey}`;
  const [result, setResult] = useState<{ key: string; url: string | null; error: boolean } | null>(null);
  const [actionError, setActionError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getFileUrl(documentId)
      .then((res) => !cancelled && setResult({ key: requestKey, url: res.url, error: false }))
      .catch(() => !cancelled && setResult({ key: requestKey, url: null, error: true }));
    return () => {
      cancelled = true;
    };
  }, [documentId, requestKey]);

  const current = result?.key === requestKey ? result : null;
  const url = current?.url ?? null;
  const error = actionError || Boolean(current?.error);
  const setError = (value: boolean) => setActionError(value);

  const download = async () => {
    try {
      const res = await getFileUrl(documentId, true);
      window.location.assign(res.url);
    } catch {
      setError(true);
    }
  };
  const openNew = async () => {
    try {
      const res = await getFileUrl(documentId);
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch {
      setError(true);
    }
  };

  const toolbarExtras = (
    <>
      <Button variant="ghost" size="icon-sm" onClick={openNew} aria-label={t("common.open")} title={t("common.open")}>
        <ExternalLink />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={download} aria-label={t("common.download")} title={t("common.download")}>
        <Download />
      </Button>
    </>
  );

  if (error) {
    return (
      <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">{t("review.viewerUnavailable")}</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setActionError(false);
            setReloadKey((k) => k + 1);
          }}
        >
          <RefreshCw /> {t("common.retry")}
        </Button>
      </div>
    );
  }
  if (!url) {
    return (
      <div className="flex h-full min-h-64 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label={t("common.loading")} />
      </div>
    );
  }
  if (mimeType === "application/pdf") {
    return <PdfViewer url={url} toolbarExtras={toolbarExtras} onError={() => setError(true)} />;
  }
  if (mimeType === "image/tiff") {
    // Most browsers cannot display TIFF natively.
    return (
      <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">{t("review.viewerUnavailable")}</p>
        <Button variant="secondary" size="sm" onClick={download}>
          <Download /> {t("common.download")}
        </Button>
      </div>
    );
  }
  return <ImageViewer url={url} toolbarExtras={toolbarExtras} onError={() => setError(true)} />;
}

function Toolbar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border bg-surface px-2 py-1.5">{children}</div>
  );
}

function ZoomControls({ zoom, setZoom, onFit }: { zoom: number; setZoom: (z: number) => void; onFit: () => void }) {
  const { t } = useI18n();
  return (
    <>
      <Button variant="ghost" size="icon-sm" onClick={() => setZoom(Math.max(MIN_ZOOM, zoom / 1.2))} aria-label="Zoom −">
        <ZoomOut />
      </Button>
      <span className="tabular w-12 text-center text-xs text-muted-foreground">{Math.round(zoom * 100)}%</span>
      <Button variant="ghost" size="icon-sm" onClick={() => setZoom(Math.min(MAX_ZOOM, zoom * 1.2))} aria-label="Zoom +">
        <ZoomIn />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={onFit} aria-label={t("common.view")} title="Fit width">
        <MoveHorizontal />
      </Button>
    </>
  );
}

function PdfViewer({ url, toolbarExtras, onError }: { url: string; toolbarExtras: React.ReactNode; onError: () => void }) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTask = useRef<RenderTask | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState<number | null>(null); // null = fit width
  const [effectiveZoom, setEffectiveZoom] = useState(1);
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: { destroy: () => Promise<void> } | null = null;
    (async () => {
      try {
        // Legacy build: broader browser support (older Safari/Chromium versions).
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const task = pdfjs.getDocument({ url });
        loadingTask = task;
        const loaded = await task.promise;
        if (cancelled) return;
        setPdf(loaded);
        setPage(1);
      } catch {
        if (!cancelled) onError();
      }
    })();
    return () => {
      cancelled = true;
      void loadingTask?.destroy();
    };
  }, [url, onError]);

  const render = useCallback(async () => {
    if (!pdf || !canvasRef.current || !containerRef.current) return;
    setRendering(true);
    try {
      const pdfPage = await pdf.getPage(page);
      const base = pdfPage.getViewport({ scale: 1 });
      const available = containerRef.current.clientWidth - 32;
      const scale = zoom ?? Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, available / base.width));
      setEffectiveZoom(scale);
      const viewport = pdfPage.getViewport({ scale });
      const ratio = window.devicePixelRatio || 1;
      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      renderTask.current?.cancel();
      const task = pdfPage.render({
        canvas,
        viewport,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
      });
      renderTask.current = task;
      await task.promise;
    } catch (error) {
      if ((error as { name?: string }).name !== "RenderingCancelledException") onError();
    } finally {
      setRendering(false);
    }
  }, [pdf, page, zoom, onError]);

  useEffect(() => {
    void render();
  }, [render]);

  useEffect(() => {
    if (zoom !== null || !containerRef.current) return;
    const observer = new ResizeObserver(() => void render());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [zoom, render]);

  const pageCount = pdf?.numPages ?? 0;
  return (
    <div className="flex h-full flex-col">
      <Toolbar>
        <Button variant="ghost" size="icon-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label={t("common.previous")}>
          <ChevronLeft />
        </Button>
        <span className="tabular min-w-20 text-center text-xs text-muted-foreground">
          {pageCount ? t("common.page", { page, total: pageCount }) : "…"}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={page >= pageCount}
          onClick={() => setPage((p) => p + 1)}
          aria-label={t("common.next")}
        >
          <ChevronRight />
        </Button>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <ZoomControls zoom={effectiveZoom} setZoom={(z) => setZoom(z)} onFit={() => setZoom(null)} />
        <span className="flex-1" />
        {rendering ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden /> : null}
        {toolbarExtras}
      </Toolbar>
      <div ref={containerRef} className="flex-1 overflow-auto bg-muted/60 p-4">
        <div className="relative mx-auto w-fit shadow-md">
          <canvas ref={canvasRef} className="block bg-white" aria-label={t("review.original")} role="img" />
        </div>
      </div>
    </div>
  );
}

function ImageViewer({ url, toolbarExtras, onError }: { url: string; toolbarExtras: React.ReactNode; onError: () => void }) {
  const { t } = useI18n();
  const [zoom, setZoom] = useState<number | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(600);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setContainerWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const available = containerWidth - 32;
  const fit = natural ? Math.min(MAX_ZOOM, available / natural.w) : 1;
  const scale = zoom ?? fit;

  return (
    <div className="flex h-full flex-col">
      <Toolbar>
        <ZoomControls zoom={scale} setZoom={(z) => setZoom(z)} onFit={() => setZoom(null)} />
        <span className="flex-1" />
        {toolbarExtras}
      </Toolbar>
      <div ref={containerRef} className="flex-1 overflow-auto bg-muted/60 p-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL of a private file */}
        <img
          src={url}
          alt={t("review.original")}
          onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          onError={onError}
          className="mx-auto block max-w-none bg-white shadow-md"
          style={natural ? { width: natural.w * scale, height: natural.h * scale } : { maxWidth: "100%" }}
        />
      </div>
    </div>
  );
}
