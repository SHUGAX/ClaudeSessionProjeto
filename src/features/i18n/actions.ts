"use server";

import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth/session";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function setLocaleAction(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === "production",
    ...(process.env.AUTH_COOKIE_DOMAIN ? { domain: process.env.AUTH_COOKIE_DOMAIN } : {}),
  });
  const user = await getSessionUser();
  if (user) {
    const supabase = await createSupabaseServerClient();
    await supabase.from("profiles").update({ preferred_language: locale }).eq("id", user.id);
  }
}
