"use client";

import { AlertCircle, Camera, CheckCircle2, FileUp, Loader2, UploadCloud } from "lucide-react";
import Link from "next/link";
import { useCallback, useRef, useState, type DragEvent } from "react";
import { useTenant } from "@/components/tenant/tenant-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ACCEPT_ATTRIBUTE, MAX_UPLOAD_BYTES, mimeFromExtension } from "@/lib/documents/file-types";
import { useI18n } from "@/lib/i18n/client";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/supabase/types";
import { cn, formatBytes } from "@/lib/utils";
import {
  ApiError,
  createUploadIntent,
  finalizeUpload,
  processDocument,
  uploadToSignedUrl,
} from "./api-client";

type Stage =
  "queued" | "uploading" | "verifying" | "processing" | "done" | "processing_failed" | "error";

interface UploadItem {
  key: string;
  file: File;
  stage: Stage;
  progress: number;
  documentId?: string;
  error?: string;
  duplicate?: boolean;
}

function errorKey(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "limit_reached") {
      return error.reason === "storage_limit"
        ? "upload.errors.storage_limit"
        : "upload.errors.limit_reached";
    }
    if (error.reason === "empty_file") return "upload.errors.empty_file";
    const known = [
      "unsupported_file",
      "file_too_large",
      "forbidden",
      "rate_limited",
      "upload_failed",
    ];
    if (known.includes(error.code)) return `upload.errors.${error.code}`;
  }
  return "upload.errors.generic";
}

