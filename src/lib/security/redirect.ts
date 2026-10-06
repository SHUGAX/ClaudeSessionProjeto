/**
 * Validates a post-login "next" target to prevent open redirects.
 * Accepts:
 *  - same-origin relative paths ("/documents?x=1"), but not protocol-relative ("//evil")
 *  - absolute http(s) URLs whose host is the root domain or one of its subdomains
 * Returns null when the target is not safe.
 */
export function safeRedirectTarget(target: string | null | undefined, rootDomain: string): string | null {
  if (!target || target.length > 2048) return null;
  const value = target.trim();

  if (value.startsWith("/")) {
    if (value.startsWith("//") || value.startsWith("/\\") || /[\u0000-\u001f]/.test(value)) return null;
    return value;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;

  const root = rootDomain.toLowerCase().split(":")[0] ?? "";
  const host = url.hostname.toLowerCase();
  if (host === root || host.endsWith(`.${root}`)) return url.toString();
  return null;
}
