import { describe, expect, it } from "vitest";
import { MockExtractionProvider } from "@/lib/ai/mock";
import { normalizeExtraction } from "@/lib/ai/normalize";

const valid = {
  document_type: "invoice",
  supplier: {
    name: "EDP Comercial, S.A.",
    tax_id: "PT 503 504 564",
    address: null,
    email: "FATURAS@EDP.PT",
  },
  customer: { name: "Cliente, Lda.", tax_id: "123456789" },
  document_number: "FT 2024A/123",
  issue_date: "15/03/2024",
  due_date: "2024-04-14",
  currency: "€",
  subtotal: "1.234,56",
  tax_total: "283,95",
  total: 1518.51,
  tax_breakdown: [{ rate: "0.23", base: "1234.56", amount: "283.95" }],
  line_items: [
    {
      description: "Energia",
      quantity: "1",
      unit_price: "1234,56",
      tax_rate: "23%",
      tax_amount: null,
      line_total: "1234.56",
    },
  ],
  payment_reference: null,
  iban: "PT50 0002 0123 1234 5678 9015 4",
  purchase_order: null,
  confidence: { overall: 0.9 },
  warnings: [],
};

describe("normalizeExtraction", () => {
  it("accepts and normalises a valid extraction", () => {
    const result = normalizeExtraction(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.supplier.taxId).toBe("PT503504564");
    expect(result.data.supplier.email).toBe("faturas@edp.pt");
    expect(result.data.documentNumber).toBe("FT 2024A/123");
    expect(result.data.issueDate).toBe("2024-03-15");
    expect(result.data.currency).toBe("EUR");
    expect(result.data.subtotal).toBe("1234.56");
    expect(result.data.taxTotal).toBe("283.95");
    expect(result.data.total).toBe("1518.51");
    expect(result.data.taxBreakdown[0]?.rate).toBe("23");
    expect(result.data.lineItems[0]?.unitPrice).toBe("1234.56");
    expect(result.data.lineItems[0]?.taxRate).toBe("23");
    expect(result.data.iban).toBe("PT50000201231234567890154");
  });

  it("turns unparseable values into null instead of guessing", () => {
    const result = normalizeExtraction({
      ...valid,
      issue_date: "Março 2024",
      total: "n/a",
      currency: "Euros??",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.issueDate).toBeNull();
    expect(result.data.total).toBeNull();
    expect(result.data.currency).toBeNull();
  });

  it("rejects structurally invalid output", () => {
    expect(normalizeExtraction({ ...valid, line_items: "oops" }).ok).toBe(false);
    expect(normalizeExtraction("not json object").ok).toBe(false);
    expect(normalizeExtraction(null).ok).toBe(false);
  });

  it("falls back to 'other' for unknown document types", () => {
    const result = normalizeExtraction({ ...valid, document_type: "spaceship" });
    expect(result.ok && result.data.documentType).toBe("other");
  });

  it("tolerates missing optional sections", () => {
    const result = normalizeExtraction({ document_type: "receipt" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.supplier.name).toBeNull();
    expect(result.data.lineItems).toEqual([]);
  });
});

describe("MockExtractionProvider", () => {
  const provider = new MockExtractionProvider();
  const enc = (s: string) => new TextEncoder().encode(s);

  it("is deterministic for the same bytes", async () => {
    const a = await provider.extractInvoice({
      bytes: enc("%PDF-1.4 abc"),
      mimeType: "application/pdf",
      documentId: "x",
    });
    const b = await provider.extractInvoice({
      bytes: enc("%PDF-1.4 abc"),
      mimeType: "application/pdf",
      documentId: "x",
    });
    expect(a.ok && b.ok && a.data.total === b.data.total).toBe(true);
  });

  it("simulates failures and invalid responses", async () => {
    const fail = await provider.extractInvoice({
      bytes: enc("%PDF MOCK_AI_FAIL"),
      mimeType: "application/pdf",
      documentId: "x",
    });
    expect(fail.ok).toBe(false);
    const invalid = await provider.extractInvoice({
      bytes: enc("%PDF MOCK_AI_INVALID"),
      mimeType: "application/pdf",
      documentId: "x",
    });
    expect(invalid.ok === false && invalid.errorCode).toBe("schema_mismatch");
  });
});
