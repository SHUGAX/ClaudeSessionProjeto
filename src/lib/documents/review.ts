import "server-only";
import { diffValues, recordAudit } from "@/lib/audit";
import { todayIso } from "@/lib/dates";
import { AppError } from "@/lib/observability/errors";
import { logger } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { UserSupabaseClient } from "@/lib/supabase/server";
import type { DocumentStatus, DocumentType } from "@/lib/supabase/types";
import { numericParam, toJson } from "@/lib/supabase/values";
import { normalizeTaxId } from "@/lib/validation/tax-id";
import { loadAuthorizedDocument } from "./access";
import { findDuplicateMatches, normalizeDocumentNumber, type DuplicateSubject } from "./duplicates";
import { strongestDuplicate } from "./pipeline";
import { reviewInputSchema, type ParsedReviewInput, type ReviewInput } from "./review-schema";
import { countIssues, hasBlockingErrors, validateDocument, type ValidationIssue } from "./validation";

export type ReviewResult =
  | { ok: true; status: DocumentStatus; issues: ValidationIssue[] }
  | { ok: false; error: string; issues?: ValidationIssue[] };

const EDITABLE_FIELDS =
  "id, organization_id, status, document_type, supplier_id, supplier_name, supplier_tax_id, document_number, issue_date, due_date, currency, subtotal::text, tax_total::text, total::text, payment_reference, iban, purchase_order, category_id, notes, updated_at, file_sha256, validated_at";

export async function duplicateCandidates(supabase: UserSupabaseClient, organizationId: string, subject: DuplicateSubject) {
  const filters: string[] = [];
  if (subject.fileSha256) filters.push(`file_sha256.eq.${subject.fileSha256}`);
  const number = normalizeDocumentNumber(subject.documentNumber);
  if (number) filters.push(`document_number_normalized.eq."${number.replace(/"/g, "")}"`);
  const taxId = normalizeTaxId(subject.supplierTaxId);
  if (taxId && subject.issueDate) filters.push(`and(supplier_tax_id_normalized.eq."${taxId}",issue_date.eq.${subject.issueDate})`);
  if (subject.supplierId && subject.issueDate) filters.push(`and(supplier_id.eq.${subject.supplierId},issue_date.eq.${subject.issueDate})`);
  if (filters.length === 0) return [];
  const { data } = await supabase
    .from("documents")
    .select("id, supplier_id, supplier_tax_id, document_number, issue_date, total::text, file_sha256, status")
    .eq("organization_id", organizationId)
    .neq("id", subject.id)
    .or(filters.join(","))
    .limit(50);
  return (data ?? []).map((d) => ({
    id: d.id,
    supplierId: d.supplier_id,
    supplierTaxId: d.supplier_tax_id,
    documentNumber: d.document_number,
    issueDate: d.issue_date,
    total: d.total,
    fileSha256: d.file_sha256,
    status: d.status,
  }));
}

/**
 * Resolves the supplier for a validated document: explicit selection (must be
 * in the same organization), else existing supplier with the same tax ID, else
 * a new supplier is created. Returns null when there is nothing to link.
 */
