import "server-only";
import { logger } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Fixed-window rate limiting backed by Postgres (works across serverless
 * instances). Fails open on infrastructure errors (Supabase Auth applies its own
 * limits to authentication endpoints as a second layer).
 */
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_key: key.slice(0, 200),
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) throw error;
    return data === true;
  } catch (error) {
    logger.warn("rate_limit_unavailable", { error });
    return true;
  }
}

export const RATE_LIMITS = {
  login: { max: 10, windowSeconds: 300 },
  passwordReset: { max: 5, windowSeconds: 900 },
  invitationAccept: { max: 10, windowSeconds: 900 },
  invitationCreate: { max: 30, windowSeconds: 3600 },
  uploadIntent: { max: 120, windowSeconds: 600 },
  extraction: { max: 60, windowSeconds: 600 },
} as const;
