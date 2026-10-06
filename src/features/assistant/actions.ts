"use server";

import { z } from "zod";
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
