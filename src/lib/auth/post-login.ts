import "server-only";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { safeRedirectTarget } from "@/lib/security/redirect";
import { tenantUrl } from "@/lib/tenancy/urls";
import { getMyMemberships, isPlatformAdmin } from "./session";

/**
 * Decides where a freshly authenticated user goes:
 *  - a safe explicit "next" target (same site only)
 *  - exactly one active organization → that tenant
 *  - several → organization selector
 *  - none, but platform admin → admin area
 *  - none → "no access" page
 */
export async function postLoginDestination(next?: string | null): Promise<string> {
  const safeNext = safeRedirectTarget(next, publicEnv().NEXT_PUBLIC_ROOT_DOMAIN);
  if (safeNext && safeNext !== "/" && !safeNext.startsWith("/login")) return safeNext;

  const memberships = (await getMyMemberships()).filter((m) => m.organization_status === "active");
  if (memberships.length === 1) {
    return tenantUrl(memberships[0]!.organization_slug, "/", serverEnv().APP_URL);
  }
  if (memberships.length > 1) return "/select-organization";
  if (await isPlatformAdmin()) return "/admin";
  return "/no-access";
}
