import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";
import { sessionCookieOptions } from "./cookies";
import type { Database } from "./database.types";

/**
 * Supabase client acting AS THE SIGNED-IN USER. Every query is subject to Row
 * Level Security. This is the default client for reading and writing tenant data.
 */
export async function createSupabaseServerClient() {
  const env = publicEnv();
  const cookieStore = await cookies();
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookieOptions: sessionCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, { ...options, ...sessionCookieOptions() });
          }
        } catch {
          // Called from a Server Component: cookies are refreshed by the proxy instead.
        }
      },
    },
  });
}

export type UserSupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
