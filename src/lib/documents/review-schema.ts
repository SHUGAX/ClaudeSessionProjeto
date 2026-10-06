import { z } from "zod";
import { isValidIsoDate } from "@/lib/dates";
import { parseAmount } from "@/lib/money";
import { DOCUMENT_TYPES } from "@/lib/supabase/types";

const text = (max: number) =>
  z
    .string()
    .max(max * 2)
    .nullable()
    .optional()
    .transform((v) => {
      const trimmed = v?.trim().slice(0, max);
      return trimmed ? trimmed : null;
    });

const amount = z
  .union([z.string().max(50), z.number()])
  .nullable()
  .optional()
  .transform((v, ctx) => {
    if (v == null || v === "") return null;
    const parsed = parseAmount(v);
    if (parsed == null) {
      ctx.addIssue({ code: "custom", message: "invalid_amount" });
      return z.NEVER;
    }
    return parsed;
  });

const date = z
  .string()
  .nullable()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    if (!isValidIsoDate(v)) {
      ctx.addIssue({ code: "custom", message: "invalid_date" });
      return z.NEVER;
    }
    return v;
  });

export const lineItemInputSchema = z.object({
  description: text(1000),
  quantity: amount,
  unitPrice: amount,
  taxRate: amount.refine((v) => v == null || (Number(v) >= 0 && Number(v) <= 100), "invalid_rate"),
  taxAmount: amount,
  lineTotal: amount,
});

/** Input of the review form. Every value is untrusted and re-validated here. */
export const reviewInputSchema = z.object({
  documentId: z.string().uuid(),
  expectedUpdatedAt: z.string().min(10).max(40),
  intent: z.enum(["draft", "validate"]),
  documentType: z.enum(DOCUMENT_TYPES as [string, ...string[]]),
  supplierId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  supplierName: text(300),
  supplierTaxId: text(40),
  documentNumber: text(100),
  issueDate: date,
  dueDate: date,
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "invalid_currency"),
  subtotal: amount,
  taxTotal: amount,
  total: amount,
  paymentReference: text(100),
  iban: text(50).transform((v) => (v ? v.replace(/\s+/g, "").toUpperCase() : null)),
  purchaseOrder: text(100),
  categoryId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  notes: text(4000),
  lineItems: z.array(lineItemInputSchema).max(500),
});

export type ReviewInput = z.input<typeof reviewInputSchema>;
export type ParsedReviewInput = z.output<typeof reviewInputSchema>;
