"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { getProfile } from "@/lib/auth/session";
import { uploadOrganizationLogo } from "@/lib/branding-upload";
import { getLocale } from "@/lib/i18n/server";
import { createInvitation } from "@/lib/invitations";
import { AppError } from "@/lib/observability/errors";
import { logger } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { slugSchema } from "@/lib/tenancy/slug";

export type AdminFormState =
  | { error?: string; success?: string; link?: string; email?: string; organizationId?: string }
  | undefined;

const optionalInt = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? Number(v) : null))
  .refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 1_000_000_000), "invalid");

const orgFields = {
  name: z.string().trim().min(1).max(200),
  legalName: z
    .string()
    .trim()
    .max(300)
    .transform((v) => v || null),
  taxId: z
    .string()
    .trim()
    .max(40)
    .transform((v) => v || null),
  planId: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.string().uuid().safeParse(v).success),
  maxUsers: optionalInt,
  maxDocuments: optionalInt,
  maxAiCalls: optionalInt,
  maxStorageMb: optionalInt,
};

const createSchema = z.object({
  ...orgFields,
  slug: slugSchema,
  adminEmail: z.string().trim().toLowerCase().email().max(320),
});

function limitValues(input: {
  maxUsers: number | null;
  maxDocuments: number | null;
  maxAiCalls: number | null;
  maxStorageMb: number | null;
}) {
  return {
    max_users: input.maxUsers,
    max_documents_per_month: input.maxDocuments,
    max_ai_calls_per_month: input.maxAiCalls,
    max_storage_bytes: input.maxStorageMb == null ? null : input.maxStorageMb * 1024 * 1024,
  };
}

export async function createOrganizationAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await requirePlatformAdmin();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const slugIssue = parsed.error.issues.find((i) => i.path[0] === "slug");
    return {
      error: slugIssue
        ? "admin.slugInvalid"
        : parsed.error.issues.some((i) => i.path[0] === "adminEmail")
          ? "auth.invalidEmail"
          : "errors.invalid_input",
    };
  }
  const input = parsed.data;
  const db = createSupabaseAdminClient();

  const { data: org, error } = await db
    .from("organizations")
    .insert({
      name: input.name,
      legal_name: input.legalName,
      tax_id: input.taxId,
      slug: input.slug,
      plan_id: input.planId,
      created_by: admin.id,
      ...limitValues(input),
    })
    .select("id, name, slug")
    .single();
  if (error || !org) {
    if (error?.code === "23505") return { error: "admin.slugTaken" };
    if (error?.code === "23514") return { error: "admin.slugInvalid" };
    logger.error("organization_create_failed", { code: error?.code });
    return { error: "errors.internal" };
  }
  await db.from("organization_settings").insert({ organization_id: org.id });

  // Default categories help the first invoices get classified.
  await db.from("categories").insert(
    [
      "Eletricidade",
      "Telecomunicações",
      "Combustíveis",
      "Material de escritório",
      "Serviços",
      "Rendas",
    ].map((name) => ({
      organization_id: org.id,
      name,
    })),
  );

  await recordAudit({
    organizationId: org.id,
    actorUserId: admin.id,
    actorType: "platform_admin",
    action: "organization.created",
    entityType: "organization",
    entityId: org.id,
    newValues: { name: org.name, slug: org.slug, plan_id: input.planId },
  });

  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    try {
      await uploadOrganizationLogo(org.id, logo);
    } catch (e) {
      logger.warn("logo_upload_failed", { code: e instanceof AppError ? e.code : "unknown" });
    }
  }

  let link: string | undefined;
  try {
    const profile = await getProfile();
    const invitation = await createInvitation({
      client: db,
      organizationId: org.id,
      organizationName: org.name,
      email: input.adminEmail,
      role: "owner",
      invitedBy: admin.id,
      inviterName: profile?.full_name ?? admin.email,
      locale: await getLocale(),
      actorType: "platform_admin",
    });
    link = invitation.emailDelivered ? undefined : invitation.link;
  } catch (e) {
    logger.error("initial_invitation_failed", { code: e instanceof AppError ? e.code : "unknown" });
  }

  revalidatePath("/admin", "layout");
  // The invitation link is returned in the action state (never placed in a URL).
  return { success: "admin.created", email: input.adminEmail, link, organizationId: org.id };
}