async function resolveSupplier(
  supabase: UserSupabaseClient,
  organizationId: string,
  input: ParsedReviewInput,
  userId: string,
  createIfMissing: boolean,
): Promise<{ id: string; created: boolean } | null> {
  if (input.supplierId) {
    const { data } = await supabase
      .from("suppliers")
      .select("id")
      .eq("id", input.supplierId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!data) throw new AppError("invalid_input", "supplier_not_found");
    return { id: data.id, created: false };
  }
  const taxId = normalizeTaxId(input.supplierTaxId);
  if (taxId) {
    const { data } = await supabase
      .from("suppliers")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("tax_id_normalized", taxId)
      .maybeSingle();
    if (data) return { id: data.id, created: false };
  }
  if (!createIfMissing || !input.supplierName) return null;

  const { data: created, error } = await supabase
    .from("suppliers")
    .insert({
      organization_id: organizationId,
      name: input.supplierName,
      tax_id: input.supplierTaxId,
      tax_country: taxId && /^\d{9}$/.test(taxId) ? "PT" : null,
      iban: input.iban,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !created) {
    if (error?.code === "23505" && taxId) {
      const { data } = await supabase
        .from("suppliers")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("tax_id_normalized", taxId)
        .maybeSingle();
      if (data) return { id: data.id, created: false };
    }
    throw new AppError(error?.code === "42501" ? "forbidden" : "internal", error?.message);
  }
  await recordAudit({
    organizationId,
    actorUserId: userId,
    action: "supplier.created",
    entityType: "supplier",
    entityId: created.id,
    newValues: { name: input.supplierName, tax_id: input.supplierTaxId },
    metadata: { source: "document_validation", documentId: input.documentId },
  });
  return { id: created.id, created: true };
}

/** Saves reviewed values (draft) or validates the document. */
export async function saveReview(rawInput: ReviewInput): Promise<ReviewResult> {
  const parsed = reviewInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: "errors.invalid_input" };
  const input = parsed.data;

  const { supabase, user } = await loadAuthorizedDocument(input.documentId, "editDocuments");
  const { data: current, error: loadError } = await supabase
    .from("documents")
    .select(EDITABLE_FIELDS)
    .eq("id", input.documentId)
    .single();
  if (loadError || !current) throw new AppError("not_found");
  if (!["review_required", "failed"].includes(current.status)) {
    return { ok: false, error: "errors.conflict" };
  }
  if (current.updated_at !== input.expectedUpdatedAt) return { ok: false, error: "errors.conflict" };

  const organizationId = current.organization_id;
  const wantsValidation = input.intent === "validate";

  // Category must belong to the organization (also enforced by a composite FK).
  if (input.categoryId) {
    const { data: category } = await supabase
      .from("categories")
      .select("id")
      .eq("id", input.categoryId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!category) return { ok: false, error: "errors.invalid_input" };
  }

  const admin = createSupabaseAdminClient();
  const { data: settings } = await admin
    .from("organization_settings")
    .select("timezone")
    .eq("organization_id", organizationId)
    .maybeSingle();

  // Validation first (without creating anything), so a blocked validation has no side effects.
  const preliminarySupplier = input.supplierId ?? current.supplier_id;
  const subject: DuplicateSubject = {
    id: current.id,
    supplierId: preliminarySupplier,
    supplierTaxId: input.supplierTaxId,
    documentNumber: input.documentNumber,
    issueDate: input.issueDate,
    total: input.total,
    fileSha256: current.file_sha256,
  };
  const duplicates = findDuplicateMatches(subject, await duplicateCandidates(supabase, organizationId, subject));
  const issues = validateDocument(
    {
      documentType: input.documentType,
      supplierName: input.supplierName,
      supplierTaxId: input.supplierTaxId,
      documentNumber: input.documentNumber,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      currency: input.currency,
      subtotal: input.subtotal,
      taxTotal: input.taxTotal,
      total: input.total,
      iban: input.iban,
      lineItems: input.lineItems,
    },
    { today: todayIso(settings?.timezone ?? "Europe/Lisbon"), duplicates },
  );
  const blocked = wantsValidation && hasBlockingErrors(issues);
  const validating = wantsValidation && !blocked;

  const supplier = await resolveSupplier(supabase, organizationId, input, user.id, validating);

  const newValues = {
    document_type: input.documentType as DocumentType,
    supplier_id: supplier?.id ?? null,
    supplier_name: input.supplierName,
    supplier_tax_id: input.supplierTaxId,
    document_number: input.documentNumber,
    issue_date: input.issueDate,
    due_date: input.dueDate,
    currency: input.currency,
    subtotal: input.subtotal,
    tax_total: input.taxTotal,
    total: input.total,
    payment_reference: input.paymentReference,
    iban: input.iban,
    purchase_order: input.purchaseOrder,
    category_id: input.categoryId,
    notes: input.notes,
  };
  const nextStatus: DocumentStatus = validating ? "validated" : "review_required";

  const { data: updated, error: updateError } = await supabase
    .from("documents")
    .update({
      ...newValues,
      subtotal: numericParam(input.subtotal),
      tax_total: numericParam(input.taxTotal),
      total: numericParam(input.total),
      status: nextStatus,
      review_status: validating ? "validated" : "needs_review",
      validation_issues: toJson(issues),
      possible_duplicate_of: strongestDuplicate(duplicates),
    })
    .eq("id", current.id)
    .eq("organization_id", organizationId)
    .eq("updated_at", input.expectedUpdatedAt)
    .select("id, status")
    .maybeSingle();
  if (updateError) {
    logger.warn("document_review_update_failed", { code: updateError.code });
    throw new AppError(updateError.code === "42501" ? "forbidden" : "internal");
  }
  if (!updated) return { ok: false, error: "errors.conflict" };

  // Line items are replaced only after the optimistic-concurrency gate above passed.
  const { error: liError } = await supabase.rpc("replace_document_line_items", {
    p_document_id: current.id,
    p_items: toJson(
      input.lineItems.map((li) => ({
        description: li.description,
        quantity: li.quantity,
        unit_price: li.unitPrice,
        tax_rate: li.taxRate,
        tax_amount: li.taxAmount,
        line_total: li.lineTotal,
      })),
    ),
  });
  if (liError) {
    logger.warn("line_items_save_failed", { code: liError.code });
    throw new AppError(liError.code === "42501" ? "forbidden" : "internal");
  }


  const before = {
    document_type: current.document_type,
    supplier_id: current.supplier_id,
    supplier_name: current.supplier_name,
    supplier_tax_id: current.supplier_tax_id,
    document_number: current.document_number,
    issue_date: current.issue_date,
    due_date: current.due_date,
    currency: current.currency,
    subtotal: normalizeNumeric(current.subtotal),
    tax_total: normalizeNumeric(current.tax_total),
    total: normalizeNumeric(current.total),
    payment_reference: current.payment_reference,
    iban: current.iban,
    purchase_order: current.purchase_order,
    category_id: current.category_id,
    notes: current.notes,
  };
  const after = {
    ...newValues,
    subtotal: normalizeNumeric(input.subtotal),
    tax_total: normalizeNumeric(input.taxTotal),
    total: normalizeNumeric(input.total),
  };
  const diff = diffValues(before, after);
  if (diff) {
    await recordAudit({
      organizationId,
      actorUserId: user.id,
      action: "document.updated",
      entityType: "document",
      entityId: current.id,
      oldValues: diff.oldValues,
      newValues: diff.newValues,
      metadata: { lineItems: input.lineItems.length },
    });
  }
  if (validating) {
    await recordAudit({
      organizationId,
      actorUserId: user.id,
      action: "document.validated",
      entityType: "document",
      entityId: current.id,
      metadata: { warnings: countIssues(issues).warnings, supplierCreated: supplier?.created ?? false },
    });
  }

  const counts = countIssues(issues);
  await admin.from("document_validation_events").insert({
    organization_id: organizationId,
    document_id: current.id,
    source: wantsValidation ? "validation" : "review_save",
    issues: toJson(issues),
    error_count: counts.errors,
    warning_count: counts.warnings,
    created_by: user.id,
  });
  await admin.rpc("refresh_alerts", { p_org: organizationId });

  if (blocked) return { ok: false, error: "review.validationBlocked", issues };
  return { ok: true, status: nextStatus, issues };
}

