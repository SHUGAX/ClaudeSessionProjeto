"use server";

import { z } from "zod";
import { loadDocumentContext } from "@/lib/assistant/document-context";
import type { ChatMessage } from "@/lib/assistant/document-qa";
import { answerDocumentQuestion } from "@/lib/assistant/document-qa-gemini";
import { getLocale } from "@/lib/i18n/server";
import { getIntentParser } from "@/lib/assistant";
import { runIntent, type AssistantAnswer } from "@/lib/assistant/tools";
import { logger } from "@/lib/observability/logger";
import { RATE_LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTenantContext } from "@/lib/tenancy/context";

const schema = z.object({
  tenant: z.string().min(3).max(63),
  question: z.string().trim().min(2).max(500),
});

export async function askAssistantAction(
  tenant: string,
  question: string,
): Promise<{ ok: true; answer: AssistantAnswer } | { ok: false; error: string }> {
  const parsed = schema.safeParse({ tenant, question });
  if (!parsed.success) return { ok: false, error: "errors.invalid_input" };
  const ctx = await requireTenantContext(parsed.data.tenant);
  if (
    !(await rateLimit(
      `assistant:${ctx.user.id}`,
      RATE_LIMITS.extraction.max,
      RATE_LIMITS.extraction.windowSeconds,
    ))
  ) {
    return { ok: false, error: "errors.rate_limited" };
  }

  const supabase = await createSupabaseServerClient();
  const orgId = ctx.organization.id;
  const [suppliers, categories, settings] = await Promise.all([
    supabase.from("suppliers").select("id, name").eq("organization_id", orgId).limit(2000),
    supabase.from("categories").select("id, name").eq("organization_id", orgId),
    supabase
      .from("organization_settings")
      .select("default_currency, timezone")
      .eq("organization_id", orgId)
      .maybeSingle(),
  ]);
  try {
    const intent = await getIntentParser().parse(parsed.data.question, {
      suppliers: suppliers.data ?? [],
      categories: categories.data ?? [],
    });
    const answer = await runIntent(supabase, orgId, intent, {
      currency: settings.data?.default_currency ?? "EUR",
      timezone: settings.data?.timezone ?? "Europe/Lisbon",
      suppliers: suppliers.data ?? [],
      categories: categories.data ?? [],
    });
    // Only the chosen tool is logged — never the question text (may contain personal data).
    logger.info("assistant_answered", { tool: answer.intent.tool, organizationId: orgId });
    return { ok: true, answer };
  } catch (error) {
    logger.error("assistant_failed", { error });
    return { ok: false, error: "assistant.error" };
  }
}

const chatSchema = z.object({
  tenant: z.string().min(3).max(63),
  documentId: z.string().uuid(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(1000),
      }),
    )
    .min(1)
    .max(30),
});

/**
 * Conversation about ONE document. The context is loaded with the user's own
 * session (RLS) and is the only data the model sees. Answers fall back to
 * deterministic rules when the model is not configured or unavailable.
 */
export async function askDocumentAction(
  tenant: string,
  documentId: string,
  messages: ChatMessage[],
): Promise<
  { ok: true; answer: string; source: "gemini" | "rules" } | { ok: false; error: string }
> {
  const parsed = chatSchema.safeParse({ tenant, documentId, messages });
  if (!parsed.success || parsed.data.messages.at(-1)?.role !== "user") {
    return { ok: false, error: "errors.invalid_input" };
  }
  const ctx = await requireTenantContext(parsed.data.tenant);
  if (!(await rateLimit(`doc-chat:${ctx.user.id}`, 60, 600)))
    return { ok: false, error: "errors.rate_limited" };

  const supabase = await createSupabaseServerClient();
  const context = await loadDocumentContext(supabase, ctx.organization.id, parsed.data.documentId);
  if (!context) return { ok: false, error: "errors.not_found" };
  try {
    const result = await answerDocumentQuestion(context, parsed.data.messages, await getLocale());
    // The question text is never logged (it may contain personal data).
    logger.info("document_chat_answered", {
      source: result.source,
      organizationId: ctx.organization.id,
    });
    return { ok: true, ...result };
  } catch (error) {
    logger.error("document_chat_failed", { error });
    return { ok: false, error: "docChat.error" };
  }
}
