import "server-only";
import { z } from "zod";

const serverSchema = z.object({
  APP_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  AUTH_COOKIE_DOMAIN: z
    .string()
    .regex(/^\.?[a-z0-9.-]+$/i)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  AI_PROVIDER: z.enum(["gemini", "mock"]),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().min(1),
  AI_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(300_000),
  EMAIL_PROVIDER: z.enum(["console", "resend"]),
  EMAIL_FROM: z.string().min(3),
  RESEND_API_KEY: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]),
  CRON_SECRET: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

/** Server-only configuration. Never import this module from client components. */
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse({
    APP_URL: process.env.APP_URL ?? "http://localhost:3000",
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    AUTH_COOKIE_DOMAIN: process.env.AUTH_COOKIE_DOMAIN,
    AI_PROVIDER: process.env.AI_PROVIDER ?? "mock",
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || undefined,
    GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    AI_TIMEOUT_MS: process.env.AI_TIMEOUT_MS ?? 90_000,
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER ?? "console",
    EMAIL_FROM: process.env.EMAIL_FROM ?? "DocuFlow <no-reply@example.com>",
    RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
    LOG_LEVEL: process.env.LOG_LEVEL ?? "info",
    CRON_SECRET: process.env.CRON_SECRET || undefined,
    NODE_ENV: process.env.NODE_ENV,
  });
  if (!parsed.success) {
    // Only variable names are reported, never values.
    throw new Error(
      `Invalid server environment configuration: ${parsed.error.issues
        .map((i) => i.path.join("."))
        .join(", ")}. See .env.example.`,
    );
  }
  if (parsed.data.NODE_ENV === "production" && parsed.data.AI_PROVIDER === "mock") {
    // Allowed (e.g. demo deployments) but must be a conscious decision.
    console.warn(
      JSON.stringify({ level: "warn", msg: "AI_PROVIDER=mock in production: extraction is simulated" }),
    );
  }
  cached = parsed.data;
  return cached;
}
