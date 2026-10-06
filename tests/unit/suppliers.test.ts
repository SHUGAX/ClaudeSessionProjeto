import { describe, expect, it } from "vitest";
import { matchSupplier, nameSimilarity, normalizeCompanyName } from "@/lib/suppliers/matching";

const suppliers = [
  { id: "1", name: "EDP Comercial, S.A.", tax_id: "503504564", default_category_id: "cat-energy" },
  { id: "2", name: "Vodafone Portugal - Comunicações Pessoais, S.A.", tax_id: "502544180", default_category_id: null },
  { id: "3", name: "Papelaria Central Lda", tax_id: null, default_category_id: null },
];

describe("supplier matching", () => {
  it("normalises legal suffixes and accents", () => {
    expect(normalizeCompanyName("EDP Comercial, S.A.")).toBe("edp comercial");
    expect(normalizeCompanyName("Papelaria Central, Lda.")).toBe("papelaria central");
    expect(normalizeCompanyName("Comunicações Unipessoal Lda")).toBe("comunicacoes");
  });

  it("associates automatically by tax id (any formatting)", () => {
    const match = matchSupplier({ name: "Something else", taxId: "PT 503 504 564" }, suppliers);
    expect(match).toEqual({ kind: "tax_id", supplier: suppliers[0] });
  });

  it("only suggests by name", () => {
    const match = matchSupplier({ name: "Papelaria Central, Lda.", taxId: null }, suppliers);
    expect(match.kind).toBe("name_suggestion");
  });

  it("never suggests a supplier with a different known tax id", () => {
    const match = matchSupplier({ name: "EDP Comercial SA", taxId: "999999990" }, suppliers);
    expect(match.kind).toBe("none");
  });

  it("returns none for unrelated names", () => {
    expect(matchSupplier({ name: "Restaurante O Bom Garfo", taxId: null }, suppliers).kind).toBe("none");
    expect(nameSimilarity("abc", "")).toBe(0);
  });
});
