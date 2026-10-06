"use client";

import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import Link from "next/link";
import { useTenant } from "@/components/tenant/tenant-provider";
import type { ValidationIssue } from "@/lib/documents/validation";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

const FIELD_KEYS: Record<string, string> = {
  supplierName: "review.fields.supplierName",
  supplierTaxId: "review.fields.supplierTaxId",
  documentNumber: "review.fields.documentNumber",
  issueDate: "review.fields.issueDate",
  dueDate: "review.fields.dueDate",
  currency: "review.fields.currency",
  total: "review.fields.total",
  taxTotal: "review.fields.taxTotal",
  iban: "review.fields.iban",
  lineItems: "review.lineItemsSection",
};

export function ValidationPanel({
  issues,
  duplicateLabels,
}: {
  issues: ValidationIssue[];
  duplicateLabels: Record<string, string>;
}) {
  const { t } = useI18n();
  const { href } = useTenant();
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;

  return (
    <section
      aria-labelledby="validation-title"
      className="border-border bg-surface rounded-lg border"
    >
      <div className="border-border flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 id="validation-title" className="text-[13px] font-semibold">
          {t("review.validation.title")}
        </h2>
        <div className="flex gap-3 text-xs">
          {errors ? (
            <span className="text-danger">{t.plural("review.validation.errors", errors)}</span>
          ) : null}
          {warnings ? (
            <span className="text-warning">{t.plural("review.validation.warnings", warnings)}</span>
          ) : null}
        </div>
      </div>
      {issues.length === 0 ? (
        <p className="text-success flex items-center gap-2 px-4 py-3 text-[13px]">
          <CheckCircle2 className="size-4" aria-hidden /> {t("review.validation.allGood")}
        </p>
      ) : (
        <ul className="divide-border divide-y">
          {issues.map((issue, idx) => {
            const Icon =
              issue.severity === "error"
                ? XCircle
                : issue.severity === "warning"
                  ? AlertTriangle
                  : Info;
            const field = issue.field ? t.dynamic(FIELD_KEYS[issue.field] ?? issue.field) : "";
            return (
              <li
                key={`${issue.code}-${idx}`}
                className="flex items-start gap-2.5 px-4 py-2.5 text-[13px]"
                data-testid="validation-issue"
                data-code={issue.code}
              >
                <Icon
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    issue.severity === "error"
                      ? "text-danger"
                      : issue.severity === "warning"
                        ? "text-warning"
                        : "text-info",
                  )}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p>
                    {t.dynamic(`validationIssues.${issue.code}`, issue.code, {
                      field,
                      ...issue.params,
                    })}
                  </p>
                  {issue.relatedDocumentId ? (
                    <Link
                      href={href(`/documents/${issue.relatedDocumentId}`)}
                      className="text-primary text-xs hover:underline"
                    >
                      {t("review.duplicateOf")}:{" "}
                      {duplicateLabels[issue.relatedDocumentId] ?? t("review.viewDocument")}
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
