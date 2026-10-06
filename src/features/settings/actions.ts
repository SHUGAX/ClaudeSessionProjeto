"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { diffValues, recordAudit } from "@/lib/audit";
import { uploadOrganizationLogo } from "@/lib/branding-upload";
import { can } from "@/lib/auth/permissions";
import { getSessionUser } from "@/lib/auth/session";
import { LOCALE_COOKIE } from "@/lib/i18n/config";
import { AppError } from "@/lib/observability/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTenantContext } from "@/lib/tenancy/context";

export type SettingsState = { error?: string; success?: string } | undefined;

const orgSchema = z.object({
  tenant: z.string().min(3).max(63),
  name: z.string().trim().min(1).max(200),
  legalName: z.string().trim().max(300).transform((v) => v || null),
  taxId: z.string().trim().max(40).transform((v) => v || null),
  defaultCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  defaultLanguage: z.enum(["pt-PT", "en"]),
  dueSoonDays: z.coerce.number().int().min(1).max(90),
});

export async function saveOrganizationSettingsAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const parsed = orgSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "errors.invalid_input" };
  const input = parsed.data;
  const ctx = await requireTenantContext(input.tenant);
  if (!can.manageOrganization(ctx.role)) return { error: "errors.forbidden" };
  const supabase = await createSupabaseServerClient();
  const orgId = ctx.organization.id;

  const [{ data: org }, { data: settings }] = await Promise.all([
    supabase.from("organizations").select("name, legal_name, tax_id").eq("id", orgId).single(),
    supabase.from("organization_settings").select("default_currency, default_language, due_soon_days").eq("organization_id", orgId).single(),
  ]);

  const orgValues = { name: input.name, legal_name: input.legalName, tax_id: input.taxId };
  const settingValues = {
    default_currency: input.defaultCurrency,
    default_language: input.defaultLanguage,
    due_soon_days: input.dueSoonDays,
  };
  const [orgUpdate, settingsUpdate] = await Promise.all([
    supabase.from("organizations").update(orgValues).eq("id", orgId),
    supabase.from("organization_settings").update({ ...settingValues, updated_by: ctx.user.id }).eq("organization_id", orgId),
  ]);
  if (orgUpdate.error || settingsUpdate.error) return { error: "errors.internal" };

  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    try {
      await uploadOrganizationLogo(orgId, logo);
    } catch (error) {
      return { error: error instanceof AppError ? `errors.${error.code}` : "errors.internal" };
    }
  }

  const diff = diffValues({ ...(org ?? {}), ...(settings ?? {}) }, { ...orgValues, ...settingValues });
  if (diff || (logo instanceof File && logo.size > 0)) {
    await recordAudit({
      organizationId: orgId,
      actorUserId: ctx.user.id,
      action: "settings.updated",
      entityType: "settings",
      entityId: orgId,
      oldValues: diff?.oldValues ?? null,
      newValues: diff?.newValues ?? null,
      metadata: { logoChanged: logo instanceof File && logo.size > 0 },
    });
  }
  await supabase.rpc("refresh_alerts", { p_org: orgId });
  revalidatePath("/", "layout");
  return { success: "settings.saved" };
}

const profileSchema = z.object({
  fullName: z.string().trim().max(200).transform((v) => v || null),
  preferredLanguage: z.enum(["pt-PT", "en"]),
});

export async function saveProfileAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "errors.invalid_input" };
  const user = await getSessionUser();
  if (!user) return { error: "errors.unauthenticated" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName, preferred_language: parsed.data.preferredLanguage })
    .eq("id", user.id);
  if (error) return { error: "errors.internal" };
  (await cookies()).set(LOCALE_COOKIE, parsed.data.preferredLanguage, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === "production",
    ...(process.env.AUTH_COOKIE_DOMAIN ? { domain: process.env.AUTH_COOKIE_DOMAIN } : {}),
  });
  revalidatePath("/", "layout");
  return { success: "settings.saved" };
}
