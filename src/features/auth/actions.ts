"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { postLoginDestination } from "@/lib/auth/post-login";
import { getSessionUser } from "@/lib/auth/session";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";
import { completeInvitation, findValidInvitation } from "@/lib/invitations";
import { AppError } from "@/lib/observability/errors";
import { logger } from "@/lib/observability/logger";
import { sha256Hex } from "@/lib/security/crypto";
import { RATE_LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { safeRedirectTarget } from "@/lib/security/redirect";
import { clientIpHash } from "@/lib/security/request";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidSlug } from "@/lib/tenancy/slug";
import { tenantPath, tenantUrl } from "@/lib/tenancy/urls";
import { emailSchema, loginSchema, passwordPairSchema, type FormState } from "./schemas";

async function applyPreferredLocale(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("preferred_language")
    .eq("id", userId)
    .maybeSingle();
  if (data && isLocale(data.preferred_language)) {
    (await cookies()).set(LOCALE_COOKIE, data.preferred_language, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      secure: process.env.NODE_ENV === "production",
      ...(process.env.AUTH_COOKIE_DOMAIN ? { domain: process.env.AUTH_COOKIE_DOMAIN } : {}),
    });
  }
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
    tenant: formData.get("tenant") || undefined,
  });
  if (!parsed.success) return { error: "auth.invalidCredentials" };
  const { email, password, next, tenant } = parsed.data;

  const ip = await clientIpHash();
  const allowed = await rateLimit(
    `login:${ip}:${sha256Hex(email).slice(0, 16)}`,
    RATE_LIMITS.login.max,
    RATE_LIMITS.login.windowSeconds,
  );
  if (!allowed) return { error: "auth.rateLimited" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (error?.status === 429) return { error: "auth.rateLimited" };
    logger.info("login_failed", { reason: error?.code ?? "unknown" });
    return { error: "auth.invalidCredentials" };
  }
  await applyPreferredLocale(data.user.id);

  let destination: string;
  if (tenant && isValidSlug(tenant)) {
    const safeNext = safeRedirectTarget(next, publicEnv().NEXT_PUBLIC_ROOT_DOMAIN);
    destination = safeNext && !safeNext.includes("/login") ? safeNext : tenantPath(tenant, "/");
  } else {
    destination = await postLoginDestination(next);
  }
  redirect(destination);
}

export async function forgotPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "auth.invalidEmail" };

  const ip = await clientIpHash();
  const allowed = await rateLimit(
    `pwreset:${ip}`,
    RATE_LIMITS.passwordReset.max,
    RATE_LIMITS.passwordReset.windowSeconds,
  );
  if (!allowed) return { error: "auth.rateLimited" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${serverEnv().APP_URL}/auth/callback?next=/reset-password`,
  });
  if (error) logger.warn("password_reset_request_failed", { code: error.code });
  // Same response whether or not the account exists (no user enumeration).
  return { success: "auth.resetLinkSent" };
}

export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = passwordPairSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "auth.passwordTooShort" };

  const user = await getSessionUser();
  if (!user) return { error: "auth.linkInvalid" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    logger.warn("password_update_failed", { code: error.code });
    return {
      error:
        error.code === "weak_password" ? "auth.passwordNeedsLettersDigits" : "auth.linkInvalid",
    };
  }
  redirect(await postLoginDestination(null));
}

/** Accepts an invitation for a NEW account (sets the user's own password). */
export async function acceptInvitationNewUserAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const ip = await clientIpHash();
  if (
    !(await rateLimit(
      `invite:${ip}`,
      RATE_LIMITS.invitationAccept.max,
      RATE_LIMITS.invitationAccept.windowSeconds,
    ))
  ) {
    return { error: "auth.rateLimited" };
  }

  const invitation = await findValidInvitation(token);
  if (!invitation) return { error: "invite.invalid" };

  const fullName = String(formData.get("fullName") ?? "")
    .trim()
    .slice(0, 200);
  const passwords = passwordPairSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!passwords.success)
    return { error: passwords.error.issues[0]?.message ?? "auth.passwordTooShort" };

  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("email", invitation.email)
    .maybeSingle();
  if (existing) return { error: "invite.existingAccount" };

  const locale = (await cookies()).get(LOCALE_COOKIE)?.value;
  // The email is confirmed by possession of the single-use invitation token.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: invitation.email,
    password: passwords.data.password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName || null,
      preferred_language: isLocale(locale) ? locale : "pt-PT",
    },
  });
  if (createError || !created.user) {
    logger.warn("invite_user_create_failed", { code: createError?.code });
    return {
      error:
        createError?.code === "weak_password"
          ? "auth.passwordNeedsLettersDigits"
          : "errors.internal",
    };
  }

  try {
    await completeInvitation(invitation, created.user.id);
  } catch (error) {
    if (error instanceof AppError && error.code === "limit_reached")
      return { error: "invite.limitReached" };
    throw error;
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signInWithPassword({
    email: invitation.email,
    password: passwords.data.password,
  });
  redirect(tenantUrl(invitation.organizationSlug, "/", serverEnv().APP_URL));
}

/** Accepts an invitation with the currently signed-in account. */
export async function acceptInvitationExistingUserAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const invitation = await findValidInvitation(token);
  if (!invitation) return { error: "invite.invalid" };
  const user = await getSessionUser();
  if (!user) return { error: "auth.sessionExpired" };
  if (user.email !== invitation.email) return { error: "invite.wrongAccount" };
  try {
    await completeInvitation(invitation, user.id);
  } catch (error) {
    if (error instanceof AppError && error.code === "limit_reached")
      return { error: "invite.limitReached" };
    throw error;
  }
  redirect(tenantUrl(invitation.organizationSlug, "/", serverEnv().APP_URL));
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
