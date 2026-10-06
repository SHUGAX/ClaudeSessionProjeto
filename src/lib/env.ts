import { z } from "zod";

/**
 * Public configuration (available in the browser). Values are inlined at build
 * time by Next.js, so each variable must be referenced explicitly.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_ROOT_DOMAIN: z
    .string()
    .min(1)
    .regex(/^[a-z0-9.-]+(:\d+)?$/i, "Root domain must not include protocol or path"),
  NEXT_PUBLIC_TENANT_ROUTING: z.enum(["subdomain", "path"]),
  NEXT_PUBLIC_APP_NAME: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicSchema>;

let cachedPublic: PublicEnv | undefined;

export function publicEnv(): PublicEnv {
  if (cachedPublic) return cachedPublic;
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_ROOT_DOMAIN: process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000",
    NEXT_PUBLIC_TENANT_ROUTING: process.env.NEXT_PUBLIC_TENANT_ROUTING ?? "path",
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME ?? "DocuFlow",
  });
  if (!parsed.success) {
    throw new Error(
      `Invalid public environment configuration: ${parsed.error.issues
        .map((i) => i.path.join("."))
        .join(", ")}. See .env.example.`,
    );
  }
  cachedPublic = parsed.data;
  return cachedPublic;
}

/** Non-throwing variant for code paths that must render even when misconfigured. */
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
