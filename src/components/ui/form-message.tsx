"use client";

import { useI18n } from "@/lib/i18n/client";
import { Callout } from "./callout";

/** Renders a translated success/error message coming from a server action. */
export function FormMessage({
  error,
  success,
  vars,
}: {
  error?: string;
  success?: string;
  vars?: Record<string, string | number>;
}) {
  const { t } = useI18n();
  if (error) return <Callout tone="danger">{t.dynamic(error, t("errors.body"), vars)}</Callout>;
  if (success) return <Callout tone="success">{t.dynamic(success, success, vars)}</Callout>;
  return null;
}
