import { isReservedSlug, isValidSlug } from "./slug";

export type HostContext =
  { kind: "central" } | { kind: "admin" } | { kind: "tenant"; slug: string } | { kind: "invalid" };

function stripPort(host: string): string {
  // IPv6 literals are not used for tenant hosts; treat them as central.
  if (host.startsWith("[")) return host;
  const idx = host.lastIndexOf(":");
  return idx === -1 ? host : host.slice(0, idx);
}

/**
 * Classifies the request host. The tenant slug derived here is only a HINT of
 * the tenant context: it never grants access by itself (membership is always
 * verified against the database).
 */
export function resolveHost(rawHost: string | null | undefined, rootDomain: string): HostContext {
  if (!rawHost) return { kind: "central" };
  const host = stripPort(rawHost.trim().toLowerCase());
  const root = stripPort(rootDomain.trim().toLowerCase());

  if (host === root || host === `www.${root}` || host === `app.${root}`) {
    return { kind: "central" };
  }
  if (host === `admin.${root}`) {
    return { kind: "admin" };
  }
  if (host.endsWith(`.${root}`)) {
    const sub = host.slice(0, -(root.length + 1));
    if (sub.includes(".")) return { kind: "invalid" };
    if (isReservedSlug(sub)) return { kind: "central" };
    if (!isValidSlug(sub)) return { kind: "invalid" };
    return { kind: "tenant", slug: sub };
  }
  // Unknown hosts (e.g. deployment preview URLs) behave as the central app.
  // Future: custom domains would be resolved here via a lookup table.
  return { kind: "central" };
}
