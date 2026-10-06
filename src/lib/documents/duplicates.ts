import Decimal from "decimal.js";
import { normalizeTaxId } from "@/lib/validation/tax-id";

/** Keep in sync with public.normalize_document_number(). */
export function normalizeDocumentNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, "").toUpperCase();
  return normalized.length ? normalized : null;
}

export interface DuplicateSubject {
  id: string;
  supplierId: string | null;
  supplierTaxId: string | null;
  documentNumber: string | null;
  issueDate: string | null;
  total: string | null;
  fileSha256: string | null;
}

export interface DuplicateCandidate extends DuplicateSubject {
  status: string;
}

export type DuplicateKind = "exact_file" | "same_number" | "same_date_total";

export interface DuplicateMatch {
  documentId: string;
  kind: DuplicateKind;
}

const STRENGTH: Record<DuplicateKind, number> = {
  exact_file: 3,
  same_number: 2,
  same_date_total: 1,
};

function sameSupplier(a: DuplicateSubject, b: DuplicateSubject): boolean {
  if (a.supplierId && b.supplierId && a.supplierId === b.supplierId) return true;
  const ta = normalizeTaxId(a.supplierTaxId);
  const tb = normalizeTaxId(b.supplierTaxId);
  return Boolean(ta && tb && ta === tb);
}

function sameAmount(a: string | null, b: string | null): boolean {
  if (a == null || b == null) return false;
  try {
    return new Decimal(a).equals(new Decimal(b));
  } catch {
    return false;
  }
}

/**
 * Classifies possible duplicates. Signals (strongest first):
 *  1. identical file hash (SHA-256)
 *  2. same supplier + same normalised document number
 *  3. same supplier + same issue date + same total
 * Duplicates are NEVER merged or deleted automatically; they are flagged for
 * human inspection. Archived documents are ignored.
 */
export function findDuplicateMatches(
  subject: DuplicateSubject,
  candidates: DuplicateCandidate[],
): DuplicateMatch[] {
  const matches = new Map<string, DuplicateKind>();
  const subjectNumber = normalizeDocumentNumber(subject.documentNumber);

  for (const candidate of candidates) {
    if (candidate.id === subject.id || candidate.status === "archived") continue;
    let kind: DuplicateKind | null = null;

    if (subject.fileSha256 && candidate.fileSha256 === subject.fileSha256) {
      kind = "exact_file";
    } else if (sameSupplier(subject, candidate)) {
      if (subjectNumber && normalizeDocumentNumber(candidate.documentNumber) === subjectNumber) {
        kind = "same_number";
      } else if (
        subject.issueDate &&
        candidate.issueDate === subject.issueDate &&
        sameAmount(subject.total, candidate.total)
      ) {
        kind = "same_date_total";
      }
    }

    if (kind) {
      const previous = matches.get(candidate.id);
      if (!previous || STRENGTH[kind] > STRENGTH[previous]) matches.set(candidate.id, kind);
    }
  }

  return [...matches.entries()]
    .map(([documentId, kind]) => ({ documentId, kind }))
    .sort((a, b) => STRENGTH[b.kind] - STRENGTH[a.kind]);
}
