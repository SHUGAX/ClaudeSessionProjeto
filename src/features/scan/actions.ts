"use server";

import { z } from "zod";
import { findDocumentByQr, type QrLookupResult } from "@/lib/documents/qr-lookup";
import { logger } from "@/lib/observability/logger";
import { rateLimit } from "@/lib/security/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTenantContext } from "@/lib/tenancy/context";

const schema = z.object({
  tenant: z.string().min(3).max(63),
  payload: z.string().min(1).max(2000),
});

/** Looks up the scanned invoice in the user's organization (RLS-scoped). */
export async function lookupQrAction(
  tenant: string,
  payload: string,
): Promise<QrLookupResult | { status: "error" }> {
  const parsed = schema.safeParse({ tenant, payload });
  if (!parsed.success) return { status: "invalid", reason: "invalid_input" };
  const ctx = await requireTenantContext(parsed.data.tenant);
  if (!(await rateLimit(`qr-lookup:${ctx.user.id}`, 120, 600))) return { status: "error" };
  try {
    const supabase = await createSupabaseServerClient();
    const result = await findDocumentByQr(supabase, ctx.organization.id, parsed.data.payload);
    logger.info("qr_lookup", { result: result.status, organizationId: ctx.organization.id });
    return result;
  } catch (error) {
    logger.error("qr_lookup_failed", { error });
    return { status: "error" };
  }
}
