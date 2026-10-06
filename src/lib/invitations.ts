import "server-only";
import { recordAudit } from "@/lib/audit";
import { invitationEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import type { Locale } from "@/lib/i18n/config";
import { AppError } from "@/lib/observability/errors";
import { generateToken, sha256Hex } from "@/lib/security/crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { UserSupabaseClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/lib/supabase/types";
import { centralUrl } from "@/lib/tenancy/urls";

export const INVITATION_TTL_DAYS = 7;

export interface CreatedInvitation {
  invitationId: string;
  link: string;
  emailDelivered: boolean;
}

/** Ensures the organization can take one more user (active members + pending invitations). */
export async function assertUserCapacity(organizationId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.rpc("organization_limits", { p_org: organizationId });
  const limits = data?.[0];
  if (limits?.max_users != null && limits.active_users + limits.pending_invitations >= limits.max_users) {
    throw new AppError("limit_reached", "user_limit");
  }
}

/**
 * Creates an invitation and emails the link. The raw token only exists in the
 * email/link; the database stores its SHA-256 hash.
 *
 * `client` is the inviter's own Supabase client (tenant admins → RLS enforced)
 * or the service-role client (platform administrators onboarding a tenant).
 */
export async function createInvitation(params: {
  client: UserSupabaseClient | ReturnType<typeof createSupabaseAdminClient>;
  organizationId: string;
  organizationName: string;
  email: string;
  role: MemberRole;
  invitedBy: string;
  inviterName: string;
  locale: Locale;
  actorType: "user" | "platform_admin";
}): Promise<CreatedInvitation> {
  const email = params.email.trim().toLowerCase();
  const admin = createSupabaseAdminClient();

  // Already a member?
  const { data: existingProfile } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existingProfile) {
    const { data: existingMember } = await admin
      .from("organization_members")
      .select("id")
      .eq("organization_id", params.organizationId)
      .eq("user_id", existingProfile.id)
      .maybeSingle();
    if (existingMember) throw new AppError("conflict", "already_member");
  }

  await assertUserCapacity(params.organizationId);

  // Expire stale pending invitations for this email so the unique index allows a new one.
  await admin
    .from("invitations")
    .update({ status: "expired" })
    .eq("organization_id", params.organizationId)
    .eq("email", email)
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());

  const token = generateToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 3600 * 1000).toISOString();
  const { data: invitation, error } = await params.client
    .from("invitations")
    .insert({
      organization_id: params.organizationId,
      email,
      role: params.role,
      token_hash: sha256Hex(token),
      invited_by: params.invitedBy,
      expires_at: expiresAt,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !invitation) {
    if (error?.code === "23505") throw new AppError("conflict", "already_invited");
    if (error?.code === "42501") throw new AppError("forbidden");
    throw new AppError("internal", error?.message);
  }

  const link = centralUrl(`/invite/${token}`, serverEnv().APP_URL);
  const message = invitationEmail({
    locale: params.locale,
    appName: publicEnv().NEXT_PUBLIC_APP_NAME,
    organizationName: params.organizationName,
    inviterName: params.inviterName,
    role: params.role,
    link,
    expiresInDays: INVITATION_TTL_DAYS,
  });
  const { delivered } = await sendEmail({ to: email, ...message, tag: "invitation", devLink: link });

  await recordAudit({
    organizationId: params.organizationId,
    actorUserId: params.invitedBy,
    actorType: params.actorType,
    action: "member.invited",
    entityType: "invitation",
    entityId: invitation.id,
    newValues: { email, role: params.role },
    metadata: { emailDelivered: delivered },
  });

  return { invitationId: invitation.id, link, emailDelivered: delivered };
}

export interface InvitationDetails {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  email: string;
  role: MemberRole;
  invitedBy: string | null;
}

/** Looks up a pending, unexpired invitation by its raw token (service role). */
export async function findValidInvitation(token: string): Promise<InvitationDetails | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("invitations")
    .select("id, organization_id, email, role, status, expires_at, invited_by, organizations!inner(name, slug, status)")
    .eq("token_hash", sha256Hex(token))
    .maybeSingle();
  if (!data || data.status !== "pending") return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  if (data.organizations.status !== "active") return null;
  return {
    id: data.id,
    organizationId: data.organization_id,
    organizationName: data.organizations.name,
    organizationSlug: data.organizations.slug,
    email: data.email,
    role: data.role,
    invitedBy: data.invited_by,
  };
}

/**
 * Creates (or re-activates) the membership for an accepted invitation and
 * marks the invitation as used. Caller must have verified that `userId`
 * belongs to the invitation's email.
 */
export async function completeInvitation(invitation: InvitationDetails, userId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();

  const { data: existing } = await admin
    .from("organization_members")
    .select("id, status")
    .eq("organization_id", invitation.organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!existing) {
    await assertCapacityForAcceptance(invitation.organizationId);
    const { error } = await admin.from("organization_members").insert({
      organization_id: invitation.organizationId,
      user_id: userId,
      role: invitation.role,
      status: "active",
      invited_by: invitation.invitedBy,
      invited_at: now,
      joined_at: now,
    });
    if (error) throw new AppError("internal", error.message);
  } else if (existing.status !== "active") {
    const { error } = await admin
      .from("organization_members")
      .update({ status: "active", role: invitation.role })
      .eq("id", existing.id);
    if (error) throw new AppError("internal", error.message);
  }

  // Single-use: only flips a still-pending invitation.
  await admin
    .from("invitations")
    .update({ status: "accepted", accepted_at: now, accepted_by: userId })
    .eq("id", invitation.id)
    .eq("status", "pending");

  await recordAudit({
    organizationId: invitation.organizationId,
    actorUserId: userId,
    action: "member.joined",
    entityType: "member",
    entityId: userId,
    newValues: { role: invitation.role },
    metadata: { invitationId: invitation.id },
  });
}

async function assertCapacityForAcceptance(organizationId: string) {
  // The pending invitation being accepted is already counted in the capacity
  // check performed at invitation time; here we only guard against overflow.
  const admin = createSupabaseAdminClient();
  const { data } = await admin.rpc("organization_limits", { p_org: organizationId });
  const limits = data?.[0];
  if (limits?.max_users != null && limits.active_users >= limits.max_users) {
    throw new AppError("limit_reached", "user_limit");
  }
}
