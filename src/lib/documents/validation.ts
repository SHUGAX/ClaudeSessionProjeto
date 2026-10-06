import Decimal from "decimal.js";
import { addDaysIso, isValidIsoDate } from "@/lib/dates";
import { isValidIban } from "@/lib/validation/iban";
import { isValidPortugueseNif, looksLikePortugueseNif } from "@/lib/validation/nif";
import type { DuplicateMatch } from "./duplicates";

export type IssueSeverity = "error" | "warning" | "info";

export type IssueCode =
  | "required_field"
  | "totals_mismatch"
  | "line_items_mismatch"
  | "invalid_date"
  | "due_before_issue"
  | "future_issue_date"
  | "very_old_issue_date"
  | "invalid_currency"
  | "invalid_nif"
  | "negative_total"
  | "tax_exceeds_subtotal"
  | "exact_duplicate"
  | "possible_duplicate"
  | "weak_duplicate"
  | "missing_supplier"
  | "invalid_iban";

export interface ValidationIssue {
  code: IssueCode;
  severity: IssueSeverity;
  field?: string;
  params?: Record<string, string>;
  relatedDocumentId?: string;
}

export interface ValidatableDocument {
  documentType: string;
  supplierName: string | null;
  supplierTaxId: string | null;
  documentNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  currency: string | null;
  subtotal: string | null;
  taxTotal: string | null;
  total: string | null;
  iban: string | null;
  lineItems: Array<{ lineTotal: string | null }>;
}

export interface ValidationContext {
  /** Today's date (ISO) in the organization's time zone. */
  today: string;
  duplicates: DuplicateMatch[];
}

/** Absolute tolerance for arithmetic checks (rounding across several VAT lines). */
const AMOUNT_TOLERANCE = new Decimal("0.05");

const MONEY_TYPES = new Set(["invoice", "receipt", "credit_note"]);

function dec(value: string | null): Decimal | null {
  if (value == null || value === "") return null;
  try {
    return new Decimal(value);
  } catch {
    return null;
  }
}

/**
 * Deterministic validation of document data. Errors block human validation;
 * warnings are shown but never prevent it (legitimate invoices can be unusual,
 * e.g. withholding tax makes total ≠ subtotal + VAT).
 */
export function validateDocument(
  doc: ValidatableDocument,
  ctx: ValidationContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const isMoneyDoc = MONEY_TYPES.has(doc.documentType);

  // Required fields
  if (isMoneyDoc) {
    if (!doc.supplierName && !doc.supplierTaxId) {
      issues.push({ code: "missing_supplier", severity: "error", field: "supplierName" });
    }
    if (!doc.issueDate)
      issues.push({ code: "required_field", severity: "error", field: "issueDate" });
    if (doc.total == null)
      issues.push({ code: "required_field", severity: "error", field: "total" });
    if (!doc.documentNumber) {
      issues.push({
        code: "required_field",
        severity:
          doc.documentType === "invoice" || doc.documentType === "credit_note"
            ? "error"
            : "warning",
        field: "documentNumber",
      });
    }
  }

  // Dates
  for (const field of ["issueDate", "dueDate"] as const) {
    const value = doc[field];
    if (value && !isValidIsoDate(value))
      issues.push({ code: "invalid_date", severity: "error", field });
  }
  if (doc.issueDate && isValidIsoDate(doc.issueDate)) {
    if (doc.issueDate > addDaysIso(ctx.today, 1)) {
      issues.push({ code: "future_issue_date", severity: "warning", field: "issueDate" });
    }
    if (doc.issueDate < addDaysIso(ctx.today, -3653)) {
      issues.push({ code: "very_old_issue_date", severity: "warning", field: "issueDate" });
    }
    if (doc.dueDate && isValidIsoDate(doc.dueDate) && doc.dueDate < doc.issueDate) {
      issues.push({ code: "due_before_issue", severity: "warning", field: "dueDate" });
    }
  }

  // Currency
  if (!doc.currency || !/^[A-Z]{3}$/.test(doc.currency)) {
    issues.push({ code: "invalid_currency", severity: "error", field: "currency" });
  }

  // Arithmetic
  const subtotal = dec(doc.subtotal);
  const tax = dec(doc.taxTotal);
  const total = dec(doc.total);
  if (subtotal && tax && total) {
    const expected = subtotal.plus(tax);
    if (expected.minus(total).abs().greaterThan(AMOUNT_TOLERANCE)) {
      issues.push({
        code: "totals_mismatch",
        severity: "warning",
        field: "total",
        params: { total: total.toFixed(2), expected: expected.toFixed(2) },
      });
    }
  }
  if (subtotal && tax && tax.abs().greaterThan(subtotal.abs()) && !subtotal.isZero()) {
    issues.push({ code: "tax_exceeds_subtotal", severity: "warning", field: "taxTotal" });
  }
  if (total && total.isNegative() && doc.documentType !== "credit_note") {
    issues.push({ code: "negative_total", severity: "warning", field: "total" });
  }
  const lineTotals = doc.lineItems.map((li) => dec(li.lineTotal));
  if (subtotal && lineTotals.length > 0 && lineTotals.every((v): v is Decimal => v !== null)) {
    const sum = lineTotals.reduce((acc, v) => acc.plus(v), new Decimal(0));
    if (sum.minus(subtotal).abs().greaterThan(AMOUNT_TOLERANCE)) {
      issues.push({
        code: "line_items_mismatch",
        severity: "warning",
        field: "lineItems",
        params: { sum: sum.toFixed(2), subtotal: subtotal.toFixed(2) },
      });
    }
  }

  // Identifiers
  if (
    doc.supplierTaxId &&
    looksLikePortugueseNif(doc.supplierTaxId) &&
    !isValidPortugueseNif(doc.supplierTaxId.replace(/[\s.-]/g, ""))
  ) {
    issues.push({
      code: "invalid_nif",
      severity: "warning",
      field: "supplierTaxId",
      params: { taxId: doc.supplierTaxId },
    });
  }
  if (doc.iban && !isValidIban(doc.iban)) {
    issues.push({ code: "invalid_iban", severity: "warning", field: "iban" });
  }

  // Duplicates
  for (const match of ctx.duplicates) {
    const code: IssueCode =
      match.kind === "exact_file"
        ? "exact_duplicate"
        : match.kind === "same_number"
          ? "possible_duplicate"
          : "weak_duplicate";
    issues.push({
      code,
      severity: match.kind === "same_date_total" ? "info" : "warning",
      relatedDocumentId: match.documentId,
    });
  }

  return issues;
}

export function hasBlockingErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

export function countIssues(issues: ValidationIssue[]) {
  return {
    errors: issues.filter((i) => i.severity === "error").length,
    warnings: issues.filter((i) => i.severity === "warning").length,
  };
}
