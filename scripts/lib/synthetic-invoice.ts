import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Generates a SYNTHETIC invoice PDF (fictitious companies and values) for
 * development seeds and automated tests. A trailing PDF comment carries the
 * expected extraction as base64 JSON so that the offline mock AI provider can
 * return realistic, verifiable values. Never use real customer documents.
 */
export interface SyntheticInvoice {
  supplierName: string;
  supplierTaxId: string;
  customerName: string;
  customerTaxId: string;
  number: string;
  issueDate: string;
  dueDate: string;
  lines: Array<{ description: string; quantity: string; unitPrice: string; taxRate: string }>;
  currency?: string;
}

export function invoiceTotals(invoice: SyntheticInvoice) {
  let subtotalCents = 0;
  let taxCents = 0;
  const lines = invoice.lines.map((l) => {
    const lineCents = Math.round(Number(l.quantity) * Math.round(Number(l.unitPrice) * 100));
    const lineTax = Math.round((lineCents * Number(l.taxRate)) / 100);
    subtotalCents += lineCents;
    taxCents += lineTax;
    return { ...l, lineTotal: (lineCents / 100).toFixed(2), taxAmount: (lineTax / 100).toFixed(2) };
  });
  return {
    lines,
    subtotal: (subtotalCents / 100).toFixed(2),
    tax: (taxCents / 100).toFixed(2),
    total: ((subtotalCents + taxCents) / 100).toFixed(2),
  };
}

const pt = (v: string) => v.replace(".", ",");

export async function createSyntheticInvoicePdf(invoice: SyntheticInvoice, options: { marker?: string } = {}): Promise<Uint8Array> {
  const totals = invoiceTotals(invoice);
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Fatura ${invoice.number} (sintética)`);
  pdf.setProducer("DocuFlow synthetic generator");
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const text = (s: string, x: number, y: number, size = 10, f = font) => page.drawText(s, { x, y, size, font: f, color: rgb(0.1, 0.1, 0.15) });

  text("DOCUMENTO SINTÉTICO — DADOS FICTÍCIOS", 40, 805, 8);
  text(invoice.supplierName, 40, 770, 16, bold);
  text(`NIF: ${invoice.supplierTaxId}`, 40, 752);
  text("Rua Exemplo, 1 · 1000-000 Lisboa", 40, 738);
  text(`FATURA ${invoice.number}`, 360, 770, 14, bold);
  text(`Data: ${invoice.issueDate.split("-").reverse().join("/")}`, 360, 752);
  text(`Vencimento: ${invoice.dueDate.split("-").reverse().join("/")}`, 360, 738);
  text("Exmo(s). Sr(s).", 40, 690);
  text(invoice.customerName, 40, 676, 11, bold);
  text(`NIF do adquirente: ${invoice.customerTaxId}`, 40, 662);

  let y = 610;
  text("Descrição", 40, y, 9, bold);
  text("Qtd.", 330, y, 9, bold);
  text("Preço", 380, y, 9, bold);
  text("IVA", 440, y, 9, bold);
  text("Total", 500, y, 9, bold);
  for (const line of totals.lines) {
    y -= 18;
    text(line.description, 40, y, 9);
    text(pt(line.quantity), 330, y, 9);
    text(pt(Number(line.unitPrice).toFixed(2)), 380, y, 9);
    text(`${line.taxRate}%`, 440, y, 9);
    text(pt(line.lineTotal), 500, y, 9);
  }
  y -= 40;
  text(`Total ilíquido: ${pt(totals.subtotal)} €`, 380, y, 10);
  text(`Total IVA: ${pt(totals.tax)} €`, 380, y - 16, 10);
  text(`TOTAL A PAGAR: ${pt(totals.total)} €`, 380, y - 36, 12, bold);

  const bytes = await pdf.save({ useObjectStreams: false });
  const expected = {
    document_type: "invoice",
    supplier: { name: invoice.supplierName, tax_id: invoice.supplierTaxId, address: "Rua Exemplo, 1 · 1000-000 Lisboa", email: null },
    customer: { name: invoice.customerName, tax_id: invoice.customerTaxId },
    document_number: invoice.number,
    issue_date: invoice.issueDate,
    due_date: invoice.dueDate,
    currency: invoice.currency ?? "EUR",
    subtotal: totals.subtotal,
    tax_total: totals.tax,
    total: totals.total,
    tax_breakdown: [{ rate: totals.lines[0]?.taxRate ?? "23", base: totals.subtotal, amount: totals.tax }],
    line_items: totals.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unitPrice,
      tax_rate: l.taxRate,
      tax_amount: l.taxAmount,
      line_total: l.lineTotal,
    })),
    payment_reference: null,
    iban: null,
    purchase_order: null,
    confidence: { overall: 0.95, supplier: 0.97, amounts: 0.96, dates: 0.95, document_number: 0.98 },
    warnings: [],
  };
  const trailer = `\n%MOCK_DATA:${Buffer.from(JSON.stringify(expected)).toString("base64")}\n${options.marker ? `%${options.marker}\n` : ""}`;
  return new Uint8Array(Buffer.concat([Buffer.from(bytes), Buffer.from(trailer, "latin1")]));
}

/** Generates a valid Portuguese NIF (mod 11) from an 8-digit base starting with 5. */
export function syntheticNif(seed: number): string {
  const base = `5${String(seed).padStart(7, "0")}`.slice(0, 8);
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(base[i]) * (9 - i);
  const r = sum % 11;
  return `${base}${r < 2 ? 0 : 11 - r}`;
}
