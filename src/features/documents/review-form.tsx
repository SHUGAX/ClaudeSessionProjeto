"use client";

import { Building2, CheckCircle2, Link2, Link2Off, Save, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import type { DuplicateMatch } from "@/lib/documents/duplicates";
import { validateDocument, type ValidationIssue } from "@/lib/documents/validation";
import { useI18n } from "@/lib/i18n/client";
import { parseAmount, trimDecimal } from "@/lib/money";
import { matchSupplier } from "@/lib/suppliers/matching";
import { DOCUMENT_TYPES } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import { saveReviewAction } from "./actions";
import { emptyLineItem, LineItemsEditor, type LineItemDraft } from "./line-items-editor";
import { ValidationPanel } from "./validation-panel";

export interface ReviewDocument {
  id: string;
  status: string;
  updatedAt: string;
  documentType: string;
  supplierId: string | null;
  supplierName: string | null;
  supplierTaxId: string | null;
  documentNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  currency: string;
  subtotal: string | null;
  taxTotal: string | null;
  total: string | null;
  paymentReference: string | null;
  iban: string | null;
  purchaseOrder: string | null;
  categoryId: string | null;
  notes: string | null;
}

export interface ReviewLineItem {
  description: string | null;
  quantity: string | null;
  unitPrice: string | null;
  taxRate: string | null;
  taxAmount: string | null;
  lineTotal: string | null;
}

type FormValues = {
  documentType: string;
  supplierId: string;
  supplierName: string;
  supplierTaxId: string;
  documentNumber: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  subtotal: string;
  taxTotal: string;
  total: string;
  paymentReference: string;
  iban: string;
  purchaseOrder: string;
  categoryId: string;
  notes: string;
};

/** Shows decimal strings with the locale's decimal separator (input accepts both). */
function toInputAmount(value: string | null, locale: string, minDecimals = 2): string {
  if (value == null || value === "") return "";
  const trimmed = trimDecimal(value, minDecimals);
  return locale === "pt-PT" ? trimmed.replace(".", ",") : trimmed;
}

function initialValues(doc: ReviewDocument, locale: string): FormValues {
  return {
    documentType: doc.documentType,
    supplierId: doc.supplierId ?? "",
    supplierName: doc.supplierName ?? "",
    supplierTaxId: doc.supplierTaxId ?? "",
    documentNumber: doc.documentNumber ?? "",
    issueDate: doc.issueDate ?? "",
    dueDate: doc.dueDate ?? "",
    currency: doc.currency || "EUR",
    subtotal: toInputAmount(doc.subtotal, locale),
    taxTotal: toInputAmount(doc.taxTotal, locale),
    total: toInputAmount(doc.total, locale),
    paymentReference: doc.paymentReference ?? "",
    iban: doc.iban ?? "",
    purchaseOrder: doc.purchaseOrder ?? "",
    categoryId: doc.categoryId ?? "",
    notes: doc.notes ?? "",
  };
}

export function ReviewForm({
  document,
  lineItems,
  suppliers,
  categories,
  duplicates,
  duplicateLabels,
  aiValues,
  canEdit,
  today,
  footer,
}: {
  document: ReviewDocument;
  lineItems: ReviewLineItem[];
  suppliers: Array<{
    id: string;
    name: string;
    tax_id: string | null;
    default_category_id: string | null;
  }>;
  categories: Array<{ id: string; name: string }>;
  duplicates: DuplicateMatch[];
  duplicateLabels: Record<string, string>;
  aiValues: Partial<Record<keyof FormValues, string | null>> | null;
  canEdit: boolean;
  today: string;
  footer?: ReactNode;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<FormValues>(() => initialValues(document, locale));
  const [items, setItems] = useState<LineItemDraft[]>(() =>
    lineItems.map((li) => ({
      ...emptyLineItem(),
      description: li.description ?? "",
      quantity: toInputAmount(li.quantity, locale, 0),
      unitPrice: toInputAmount(li.unitPrice, locale),
      taxRate: toInputAmount(li.taxRate, locale, 0),
      taxAmount: toInputAmount(li.taxAmount, locale),
      lineTotal: toInputAmount(li.lineTotal, locale),
    })),
  );
  const [dirty, setDirty] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const editable =
    canEdit && (document.status === "review_required" || document.status === "failed");

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const linkedSupplier = suppliers.find((s) => s.id === values.supplierId) ?? null;
  const supplierSuggestion = useMemo(() => {
    if (values.supplierId) return null;
    const match = matchSupplier(
      { name: values.supplierName || null, taxId: values.supplierTaxId || null },
      suppliers,
    );
    return match.kind === "none" ? null : match;
  }, [values.supplierId, values.supplierName, values.supplierTaxId, suppliers]);

  const suggestedCategory = linkedSupplier?.default_category_id
    ? categories.find((c) => c.id === linkedSupplier.default_category_id)
    : null;

  // Live deterministic validation (same rules as the server).
  const issues: ValidationIssue[] = useMemo(
    () =>
      validateDocument(
        {
          documentType: values.documentType,
          supplierName: values.supplierName || null,
          supplierTaxId: values.supplierTaxId || null,
          documentNumber: values.documentNumber || null,
          issueDate: values.issueDate || null,
          dueDate: values.dueDate || null,
          currency: values.currency.trim().toUpperCase() || null,
          subtotal: parseAmount(values.subtotal),
          taxTotal: parseAmount(values.taxTotal),
          total: parseAmount(values.total),
          iban: values.iban || null,
          lineItems: items.map((li) => ({ lineTotal: parseAmount(li.lineTotal) })),
        },
        { today, duplicates },
      ),
    [values, items, today, duplicates],
  );
  const fieldIssue = (field: string) =>
    issues.find((i) => i.field === field && i.severity === "error");

  const submit = (intent: "draft" | "validate") => {
    setServerError(null);
    startTransition(async () => {
      const result = await saveReviewAction({
        documentId: document.id,
        expectedUpdatedAt: document.updatedAt,
        intent,
        documentType: values.documentType,
        supplierId: values.supplierId || null,
        supplierName: values.supplierName,
        supplierTaxId: values.supplierTaxId,
        documentNumber: values.documentNumber,
        issueDate: values.issueDate || null,
        dueDate: values.dueDate || null,
        currency: values.currency,
        subtotal: values.subtotal || null,
        taxTotal: values.taxTotal || null,
        total: values.total || null,
        paymentReference: values.paymentReference,
        iban: values.iban,
        purchaseOrder: values.purchaseOrder,
        categoryId: values.categoryId || null,
        notes: values.notes,
        lineItems: items
          .filter((li) => li.description || li.lineTotal || li.unitPrice)
          .map((li) => ({
            description: li.description,
            quantity: li.quantity || null,
            unitPrice: li.unitPrice || null,
            taxRate: li.taxRate || null,
            taxAmount: li.taxAmount || null,
            lineTotal: li.lineTotal || null,
          })),
      });
      if (result.ok) {
        setDirty(false);
        toast(t(intent === "validate" ? "review.validated" : "review.saved"));
        router.refresh();
      } else {
        setServerError(result.error);
        if (result.error === "review.validationBlocked") {
          setDirty(false);
          router.refresh();
        }
      }
    });
  };

  const aiBadge = (key: keyof FormValues) => {
    if (!aiValues || document.status === "validated" || !(key in aiValues)) return null;
    const ai = aiValues[key] ?? "";
    const current = values[key];
    const same = ["subtotal", "taxTotal", "total"].includes(key)
      ? parseAmount(current) === (ai || null)
      : current === (ai ?? "");
    return same && ai ? (
      <span
        className="text-info inline-flex items-center gap-1 text-[11px]"
        title={t("review.aiSuggested")}
      >
        <Sparkles className="size-3" aria-hidden /> IA
      </span>
    ) : null;
  };

  const errorText = (field: string) => {
    const issue = fieldIssue(field);
    return issue
      ? t.dynamic(`validationIssues.${issue.code}`, issue.code, { field: "", ...issue.params })
      : undefined;
  };

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit("draft");
      }}
      aria-busy={pending}
    >
      {!canEdit ? <Callout tone="info">{t("review.readOnly")}</Callout> : null}
      {serverError ? (
        <Callout tone="danger">{t.dynamic(serverError, t("errors.body"))}</Callout>
      ) : null}

      <ValidationPanel issues={issues} duplicateLabels={duplicateLabels} />

      <Section
        title={t("review.supplierSection")}
        icon={<Building2 className="size-4" aria-hidden />}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label={t("review.fields.supplierName")}
            htmlFor="supplierName"
            aside={aiBadge("supplierName")}
            error={errorText("supplierName")}
            className="sm:col-span-2"
          >
            <Input
              id="supplierName"
              value={values.supplierName}
              onChange={(e) => set("supplierName", e.target.value)}
              disabled={!editable}
              maxLength={300}
              aria-invalid={Boolean(fieldIssue("supplierName"))}
            />
          </Field>
          <Field
            label={t("review.fields.supplierTaxId")}
            htmlFor="supplierTaxId"
            aside={aiBadge("supplierTaxId")}
          >
            <Input
              id="supplierTaxId"
              value={values.supplierTaxId}
              onChange={(e) => set("supplierTaxId", e.target.value)}
              disabled={!editable}
              maxLength={40}
              className="tabular"
            />
          </Field>
          <Field label={t("review.fields.supplier")} htmlFor="supplierId">
            <Select
              id="supplierId"
              value={values.supplierId}
              onChange={(e) => {
                const id = e.target.value;
                set("supplierId", id);
                const s = suppliers.find((x) => x.id === id);
                if (s?.default_category_id && !values.categoryId)
                  set("categoryId", s.default_category_id);
              }}
              disabled={!editable}
            >
              <option value="">{t("review.supplierMatch.none")}</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.tax_id ? ` · ${s.tax_id}` : ""}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-3">
          {linkedSupplier ? (
            <p className="text-success flex items-center gap-2 text-[13px]">
              <Link2 className="size-4" aria-hidden /> {t("review.supplierMatch.linked")}:{" "}
              {linkedSupplier.name}
              {editable ? (
                <Button
                  variant="link"
                  size="sm"
                  className="ml-1"
                  onClick={() => set("supplierId", "")}
                >
                  <Link2Off /> {t("review.supplierMatch.unlink")}
                </Button>
              ) : null}
            </p>
          ) : supplierSuggestion && editable ? (
            <Callout
              tone="info"
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    set("supplierId", supplierSuggestion.supplier.id);
                    if (supplierSuggestion.supplier.default_category_id && !values.categoryId) {
                      set("categoryId", supplierSuggestion.supplier.default_category_id);
                    }
                  }}
                >
                  {t("review.supplierMatch.useSuggestion")}
                </Button>
              }
            >
              {t("review.supplierMatch.suggestion", { name: supplierSuggestion.supplier.name })}
            </Callout>
          ) : editable && values.supplierName ? (
            <p className="text-muted-foreground text-[13px]">
              {t("review.supplierMatch.createOnValidate")}
            </p>
          ) : null}
        </div>
      </Section>

      <Section title={t("review.documentSection")}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("review.fields.documentType")} htmlFor="documentType">
            <Select
              id="documentType"
              value={values.documentType}
              onChange={(e) => set("documentType", e.target.value)}
              disabled={!editable}
            >
              {DOCUMENT_TYPES.map((d) => (
                <option key={d} value={d}>
                  {t.dynamic(`documentTypes.${d}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={t("review.fields.documentNumber")}
            htmlFor="documentNumber"
            aside={aiBadge("documentNumber")}
            error={errorText("documentNumber")}
          >
            <Input
              id="documentNumber"
              value={values.documentNumber}
              onChange={(e) => set("documentNumber", e.target.value)}
              disabled={!editable}
              maxLength={100}
              aria-invalid={Boolean(fieldIssue("documentNumber"))}
            />
          </Field>
          <Field
            label={t("review.fields.issueDate")}
            htmlFor="issueDate"
            aside={aiBadge("issueDate")}
            error={errorText("issueDate")}
          >
            <Input
              id="issueDate"
              type="date"
              value={values.issueDate}
              onChange={(e) => set("issueDate", e.target.value)}
              disabled={!editable}
              aria-invalid={Boolean(fieldIssue("issueDate"))}
            />
          </Field>
          <Field
            label={t("review.fields.dueDate")}
            htmlFor="dueDate"
            aside={aiBadge("dueDate")}
            error={errorText("dueDate")}
          >
            <Input
              id="dueDate"
              type="date"
              value={values.dueDate}
              onChange={(e) => set("dueDate", e.target.value)}
              disabled={!editable}
            />
          </Field>
        </div>
      </Section>

      <Section title={t("review.amountsSection")}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(["subtotal", "taxTotal", "total"] as const).map((key) => (
            <Field
              key={key}
              label={t(`review.fields.${key}`)}
              htmlFor={key}
              aside={aiBadge(key)}
              error={errorText(key)}
            >
              <Input
                id={key}
                value={values[key]}
                onChange={(e) => set(key, e.target.value)}
                disabled={!editable}
                inputMode="decimal"
                className={cn("tabular text-right", key === "total" && "font-semibold")}
                aria-invalid={Boolean(fieldIssue(key))}
              />
            </Field>
          ))}
          <Field
            label={t("review.fields.currency")}
            htmlFor="currency"
            error={errorText("currency")}
          >
            <Input
              id="currency"
              value={values.currency}
              onChange={(e) => set("currency", e.target.value.toUpperCase())}
              disabled={!editable}
              maxLength={3}
              className="uppercase"
              aria-invalid={Boolean(fieldIssue("currency"))}
            />
          </Field>
        </div>
      </Section>

      <Section title={t("review.classificationSection")}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label={t("review.fields.category")}
            htmlFor="categoryId"
            hint={
              suggestedCategory && values.categoryId !== suggestedCategory.id
                ? t("review.categorySuggested", { name: suggestedCategory.name })
                : undefined
            }
          >
            <Select
              id="categoryId"
              value={values.categoryId}
              onChange={(e) => set("categoryId", e.target.value)}
              disabled={!editable}
            >
              <option value="">{t("common.none")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("review.fields.purchaseOrder")} htmlFor="purchaseOrder">
            <Input
              id="purchaseOrder"
              value={values.purchaseOrder}
              onChange={(e) => set("purchaseOrder", e.target.value)}
              disabled={!editable}
              maxLength={100}
            />
          </Field>
        </div>
      </Section>

      <Section title={t("review.paymentSection")}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("review.fields.iban")} htmlFor="iban" aside={aiBadge("iban")}>
            <Input
              id="iban"
              value={values.iban}
              onChange={(e) => set("iban", e.target.value)}
              disabled={!editable}
              maxLength={50}
              className="tabular"
            />
          </Field>
          <Field label={t("review.fields.paymentReference")} htmlFor="paymentReference">
            <Input
              id="paymentReference"
              value={values.paymentReference}
              onChange={(e) => set("paymentReference", e.target.value)}
              disabled={!editable}
              maxLength={100}
            />
          </Field>
          <Field label={t("review.fields.notes")} htmlFor="notes" className="sm:col-span-2">
            <Textarea
              id="notes"
              value={values.notes}
              onChange={(e) => set("notes", e.target.value)}
              disabled={!editable}
              maxLength={4000}
              rows={2}
            />
          </Field>
        </div>
      </Section>

      <Section title={t("review.lineItemsSection")}>
        <LineItemsEditor
          items={items}
          onChange={(next) => {
            setItems(next);
            setDirty(true);
          }}
          disabled={!editable}
        />
      </Section>

      {editable ? (
        <div className="border-border bg-background/95 sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-end gap-2 border-t px-1 py-3 backdrop-blur">
          {dirty ? (
            <Badge tone="warning" className="mr-auto">
              {t("review.unsavedChanges")}
            </Badge>
          ) : null}
          <Button type="submit" variant="secondary" disabled={pending}>
            <Save /> {t("review.saveDraft")}
          </Button>
          <Button
            onClick={() => submit("validate")}
            disabled={pending}
            data-testid="validate-button"
          >
            <CheckCircle2 /> {pending ? t("review.validating") : t("review.validate")}
          </Button>
        </div>
      ) : null}
      {footer}
    </form>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-border bg-surface rounded-lg border">
      <h2 className="border-border flex items-center gap-2 border-b px-4 py-2.5 text-[13px] font-semibold">
        {icon}
        {title}
      </h2>
      <div className="p-4">{children}</div>
    </section>
  );
}
