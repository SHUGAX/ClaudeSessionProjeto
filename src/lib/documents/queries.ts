import "server-only";
import { z } from "zod";
import { addDaysIso, isValidIsoDate, todayIso } from "@/lib/dates";
import { parseAmount } from "@/lib/money";
import type { UserSupabaseClient } from "@/lib/supabase/server";
import {
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  type DocumentStatus,
  type DocumentType,
} from "@/lib/supabase/types";
import { normalizeTaxId } from "@/lib/validation/tax-id";

export const PAGE_SIZE = 25;

import { SORTS, type SortKey } from "./sort-keys";

const SORT_COLUMNS: Record<SortKey, { column: string; ascending: boolean }> = {
  created_desc: { column: "created_at", ascending: false },
  created_asc: { column: "created_at", ascending: true },
  issue_desc: { column: "issue_date", ascending: false },
  issue_asc: { column: "issue_date", ascending: true },
  due_asc: { column: "due_date", ascending: true },
  total_desc: { column: "total", ascending: false },
  total_asc: { column: "total", ascending: true },
};

const uuid = z.string().uuid();
const isoDate = z.string().refine(isValidIsoDate);

/** Parses untrusted query-string filters into a safe, typed structure. */
export function parseDocumentFilters(params: Record<string, string | string[] | undefined>) {
  const get = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
  };
  const status = get("status");
  const type = get("type");
  const sort = get("sort");
  const due = get("due");
  return {
    q: get("q")?.slice(0, 100),
    status:
      status && (DOCUMENT_STATUSES as readonly string[]).includes(status)
        ? (status as DocumentStatus)
        : undefined,
    type:
      type && (DOCUMENT_TYPES as readonly string[]).includes(type)
        ? (type as DocumentType)
        : undefined,
    supplier: uuid.safeParse(get("supplier")).success ? get("supplier") : undefined,
    category: uuid.safeParse(get("category")).success ? get("category") : undefined,
    from: isoDate.safeParse(get("from")).success ? get("from") : undefined,
    to: isoDate.safeParse(get("to")).success ? get("to") : undefined,
    due: due === "overdue" || due === "next7" || due === "next30" ? due : undefined,
    min: parseAmount(get("min") ?? null) ?? undefined,
    max: parseAmount(get("max") ?? null) ?? undefined,
    duplicates: get("dup") === "1",
    archived: get("archived") === "1",
    sort: (sort && (SORTS as readonly string[]).includes(sort) ? sort : "created_desc") as SortKey,
    page: Math.max(1, Math.min(10_000, Number.parseInt(get("page") ?? "1", 10) || 1)),
  };
}

export type DocumentFilters = ReturnType<typeof parseDocumentFilters>;

/** Removes characters with meaning in PostgREST filter syntax. */
export function sanitizeSearchTerm(term: string): string {
  return term
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s\-_/.]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

export async function listDocuments(
  supabase: UserSupabaseClient,
  organizationId: string,
  filters: DocumentFilters,
  timezone = "Europe/Lisbon",
) {
  let query = supabase
    .from("documents")
    .select(
      "id, document_type, status, original_filename, supplier_id, supplier_name, supplier_tax_id, document_number, issue_date, due_date, currency, total::text, category_id, possible_duplicate_of, paid_at, created_at, categories(name), suppliers(name)",
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .neq("status", "uploading");

  if (filters.status) query = query.eq("status", filters.status);
  else if (!filters.archived) query = query.neq("status", "archived");
  if (filters.type) query = query.eq("document_type", filters.type);
  if (filters.supplier) query = query.eq("supplier_id", filters.supplier);
  if (filters.category) query = query.eq("category_id", filters.category);
  if (filters.from) query = query.gte("issue_date", filters.from);
  if (filters.to) query = query.lte("issue_date", filters.to);
  if (filters.min) query = query.gte("total", filters.min);
  if (filters.max) query = query.lte("total", filters.max);
  if (filters.duplicates) query = query.not("possible_duplicate_of", "is", null);
  if (filters.due) {
    const today = todayIso(timezone);
    query = query.is("paid_at", null).not("due_date", "is", null);
    if (filters.due === "overdue") query = query.lt("due_date", today);
    else
      query = query
        .gte("due_date", today)
        .lte("due_date", addDaysIso(today, filters.due === "next7" ? 7 : 30));
  }

  const term = filters.q ? sanitizeSearchTerm(filters.q) : "";
  if (term) {
    const like = `"*${term}*"`;
    const conditions = [
      `document_number.ilike.${like}`,
      `supplier_name.ilike.${like}`,
      `supplier_tax_id.ilike.${like}`,
      `original_filename.ilike.${like}`,
    ];
    const taxId = normalizeTaxId(term);
    if (taxId && /^[A-Z0-9]{5,}$/.test(taxId))
      conditions.push(`supplier_tax_id_normalized.eq."${taxId}"`);
    query = query.or(conditions.join(","));
  }

  const sort = SORT_COLUMNS[filters.sort];
  query = query
    .order(sort.column, { ascending: sort.ascending, nullsFirst: false })
    .order("id", { ascending: true });
  const from = (filters.page - 1) * PAGE_SIZE;
  const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}

export type DocumentListRow = Awaited<ReturnType<typeof listDocuments>>["rows"][number];