const updateSchema = z.object({ id: z.string().uuid(), ...orgFields });

export async function updateOrganizationAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await requirePlatformAdmin();
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "errors.invalid_input" };
  const input = parsed.data;
  const db = createSupabaseAdminClient();
  const { data: before } = await db
    .from("organizations")
    .select(
      "name, legal_name, tax_id, plan_id, max_users, max_documents_per_month, max_ai_calls_per_month, max_storage_bytes",
    )
    .eq("id", input.id)
    .maybeSingle();
  if (!before) return { error: "errors.not_found" };
  const values = {
    name: input.name,
    legal_name: input.legalName,
    tax_id: input.taxId,
    plan_id: input.planId,
    ...limitValues(input),
  };
  const { error } = await db.from("organizations").update(values).eq("id", input.id);
  if (error) return { error: "errors.internal" };

  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    try {
      await uploadOrganizationLogo(input.id, logo);
    } catch (e) {
      return { error: e instanceof AppError ? `errors.${e.code}` : "errors.internal" };
    }
  }
  await recordAudit({
    organizationId: input.id,
    actorUserId: admin.id,
    actorType: "platform_admin",
    action: "organization.updated",
    entityType: "organization",
    entityId: input.id,
    oldValues: before,
    newValues: values,
  });
  revalidatePath("/admin", "layout");
  return { success: "admin.updated" };
}

export async function setOrganizationStatusAction(
  id: string,
  status: "active" | "suspended",
  reason?: string,
): Promise<AdminFormState> {
  const admin = await requirePlatformAdmin();
  if (!z.string().uuid().safeParse(id).success || (status !== "active" && status !== "suspended")) {
    return { error: "errors.invalid_input" };
  }
  const db = createSupabaseAdminClient();
  const { error } = await db
    .from("organizations")
    .update({
      status,
      suspended_at: status === "suspended" ? new Date().toISOString() : null,
      suspended_reason: status === "suspended" ? (reason ?? "").slice(0, 500) || null : null,
    })
    .eq("id", id);
  if (error) return { error: "errors.internal" };
  await recordAudit({
    organizationId: id,
    actorUserId: admin.id,
    actorType: "platform_admin",
    action: status === "suspended" ? "organization.suspended" : "organization.reactivated",
    entityType: "organization",
    entityId: id,
    metadata: reason ? { reason: reason.slice(0, 500) } : {},
  });
  revalidatePath("/admin", "layout");
  return { success: "admin.updated" };
}

export async function inviteOrganizationAdminAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await requirePlatformAdmin();
  const id = z.string().uuid().safeParse(formData.get("id"));
  const email = z.string().trim().toLowerCase().email().max(320).safeParse(formData.get("email"));
  if (!id.success) return { error: "errors.invalid_input" };
  if (!email.success) return { error: "auth.invalidEmail" };
  const db = createSupabaseAdminClient();
  const { data: org } = await db
    .from("organizations")
    .select("id, name")
    .eq("id", id.data)
    .maybeSingle();
  if (!org) return { error: "errors.not_found" };
  try {
    const profile = await getProfile();
    const invitation = await createInvitation({
      client: db,
      organizationId: org.id,
      organizationName: org.name,
      email: email.data,
      role: "owner",
      invitedBy: admin.id,
      inviterName: profile?.full_name ?? admin.email,
      locale: await getLocale(),
      actorType: "platform_admin",
    });
    revalidatePath("/admin", "layout");
    return {
      success: "users.inviteSent",
      email: email.data,
      link: invitation.emailDelivered ? undefined : invitation.link,
    };
  } catch (e) {
    if (e instanceof AppError) {
      if (e.message === "already_member") return { error: "users.alreadyMember" };
      if (e.message === "already_invited") return { error: "users.alreadyInvited" };
      if (e.code === "limit_reached") return { error: "users.limitReached" };
    }
    return { error: "errors.internal" };
  }
}
