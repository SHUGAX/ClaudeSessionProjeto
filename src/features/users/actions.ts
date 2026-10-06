"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { assignableRoles, can, canManageMember } from "@/lib/auth/permissions";
import { getProfile } from "@/lib/auth/session";
import { getLocale } from "@/lib/i18n/server";
import { createInvitation } from "@/lib/invitations";
import { AppError } from "@/lib/observability/errors";
import { RATE_LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MEMBER_ROLES, type MemberRole } from "@/lib/supabase/types";
import { requireTenantContext } from "@/lib/tenancy/context";

export type UsersActionResult = {
  ok: boolean;
  error?: string;
  success?: string;
  link?: string;
  email?: string;
};

const roleSchema = z.enum(MEMBER_ROLES as [MemberRole, ...MemberRole[]]);
const uuid = z.string().uuid();

function mapDbError(code: string | undefined): string {
  if (code === "23514") return "users.lastOwner";
  if (code === "42501") return "users.ownerRequired";
  return "errors.internal";
}

export async function inviteUserAction(
  _prev: UsersActionResult | undefined,
  formData: FormData,
): Promise<UsersActionResult> {
  const ctx = await requireTenantContext(String(formData.get("tenant") ?? ""));
  if (!can.manageUsers(ctx.role)) return { ok: false, error: "errors.forbidden" };
  const email = z.string().trim().toLowerCase().email().max(320).safeParse(formData.get("email"));
  const role = roleSchema.safeParse(formData.get("role"));
  if (!email.success) return { ok: false, error: "auth.invalidEmail" };
  if (!role.success || !assignableRoles(ctx.role).includes(role.data))
    return { ok: false, error: "errors.forbidden" };
  if (
    !(await rateLimit(
      `invite-create:${ctx.user.id}`,
      RATE_LIMITS.invitationCreate.max,
      RATE_LIMITS.invitationCreate.windowSeconds,
    ))
  ) {
    return { ok: false, error: "errors.rate_limited" };
  }

  const supabase = await createSupabaseServerClient();
  const profile = await getProfile();
  try {
    const created = await createInvitation({
      client: supabase,
      organizationId: ctx.organization.id,
      organizationName: ctx.organization.name,
      email: email.data,
      role: role.data,
      invitedBy: ctx.user.id,
      inviterName: profile?.full_name ?? ctx.user.email,
      locale: await getLocale(),
      actorType: "user",
    });
    revalidatePath("/", "layout");
    return {
      ok: true,
      success: "users.inviteSent",
      email: email.data,
      // Only reveal the link to the admin when no email could be delivered.
      link: created.emailDelivered ? undefined : created.link,
    };
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === "limit_reached") return { ok: false, error: "users.limitReached" };
      if (error.message === "already_member") return { ok: false, error: "users.alreadyMember" };
      if (error.message === "already_invited") return { ok: false, error: "users.alreadyInvited" };
      return { ok: false, error: `errors.${error.code}` };
    }
    throw error;
  }
}

