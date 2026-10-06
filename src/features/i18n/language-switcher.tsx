"use client";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LOCALE_LABELS, LOCALES } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { setLocaleAction } from "./actions";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className={cn("inline-flex items-center gap-1.5 text-[13px] text-muted-foreground", className)}>
      <Languages className="size-4" aria-hidden />
      <span className="sr-only">{t("common.language")}</span>
      <select
        value={locale}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          startTransition(async () => {
            await setLocaleAction(next);
            router.refresh();
          });
        }}
        className="cursor-pointer rounded bg-transparent py-1 pr-1 text-[13px] text-muted-foreground hover:text-foreground focus-visible:outline-2"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
