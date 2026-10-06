import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SessionUser {
  id: string;
  email: string;
}

/**
 * Returns the authenticated user, validated against Supabase Auth (getUser
 * performs a server round-trip; never trust the unverified cookie payload).
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: (data.user.email ?? "").toLowerCase() };
});

export async function requireUser(loginPath = "/login"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(loginPath);
  return user;
}

export const getProfile = cache(async () => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, preferred_language")
    .eq("id", user.id)
    .maybeSingle();
  return data;
});

export const isPlatformAdmin = cache(async (): Promise<boolean> => {
  const user = await getSessionUser();
  if (!user) return false;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("is_platform_admin");
  return !error && data === true;
});

export const getMyMemberships = cache(async () => {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_memberships");
  if (error || !data) return [];
  return data;
});