async function loadMember(tenant: string, memberId: string) {
  const ctx = await requireTenantContext(tenant);
  if (!uuid.safeParse(memberId).success) return { ctx, member: null };
  const supabase = await createSupabaseServerClient();
  const { data: member } = await supabase
    .from("organization_members")
    .select("id, user_id, role, status")
    .eq("id", memberId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  return { ctx, member, supabase };
}

export async function changeRoleAction(
  tenant: string,
  memberId: string,
  newRole: string,
): Promise<UsersActionResult> {
  const { ctx, member, supabase } = await loadMember(tenant, memberId);
  const role = roleSchema.safeParse(newRole);
  if (!member || !supabase || !role.success) return { ok: false, error: "errors.invalid_input" };
  if (member.user_id === ctx.user.id) return { ok: false, error: "users.cannotChangeSelf" };
  if (!canManageMember(ctx.role, member.role) || !assignableRoles(ctx.role).includes(role.data)) {
    return { ok: false, error: "users.ownerRequired" };
  }
  const { error } = await supabase
    .from("organization_members")
    .update({ role: role.data })
    .eq("id", member.id);
  if (error) return { ok: false, error: mapDbError(error.code) };
  await recordAudit({
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    action: "member.role_changed",
    entityType: "member",
    entityId: member.user_id,
    oldValues: { role: member.role },
    newValues: { role: role.data },
  });
  revalidatePath("/", "layout");
  return { ok: true, success: "users.roleUpdated" };
}

export async function setMemberStatusAction(
  tenant: string,
  memberId: string,
  status: "active" | "disabled",
): Promise<UsersActionResult> {
  const { ctx, member, supabase } = await loadMember(tenant, memberId);
  if (!member || !supabase || (status !== "active" && status !== "disabled"))
    return { ok: false, error: "errors.invalid_input" };
  if (member.user_id === ctx.user.id) return { ok: false, error: "users.cannotChangeSelf" };
  if (!canManageMember(ctx.role, member.role)) return { ok: false, error: "users.ownerRequired" };
  const { error } = await supabase
    .from("organization_members")
    .update({ status })
    .eq("id", member.id);
  if (error) return { ok: false, error: mapDbError(error.code) };
  await recordAudit({
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    action: status === "active" ? "member.reactivated" : "member.deactivated",
    entityType: "member",
    entityId: member.user_id,
    oldValues: { status: member.status },
    newValues: { status },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeMemberAction(
  tenant: string,
  memberId: string,
): Promise<UsersActionResult> {
  const { ctx, member, supabase } = await loadMember(tenant, memberId);
  if (!member || !supabase) return { ok: false, error: "errors.invalid_input" };
  if (member.user_id === ctx.user.id) return { ok: false, error: "users.cannotChangeSelf" };
  if (!canManageMember(ctx.role, member.role)) return { ok: false, error: "users.ownerRequired" };
  const { error } = await supabase.from("organization_members").delete().eq("id", member.id);
  if (error) return { ok: false, error: mapDbError(error.code) };
  await recordAudit({
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    action: "member.removed",
    entityType: "member",
    entityId: member.user_id,
    oldValues: { role: member.role, status: member.status },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function revokeInvitationAction(
  tenant: string,
  invitationId: string,
): Promise<UsersActionResult> {
  const ctx = await requireTenantContext(tenant);
  if (!can.manageUsers(ctx.role) || !uuid.safeParse(invitationId).success)
    return { ok: false, error: "errors.forbidden" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("invitations")
    .update({ status: "revoked" })
    .eq("id", invitationId)
    .eq("organization_id", ctx.organization.id)
    .eq("status", "pending")
    .select("email, role")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "errors.conflict" };
  await recordAudit({
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    action: "invitation.revoked",
    entityType: "invitation",
    entityId: invitationId,
    oldValues: { email: data.email, role: data.role },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function resendInvitationAction(
  tenant: string,
  invitationId: string,
): Promise<UsersActionResult> {
  const ctx = await requireTenantContext(tenant);
  if (!can.manageUsers(ctx.role) || !uuid.safeParse(invitationId).success)
    return { ok: false, error: "errors.forbidden" };
  const supabase = await createSupabaseServerClient();
  const { data: invitation } = await supabase
    .from("invitations")
    .select("id, email, role, status")
    .eq("id", invitationId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!invitation || invitation.status !== "pending")
    return { ok: false, error: "errors.conflict" };
  if (!assignableRoles(ctx.role).includes(invitation.role))
    return { ok: false, error: "users.ownerRequired" };
  await supabase
    .from("invitations")
    .update({ status: "revoked" })
    .eq("id", invitation.id)
    .eq("status", "pending");

  const form = new FormData();
  form.set("tenant", tenant);
  form.set("email", invitation.email);
  form.set("role", invitation.role);
  const result = await inviteUserAction(undefined, form);
  if (result.ok) {
    await recordAudit({
      organizationId: ctx.organization.id,
      actorUserId: ctx.user.id,
      action: "invitation.resent",
      entityType: "invitation",
      entityId: invitation.id,
      newValues: { email: invitation.email },
    });
  }
  return result;
}
