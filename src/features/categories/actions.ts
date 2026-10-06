"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { can } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTenantContext } from "@/lib/tenancy/context";

export type CategoryState = { error?: string; success?: string } | undefined;

const nameSchema = z.string().trim().min(1).max(100);
const codeSchema = z
  .string()
  .trim()
  .max(40)
  .optional()
  .transform((v) => (v ? v : null));

async function context(tenant: string) {
  const ctx = await requireTenantContext(tenant);
  if (!can.manageCategories(ctx.role)) return null;
  return ctx;
}

export async function createCategoryAction(
  _prev: CategoryState,
  formData: FormData,
): Promise<CategoryState> {
  const ctx = await context(String(formData.get("tenant") ?? ""));
  if (!ctx) return { error: "errors.forbidden" };
  const name = nameSchema.safeParse(formData.get("name"));
  const code = codeSchema.safeParse(formData.get("code") ?? undefined);
  if (!name.success || !code.success) return { error: "errors.invalid_input" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("categories")
    .insert({
      organization_id: ctx.organization.id,
      name: name.data,
      code: code.data,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error || !data)
    return { error: error?.code === "23505" ? "categories.duplicate" : "errors.internal" };
  await recordAudit({
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    action: "category.created",
    entityType: "category",
    entityId: data.id,
    newValues: { name: name.data, code: code.data },
  });
  revalidatePath("/", "layout");
  return { success: "common.saved" };
}

export async function renameCategoryAction(
  tenant: string,
  id: string,
  rawName: string,
): Promise<CategoryState> {
  const ctx = await context(tenant);
  if (!ctx) return { error: "errors.forbidden" };
  const name = nameSchema.safeParse(rawName);
  if (!name.success || !z.string().uuid().safeParse(id).success)
    return { error: "errors.invalid_input" };
  const supabase = await createSupabaseServerClient();
  const { data: before } = await supabase
    .from("categories")
    .select("name")
    .eq("id", id)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!before) return { error: "errors.not_found" };
  const { error } = await supabase
    .from("categories")
    .update({ name: name.data })
    .eq("id", id)
    .eq("organization_id", ctx.organization.id);
  if (error) return { error: error.code === "23505" ? "categories.duplicate" : "errors.internal" };
  await recordAudit({
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    action: "category.updated",
    entityType: "category",
    entityId: id,
    oldValues: { name: before.name },
    newValues: { name: name.data },
  });
  revalidatePath("/", "layout");
  return { success: "common.saved" };
}

export async function deleteCategoryAction(tenant: string, id: string): Promise<CategoryState> {
  const ctx = await context(tenant);
  if (!ctx) return { error: "errors.forbidden" };
  if (!z.string().uuid().safeParse(id).success) return { error: "errors.invalid_input" };
  const supabase = await createSupabaseServerClient();
  const { data: before } = await supabase
    .from("categories")
    .select("name")
    .eq("id", id)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!before) return { error: "errors.not_found" };
  // Documents/suppliers referencing it are set to "no category" by the FK (ON DELETE SET NULL).
  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", id)
    .eq("organization_id", ctx.organization.id);
  if (error) return { error: "errors.internal" };
  await recordAudit({
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    action: "category.deleted",
    entityType: "category",
    entityId: id,
    oldValues: { name: before.name },
  });
  revalidatePath("/", "layout");
  return { success: "common.saved" };
}
