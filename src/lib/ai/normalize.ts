import { parseBusinessDate } from "@/lib/dates";
import { parseAmount } from "@/lib/money";
import { EXTRACTION_SCHEMA_VERSION, rawExtractionSchema, type InvoiceExtraction } from "./schema";

const ISO_CURRENCY = /^[A-Z]{3}$/;
const CURRENCY_ALIASES: Record<string, string> = { "€": "EUR", EURO: "EUR", EUROS: "EUR", $: "USD", "£": "GBP" };

function normalizeCurrency(value: string | null): string | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase();
  const mapped = CURRENCY_ALIASES[upper] ?? upper;
  return ISO_CURRENCY.test(mapped) ? mapped : null;
}

function normalizeTaxIdDisplay(value: string | null): string | null {
  if (!value) return null;
  const compact = value.replace(/\s+/g, "").toUpperCase();
  return compact.length ? compact.slice(0, 40) : null;
}

function normalizeIban(value: string | null): string | null {
  if (!value) return null;
  const compact = value.replace(/\s+/g, "").toUpperCase();
  return /^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(compact) ? compact : null;
}

function normalizeRate(value: string | number | null): string | null {
  const parsed = parseAmount(typeof value === "string" ? value.replace("%", "") : value);
  if (parsed == null) return null;
  const n = Number(parsed);
  // A rate expressed as fraction (0.23) is converted to percent.
  if (n > 0 && n < 1) return String(Math.round(n * 10000) / 100);
  return n >= 0 && n <= 100 ? parsed : null;
}

export type NormalizeResult = { ok: true; data: InvoiceExtraction } | { ok: false; issues: string[] };

/**
 * Validates the untrusted model output with Zod and converts it to canonical
 * values (decimal strings, ISO dates, ISO currency). Values that cannot be
 * parsed become null rather than being guessed.
 */
export function normalizeExtraction(raw: unknown): NormalizeResult {
  const parsed = rawExtractionSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.slice(0, 10).map((i) => `${i.path.join(".")}: ${i.code}`) };
  }
  const r = parsed.data;
  return {
    ok: true,
    data: {
      schemaVersion: EXTRACTION_SCHEMA_VERSION,
      documentType: r.document_type,
      supplier: {
        name: r.supplier.name,
        taxId: normalizeTaxIdDisplay(r.supplier.tax_id),
        address: r.supplier.address,
        email: r.supplier.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.supplier.email) ? r.supplier.email.toLowerCase() : null,
      },
      customer: { name: r.customer.name, taxId: normalizeTaxIdDisplay(r.customer.tax_id) },
      documentNumber: r.document_number,
      issueDate: parseBusinessDate(r.issue_date),
      dueDate: parseBusinessDate(r.due_date),
      currency: normalizeCurrency(r.currency),
      subtotal: parseAmount(r.subtotal),
      taxTotal: parseAmount(r.tax_total),
      total: parseAmount(r.total),
      taxBreakdown: r.tax_breakdown.map((t) => ({
        rate: normalizeRate(t.rate),
        base: parseAmount(t.base),
        amount: parseAmount(t.amount),
      })),
      lineItems: r.line_items
        .map((li) => ({
          description: li.description,
          quantity: parseAmount(li.quantity),
          unitPrice: parseAmount(li.unit_price),
          taxRate: normalizeRate(li.tax_rate),
          taxAmount: parseAmount(li.tax_amount),
          lineTotal: parseAmount(li.line_total),
        }))
        .filter((li) => li.description || li.lineTotal),
      paymentReference: r.payment_reference,
      iban: normalizeIban(r.iban),
      purchaseOrder: r.purchase_order,
      confidence: r.confidence,
      warnings: r.warnings,
    },
  };
}
