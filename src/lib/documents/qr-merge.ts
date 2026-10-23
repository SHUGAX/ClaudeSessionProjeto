import { EXTRACTION_SCHEMA_VERSION, type InvoiceExtraction, type QrField } from "@/lib/ai/schema";
import type { AtQrData } from "./at-qrcode";

/**
 * Combines the AT QR code (authoritative fiscal values from the issuer's
 * certified software) with the AI extraction (everything the QR code does not
 * carry: supplier name/address, due date, line items, IBAN…). QR values always
 * win. When the AI is unavailable, the QR code alone still yields a usable
 * document; the supplier name can come from an existing supplier record.
 */
export function mergeQrIntoExtraction(
  ai: InvoiceExtraction | null,
  qr: AtQrData,
  payload: string,
  knownSupplierName: string | null,
): InvoiceExtraction {
  const qrFields: QrField[] = [
    "documentType",
    "supplierTaxId",
    "documentNumber",
    "issueDate",
    "currency",
    "subtotal",
    "taxTotal",
    "total",
  ];
  if (qr.buyerTaxId) qrFields.push("customerTaxId");
  const supplierName = ai?.supplier.name ?? knownSupplierName;
  if (!ai?.supplier.name && knownSupplierName) qrFields.push("supplierName");

  return {
    schemaVersion: EXTRACTION_SCHEMA_VERSION,
    documentType: qr.documentType,
    supplier: {
      name: supplierName ?? null,
      taxId: qr.issuerTaxId,
      address: ai?.supplier.address ?? null,
      email: ai?.supplier.email ?? null,
    },
    customer: {
      name: ai?.customer.name ?? null,
      taxId: qr.buyerTaxId ?? ai?.customer.taxId ?? null,
    },
    documentNumber: qr.documentNumber,
    issueDate: qr.issueDate,
    dueDate: ai?.dueDate ?? null,
    currency: "EUR",
    subtotal: qr.subtotal,
    taxTotal: qr.taxTotal,
    total: qr.total,
    taxBreakdown: qr.taxLines.map((line) => ({ rate: null, base: line.base, amount: line.vat })),
    lineItems: ai?.lineItems ?? [],
    paymentReference: ai?.paymentReference ?? null,
    iban: ai?.iban ?? null,
    purchaseOrder: ai?.purchaseOrder ?? null,
    confidence: ai?.confidence ?? {
      overall: null,
      supplier: null,
      amounts: 1,
      dates: 1,
      document_number: 1,
    },
    warnings: ai?.warnings ?? [],
    qrFields,
    atcud: qr.atcud,
    atQrPayload: payload,
    atStatus: qr.status,
  };
}
