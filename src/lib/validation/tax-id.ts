/**
 * Normalises a tax identifier for comparison. Keep in sync with the SQL
 * function public.normalize_tax_id().
 */
export function normalizeTaxId(value: string | null | undefined): string | null {
  if (value == null) return null;
  const compact = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const withoutPt = /^PT\d{9}$/.test(compact) ? compact.slice(2) : compact;
  return withoutPt.length > 0 ? withoutPt : null;
}
