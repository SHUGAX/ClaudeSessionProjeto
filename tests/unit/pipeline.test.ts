import { describe, expect, it, vi } from "vitest";
import type { DocumentExtractionProvider, ExtractionResult } from "@/lib/ai/types";
import { normalizeExtraction } from "@/lib/ai/normalize";
import {
  runExtractionPipeline,
  type PipelineDeps,
  type PipelineDocument,
} from "@/lib/documents/pipeline";

const doc: PipelineDocument = {
  id: "doc-1",
  organizationId: "org-1",
  storagePath: "organizations/org-1/documents/doc-1/original.pdf",
  mimeType: "application/pdf",
  fileSha256: "a".repeat(64),
  status: "uploaded",
  documentType: "invoice",
  categoryId: null,
};

const base = {
  provider: "fake",
  model: "fake-1",
  promptVersion: "p1",
  schemaVersion: "s1",
  durationMs: 5,
};

function successResult(): ExtractionResult {
  const normalized = normalizeExtraction({
    document_type: "invoice",
    supplier: { name: "Fornecedor X", tax_id: "123456789" },
    document_number: "FT 1",
    issue_date: "2026-01-10",
    due_date: "2026-02-10",
    currency: "EUR",
    subtotal: "100.00",
    tax_total: "23.00",
    total: "123.00",
  });
  if (!normalized.ok) throw new Error("fixture invalid");
  return { ok: true, ...base, raw: {}, data: normalized.data };
}

function makeDeps(result: ExtractionResult | Error, overrides: Partial<PipelineDeps> = {}) {
  const storage = new Map([[doc.storagePath, new Uint8Array([1, 2, 3])]]);
  const calls: string[] = [];
  const provider: DocumentExtractionProvider = {
    name: "fake",
    model: "fake-1",
    extractInvoice: vi.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    }),
  };
  const deps: PipelineDeps = {
    provider,
    claimForProcessing: vi.fn(async () => true),
    downloadOriginal: vi.fn(async (d) => storage.get(d.storagePath)!),
    saveExtraction: vi.fn(async () => {
      calls.push("saveExtraction");
      return "ext-1";
    }),
    listSuppliers: vi.fn(async () => [
      { id: "sup-1", name: "Fornecedor X", tax_id: "PT123456789", default_category_id: "cat-1" },
    ]),
    findDuplicateCandidates: vi.fn(async () => []),
    applyExtraction: vi.fn(async () => {
      calls.push("applyExtraction");
    }),
    markFailed: vi.fn(async () => {
      calls.push("markFailed");
    }),
    recordValidationEvent: vi.fn(async () => undefined),
    audit: vi.fn(async (_d, action) => {
      calls.push(action);
    }),
    incrementUsage: vi.fn(async () => undefined),
    today: vi.fn(async () => "2026-03-01"),
    afterProcessing: vi.fn(async () => undefined),
    ...overrides,
  };
  return { deps, storage, calls };
}

describe("runExtractionPipeline", () => {
  it("applies a valid extraction, links the supplier by tax id and suggests its category", async () => {
    const { deps } = makeDeps(successResult());
    const outcome = await runExtractionPipeline(doc, "user-1", deps);
    expect(outcome.status).toBe("success");
    const applied = vi.mocked(deps.applyExtraction).mock.calls[0]![1];
    expect(applied.supplier?.id).toBe("sup-1");
    expect(applied.categoryId).toBe("cat-1");
    expect(applied.issues).toEqual([]);
    expect(deps.incrementUsage).toHaveBeenCalledWith("org-1", {
      aiCalls: 1,
      aiFailures: 0,
      processed: 1,
    });
  });

  it("AI failure: stores the failed extraction, marks the document failed and keeps the original", async () => {
    const failure: ExtractionResult = {
      ok: false,
      ...base,
      errorCode: "timeout",
      errorMessage: "timed out",
    };
    const { deps, storage, calls } = makeDeps(failure);
    const outcome = await runExtractionPipeline(doc, "user-1", deps);
    expect(outcome).toEqual({ status: "failed", extractionId: "ext-1", errorCode: "timeout" });
    expect(calls).toContain("saveExtraction");
    expect(calls).toContain("markFailed");
    expect(calls).not.toContain("applyExtraction");
    expect(calls).toContain("document.extraction_failed");
    expect(storage.get(doc.storagePath)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("invalid AI output is rejected without touching document data", async () => {
    const invalid: ExtractionResult = {
      ok: false,
      ...base,
      errorCode: "schema_mismatch",
      errorMessage: "bad",
      raw: { x: 1 },
    };
    const { deps } = makeDeps(invalid);
    const outcome = await runExtractionPipeline(doc, "user-1", deps);
    expect(outcome.status).toBe("failed");
    expect(deps.applyExtraction).not.toHaveBeenCalled();
  });

  it("infrastructure errors mark the document failed and are re-thrown", async () => {
    const { deps, storage } = makeDeps(new Error("network down"));
    await expect(runExtractionPipeline(doc, "user-1", deps)).rejects.toThrow("network down");
    expect(deps.markFailed).toHaveBeenCalledWith(doc, null, "pipeline_error", "user-1");
    expect(storage.has(doc.storagePath)).toBe(true);
  });

  it("does nothing when the document cannot be claimed (already processing / not allowed)", async () => {
    const { deps } = makeDeps(successResult(), { claimForProcessing: vi.fn(async () => false) });
    const outcome = await runExtractionPipeline(doc, "user-1", deps);
    expect(outcome).toEqual({ status: "skipped", reason: "not_claimable" });
    expect(deps.provider.extractInvoice).not.toHaveBeenCalled();
  });

  it("flags possible duplicates for human inspection (never merges)", async () => {
    const { deps } = makeDeps(successResult(), {
      findDuplicateCandidates: vi.fn(async () => [
        {
          id: "doc-0",
          supplierId: "sup-1",
          supplierTaxId: "123456789",
          documentNumber: "ft 1",
          issueDate: "2026-01-10",
          total: "123.00",
          fileSha256: null,
          status: "validated",
        },
      ]),
    });
    await runExtractionPipeline(doc, "user-1", deps);
    const applied = vi.mocked(deps.applyExtraction).mock.calls[0]![1];
    expect(applied.possibleDuplicateOf).toBe("doc-0");
    expect(applied.issues.map((i) => i.code)).toContain("possible_duplicate");
  });
});
