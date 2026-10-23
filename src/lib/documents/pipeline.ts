import type { InvoiceExtraction } from "@/lib/ai/schema";
import type { DocumentExtractionProvider, ExtractionResult } from "@/lib/ai/types";
import { matchSupplier, type SupplierRecord } from "@/lib/suppliers/matching";
import { normalizeTaxId } from "@/lib/validation/tax-id";
import { parseAtQr, type AtQrData } from "./at-qrcode";
import { mergeQrIntoExtraction } from "./qr-merge";
import {
  findDuplicateMatches,
  type DuplicateCandidate,
  type DuplicateMatch,
  type DuplicateSubject,
} from "./duplicates";
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
  /** Decoded QR code payloads found in the original (best effort, never throws). */
  findQrCodes(bytes: Uint8Array, mimeType: string | null): Promise<string[]>;
  /** Appends an immutable extraction record and returns its id. */
  saveExtraction(
    doc: PipelineDocument,
    result: ExtractionResult,
    actorUserId: string,
  ): Promise<string>;
  listSuppliers(organizationId: string): Promise<SupplierRecord[]>;
  findDuplicateCandidates(
    organizationId: string,
    subject: DuplicateSubject,
  ): Promise<DuplicateCandidate[]>;
  applyExtraction(
    doc: PipelineDocument,
    applied: AppliedExtraction,
    actorUserId: string,
  ): Promise<void>;
  markFailed(
    doc: PipelineDocument,
    extractionId: string | null,
    errorCode: string,
    actorUserId: string,
  ): Promise<void>;
  recordValidationEvent(
    doc: PipelineDocument,
    issues: ValidationIssue[],
    actorUserId: string,
  ): Promise<void>;
  audit(
    doc: PipelineDocument,
    action: "document.processing_started" | "document.extracted" | "document.extraction_failed",
    actorUserId: string,
    metadata: Record<string, unknown>,
  ): Promise<void>;
  incrementUsage(
    organizationId: string,
    usage: { aiCalls: number; aiFailures: number; processed: number },
  ): Promise<void>;
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
  await deps.audit(doc, "document.processing_started", actorUserId, {
    provider: deps.provider.name,
  });

  let extractionId: string | null = null;
  try {
    const bytes = await deps.downloadOriginal(doc);

    // 1. Portuguese AT QR code: authoritative fiscal values, no AI needed.
    let qr: { data: AtQrData; payload: string } | null = null;
    for (const payload of await deps.findQrCodes(bytes, doc.mimeType)) {
      const parsed = parseAtQr(payload);
      if (parsed.ok) {
        qr = { data: parsed.data, payload };
        break;
      }
    }

    // 2. AI extraction for everything else (supplier name, due date, lines…).
    let result = await deps.provider.extractInvoice({
      bytes,
      mimeType: doc.mimeType ?? "application/pdf",
      documentId: doc.id,
    });
    const aiFailed = !result.ok;
    const suppliers = await deps.listSuppliers(doc.organizationId);

    if (qr) {
      const knownSupplier = suppliers.find(
        (s) => normalizeTaxId(s.tax_id) === normalizeTaxId(qr.data.issuerTaxId),
      );
      if (result.ok) {
        result = {
          ...result,
          provider: `${result.provider}+at_qr`,
          raw: { model: result.raw, at_qr: qr.payload },
          data: mergeQrIntoExtraction(
            result.data,
            qr.data,
            qr.payload,
            knownSupplier?.name ?? null,
          ),
        };
      } else {
        // Keep the failed AI attempt in the history, then continue with the QR code alone.
        await deps.saveExtraction(doc, result, actorUserId);
        result = {
          ok: true,
          provider: "at_qr",
          model: "portaria-195-2020",
          promptVersion: "n/a",
          schemaVersion: result.schemaVersion,
          raw: { at_qr: qr.payload, ai_error: result.errorCode },
          data: mergeQrIntoExtraction(null, qr.data, qr.payload, knownSupplier?.name ?? null),
          durationMs: 0,
        };
      }
    }
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
    const match = matchSupplier(
      { name: data.supplier.name, taxId: data.supplier.taxId },
      suppliers,
    );
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
      atcud: data.atcud ?? null,
    };
    const duplicates = findDuplicateMatches(
      subject,
      await deps.findDuplicateCandidates(doc.organizationId, subject),
    );
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
      { today: await deps.today(doc.organizationId), duplicates, atStatus: data.atStatus ?? null },
    );

    await deps.applyExtraction(
      doc,
      {
        extractionId,
        data,
        supplier,
        categoryId,
        issues,
        possibleDuplicateOf: strongestDuplicate(duplicates),
      },
      actorUserId,
    );
    await deps.recordValidationEvent(doc, issues, actorUserId);
    await deps.incrementUsage(doc.organizationId, {
      aiCalls: 1,
      aiFailures: aiFailed ? 1 : 0,
      processed: 1,
    });
    await deps.audit(doc, "document.extracted", actorUserId, {
      extractionId,
      provider: result.provider,
      model: result.model,
      promptVersion: result.promptVersion,
      durationMs: result.durationMs,
      atQrCode: Boolean(qr),
      aiFailed,
      issues: issues.map((i) => i.code),
    });
    await deps.afterProcessing(doc.organizationId);
    return { status: "success", extractionId, issues };
  } catch (error) {
    // Infrastructure failure (storage, database...). The original stays intact.
    await deps.markFailed(doc, extractionId, "pipeline_error", actorUserId).catch(() => undefined);
    await deps
      .audit(doc, "document.extraction_failed", actorUserId, {
        extractionId,
        errorCode: "pipeline_error",
      })
      .catch(() => undefined);
    await deps.afterProcessing(doc.organizationId).catch(() => undefined);
    throw error;
  }
}

export function strongestDuplicate(matches: DuplicateMatch[]): string | null {
  const strong = matches.find((m) => m.kind === "exact_file" || m.kind === "same_number");
  return strong?.documentId ?? null;
}