export function Uploader() {
  const { t, locale } = useI18n();
  const { slug, href } = useTenant();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [documentType, setDocumentType] = useState<DocumentType>("invoice");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const queueRef = useRef(Promise.resolve());

  const update = useCallback((key: string, patch: Partial<UploadItem>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }, []);

  const runOne = useCallback(
    async (item: UploadItem, type: DocumentType) => {
      const mime = mimeFromExtension(item.file.name);
      if (!mime)
        return update(item.key, { stage: "error", error: "upload.errors.unsupported_file" });
      if (item.file.size === 0)
        return update(item.key, { stage: "error", error: "upload.errors.empty_file" });
      if (item.file.size > MAX_UPLOAD_BYTES)
        return update(item.key, { stage: "error", error: "upload.errors.file_too_large" });

      let documentId: string | undefined;
      try {
        update(item.key, { stage: "uploading", progress: 0 });
        const intent = await createUploadIntent({
          tenant: slug,
          filename: item.file.name,
          size: item.file.size,
          documentType: type,
        });
        documentId = intent.documentId;
        await uploadToSignedUrl(intent.signedUrl, item.file, mime, (progress) =>
          update(item.key, { progress }),
        );
        update(item.key, { stage: "verifying", documentId });
        const finalized = await finalizeUpload(intent.documentId);
        update(item.key, { stage: "processing", duplicate: Boolean(finalized.duplicateOf) });
      } catch (error) {
        return update(item.key, { stage: "error", error: errorKey(error) });
      }

      try {
        const outcome = await processDocument(documentId);
        update(item.key, { stage: outcome.status === "failed" ? "processing_failed" : "done" });
      } catch {
        // The original is stored; extraction can be retried from the document page.
        update(item.key, { stage: "processing_failed" });
      }
    },
    [slug, update],
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const newItems = Array.from(files).map((file) => ({
        key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
        file,
        stage: "queued" as Stage,
        progress: 0,
      }));
      if (newItems.length === 0) return;
      setItems((prev) => [...newItems, ...prev]);
      const type = documentType;
      for (const item of newItems) {
        // Sequential processing keeps load and AI usage predictable.
        queueRef.current = queueRef.current.then(() => runOne(item, type));
      }
    },
    [documentType, runOne],
  );

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files?.length) addFiles(event.dataTransfer.files);
  };

  const retry = (item: UploadItem) => {
    update(item.key, { stage: "queued", error: undefined, progress: 0 });
    queueRef.current = queueRef.current.then(() =>
      runOne({ ...item, stage: "queued" }, documentType),
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5 sm:max-w-xs">
        <Label htmlFor="documentType">{t("upload.documentType")}</Label>
        <Select
          id="documentType"
          value={documentType}
          onChange={(e) => setDocumentType(e.target.value as DocumentType)}
        >
          {DOCUMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {t.dynamic(`documentTypes.${type}`)}
            </option>
          ))}
        </Select>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInput.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInput.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors",
          dragging
            ? "border-primary bg-primary-soft"
            : "border-input bg-surface hover:border-primary/50 hover:bg-muted/40",
        )}
      >
        <div className="bg-primary-soft text-primary flex size-11 items-center justify-center rounded-full">
          <UploadCloud className="size-5" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-medium">
            {dragging ? t("upload.dropzoneActive") : t("upload.dropzone")}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {t("upload.supported", { size: formatBytes(MAX_UPLOAD_BYTES, locale) })}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Button variant="secondary" size="sm" onClick={() => fileInput.current?.click()}>
            <FileUp /> {t("upload.chooseFiles")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="sm:hidden"
            onClick={() => cameraInput.current?.click()}
          >
            <Camera /> {t("upload.takePhoto")}
          </Button>
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          data-testid="file-input"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={cameraInput}
          type="file"
          accept="image/jpeg,image/png"
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 ? (
        <ul
          className="divide-border border-border bg-surface divide-y rounded-lg border"
          aria-live="polite"
        >
          {items.map((item) => (
            <li
              key={item.key}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
              data-testid="upload-item"
            >
              <StageIcon stage={item.stage} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.file.name}</p>
                <p className="text-muted-foreground text-xs">
                  {formatBytes(item.file.size, locale)} · <StageLabel item={item} />
                </p>
                {item.stage === "uploading" ? (
                  <div className="bg-muted mt-1.5 h-1 w-full overflow-hidden rounded">
                    <div
                      className="bg-primary h-full transition-[width]"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                ) : null}
              </div>
              {item.documentId && (item.stage === "done" || item.stage === "processing_failed") ? (
                <Link
                  href={href(`/documents/${item.documentId}`)}
                  className={buttonVariants({
                    variant: item.stage === "done" ? "primary" : "secondary",
                    size: "sm",
                  })}
                >
                  {t("upload.review")}
                </Link>
              ) : null}
              {item.stage === "error" ? (
                <Button variant="secondary" size="sm" onClick={() => retry(item)}>
                  {t("upload.retry")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function StageIcon({ stage }: { stage: Stage }) {
  if (stage === "done") return <CheckCircle2 className="text-success size-5" aria-hidden />;
  if (stage === "error" || stage === "processing_failed")
    return <AlertCircle className="text-danger size-5" aria-hidden />;
  if (stage === "queued") return <FileUp className="text-muted-foreground size-5" aria-hidden />;
  return <Loader2 className="text-primary size-5 animate-spin" aria-hidden />;
}

function StageLabel({ item }: { item: UploadItem }) {
  const { t } = useI18n();
  switch (item.stage) {
    case "queued":
      return <>{t("upload.queued")}</>;
    case "uploading":
      return <>{t("upload.uploading", { progress: item.progress })}</>;
    case "verifying":
      return <>{t("upload.verifying")}</>;
    case "processing":
      return <>{t("upload.processing")}</>;
    case "done":
      return (
        <span className="text-success">
          {t("upload.done")}
          {item.duplicate ? (
            <span className="text-warning"> · {t("upload.exactDuplicate")}</span>
          ) : null}
        </span>
      );
    case "processing_failed":
      return <span className="text-danger">{t("upload.processingFailed")}</span>;
    case "error":
      return (
        <span className="text-danger">{t.dynamic(item.error ?? "upload.errors.generic")}</span>
      );
  }
}
