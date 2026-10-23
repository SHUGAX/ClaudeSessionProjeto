import { describe, expect, it } from "vitest";
import { looksLikeAtQr, parseAtQr } from "@/lib/documents/at-qrcode";

const SAMPLE =
  "A:123456789*B:999999990*C:PT*D:FT*E:N*F:20260115*G:FT A/123*H:CSDF7T5H-123*I1:PT*I3:10.00*I4:0.60*I7:100.00*I8:23.00*N:23.60*O:133.60*Q:aBcD*R:9999";

describe("AT invoice QR code", () => {
  it("parses the official payload", () => {
    const result = parseAtQr(SAMPLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      issuerTaxId: "123456789",
      buyerTaxId: null,
      atDocumentType: "FT",
      documentType: "invoice",
      issueDate: "2026-01-15",
      documentNumber: "FT A/123",
      atcud: "CSDF7T5H-123",
      taxTotal: "23.60",
      total: "133.60",
      subtotal: "110.00",
      certificate: "9999",
    });
    expect(result.data.taxLines).toEqual([
      { region: "PT", rateClass: "reduced", base: "10.00", vat: "0.60" },
      { region: "PT", rateClass: "normal", base: "100.00", vat: "23.00" },
    ]);
  });

  it("maps credit notes and receipts", () => {
    const nc = parseAtQr(SAMPLE.replace("D:FT", "D:NC"));
    expect(nc.ok && nc.data.documentType).toBe("credit_note");
    const rg = parseAtQr(SAMPLE.replace("D:FT", "D:FR"));
    expect(rg.ok && rg.data.documentType).toBe("invoice");
  });

  it("keeps the buyer NIF when present", () => {
    const r = parseAtQr(SAMPLE.replace("B:999999990", "B:501442600"));
    expect(r.ok && r.data.buyerTaxId).toBe("501442600");
  });

  it.each([
    ["https://example.com", "not_at_qr"],
    ["", "invalid_length"],
    [SAMPLE.replace("A:123456789", "A:12345"), "invalid_issuer"],
    [SAMPLE.replace("F:20260115", "F:20261315"), "invalid_date"],
    [SAMPLE.replace("G:FT A/123", "G:"), "missing_number"],
    [SAMPLE.replace("O:133.60", "O:abc"), "missing_total"],
  ])("rejects %s", (payload, reason) => {
    expect(parseAtQr(payload)).toEqual({ ok: false, reason });
  });

  it("detects AT payloads", () => {
    expect(looksLikeAtQr(SAMPLE)).toBe(true);
    expect(looksLikeAtQr("WIFI:S:x;;")).toBe(false);
  });
});
