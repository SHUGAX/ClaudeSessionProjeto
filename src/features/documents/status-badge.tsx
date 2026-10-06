"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n/client";
import type { DocumentStatus } from "@/lib/supabase/types";

const TONES: Record<DocumentStatus, "neutral" | "primary" | "success" | "warning" | "danger" | "info"> = {
  uploading: "neutral",
  uploaded: "neutral",
  processing: "info",
  review_required: "warning",
  validated: "success",
  failed: "danger",
  archived: "neutral",
};

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  const { t } = useI18n();
  return <Badge tone={TONES[status]}>{t.dynamic(`documentStatus.${status}`)}</Badge>;
}
