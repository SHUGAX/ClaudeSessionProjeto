"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTenantContext } from "@/lib/tenancy/context";

export async function dismissAlertAction(tenant: string, alertId: string): Promise<{ ok: boolean; error?: string }> {
  if (!z.string().uuid().safeParse(alertId).success) return { ok: false, error: "errors.invalid_input" };
  const ctx = await requireTenantContext(tenant);
  if (!can.editDocuments(ctx.role)) return { ok: false, error: "errors.forbidden" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("alerts")
    .update({ status: "dismissed" })
    .eq("id", alertId)
    .eq("organization_id", ctx.organization.id)
    .eq("status", "open");
  if (error) return { ok: false, error: "errors.internal" };
  revalidatePath("/", "layout");
  return { ok: true };
}
