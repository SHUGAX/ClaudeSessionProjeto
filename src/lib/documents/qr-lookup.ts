import "server-only";
import type { UserSupabaseClient } from "@/lib/supabase/server";
import type { DocumentStatus } from "@/lib/supabase/types";
import { parseAtQr, type AtQrData } from "./at-qrcode";
import { normalizeDocumentNumber } from "./duplicates";

export interface ScannedDocument {
  id: string;
  documentNumber: string | null;
  supplierName: string | null;
  supplierTaxId: string | null;
  issueDate: string | null;
  dueDate: string | null;
  total: string | null;
  currency: string;
  status: DocumentStatus;
  paidAt: string | null;
}

export type QrLookupResult =
  | { status: "invalid"; reason: string }
  | { status: "found"; document: ScannedDocument; qr: AtQrData }
  | { status: "not_found"; qr: AtQrData };

/**
 * Finds the document a paper invoice's QR code refers to, within ONE
 * organization and through the user's own session (RLS applies). The payload
 * is parsed again on the server: client-side parsing is never trusted.
 * Match: ATCUD, or issuer NIF + normalised document number.
 */
export async function findDocumentByQr(
  supabase: UserSupabaseClient,
  organizationId: string,
  payload: string,
): Promise<QrLookupResult> {
  const parsed = parseAtQr(payload);
  if (!parsed.ok) return { status: "invalid", reason: parsed.reason };
  const qr = parsed.data;

  const number = normalizeDocumentNumber(qr.documentNumber);
  const filters = [
    `and(supplier_tax_id_normalized.eq."${qr.issuerTaxId}",document_number_normalized.eq."${(number ?? "").replace(/"/g, "")}")`,
  ];
  if (qr.atcud) filters.push(`atcud.eq."${qr.atcud.replace(/"/g, "")}"`);

  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, document_number, supplier_name, supplier_tax_id, issue_date, due_date, total::text, currency, status, paid_at, suppliers(name)",
    )
    .eq("organization_id", organizationId)
    .neq("status", "uploading")
    .or(filters.join(","))
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) throw error;

  // Prefer active documents over archived copies.
  const best = (data ?? []).sort(
    (a, b) => Number(a.status === "archived") - Number(b.status === "archived"),
  )[0];
  if (!best) return { status: "not_found", qr };
  return {
    status: "found",
    qr,
    document: {
      id: best.id,
      documentNumber: best.document_number,
      supplierName: best.suppliers?.name ?? best.supplier_name,
      supplierTaxId: best.supplier_tax_id,
      issueDate: best.issue_date,
      dueDate: best.due_date,
      total: best.total,
      currency: best.currency,
      status: best.status,
      paidAt: best.paid_at,
    },
  };
}
