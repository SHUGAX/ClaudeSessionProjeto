import { publicEnv } from "@/lib/env";

/**
 * Path of a page inside a tenant, relative to the current origin.
 * - subdomain routing: the tenant is implied by the host → "/documents"
 * - path routing:      "/t/{slug}/documents"
 */
export function tenantPath(slug: string, path = "/"): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (publicEnv().NEXT_PUBLIC_TENANT_ROUTING === "subdomain") return normalized;
  return normalized === "/" ? `/t/${slug}` : `/t/${slug}${normalized}`;
}

/** Absolute URL of a tenant page (used for cross-host redirects). */
export function tenantUrl(slug: string, path = "/", appUrl?: string): string {
  const env = publicEnv();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const base = new URL(appUrl ?? defaultAppUrl());
  if (env.NEXT_PUBLIC_TENANT_ROUTING === "subdomain") {
    return `${base.protocol}//${slug}.${env.NEXT_PUBLIC_ROOT_DOMAIN}${normalized}`;
  }
  return `${base.origin}${tenantPath(slug, normalized)}`;
}

/** Absolute URL of the central application. */
export function centralUrl(path = "/", appUrl?: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${new URL(appUrl ?? defaultAppUrl()).origin}${normalized}`;
}

function defaultAppUrl(): string {
  if (typeof window !== "undefined") {
    // In the browser, derive the central origin from the configured root domain.
    const env = publicEnv();
    if (env.NEXT_PUBLIC_TENANT_ROUTING === "path") return window.location.origin;
    return `${window.location.protocol}//app.${env.NEXT_PUBLIC_ROOT_DOMAIN}`;
  }
  return process.env.APP_URL ?? "http://localhost:3000";
}
