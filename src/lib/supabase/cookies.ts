import type { CookieOptions } from "@supabase/ssr";

/**
 * Cookie options for the Supabase session. In subdomain routing the cookie is
 * scoped to the parent domain (AUTH_COOKIE_DOMAIN, e.g. ".example.com") so that
 * a single sign-in works on the central app and on tenant subdomains. The
 * cookie itself grants no tenant access: membership is always checked.
 */
export function sessionCookieOptions(): CookieOptions {
  const domain = process.env.AUTH_COOKIE_DOMAIN || undefined;
  return {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    ...(domain ? { domain } : {}),
  };
}
