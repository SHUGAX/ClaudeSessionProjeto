import "server-only";
import Decimal from "decimal.js";
import { addDaysIso, todayIso } from "@/lib/dates";
import type { UserSupabaseClient } from "@/lib/supabase/server";
import type { Intent, Period } from "./intents";
import { findMentioned } from "./intents";

export interface AnswerRow {
  label: string;
  value: string | null; // decimal string (money) or null
  detail?: string | null;
  href?: { kind: "document" | "supplier"; id: string };
}

export interface AssistantAnswer {
  intent: Intent;
  /** i18n key under "assistant.answers" */
  answer:
    | "spend_by_supplier"
    | "total_spend"
    | "top_suppliers"
    | "spend_by_category"
    | "invoices_due"
    | "documents_to_review"
    | "unknown"
    | "supplier_not_found";
  vars: Record<string, string | number>;
  total: string | null;
  rows: AnswerRow[];
  sourceCount: number;
}

export function periodRange(
  period: Period,
  today: string,
): { from: string | null; to: string | null } {
  const [y, m] = today.split("-").map(Number) as [number, number];
  const pad = (n: number) => String(n).padStart(2, "0");
  switch (period) {
    case "this_month":
      return { from: `${y}-${pad(m)}-01`, to: today };
    case "last_month": {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return { from: `${py}-${pad(pm)}-01`, to: addDaysIso(`${y}-${pad(m)}-01`, -1) };
    }
    case "this_year":
      return { from: `${y}-01-01`, to: today };
    case "last_year":
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    default:
      return { from: null, to: null };
  }
}

interface MoneyDoc {
  id: string;
  document_number: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  category_id: string | null;
  total: string | null;
  document_type: string;
  issue_date: string | null;
  due_date: string | null;
}

const signed = (d: MoneyDoc) => {
  const v = new Decimal(d.total ?? 0);
  return d.document_type === "credit_note" ? v.abs().negated() : v;
};

/**
 * Executes a predefined tool with the USER's Supabase client: Row Level
 * Security applies, and every query is additionally filtered by organization.
 * Only validated documents in the organization's currency count as spend.
 */
