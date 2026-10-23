import "server-only";
import Decimal from "decimal.js";
import type { InvoiceExtraction } from "@/lib/ai/schema";
import { todayIso } from "@/lib/dates";
import type { UserSupabaseClient } from "@/lib/supabase/server";

/**
 * Everything the assistant may know about ONE document, read through the
 * user's session (RLS) and filtered by organization. This object is the only
 * data source for answers: the model never receives anything else.
 */
export interface DocumentContext {
  today: string;
  document: {
    id: string;
    type: string;
    status: string;
    number: string | null;
    issueDate: string | null;
    dueDate: string | null;
    daysUntilDue: number | null;
    paid: boolean;
    paidAt: string | null;
    currency: string;
    subtotal: string | null;
    vat: string | null;
    total: string | null;
    category: string | null;
    paymentReference: string | null;
    iban: string | null;
    purchaseOrder: string | null;
    notes: string | null;
    atcud: string | null;
    validated: boolean;
    validatedAt: string | null;
    possibleDuplicate: boolean;
  };
  supplier: {
    name: string | null;
    taxId: string | null;
    email: string | null;
    phone: string | null;
    documentsThisYear: number;
    validatedTotalThisYear: string;
    recentDocuments: Array<{
      number: string | null;
      issueDate: string | null;
      total: string | null;
      paid: boolean;
    }>;
  };
  lineItems: Array<{
    description: string | null;
    quantity: string | null;
    unitPrice: string | null;
    vatRate: string | null;
    total: string | null;
  }>;
  vatBreakdown: Array<{ rate: string | null; base: string | null; vat: string | null }>;
}

function daysBetween(fromIso: string, toIso: string): number {
  const [a, b] = [fromIso, toIso].map((d) =>
    Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)),
  );
  return Math.round((b! - a!) / 86_400_000);
}

export async function loadDocumentContext(
  supabase: UserSupabaseClient,
  organizationId: string,
  documentId: string,
): Promise<DocumentContext | null> {
  const { data: doc } = await supabase
    .from("documents")
    .select(
      "id, document_type, status, document_number, issue_date, due_date, paid_at, currency, subtotal::text, tax_total::text, total::text, payment_reference, iban, purchase_order, notes, atcud, validated_at, possible_duplicate_of, supplier_id, supplier_name, supplier_tax_id, current_extraction_id, categories(name), suppliers(name, tax_id, email, phone)",
    )
    .eq("id", documentId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!doc) return null;

  const [{ data: settings }, { data: lines }, { data: extraction }] = await Promise.all([
    supabase
      .from("organization_settings")
      .select("timezone")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("document_line_items")
      .select("description, quantity::text, unit_price::text, tax_rate::text, line_total::text")
      .eq("document_id", documentId)
      .order("position")
      .limit(50),
    doc.current_extraction_id
      ? supabase
          .from("document_extractions")
          .select("structured_data")
          .eq("id", doc.current_extraction_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const today = todayIso(settings?.timezone ?? "Europe/Lisbon");
  const yearStart = `${today.slice(0, 4)}-01-01`;

  let supplierDocs: Array<{
    document_number: string | null;
    issue_date: string | null;
    total: string | null;
    paid_at: string | null;
    status: string;
    document_type: string;
  }> = [];
  if (doc.supplier_id || doc.supplier_tax_id) {
    let q = supabase
      .from("documents")
      .select("document_number, issue_date, total::text, paid_at, status, document_type")
      .eq("organization_id", organizationId)
      .neq("status", "archived")
      .neq("status", "uploading")
      .order("issue_date", { ascending: false, nullsFirst: false })
      .limit(200);
    q = doc.supplier_id
      ? q.eq("supplier_id", doc.supplier_id)
      : q.eq("supplier_tax_id", doc.supplier_tax_id!);
    supplierDocs = (await q).data ?? [];
  }
  const thisYear = supplierDocs.filter((d) => (d.issue_date ?? "") >= yearStart);
  const validatedTotal = thisYear
    .filter((d) => d.status === "validated" && d.total)
    .reduce((acc, d) => {
      const v = new Decimal(d.total!);
      return acc.plus(d.document_type === "credit_note" ? v.abs().negated() : v);
    }, new Decimal(0));

  const structured = extraction?.structured_data as unknown as InvoiceExtraction | null;
  return {
    today,
    document: {
      id: doc.id,
      type: doc.document_type,
      status: doc.status,
      number: doc.document_number,
      issueDate: doc.issue_date,
      dueDate: doc.due_date,
      daysUntilDue: doc.due_date ? daysBetween(today, doc.due_date) : null,
      paid: Boolean(doc.paid_at),
      paidAt: doc.paid_at,
      currency: doc.currency,
      subtotal: doc.subtotal,
      vat: doc.tax_total,
      total: doc.total,
      category: doc.categories?.name ?? null,
      paymentReference: doc.payment_reference,
      iban: doc.iban,
      purchaseOrder: doc.purchase_order,
      notes: doc.notes,
      atcud: doc.atcud,
      validated: doc.status === "validated",
      validatedAt: doc.validated_at,
      possibleDuplicate: Boolean(doc.possible_duplicate_of),
    },
    supplier: {
      name: doc.suppliers?.name ?? doc.supplier_name,
      taxId: doc.suppliers?.tax_id ?? doc.supplier_tax_id,
      email: doc.suppliers?.email ?? null,
      phone: doc.suppliers?.phone ?? null,
      documentsThisYear: thisYear.length,
      validatedTotalThisYear: validatedTotal.toFixed(2),
      recentDocuments: supplierDocs.slice(0, 5).map((d) => ({
        number: d.document_number,
        issueDate: d.issue_date,
        total: d.total,
        paid: Boolean(d.paid_at),
      })),
    },
    lineItems: (lines ?? []).map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unit_price,
      vatRate: l.tax_rate,
      total: l.line_total,
    })),
    vatBreakdown: (structured?.taxBreakdown ?? []).map((t) => ({
      rate: t.rate,
      base: t.base,
      vat: t.amount,
    })),
  };
}
