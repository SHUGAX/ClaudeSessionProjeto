"use server";

import { changeDocumentState, saveReview, type ReviewResult } from "@/lib/documents/review";
import type { ReviewInput } from "@/lib/documents/review-schema";
import { AppError, toAppError } from "@/lib/observability/errors";

export async function saveReviewAction(input: ReviewInput): Promise<ReviewResult> {
  try {
    return await saveReview(input);
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return { ok: false, error: `errors.${appError.code}` };
  }
}

export async function documentStateAction(
  documentId: string,
  action: "reopen" | "archive" | "unarchive" | "mark_paid" | "mark_unpaid",
  paidAt?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const allowed = ["reopen", "archive", "unarchive", "mark_paid", "mark_unpaid"];
  if (!allowed.includes(action)) return { ok: false, error: "errors.invalid_input" };
  try {
    return await changeDocumentState(documentId, action, paidAt);
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return { ok: false, error: `errors.${appError.code}` };
  }
}