function normalizeNumeric(value: string | null): string | null {
  if (value == null) return null;
  const n = value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
  return n === "-0" ? "0" : n;
}

type SimpleAction = "reopen" | "archive" | "unarchive" | "mark_paid" | "mark_unpaid";

/** Lifecycle actions that do not change extracted values. */
export async function changeDocumentState(
  documentId: string,
  action: SimpleAction,
  paidAt?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const capability = action === "archive" || action === "unarchive" ? "archiveDocuments" : "editDocuments";
  const { doc, supabase, user } = await loadAuthorizedDocument(documentId, capability);
  const { data: current } = await supabase
    .from("documents")
    .select("status, validated_at, paid_at, updated_at")
    .eq("id", documentId)
    .single();
  if (!current) throw new AppError("not_found");

  let patch: { status?: DocumentStatus; paid_at?: string | null; review_status?: "needs_review" } = {};
  let auditAction:
    | "document.reopened"
    | "document.archived"
    | "document.unarchived"
    | "document.marked_paid"
    | "document.marked_unpaid";

  switch (action) {
    case "reopen":
      if (current.status !== "validated") return { ok: false, error: "errors.conflict" };
      patch = { status: "review_required", review_status: "needs_review" };
      auditAction = "document.reopened";
      break;
    case "archive":
      if (current.status === "archived" || current.status === "processing" || current.status === "uploading") {
        return { ok: false, error: "errors.conflict" };
      }
      patch = { status: "archived" };
      auditAction = "document.archived";
      break;
    case "unarchive":
      if (current.status !== "archived") return { ok: false, error: "errors.conflict" };
      patch = { status: current.validated_at ? "validated" : "review_required" };
      auditAction = "document.unarchived";
      break;
    case "mark_paid":
      if (current.status !== "validated") return { ok: false, error: "errors.conflict" };
      patch = { paid_at: paidAt && /^\d{4}-\d{2}-\d{2}$/.test(paidAt) ? paidAt : todayIso() };
      auditAction = "document.marked_paid";
      break;
    case "mark_unpaid":
      patch = { paid_at: null };
      auditAction = "document.marked_unpaid";
      break;
  }

  const { data: updated, error } = await supabase
    .from("documents")
    .update(patch)
    .eq("id", documentId)
    .eq("updated_at", current.updated_at)
    .select("id")
    .maybeSingle();
  if (error) {
    logger.warn("document_state_change_failed", { code: error.code, action });
    return { ok: false, error: error.code === "42501" ? "errors.forbidden" : "errors.internal" };
  }
  if (!updated) return { ok: false, error: "errors.conflict" };

  await recordAudit({
    organizationId: doc.organization_id,
    actorUserId: user.id,
    action: auditAction,
    entityType: "document",
    entityId: documentId,
    oldValues: { status: current.status, paid_at: current.paid_at },
    newValues: { status: patch.status ?? current.status, paid_at: "paid_at" in patch ? patch.paid_at : current.paid_at },
  });
  await createSupabaseAdminClient().rpc("refresh_alerts", { p_org: doc.organization_id });
  return { ok: true };
}
