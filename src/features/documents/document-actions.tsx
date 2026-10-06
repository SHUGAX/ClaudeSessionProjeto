"use client";

import { Archive, ArchiveRestore, BadgeCheck, CircleDollarSign, RotateCcw, Sparkles, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n/client";
import { documentStateAction } from "./actions";
import { ApiError, processDocument } from "./api-client";

type ConfirmKind = "retry" | "archive" | null;

export function DocumentActions({
  documentId,
  status,
  paid,
  canEdit,
  canArchive,
}: {
  documentId: string;
  status: string;
  paid: boolean;
  canEdit: boolean;
  canArchive: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<ConfirmKind>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) =>
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        if (success) toast(success);
        router.refresh();
      } else {
        toast(t.dynamic(result.error ?? "errors.body", t("errors.body")), "error");
      }
    });

  const retry = () =>
    run(async () => {
      try {
        const outcome = await processDocument(documentId);
        return outcome.status === "failed" ? { ok: false, error: "review.failedTitle" } : { ok: true };
      } catch (error) {
        return { ok: false, error: `errors.${error instanceof ApiError ? error.code : "internal"}` };
      }
    });

  const canRetry = canEdit && ["uploaded", "failed", "review_required"].includes(status);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canRetry ? (
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => (status === "review_required" ? setConfirm("retry") : retry())}>
          <Sparkles /> {pending ? t("review.retrying") : t("review.retryExtraction")}
        </Button>
      ) : null}
      {canEdit && status === "validated" ? (
        <>
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => run(() => documentStateAction(documentId, paid ? "mark_unpaid" : "mark_paid"))}
          >
            {paid ? <Undo2 /> : <CircleDollarSign />} {paid ? t("review.markUnpaid") : t("review.markPaid")}
          </Button>
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => documentStateAction(documentId, "reopen"))}>
            <RotateCcw /> {t("review.reopen")}
          </Button>
        </>
      ) : null}
      {canArchive && status === "archived" ? (
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => documentStateAction(documentId, "unarchive"))}>
          <ArchiveRestore /> {t("review.unarchive")}
        </Button>
      ) : null}
      {canArchive && !["archived", "processing", "uploading"].includes(status) ? (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirm("archive")}>
          <Archive /> {t("review.archive")}
        </Button>
      ) : null}

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent
          title={confirm === "archive" ? t("review.archive") : t("review.retryExtraction")}
          description={confirm === "archive" ? t("review.archiveConfirm") : t("review.retryConfirm")}
          closeLabel={t("common.close")}
        >
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="secondary">{t("common.cancel")}</Button>
            </DialogClose>
            <Button
              variant={confirm === "archive" ? "danger" : "primary"}
              onClick={() => {
                const kind = confirm;
                setConfirm(null);
                if (kind === "archive") run(() => documentStateAction(documentId, "archive"));
                else retry();
              }}
            >
              <BadgeCheck /> {t("common.confirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
