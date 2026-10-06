"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Callout } from "@/components/ui/callout";
import { useI18n } from "@/lib/i18n/client";
import { processDocument } from "./api-client";

/**
 * Shown while a document is waiting for/under AI processing. Polls the server
 * (router.refresh) until the status changes. If the upload tab was closed
 * before extraction started ("uploaded"), it starts the extraction.
 */
export function ProcessingWatcher({
  documentId,
  status,
  stale,
  canStart,
}: {
  documentId: string;
  status: "uploaded" | "processing";
  stale: boolean;
  canStart: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (status === "uploaded" && canStart && !started.current) {
      started.current = true;
      processDocument(documentId)
        .catch(() => undefined)
        .finally(() => router.refresh());
    }
    const interval = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(interval);
  }, [documentId, status, canStart, router]);

  return (
    <Callout tone="info" title={t("review.processingTitle")}>
      <span className="flex items-center gap-2">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {stale ? t("review.processingStale") : t("review.processingBody")}
      </span>
    </Callout>
  );
}
