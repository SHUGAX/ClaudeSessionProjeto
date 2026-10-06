import { describe, expect, it } from "vitest";
import { isValidPortugueseNif, looksLikePortugueseNif } from "@/lib/validation/nif";
import { normalizeTaxId } from "@/lib/validation/tax-id";
import { isValidIban } from "@/lib/validation/iban";

describe("Portuguese NIF", () => {
  it.each(["123456789", "PT123456789", "501442600", "500100144", "980245974"])("accepts valid NIF %s", (nif) => {
    expect(isValidPortugueseNif(nif)).toBe(true);
  });

  it.each(["123456788", "12345678", "1234567890", "abcdefghi", "400000000"])("rejects invalid NIF %s", (nif) => {
    expect(isValidPortugueseNif(nif)).toBe(false);
  });

  it("detects NIF-like values regardless of formatting", () => {
    expect(looksLikePortugueseNif("PT 123 456 789")).toBe(true);
    expect(looksLikePortugueseNif("ESB12345678")).toBe(false);
  });
});

describe("normalizeTaxId", () => {
  it("strips PT prefix and separators", () => {
    expect(normalizeTaxId("PT 123.456.789")).toBe("123456789");
    expect(normalizeTaxId("pt123456789")).toBe("123456789");
  });
  it("keeps foreign identifiers", () => {
    expect(normalizeTaxId("ES-B12345678")).toBe("ESB12345678");
  });
  it("returns null for empty values", () => {
    expect(normalizeTaxId("  ")).toBeNull();
    expect(normalizeTaxId(null)).toBeNull();
  });
});

describe("IBAN", () => {
  it("validates checksums", () => {
    expect(isValidIban("PT50 0002 0123 1234 5678 9015 4")).toBe(true);
    expect(isValidIban("GB82 WEST 1234 5698 7654 32")).toBe(true);
    expect(isValidIban("PT50 0002 0123 1234 5678 9015 5")).toBe(false);
  });
});
