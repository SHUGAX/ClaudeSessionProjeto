import { normalizeTaxId } from "@/lib/validation/tax-id";

const LEGAL_SUFFIXES = [
  "lda", "limitada", "sa", "s a", "unipessoal", "sociedade anonima", "sgps", "crl", "ace",
  "ltd", "limited", "inc", "llc", "gmbh", "sl", "sas", "sarl", "bv", "nv", "plc", "co",
];

/** Canonical form of a company name for comparison ("EDP Comercial, S.A." → "edp comercial"). */
export function normalizeCompanyName(name: string): string {
  let value = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of LEGAL_SUFFIXES) {
      if (value.endsWith(` ${suffix}`)) {
        value = value.slice(0, -(suffix.length + 1)).trim();
        changed = true;
      }
    }
  }
  return value.replace(/\s+/g, " ");
}

function bigrams(value: string): Map<string, number> {
  const map = new Map<string, number>();
  const s = ` ${value} `;
  for (let i = 0; i < s.length - 1; i++) {
    const bg = s.slice(i, i + 2);
    map.set(bg, (map.get(bg) ?? 0) + 1);
  }
  return map;
}

/** Sørensen–Dice coefficient on character bigrams (0..1). */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeCompanyName(a);
  const nb = normalizeCompanyName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ba = bigrams(na);
  const bb = bigrams(nb);
  let overlap = 0;
  let total = 0;
  for (const [bg, count] of ba) {
    overlap += Math.min(count, bb.get(bg) ?? 0);
    total += count;
  }
  for (const count of bb.values()) total += count;
  return total === 0 ? 0 : (2 * overlap) / total;
}

export interface SupplierRecord {
  id: string;
  name: string;
  tax_id: string | null;
  default_category_id: string | null;
}

export type SupplierMatch<T extends SupplierRecord = SupplierRecord> =
  | { kind: "tax_id"; supplier: T }
  | { kind: "name_suggestion"; supplier: T; score: number }
  | { kind: "none" };

export const NAME_SUGGESTION_THRESHOLD = 0.82;

/**
 * Supplier resolution policy:
 *  - identical normalised tax ID → automatic association (deterministic)
 *  - otherwise similar name → SUGGESTION only (a human confirms)
 * A tax ID mismatch is never overridden by a name match.
 */
export function matchSupplier<T extends SupplierRecord>(
  extracted: { name: string | null; taxId: string | null },
  suppliers: T[],
): SupplierMatch<T> {
  const taxId = normalizeTaxId(extracted.taxId);
  if (taxId) {
    const byTax = suppliers.find((s) => normalizeTaxId(s.tax_id) === taxId);
    if (byTax) return { kind: "tax_id", supplier: byTax };
  }
  if (!extracted.name) return { kind: "none" };

  let best: { supplier: T; score: number } | null = null;
  for (const supplier of suppliers) {
    const supplierTax = normalizeTaxId(supplier.tax_id);
    // Different, known tax IDs mean different legal entities.
    if (taxId && supplierTax && supplierTax !== taxId) continue;
    const score = nameSimilarity(extracted.name, supplier.name);
    if (score >= NAME_SUGGESTION_THRESHOLD && (!best || score > best.score)) best = { supplier, score };
  }
  return best ? { kind: "name_suggestion", ...best } : { kind: "none" };
}
