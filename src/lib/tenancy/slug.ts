import { z } from "zod";

/** Keep in sync with public.is_reserved_slug() in the database. */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "www", "app", "admin", "api", "support", "status", "docs", "mail", "auth",
  "help", "blog", "static", "assets", "cdn", "login", "logout", "signup",
  "billing", "dashboard", "smtp", "imap", "pop", "ftp", "ns1", "ns2", "test",
  "staging", "dev", "internal", "root", "system", "supabase", "vercel",
]);

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,61})[a-z0-9]$/;

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

/** Syntactic validity of a tenant slug (DNS label, lowercase, 3–63 chars). */
export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug) && !slug.includes("--") && !isReservedSlug(slug);
}

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(63)
  .refine((s) => SLUG_PATTERN.test(s) && !s.includes("--"), { message: "invalid_slug" })
  .refine((s) => !isReservedSlug(s), { message: "reserved_slug" });

/** Suggests a slug from an organization name ("Pizzaria São João, Lda." → "pizzaria-sao-joao-lda"). */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");
}
