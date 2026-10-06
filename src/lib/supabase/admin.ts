import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import type { Database } from "./database.types";

/**
 * Service-role client: BYPASSES Row Level Security.
 *
 * Only use it AFTER the caller has been authorized, and only for:
 *  - system writes (AI extraction records, audit logs, usage counters, alerts)
 *  - platform administration (tenant onboarding)
 *  - invitation acceptance (creating the membership)
 *  - issuing signed upload URLs for paths derived from an authorized document
 * Always scope queries explicitly by organization_id.
 */
let adminClient: ReturnType<typeof createClient<Database>> | undefined;

export function createSupabaseAdminClient() {
  if (adminClient) return adminClient;
  adminClient = createClient<Database>(publicEnv().NEXT_PUBLIC_SUPABASE_URL, serverEnv().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return adminClient;
}

export type AdminSupabaseClient = ReturnType<typeof createSupabaseAdminClient>;
