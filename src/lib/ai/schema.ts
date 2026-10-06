import { z } from "zod";

/**
 * Versioned extraction contract between the AI provider and the application.
 * The model output is validated with this schema; nothing reaches the database
 * without passing it. Amounts are DECIMAL STRINGS ("1234.56"), dates ISO.
 */
export const EXTRACTION_SCHEMA_VERSION = "invoice-extraction-schema@1.0.0";

const nullableString = (max: number) =>
  z
    .string()
    .max(max * 4) // tolerate verbose model output; trimmed below
    .transform((v) => v.trim().slice(0, max))
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

/** Raw amounts may arrive as strings in various notations or as JSON numbers. */
const rawAmount = z
  .union([z.string().max(50), z.number()])
  .nullable()
  .optional()
  .transform((v) => v ?? null);

const confidence = z
  .number()
  .min(0)
  .max(1)
  .nullable()
  .optional()
  .transform((v) => v ?? null);

export const rawExtractionSchema = z.object({
  document_type: z
    .enum(["invoice", "receipt", "credit_note", "quotation", "delivery_note", "contract", "other"])
    .catch("other"),
  supplier: z
    .object({
      name: nullableString(300),
      tax_id: nullableString(40),
      address: nullableString(500),
      email: nullableString(320),
    })
    .nullable()
    .optional()
    .transform((v) => v ?? { name: null, tax_id: null, address: null, email: null }),
  customer: z
    .object({ name: nullableString(300), tax_id: nullableString(40) })
    .nullable()
    .optional()
    .transform((v) => v ?? { name: null, tax_id: null }),
  document_number: nullableString(100),
  issue_date: nullableString(30),
  due_date: nullableString(30),
  currency: nullableString(10),
  subtotal: rawAmount,
  tax_total: rawAmount,
  total: rawAmount,
  tax_breakdown: z
    .array(z.object({ rate: rawAmount, base: rawAmount, amount: rawAmount }))
    .max(20)
    .nullable()
    .optional()
    .transform((v) => v ?? []),
  line_items: z
    .array(
      z.object({
        description: nullableString(1000),
        quantity: rawAmount,
        unit_price: rawAmount,
        tax_rate: rawAmount,
        tax_amount: rawAmount,
        line_total: rawAmount,
      }),
    )
    .max(500)
    .nullable()
    .optional()
    .transform((v) => v ?? []),
  payment_reference: nullableString(100),
  iban: nullableString(50),
  purchase_order: nullableString(100),
  confidence: z
    .object({
      overall: confidence,
      supplier: confidence,
      amounts: confidence,
      dates: confidence,
      document_number: confidence,
    })
    .nullable()
    .optional()
    .transform(
      (v) =>
        v ?? { overall: null, supplier: null, amounts: null, dates: null, document_number: null },
    ),
  warnings: z
    .array(z.string().max(500))
    .max(20)
    .nullable()
    .optional()
    .transform((v) => v ?? []),
});

export type RawExtraction = z.infer<typeof rawExtractionSchema>;

/** Canonical, normalised extraction stored in document_extractions.structured_data. */
export interface InvoiceExtraction {
  schemaVersion: string;
  documentType: RawExtraction["document_type"];
  supplier: {
    name: string | null;
    taxId: string | null;
    address: string | null;
    email: string | null;
  };
  customer: { name: string | null; taxId: string | null };
  documentNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  currency: string | null;
  subtotal: string | null;
  taxTotal: string | null;
  total: string | null;
  taxBreakdown: Array<{ rate: string | null; base: string | null; amount: string | null }>;
  lineItems: Array<{
    description: string | null;
    quantity: string | null;
    unitPrice: string | null;
    taxRate: string | null;
    taxAmount: string | null;
    lineTotal: string | null;
  }>;
  paymentReference: string | null;
  iban: string | null;
  purchaseOrder: string | null;
  confidence: RawExtraction["confidence"];
  warnings: string[];
}

/**
 * JSON Schema sent to the model (structured output). Mirrors rawExtractionSchema.
 * Amount fields are strings so that no binary floating point is involved.
 */
const str = { type: ["string", "null"] } as const;
const amount = {
  type: ["string", "null"],
  description:
    "Decimal number using '.' as decimal separator and no thousands separator, e.g. \"1234.56\". null if absent.",
} as const;
const conf = { type: ["number", "null"], minimum: 0, maximum: 1 } as const;

export const extractionJsonSchema = {
  type: "object",
  properties: {
    document_type: {
      type: "string",
      enum: [
        "invoice",
        "receipt",
        "credit_note",
        "quotation",
        "delivery_note",
        "contract",
        "other",
      ],
    },
    supplier: {
      type: "object",
      description: "The ISSUER of the document (who is selling / charging).",
      properties: { name: str, tax_id: str, address: str, email: str },
      required: ["name", "tax_id"],
    },
    customer: {
      type: "object",
      description: "The RECIPIENT of the document (who is buying / being charged).",
      properties: { name: str, tax_id: str },
    },
    document_number: {
      ...str,
      description: "Exactly as printed, preserving letters, spaces and slashes.",
    },
    issue_date: { ...str, description: "YYYY-MM-DD" },
    due_date: { ...str, description: "YYYY-MM-DD" },
    currency: { ...str, description: "ISO 4217 code, e.g. EUR" },
    subtotal: { ...amount, description: `${amount.description} Total before VAT/tax.` },
    tax_total: { ...amount, description: `${amount.description} Total VAT/tax amount.` },
    total: { ...amount, description: `${amount.description} Grand total payable including VAT.` },
    tax_breakdown: {
      type: "array",
      items: {
        type: "object",
        properties: { rate: amount, base: amount, amount: amount },
      },
    },
    line_items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: str,
          quantity: amount,
          unit_price: amount,
          tax_rate: { ...amount, description: 'VAT percentage, e.g. "23"' },
          tax_amount: amount,
          line_total: amount,
        },
      },
    },
    payment_reference: str,
    iban: str,
    purchase_order: str,
    confidence: {
      type: "object",
      properties: {
        overall: conf,
        supplier: conf,
        amounts: conf,
        dates: conf,
        document_number: conf,
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: [
    "document_type",
    "supplier",
    "document_number",
    "issue_date",
    "currency",
    "subtotal",
    "tax_total",
    "total",
  ],
} as const;
