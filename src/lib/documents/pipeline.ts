import type { InvoiceExtraction } from "@/lib/ai/schema";
import type { DocumentExtractionProvider, ExtractionResult } from "@/lib/ai/types";
import { matchSupplier, type SupplierRecord } from "@/lib/suppliers/matching";
import { findDuplicateMatches, type DuplicateCandidate, type DuplicateMatch, type DuplicateSubject } from "./duplicates";
import { validateDocument, type ValidationIssue } from "./validation";

export interface PipelineDocument {
  id: string;
  organizationId: string;
  storagePath: string;
  mimeType: string | null;
  fileSha256: string | null;
  status: string;
  documentType: string;
  categoryId: string | null;
}

export interface AppliedExtraction {
  extractionId: string;
  data: InvoiceExtraction;
  supplier: SupplierRecord | null;
  categoryId: string | null;
  issues: ValidationIssue[];
  possibleDuplicateOf: string | null;
}

/**
 * Side effects required by the extraction pipeline. The production
 * implementation uses Supabase (see repository.ts); tests use in-memory fakes.
 */
export interface PipelineDeps {
  provider: DocumentExtractionProvider;
  /** Atomically moves the document to "processing"; false if not allowed / already running. */
  claimForProcessing(doc: PipelineDocument, actorUserId: string): Promise<boolean>;
  downloadOriginal(doc: PipelineDocument): Promise<Uint8Array>;
  /** Appends an immutable extraction record and returns its id. */
  saveExtraction(doc: PipelineDocument, result: ExtractionResult, actorUserId: string): Promise<string>;
  listSuppliers(organizationId: string): Promise<SupplierRecord[]>;
  findDuplicateCandidates(organizationId: string, subject: DuplicateSubject): Promise<DuplicateCandidate[]>;
  applyExtraction(doc: PipelineDocument, applied: AppliedExtraction, actorUserId: string): Promise<void>;
  markFailed(doc: PipelineDocument, extractionId: string | null, errorCode: string, actorUserId: string): Promise<void>;
  recordValidationEvent(doc: PipelineDocument, issues: ValidationIssue[], actorUserId: string): Promise<void>;
  audit(
    doc: PipelineDocument,
    action: "document.processing_started" | "document.extracted" | "document.extraction_failed",
    actorUserId: string,
    metadata: Record<string, unknown>,
  ): Promise<void>;
  incrementUsage(organizationId: string, usage: { aiCalls: number; aiFailures: number; processed: number }): Promise<void>;
  today(organizationId: string): Promise<string>;
  afterProcessing(organizationId: string): Promise<void>;
}

export type PipelineOutcome =
  | { status: "success"; extractionId: string; issues: ValidationIssue[] }
  | { status: "failed"; extractionId: string | null; errorCode: string }
  | { status: "skipped"; reason: "not_claimable" };

/**
 * AI extraction pipeline:
 *   claim → download original → provider → persist extraction (always, even on
 *   failure) → supplier resolution → duplicates → deterministic validation →
 *   apply suggested values → status "review_required".
 * The original file is never modified. On failure the document becomes
 * "failed" (retryable) and keeps its original.
 */
export async function runExtractionPipeline(
  doc: PipelineDocument,
  actorUserId: string,
  deps: PipelineDeps,
): Promise<PipelineOutcome> {
  const claimed = await deps.claimForProcessing(doc, actorUserId);
  if (!claimed) return { status: "skipped", reason: "not_claimable" };
  await deps.audit(doc, "document.processing_started", actorUserId, { provider: deps.provider.name });

  let extractionId: string | null = null;
  try {
    const bytes = await deps.downloadOriginal(doc);
    const result = await deps.provider.extractInvoice({
      bytes,
      mimeType: doc.mimeType ?? "application/pdf",
      documentId: doc.id,
    });
    extractionId = await deps.saveExtraction(doc, result, actorUserId);

    if (!result.ok) {
      await deps.markFailed(doc, extractionId, result.errorCode, actorUserId);
      await deps.incrementUsage(doc.organizationId, { aiCalls: 1, aiFailures: 1, processed: 0 });
      await deps.audit(doc, "document.extraction_failed", actorUserId, {
        extractionId,
        errorCode: result.errorCode,
        provider: result.provider,
        model: result.model,
      });
      await deps.afterProcessing(doc.organizationId);
      return { status: "failed", extractionId, errorCode: result.errorCode };
    }

    const data = result.data;
    const suppliers = await deps.listSuppliers(doc.organizationId);
    const match = matchSupplier({ name: data.supplier.name, taxId: data.supplier.taxId }, suppliers);
    // Only a deterministic tax-ID match is linked automatically; names are suggestions.
    const supplier = match.kind === "tax_id" ? match.supplier : null;
    const categoryId = doc.categoryId ?? supplier?.default_category_id ?? null;

    const subject: DuplicateSubject = {
      id: doc.id,
      supplierId: supplier?.id ?? null,
      supplierTaxId: data.supplier.taxId,
      documentNumber: data.documentNumber,
      issueDate: data.issueDate,
      total: data.total,
      fileSha256: doc.fileSha256,
    };
    const duplicates = findDuplicateMatches(subject, await deps.findDuplicateCandidates(doc.organizationId, subject));
    const issues = validateDocument(
      {
        documentType: data.documentType,
        supplierName: data.supplier.name,
        supplierTaxId: data.supplier.taxId,
        documentNumber: data.documentNumber,
        issueDate: data.issueDate,
        dueDate: data.dueDate,
        currency: data.currency,
        subtotal: data.subtotal,
        taxTotal: data.taxTotal,
        total: data.total,
        iban: data.iban,
        lineItems: data.lineItems,
      },
      { today: await deps.today(doc.organizationId), duplicates },
    );

    await deps.applyExtraction(
      doc,
      { extractionId, data, supplier, categoryId, issues, possibleDuplicateOf: strongestDuplicate(duplicates) },
      actorUserId,
    );
    await deps.recordValidationEvent(doc, issues, actorUserId);
    await deps.incrementUsage(doc.organizationId, { aiCalls: 1, aiFailures: 0, processed: 1 });
    await deps.audit(doc, "document.extracted", actorUserId, {
      extractionId,
      provider: result.provider,
      model: result.model,
      promptVersion: result.promptVersion,
      durationMs: result.durationMs,
      issues: issues.map((i) => i.code),
    });
    await deps.afterProcessing(doc.organizationId);
    return { status: "success", extractionId, issues };
  } catch (error) {
    // Infrastructure failure (storage, database...). The original stays intact.
    await deps.markFailed(doc, extractionId, "pipeline_error", actorUserId).catch(() => undefined);
    await deps
      .audit(doc, "document.extraction_failed", actorUserId, { extractionId, errorCode: "pipeline_error" })
      .catch(() => undefined);
    await deps.afterProcessing(doc.organizationId).catch(() => undefined);
    throw error;
  }
}

export function strongestDuplicate(matches: DuplicateMatch[]): string | null {
  const strong = matches.find((m) => m.kind === "exact_file" || m.kind === "same_number");
  return strong?.documentId ?? null;
}