export async function runIntent(
  supabase: UserSupabaseClient,
  organizationId: string,
  intent: Intent,
  options: {
    currency: string;
    timezone: string;
    suppliers: Array<{ id: string; name: string }>;
    categories: Array<{ id: string; name: string }>;
  },
): Promise<AssistantAnswer> {
  const today = todayIso(options.timezone);
  const base = {
    intent,
    vars: {} as Record<string, string | number>,
    total: null as string | null,
    rows: [] as AnswerRow[],
    sourceCount: 0,
  };

  const loadMoneyDocs = async (
    period: Period,
    extra?: { supplierId?: string; categoryId?: string },
  ) => {
    const range = periodRange(period, today);
    let q = supabase
      .from("documents")
      .select(
        "id, document_number, supplier_id, supplier_name, category_id, total::text, document_type, issue_date, due_date",
      )
      .eq("organization_id", organizationId)
      .eq("status", "validated")
      .eq("currency", options.currency)
      .in("document_type", ["invoice", "receipt", "credit_note", "other"])
      .not("total", "is", null)
      .limit(5000);
    if (range.from) q = q.gte("issue_date", range.from);
    if (range.to) q = q.lte("issue_date", range.to);
    if (extra?.supplierId) q = q.eq("supplier_id", extra.supplierId);
    if (extra?.categoryId) q = q.eq("category_id", extra.categoryId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as MoneyDoc[];
  };
  const sum = (docs: MoneyDoc[]) =>
    docs.reduce((acc, d) => acc.plus(signed(d)), new Decimal(0)).toFixed(2);
  const groupBy = (
    docs: MoneyDoc[],
    key: (d: MoneyDoc) => string,
    label: (d: MoneyDoc) => string,
  ) => {
    const map = new Map<string, { label: string; total: Decimal; count: number; id: string }>();
    for (const d of docs) {
      const k = key(d);
      const entry = map.get(k) ?? { label: label(d), total: new Decimal(0), count: 0, id: k };
      entry.total = entry.total.plus(signed(d));
      entry.count += 1;
      map.set(k, entry);
    }
    return [...map.values()].sort((a, b) => b.total.comparedTo(a.total));
  };

  switch (intent.tool) {
    case "spend_by_supplier": {
      const supplier =
        options.suppliers.find((s) => s.name === intent.supplier) ??
        findMentioned(intent.supplier, options.suppliers);
      if (!supplier)
        return { ...base, answer: "supplier_not_found", vars: { supplier: intent.supplier } };
      const docs = await loadMoneyDocs(intent.period, { supplierId: supplier.id });
      return {
        ...base,
        answer: "spend_by_supplier",
        vars: { supplier: supplier.name, period: intent.period, count: docs.length },
        total: sum(docs),
        sourceCount: docs.length,
        rows: docs
          .sort((a, b) => (b.issue_date ?? "").localeCompare(a.issue_date ?? ""))
          .slice(0, 10)
          .map((d) => ({
            label: d.document_number ?? "—",
            value: signed(d).toFixed(2),
            detail: d.issue_date,
            href: { kind: "document", id: d.id },
          })),
      };
    }
    case "total_spend": {
      const category = intent.category ? findMentioned(intent.category, options.categories) : null;
      const docs = await loadMoneyDocs(intent.period, { categoryId: category?.id });
      return {
        ...base,
        answer: "total_spend",
        vars: { period: intent.period, count: docs.length, category: category?.name ?? "" },
        total: sum(docs),
        sourceCount: docs.length,
      };
    }
    case "top_suppliers": {
      const docs = await loadMoneyDocs(intent.period);
      const groups = groupBy(
        docs,
        (d) => d.supplier_id ?? `name:${d.supplier_name ?? "—"}`,
        (d) => d.supplier_name ?? "—",
      );
      return {
        ...base,
        answer: "top_suppliers",
        vars: { period: intent.period, count: docs.length },
        total: sum(docs),
        sourceCount: docs.length,
        rows: groups.slice(0, 10).map((g) => ({
          label: g.label,
          value: g.total.toFixed(2),
          detail: String(g.count),
          href: g.id.startsWith("name:") ? undefined : { kind: "supplier" as const, id: g.id },
        })),
      };
    }
    case "spend_by_category": {
      const docs = await loadMoneyDocs(intent.period);
      const names = new Map(options.categories.map((c) => [c.id, c.name]));
      const groups = groupBy(
        docs,
        (d) => d.category_id ?? "none",
        (d) => (d.category_id ? (names.get(d.category_id) ?? "—") : ""),
      );
      return {
        ...base,
        answer: "spend_by_category",
        vars: { period: intent.period, count: docs.length },
        total: sum(docs),
        sourceCount: docs.length,
        rows: groups.map((g) => ({
          label: g.label,
          value: g.total.toFixed(2),
          detail: String(g.count),
        })),
      };
    }
    case "invoices_due": {
      let q = supabase
        .from("documents")
        .select(
          "id, document_number, supplier_id, supplier_name, category_id, total::text, document_type, issue_date, due_date",
        )
        .eq("organization_id", organizationId)
        .eq("status", "validated")
        .eq("currency", options.currency)
        .is("paid_at", null)
        .not("due_date", "is", null)
        .order("due_date")
        .limit(200);
      q =
        intent.range === "overdue"
          ? q.lt("due_date", today)
          : q
              .gte("due_date", today)
              .lte("due_date", addDaysIso(today, intent.range === "next_7" ? 7 : 30));
      const { data, error } = await q;
      if (error) throw error;
      const docs = (data ?? []) as MoneyDoc[];
      return {
        ...base,
        answer: "invoices_due",
        vars: { range: intent.range, count: docs.length },
        total: sum(docs),
        sourceCount: docs.length,
        rows: docs.slice(0, 20).map((d) => ({
          label: `${d.document_number ?? "—"} · ${d.supplier_name ?? "—"}`,
          value: signed(d).toFixed(2),
          detail: d.due_date,
          href: { kind: "document", id: d.id },
        })),
      };
    }
    case "documents_to_review": {
      const { data, count, error } = await supabase
        .from("documents")
        .select("id, document_number, original_filename, supplier_name, total::text", {
          count: "exact",
        })
        .eq("organization_id", organizationId)
        .eq("status", "review_required")
        .order("created_at")
        .limit(20);
      if (error) throw error;
      return {
        ...base,
        answer: "documents_to_review",
        vars: { count: count ?? 0 },
        sourceCount: count ?? 0,
        rows: (data ?? []).map((d) => ({
          label: d.document_number ?? d.original_filename,
          value: d.total,
          detail: d.supplier_name,
          href: { kind: "document", id: d.id },
        })),
      };
    }
    default:
      return { ...base, answer: "unknown" };
  }
}
