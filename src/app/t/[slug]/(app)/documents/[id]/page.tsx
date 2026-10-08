import { ArrowLeft, Copy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { DocumentActions } from "@/features/documents/document-actions";
import { DocumentViewer } from "@/features/documents/document-viewer";
import { HistoryPanel, type HistoryEntry } from "@/features/documents/history-panel";
import { ProcessingWatcher } from "@/features/documents/processing-watcher";
import { ReviewForm } from "@/features/documents/review-form";
import { DocumentStatusBadge } from "@/features/documents/status-badge";
import type { InvoiceExtraction } from "@/lib/ai/schema";
import { can } from "@/lib/auth/permissions";
import { formatBusinessDate, formatTimestamp, todayIso } from "@/lib/dates";
import { findDuplicateMatches } from "@/lib/documents/duplicates";
import { duplicateCandidates } from "@/lib/documents/review";
import { isProcessingStale } from "@/lib/documents/status";
import { getI18n } from "@/lib/i18n/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTenantContext } from "@/lib/tenancy/context";
import { tenantPath } from "@/lib/tenancy/urls";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("review.title") };
}

function stringify(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default async function DocumentReviewPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await requireTenantContext(slug);
  const { t, locale } = await getI18n();
  const supabase = await createSupabaseServerClient();
  const orgId = ctx.organization.id;

  // RLS guarantees only documents of the user's organizations are visible;
  // the explicit organization filter also prevents cross-tenant URLs mixing.
  const { data: doc } = await supabase
    .from("documents")
    .select(
      "id, organization_id, status, processing_status, processing_started_at, processing_error, document_type, original_filename, mime_type, file_size, file_sha256, supplier_id, supplier_name, supplier_tax_id, document_number, issue_date, due_date, currency, subtotal::text, tax_total::text, total::text, payment_reference, iban, purchase_order, category_id, notes, paid_at, possible_duplicate_of, current_extraction_id, validated_at, validated_by, created_at, updated_at",
    )
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!doc) notFound();

  const [settings, lineItems, suppliers, categories, extractions, audit, validator] =
    await Promise.all([
      supabase
        .from("organization_settings")
        .select("timezone")
        .eq("organization_id", orgId)
        .maybeSingle(),
      supabase
        .from("document_line_items")
        .select(
          "description, quantity::text, unit_price::text, tax_rate::text, tax_amount::text, line_total::text",
        )
        .eq("document_id", id)
        .order("position"),
      supabase
        .from("suppliers")
        .select("id, name, tax_id, default_category_id")
        .eq("organization_id", orgId)
        .order("name")
        .limit(2000),
      supabase.from("categories").select("id, name").eq("organization_id", orgId).order("name"),
      supabase
        .from("document_extractions")
        .select(
          "id, provider, model, prompt_version, status, error_code, error_message, processing_duration_ms, confidence, structured_data, created_at",
        )
        .eq("document_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("audit_logs")
        .select(
          "id, action, actor_type, old_values, new_values, created_at, profiles(full_name, email)",
        )
        .eq("entity_type", "document")
        .eq("entity_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
      doc.validated_by
        ? supabase
            .from("profiles")
            .select("full_name, email")
            .eq("id", doc.validated_by)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const timezone = settings.data?.timezone ?? "Europe/Lisbon";
  const today = todayIso(timezone);
  const canEdit = can.editDocuments(ctx.role);

  const subject = {
    id: doc.id,
    supplierId: doc.supplier_id,
    supplierTaxId: doc.supplier_tax_id,
    documentNumber: doc.document_number,
    issueDate: doc.issue_date,
    total: doc.total,
    fileSha256: doc.file_sha256,
  };
  const duplicates = findDuplicateMatches(
    subject,
    await duplicateCandidates(supabase, orgId, subject),
  );
  const relatedIds = [
    ...new Set([
      ...duplicates.map((d) => d.documentId),
      ...(doc.possible_duplicate_of ? [doc.possible_duplicate_of] : []),
    ]),
  ];
  const { data: relatedDocs } = relatedIds.length
    ? await supabase
        .from("documents")
        .select("id, document_number, supplier_name, issue_date")
        .in("id", relatedIds)
    : {
        data: [] as Array<{
          id: string;
          document_number: string | null;
          supplier_name: string | null;
          issue_date: string | null;
        }>,
      };
  const duplicateLabels = Object.fromEntries(
    (relatedDocs ?? []).map((d) => [
      d.id,
      [
        d.document_number ?? t("documents.unnamed"),
        d.supplier_name,
        formatBusinessDate(d.issue_date, locale),
      ]
        .filter(Boolean)
        .join(" · "),
    ]),
  );

  const currentExtraction = extractions.data?.find((x) => x.id === doc.current_extraction_id);
  const ai = currentExtraction?.structured_data as unknown as InvoiceExtraction | undefined;
  const aiValues = ai
    ? {
        supplierName: ai.supplier?.name ?? null,
        supplierTaxId: ai.supplier?.taxId ?? null,
        documentNumber: ai.documentNumber,
        issueDate: ai.issueDate,
        dueDate: ai.dueDate,
        subtotal: ai.subtotal,
        taxTotal: ai.taxTotal,
        total: ai.total,
        iban: ai.iban,
      }
    : null;

  const history: HistoryEntry[] = (audit.data ?? []).map((a) => {
    const oldValues = (a.old_values ?? {}) as Record<string, unknown>;
    const newValues = (a.new_values ?? {}) as Record<string, unknown>;
    const changes =
      a.action === "document.updated"
        ? Object.keys(newValues).map((field) => ({
            field,
            from: stringify(oldValues[field]),
            to: stringify(newValues[field]),
          }))
        : [];
    return {
      id: a.id,
      action: a.action,
      actorType: a.actor_type,
      actorName: a.profiles?.full_name ?? a.profiles?.email ?? null,
      createdAt: a.created_at,
      changes,
    };
  });

  const processing = doc.status === "processing" || doc.status === "uploaded";
  const stale = doc.status === "processing" && isProcessingStale(doc.processing_started_at);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <Link
            href={tenantPath(slug, "/documents")}
            className="text-muted-foreground hover:text-foreground mb-1.5 inline-flex items-center gap-1 text-[13px]"
          >
            <ArrowLeft className="size-3.5" aria-hidden /> {t("documents.title")}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-tight">
              {doc.document_number ?? doc.original_filename}
            </h1>
            <DocumentStatusBadge status={doc.status} />
            {doc.possible_duplicate_of ? (
              <Badge tone="warning">
                <Copy /> {t("documents.possibleDuplicate")}
              </Badge>
            ) : null}
            {doc.paid_at ? <Badge tone="success">{t("documents.paid")}</Badge> : null}
          </div>
          <p className="text-muted-foreground mt-1 text-[13px]">
            {t.dynamic(`documentTypes.${doc.document_type}`)} · {doc.original_filename} ·{" "}
            {doc.validated_at
              ? t("review.humanValidated", {
                  name: validator.data?.full_name ?? validator.data?.email ?? "—",
                  date: formatTimestamp(doc.validated_at, locale, timezone),
                })
              : t("review.notValidated")}
          </p>
        </div>
        <DocumentActions
          documentId={doc.id}
          status={doc.status}
          paid={Boolean(doc.paid_at)}
          canEdit={canEdit}
          canArchive={can.archiveDocuments(ctx.role)}
        />
      </div>

      {doc.status === "archived" ? (
        <Callout tone="info">{t("review.archivedNotice")}</Callout>
      ) : null}
      {processing ? (
        <ProcessingWatcher
          documentId={doc.id}
          status={doc.status as "uploaded" | "processing"}
          stale={stale}
          canStart={canEdit}
        />
      ) : null}
      {doc.status === "failed" ? (
        <Callout tone="danger" title={t("review.failedTitle")}>
          {t("review.failedBody")}
        </Callout>
      ) : null}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section
          aria-label={t("review.original")}
          className="border-border bg-surface h-[60vh] overflow-hidden rounded-lg border xl:sticky xl:top-20 xl:h-[calc(100dvh-7rem)]"
        >
          <DocumentViewer documentId={doc.id} mimeType={doc.mime_type} />
        </section>

        <div className="flex min-w-0 flex-col gap-5">
          {!processing ? (
            <ReviewForm
              key={doc.updated_at}
              document={{
                id: doc.id,
                status: doc.status,
                updatedAt: doc.updated_at,
                documentType: doc.document_type,
                supplierId: doc.supplier_id,
                supplierName: doc.supplier_name,
                supplierTaxId: doc.supplier_tax_id,
                documentNumber: doc.document_number,
                issueDate: doc.issue_date,
                dueDate: doc.due_date,
                currency: doc.currency,
                subtotal: doc.subtotal,
                taxTotal: doc.tax_total,
                total: doc.total,
                paymentReference: doc.payment_reference,
                iban: doc.iban,
                purchaseOrder: doc.purchase_order,
                categoryId: doc.category_id,
                notes: doc.notes,
              }}
              lineItems={(lineItems.data ?? []).map((li) => ({
                description: li.description,
                quantity: li.quantity,
                unitPrice: li.unit_price,
                taxRate: li.tax_rate,
                taxAmount: li.tax_amount,
                lineTotal: li.line_total,
              }))}
              suppliers={suppliers.data ?? []}
              categories={categories.data ?? []}
              duplicates={duplicates}
              duplicateLabels={duplicateLabels}
              aiValues={aiValues}
              canEdit={canEdit}
              today={today}
            />
          ) : null}
          <HistoryPanel
            entries={history}
            extractions={(extractions.data ?? []).map((x) => ({
              id: x.id,
              provider: x.provider,
              model: x.model,
              promptVersion: x.prompt_version,
              status: x.status,
              errorCode: x.error_code,
              errorMessage: x.error_message,
              durationMs: x.processing_duration_ms,
              confidence: (x.confidence as { overall?: number | null } | null)?.overall ?? null,
              createdAt: x.created_at,
              current: x.id === doc.current_extraction_id,
            }))}
            t={t}
            locale={locale}
            timezone={timezone}
          />
        </div>
      </div>
    </div>
  );
}
