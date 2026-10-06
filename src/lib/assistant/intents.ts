import { z } from "zod";
import { normalizeCompanyName } from "@/lib/suppliers/matching";

/**
 * The assistant can only run these predefined, read-only tools. The language
 * model (or the rule-based parser) merely chooses a tool and its parameters;
 * it never writes SQL and never sees data it was not given by a tool.
 */
export const PERIODS = ["this_month", "last_month", "this_year", "last_year", "all"] as const;
export type Period = (typeof PERIODS)[number];

export const intentSchema = z.discriminatedUnion("tool", [
  z.object({
    tool: z.literal("spend_by_supplier"),
    supplier: z.string().min(1).max(200),
    period: z.enum(PERIODS),
  }),
  z.object({
    tool: z.literal("total_spend"),
    period: z.enum(PERIODS),
    category: z.string().max(100).nullable().optional(),
  }),
  z.object({ tool: z.literal("top_suppliers"), period: z.enum(PERIODS) }),
  z.object({ tool: z.literal("spend_by_category"), period: z.enum(PERIODS) }),
  z.object({ tool: z.literal("invoices_due"), range: z.enum(["overdue", "next_7", "next_30"]) }),
  z.object({ tool: z.literal("documents_to_review") }),
  z.object({ tool: z.literal("unknown") }),
]);
export type Intent = z.infer<typeof intentSchema>;

export interface IntentContext {
  suppliers: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
}

export interface IntentParser {
  readonly name: string;
  parse(question: string, context: IntentContext): Promise<Intent>;
}

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function detectPeriod(q: string): Period {
  if (/(mes passado|ultimo mes|last month)/.test(q)) return "last_month";
  if (/(este mes|neste mes|mes atual|this month)/.test(q)) return "this_month";
  if (/(ano passado|ultimo ano|last year)/.test(q)) return "last_year";
  if (/(este ano|neste ano|ano atual|this year|em \d{4})/.test(q)) return "this_year";
  if (/(sempre|total geral|all time|ever)/.test(q)) return "all";
  return "this_year";
}

const FOLLOWING_WORDS = new Set([
  "este",
  "esta",
  "neste",
  "nesta",
  "no",
  "na",
  "em",
  "desde",
  "durante",
  "ano",
  "mes",
  "ate",
  "e",
  "de",
  "do",
  "da",
  "this",
  "last",
  "in",
  "during",
  "since",
  "year",
  "month",
  "and",
  "for",
  "of",
]);

function words(s: string): string[] {
  return normalizeCompanyName(s).split(" ").filter(Boolean);
}

/**
 * Finds the tenant supplier/category named in the question (deterministic).
 * The name (without legal suffixes) must appear as a contiguous phrase; a
 * shortened name (≥ 2 leading words) is accepted only if it is unambiguous and
 * not followed by a different distinguishing word ("Telecom Fictícia B" never
 * matches "Telecom Fictícia A").
 */
export function findMentioned<T extends { name: string }>(question: string, items: T[]): T | null {
  const q = words(question);
  const indexOf = (needle: string[]) => {
    for (let i = 0; i + needle.length <= q.length; i++) {
      if (needle.every((w, j) => q[i + j] === w)) return i;
    }
    return -1;
  };
  const full = items.filter((item) => {
    const w = words(item.name);
    return w.length > 0 && indexOf(w) !== -1;
  });
  if (full.length > 0) return full.sort((a, b) => words(b.name).length - words(a.name).length)[0]!;

  const partial = items.filter((item) => {
    const w = words(item.name);
    for (let k = w.length - 1; k >= 2; k--) {
      const at = indexOf(w.slice(0, k));
      if (at === -1) continue;
      const next = q[at + k];
      return next === undefined || FOLLOWING_WORDS.has(next);
    }
    return false;
  });
  return partial.length === 1 ? partial[0]! : null;
}

/**
 * Keyword-based parser (Portuguese and English). Used when no LLM is
 * configured and as a fallback; fully deterministic and testable.
 */
export class RuleBasedIntentParser implements IntentParser {
  readonly name = "rules";

  async parse(question: string, context: IntentContext): Promise<Intent> {
    const q = normalize(question);
    const period = detectPeriod(q);

    if (/(rever|revisao|por validar|to review|pending review)/.test(q))
      return { tool: "documents_to_review" };
    if (/(vencid|em atraso|atrasad|overdue)/.test(q))
      return { tool: "invoices_due", range: "overdue" };
    if (/(vence|vencimento|a pagar|due)/.test(q)) {
      return { tool: "invoices_due", range: /(30|mes|month)/.test(q) ? "next_30" : "next_7" };
    }
    if (/(categoria|category|categories)/.test(q) && !findMentioned(question, context.categories)) {
      return { tool: "spend_by_category", period };
    }
    if (
      /(principais fornecedores|maiores fornecedores|top suppliers|biggest suppliers|ranking)/.test(
        q,
      )
    ) {
      return { tool: "top_suppliers", period };
    }
    const supplier = findMentioned(question, context.suppliers);
    if (supplier && /(gast|pag|fatur|spend|spent|paid|invoic|quanto|how much|total)/.test(q)) {
      return { tool: "spend_by_supplier", supplier: supplier.name, period };
    }
    const category = findMentioned(question, context.categories);
    // "… com <nome> …" / "… with <name> …" naming an unknown supplier: say so
    // instead of answering a broader question.
    const named =
      /\b(?:com|with)\s+(?:a\s+|o\s+|the\s+)?([a-z0-9][a-z0-9 .&-]{1,80}?)(?=\s+(?:este|esta|neste|no|na|em|this|last|in|during|since)\b|[?!.]|$)/.exec(
        q,
      );
    if (!category && named?.[1] && /(gast|pag|spend|spent|paid|quanto|how much)/.test(q)) {
      return { tool: "spend_by_supplier", supplier: named[1].trim(), period };
    }
    if (/(gast|despesa|fatur|spend|spent|total|quanto|how much)/.test(q)) {
      return { tool: "total_spend", period, category: category?.name ?? null };
    }
    return { tool: "unknown" };
  }
}
