"use client";

import {
  Camera,
  CameraOff,
  ExternalLink,
  ImageUp,
  Loader2,
  RotateCcw,
  ScanLine,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTenant } from "@/components/tenant/tenant-provider";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DocumentChat } from "@/features/assistant/document-chat";
import { DocumentStatusBadge } from "@/features/documents/status-badge";
import { looksLikeAtQr } from "@/lib/documents/at-qrcode";
import { formatBusinessDate } from "@/lib/dates";
import { useI18n } from "@/lib/i18n/client";
import { formatMoney } from "@/lib/money";
import { lookupQrAction } from "./actions";

type LookupResult = Awaited<ReturnType<typeof lookupQrAction>>;
type Phase = "idle" | "starting" | "scanning" | "checking" | "result";

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

const SCAN_INTERVAL_MS = 200;

async function decodeWithJsQr(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxSide: number,
) {
  const { default: jsQR } = await import("jsqr");
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  return jsQR(data, w, h, { inversionAttempts: "attemptBoth" })?.data ?? null;
}

/**
 * Camera QR scanner for paper invoices. Uses the native BarcodeDetector when
 * available (Android/Chrome) and jsQR otherwise (iOS Safari, desktop). The
 * decoded payload is checked again on the server before any lookup.
 */
export function QrScanner() {
  const { t, locale } = useI18n();
  const { slug, href } = useTenant();
  const videoRef = useRef<HTMLVideoElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);

  const stopCamera = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const handlePayload = useCallback(
    async (payload: string) => {
      stopCamera();
      navigator.vibrate?.(60);
      setPhase("checking");
      setMessage(null);
      const lookup = await lookupQrAction(slug, payload);
      setResult(lookup);
      setPhase("result");
    },
    [slug, stopCamera],
  );

  // The scan loop re-schedules itself through a ref so each tick uses the
  // latest callbacks without re-creating the loop.
  const scanFrameRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    scanFrameRef.current = async () => {
      const video = videoRef.current;
      if (!video || !streamRef.current) return;
      if (video.readyState >= 2 && video.videoWidth > 0) {
        let payload: string | null = null;
        try {
          if (detectorRef.current) {
            payload = (await detectorRef.current.detect(video))[0]?.rawValue ?? null;
          } else {
            payload = await decodeWithJsQr(video, video.videoWidth, video.videoHeight, 900);
          }
        } catch {
          payload = null;
        }
        if (payload) {
          if (looksLikeAtQr(payload)) return void handlePayload(payload);
          setMessage(t("scan.notAtQr"));
        }
      }
      timerRef.current = window.setTimeout(() => void scanFrameRef.current(), SCAN_INTERVAL_MS);
    };
  }, [handlePayload, t]);

  const startCamera = async () => {
    setResult(null);
    setMessage(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage(t("scan.cameraUnavailable"));
      return;
    }
    setPhase("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
        .BarcodeDetector;
      detectorRef.current = Detector ? new Detector({ formats: ["qr_code"] }) : null;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setPhase("scanning");
      timerRef.current = window.setTimeout(() => void scanFrameRef.current(), SCAN_INTERVAL_MS);
    } catch (error) {
      stopCamera();
      setPhase("idle");
      const name = (error as { name?: string }).name;
      setMessage(name === "NotAllowedError" ? t("scan.cameraDenied") : t("scan.cameraUnavailable"));
    }
  };

  const scanPhoto = async (file: File) => {
    stopCamera();
    setResult(null);
    setPhase("checking");
    setMessage(null);
    try {
      const bitmap = await createImageBitmap(file);
      const payload =
        (await decodeWithJsQr(bitmap, bitmap.width, bitmap.height, 1600)) ??
        (await decodeWithJsQr(bitmap, bitmap.width, bitmap.height, 900));
      bitmap.close();
      if (!payload) {
        setPhase("idle");
        setMessage(t("scan.noQrInPhoto"));
        return;
      }
      if (!looksLikeAtQr(payload)) {
        setPhase("idle");
        setMessage(t("scan.notAtQr"));
        return;
      }
      await handlePayload(payload);
    } catch {
      setPhase("idle");
      setMessage(t("scan.noQrInPhoto"));
    }
  };

  const reset = () => {
    setResult(null);
    setMessage(null);
    setPhase("idle");
  };

  const money = (value: string | null, currency = "EUR") => formatMoney(value, currency, locale);
  const scanning = phase === "starting" || phase === "scanning";

  return (
    <div className="flex flex-col gap-4">
      {phase !== "result" ? (
        <div className="border-border relative overflow-hidden rounded-xl border bg-slate-950">
          <video
            ref={videoRef}
            playsInline
            muted
            className={scanning ? "aspect-[3/4] w-full object-cover sm:aspect-video" : "hidden"}
          />
          {scanning ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="size-56 rounded-2xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(2,6,23,0.45)]" />
              <p className="absolute right-0 bottom-4 left-0 text-center text-[13px] text-white">
                {phase === "starting" ? t("common.loading") : t("scan.scanning")}
              </p>
            </div>
          ) : (
            <div className="flex aspect-[3/4] flex-col items-center justify-center gap-3 px-6 text-center text-white sm:aspect-video">
              {phase === "checking" ? (
                <Loader2 className="size-8 animate-spin" aria-label={t("common.loading")} />
              ) : (
                <>
                  <ScanLine className="size-10 opacity-80" aria-hidden />
                  <p className="max-w-xs text-sm opacity-80">{t("scan.hint")}</p>
                </>
              )}
            </div>
          )}
        </div>
      ) : null}

      {message ? <Callout tone="warning">{message}</Callout> : null}

      {phase !== "result" ? (
        <div className="flex flex-wrap gap-2">
          {scanning ? (
            <Button
              variant="secondary"
              onClick={() => {
                stopCamera();
                setPhase("idle");
              }}
            >
              <CameraOff /> {t("scan.stopCamera")}
            </Button>
          ) : (
            <Button
              onClick={startCamera}
              disabled={phase === "checking"}
              className="flex-1 sm:flex-none"
            >
              <Camera /> {t("scan.startCamera")}
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => photoRef.current?.click()}
            disabled={phase === "checking"}
          >
            <ImageUp /> {t("scan.takePhoto")}
          </Button>
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            data-testid="qr-photo-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void scanPhoto(file);
              e.target.value = "";
            }}
          />
        </div>
      ) : null}

      {phase === "result" && result ? (
        <div className="flex flex-col gap-4" data-testid="scan-result">
          {result.status === "found" ? (
            <>
              <div className="border-success/30 bg-surface rounded-lg border p-4">
                <p className="text-success mb-2 text-xs font-medium tracking-wide uppercase">
                  {t("scan.found")}
                </p>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold">
                      {result.document.documentNumber ?? "—"}
                    </p>
                    <p className="text-muted-foreground truncate text-[13px]">
                      {result.document.supplierName ?? "—"} ·{" "}
                      {formatBusinessDate(result.document.issueDate, locale)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tabular text-lg font-semibold">
                      {money(result.document.total, result.document.currency)}
                    </p>
                    <div className="mt-1 flex justify-end gap-1">
                      <DocumentStatusBadge status={result.document.status} />
                      {result.document.paidAt ? (
                        <Badge tone="success">{t("documents.paid")}</Badge>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={href(`/documents/${result.document.id}`)}
                    className={buttonVariants({ size: "sm" })}
                  >
                    <ExternalLink /> {t("scan.openDocument")}
                  </Link>
                  <Button variant="secondary" size="sm" onClick={reset}>
                    <RotateCcw /> {t("scan.scanAgain")}
                  </Button>
                </div>
              </div>
              <DocumentChat documentId={result.document.id} />
            </>
          ) : result.status === "not_found" ? (
            <div className="border-border bg-surface rounded-lg border p-4">
              <p className="text-base font-semibold">{t("scan.notFound")}</p>
              <p className="text-muted-foreground mt-1 text-[13px]">{t("scan.notFoundBody")}</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
                <dt className="text-muted-foreground">{t("scan.issuerTaxId")}</dt>
                <dd className="tabular">{result.qr.issuerTaxId}</dd>
                <dt className="text-muted-foreground">{t("review.fields.documentNumber")}</dt>
                <dd>{result.qr.documentNumber}</dd>
                <dt className="text-muted-foreground">{t("review.fields.issueDate")}</dt>
                <dd className="tabular">{formatBusinessDate(result.qr.issueDate, locale)}</dd>
                <dt className="text-muted-foreground">{t("review.fields.total")}</dt>
                <dd className="tabular font-medium">{money(result.qr.total)}</dd>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={href("/upload")} className={buttonVariants({ size: "sm" })}>
                  <Upload /> {t("scan.uploadIt")}
                </Link>
                <Button variant="secondary" size="sm" onClick={reset}>
                  <RotateCcw /> {t("scan.scanAgain")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Callout tone="warning">
                {result.status === "invalid" ? t("scan.notAtQr") : t("scan.error")}
              </Callout>
              <div>
                <Button variant="secondary" size="sm" onClick={reset}>
                  <RotateCcw /> {t("scan.scanAgain")}
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
