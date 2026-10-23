import Decimal from "decimal.js";
import { isValidIsoDate } from "@/lib/dates";
import type { DocumentType } from "@/lib/supabase/types";

/**
 * Parser for the QR code printed on Portuguese invoices (Portaria n.º
 * 195/2020, AT specification). The payload is a list of `CODE:value` fields
 * separated by `*`, e.g.
 *   A:123456789*B:999999990*C:PT*D:FT*E:N*F:20260115*G:FT A/1*H:CSDF7T5H-1*
 *   I1:PT*I7:100.00*I8:23.00*N:23.00*O:123.00*Q:abcd*R:9999
 * Values come from the issuer's certified invoicing software, so they are
 * authoritative — but they are still untrusted input and fully validated.
 */
export interface AtQrTaxLine {
  /** "PT", "PT-AC" (Açores), "PT-MA" (Madeira) or another fiscal space code */
  region: string;
  rateClass: "exempt" | "reduced" | "intermediate" | "normal";
  base: string;
  vat: string | null;
}

export interface AtQrData {
  issuerTaxId: string;
  buyerTaxId: string | null;
  buyerCountry: string | null;
  atDocumentType: string;
  documentType: DocumentType;
  /** N normal, A anulado, F faturado, S autofaturação, R resumo… */
  status: string;
  issueDate: string;
  documentNumber: string;
  atcud: string | null;
  taxLines: AtQrTaxLine[];
  nonTaxable: string | null;
  stampDuty: string | null;
  taxTotal: string;
  total: string;
  /** Total minus taxes (bases + non-taxable amounts). */
  subtotal: string;
  withholding: string | null;
  certificate: string | null;
}

export type AtQrParseResult = { ok: true; data: AtQrData } | { ok: false; reason: string };

const MAX_PAYLOAD = 2000;
const AMOUNT = /^-?\d{1,15}(\.\d{1,6})?$/;

/** Tax blocks: I = first fiscal space, J and K = additional ones (e.g. Açores, Madeira). */
const TAX_BLOCKS = ["I", "J", "K"] as const;
const RATE_FIELDS: Array<{
  suffix: number;
  rateClass: AtQrTaxLine["rateClass"];
  vatSuffix: number | null;
}> = [
  { suffix: 2, rateClass: "exempt", vatSuffix: null },
  { suffix: 3, rateClass: "reduced", vatSuffix: 4 },
  { suffix: 5, rateClass: "intermediate", vatSuffix: 6 },
  { suffix: 7, rateClass: "normal", vatSuffix: 8 },
];

/** Maps AT document type codes to our document types. */
export function mapAtDocumentType(code: string): DocumentType {
  switch (code) {
    case "FT":
    case "FS":
    case "FR":
    case "ND":
    case "VD":
      return "invoice";
    case "NC":
      return "credit_note";
    case "RC":
    case "RG":
      return "receipt";
    case "OR":
      return "quotation";
    case "GR":
    case "GT":
      return "delivery_note";
    default:
      return "other";
  }
}

/** Quick check used by scanners before parsing (avoids treating URLs etc. as AT codes). */
export function looksLikeAtQr(payload: string): boolean {
  return /^A:[^*]+\*B:/.test(payload.trim());
}

export function parseAtQr(payload: string): AtQrParseResult {
  const raw = payload.trim();
  if (!raw || raw.length > MAX_PAYLOAD) return { ok: false, reason: "invalid_length" };
  if (!looksLikeAtQr(raw)) return { ok: false, reason: "not_at_qr" };

  const fields = new Map<string, string>();
  for (const part of raw.split("*")) {
    const idx = part.indexOf(":");
    if (idx <= 0) continue;
    const code = part.slice(0, idx).trim().toUpperCase();
    if (!/^[A-S]\d?$/.test(code)) continue;
    if (!fields.has(code)) fields.set(code, part.slice(idx + 1).trim());
  }

  const issuerTaxId = (fields.get("A") ?? "").replace(/\s+/g, "");
  if (!/^\d{9}$/.test(issuerTaxId)) return { ok: false, reason: "invalid_issuer" };

  const rawDate = fields.get("F") ?? "";
  const issueDate = /^\d{8}$/.test(rawDate)
    ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
    : "";
  if (!isValidIsoDate(issueDate)) return { ok: false, reason: "invalid_date" };

  const documentNumber = (fields.get("G") ?? "").slice(0, 100);
  if (!documentNumber) return { ok: false, reason: "missing_number" };

  const amount = (code: string): string | null => {
    const v = fields.get(code);
    if (v === undefined || v === "") return null;
    return AMOUNT.test(v) ? new Decimal(v).toFixed(2) : null;
  };

  const total = amount("O");
  if (total === null) return { ok: false, reason: "missing_total" };
  const taxTotal = amount("N") ?? "0.00";

  const taxLines: AtQrTaxLine[] = [];
  for (const prefix of TAX_BLOCKS) {
    const region = fields.get(`${prefix}1`);
    if (!region || region === "0") continue;
    for (const { suffix, rateClass, vatSuffix } of RATE_FIELDS) {
      const base = amount(`${prefix}${suffix}`);
      if (base === null) continue;
      taxLines.push({
        region: region.slice(0, 10),
        rateClass,
        base,
        vat: vatSuffix ? amount(`${prefix}${vatSuffix}`) : null,
      });
    }
  }

  const atDocumentType = (fields.get("D") ?? "").toUpperCase().slice(0, 4);
  const buyer = (fields.get("B") ?? "").replace(/\s+/g, "");
  return {
    ok: true,
    data: {
      issuerTaxId,
      // 999999990 is the AT code for "consumidor final" (no buyer tax ID).
      buyerTaxId: buyer && buyer !== "999999990" ? buyer.slice(0, 20) : null,
      buyerCountry: fields.get("C")?.slice(0, 10) || null,
      atDocumentType,
      documentType: mapAtDocumentType(atDocumentType),
      status: (fields.get("E") ?? "N").slice(0, 2),
      issueDate,
      documentNumber,
      atcud: fields.get("H")?.slice(0, 100) || null,
      taxLines,
      nonTaxable: amount("L"),
      stampDuty: amount("M"),
      taxTotal,
      total,
      subtotal: new Decimal(total).minus(taxTotal).toFixed(2),
      withholding: amount("P"),
      certificate: fields.get("R")?.slice(0, 10) || null,
    },
  };
}
