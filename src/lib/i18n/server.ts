import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import { MESSAGES } from "./messages";
import { createTranslator } from "./translate";

/**
 * Locale resolution order: explicit cookie (set by the language switcher or at
 * login from the user's profile) → Accept-Language → default (pt-PT).
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  const accept = (await headers()).get("accept-language") ?? "";
  if (/^en\b/i.test(accept.trim())) return "en";
  return DEFAULT_LOCALE;
});

export const getI18n = cache(async () => {
  const locale = await getLocale();
  const messages = MESSAGES[locale];
  return { locale, messages, t: createTranslator(messages, locale) };
});
