import { describe, expect, it } from "vitest";
import { findDuplicateMatches, normalizeDocumentNumber, type DuplicateCandidate } from "@/lib/documents/duplicates";
import { hasBlockingErrors, validateDocument, type ValidatableDocument } from "@/lib/documents/validation";

const base: ValidatableDocument = {
  documentType: "invoice",
  supplierName: "Fornecedor Exemplo, Lda.",
  supplierTaxId: "123456789",
  documentNumber: "FT 2026/1",
  issueDate: "2026-01-10",
  dueDate: "2026-02-10",
  currency: "EUR",
  subtotal: "100.00",
  taxTotal: "23.00",
  total: "123.00",
  iban: null,
  lineItems: [],
};
const ctx = { today: "2026-03-01", duplicates: [] };
const codes = (doc: Partial<ValidatableDocument>) => validateDocument({ ...base, ...doc }, ctx).map((i) => i.code);

describe("validateDocument", () => {
  it("accepts a consistent invoice", () => {
    expect(validateDocument(base, ctx)).toEqual([]);
  });

  it("warns (does not block) when total != subtotal + VAT", () => {
    const issues = validateDocument({ ...base, total: "120.00" }, ctx);
    expect(issues.map((i) => i.code)).toContain("totals_mismatch");
    expect(hasBlockingErrors(issues)).toBe(false);
  });

  it("tolerates small rounding differences", () => {
    expect(codes({ total: "123.03" })).not.toContain("totals_mismatch");
  });

  it("blocks when required fields are missing", () => {
    const issues = validateDocument({ ...base, total: null, issueDate: null }, ctx);
    expect(hasBlockingErrors(issues)).toBe(true);
  });

  it("flags due date before issue date", () => {
    expect(codes({ dueDate: "2026-01-01" })).toContain("due_before_issue");
  });

  it("flags invalid currency as error", () => {
    expect(hasBlockingErrors(validateDocument({ ...base, currency: "EURO" }, ctx))).toBe(true);
  });

  it("warns on bad Portuguese NIF but accepts foreign tax IDs", () => {
    expect(codes({ supplierTaxId: "123456788" })).toContain("invalid_nif");
    expect(codes({ supplierTaxId: "ESB12345678" })).not.toContain("invalid_nif");
  });

  it("allows negative totals on credit notes only", () => {
    expect(codes({ total: "-123.00", subtotal: "-100.00", taxTotal: "-23.00" })).toContain("negative_total");
    expect(
      codes({ documentType: "credit_note", total: "-123.00", subtotal: "-100.00", taxTotal: "-23.00" }),
    ).not.toContain("negative_total");
  });

  it("checks line items against subtotal", () => {
    expect(codes({ lineItems: [{ lineTotal: "50.00" }, { lineTotal: "40.00" }] })).toContain("line_items_mismatch");
    expect(codes({ lineItems: [{ lineTotal: "60.00" }, { lineTotal: "40.00" }] })).not.toContain("line_items_mismatch");
  });

  it("flags future dates", () => {
    expect(codes({ issueDate: "2026-05-01", dueDate: null })).toContain("future_issue_date");
  });

  it("reports duplicates as warnings with the related document", () => {
    const issues = validateDocument(base, { ...ctx, duplicates: [{ documentId: "doc-2", kind: "same_number" }] });
    expect(issues).toContainEqual(
      expect.objectContaining({ code: "possible_duplicate", severity: "warning", relatedDocumentId: "doc-2" }),
    );
  });
});

describe("duplicate detection", () => {
  const subject = {
    id: "a",
    supplierId: "s1",
    supplierTaxId: "PT123456789",
    documentNumber: "FT 2026/1",
    issueDate: "2026-01-10",
    total: "123.00",
    fileSha256: "f".repeat(64),
  };
  const candidate = (over: Partial<DuplicateCandidate>): DuplicateCandidate => ({
    id: "b",
    supplierId: null,
    supplierTaxId: null,
    documentNumber: null,
    issueDate: null,
    total: null,
    fileSha256: null,
    status: "validated",
    ...over,
  });

  it("normalises document numbers", () => {
    expect(normalizeDocumentNumber(" ft 2026/ 1 ")).toBe("FT2026/1");
  });

  it("detects identical files", () => {
    expect(findDuplicateMatches(subject, [candidate({ fileSha256: "f".repeat(64) })])).toEqual([
      { documentId: "b", kind: "exact_file" },
    ]);
  });

  it("detects same supplier (by tax id) + same number", () => {
    const matches = findDuplicateMatches(subject, [candidate({ supplierTaxId: "123456789", documentNumber: "ft2026/1" })]);
    expect(matches).toEqual([{ documentId: "b", kind: "same_number" }]);
  });

  it("does not flag same number from a different supplier", () => {
    expect(findDuplicateMatches(subject, [candidate({ supplierTaxId: "999999990", documentNumber: "FT 2026/1" })])).toEqual(
      [],
    );
  });

  it("detects weak duplicates (same supplier, date and total)", () => {
    const matches = findDuplicateMatches(subject, [
      candidate({ supplierId: "s1", documentNumber: "OTHER", issueDate: "2026-01-10", total: "123.0" }),
    ]);
    expect(matches).toEqual([{ documentId: "b", kind: "same_date_total" }]);
  });

  it("ignores archived documents and itself", () => {
    expect(
      findDuplicateMatches(subject, [
        candidate({ id: "a", fileSha256: "f".repeat(64) }),
        candidate({ fileSha256: "f".repeat(64), status: "archived" }),
      ]),
    ).toEqual([]);
  });
});
