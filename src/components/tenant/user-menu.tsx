"use client";

import { Check, ChevronsUpDown, Languages, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { OrganizationLogo } from "@/components/layout/brand";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setLocaleAction } from "@/features/i18n/actions";
import { LOCALE_LABELS, LOCALES } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/client";

export function UserMenu({
  name,
  email,
  roleLabel,
  settingsHref,
  adminHref,
}: {
  name: string | null;
  email: string;
  roleLabel: string;
  settingsHref: string;
  adminHref?: string;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const display = name || email;
  const initials = display
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="hover:bg-muted flex items-center gap-2 rounded-md px-1.5 py-1 text-left"
        aria-label={t("nav.userMenu")}
      >
        <span className="bg-muted text-muted-foreground flex size-8 items-center justify-center rounded-full text-xs font-semibold">
          {initials}
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block max-w-40 truncate text-[13px] leading-4 font-medium">
            {display}
          </span>
          <span className="text-muted-foreground block text-xs">{roleLabel}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60">
        <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push(settingsHref)}>
          <UserRound /> {t("settings.profile")}
        </DropdownMenuItem>
        {adminHref ? (
          <DropdownMenuItem onSelect={() => (window.location.href = adminHref)}>
            <ShieldCheck /> {t("nav.platformAdmin")}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-1.5">
          <Languages className="size-3.5" /> {t("common.language")}
        </DropdownMenuLabel>
        {LOCALES.map((l) => (
          <DropdownMenuItem
            key={l}
            onSelect={() =>
              startTransition(async () => {
                await setLocaleAction(l);
                router.refresh();
              })
            }
          >
            <Check className={l === locale ? "opacity-100" : "opacity-0"} /> {LOCALE_LABELS[l]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="hover:bg-muted [&_svg]:text-muted-foreground flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm [&_svg]:size-4"
          >
            <LogOut /> {t("common.signOut")}
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function OrganizationSwitcher({
  current,
  organizations,
}: {
  current: { name: string; logoUrl: string | null };
  organizations: Array<{ id: string; name: string; href: string; active: boolean }>;
}) {
  const { t } = useI18n();
  const header = (
    <span className="flex min-w-0 items-center gap-2.5">
      <OrganizationLogo name={current.name} logoUrl={current.logoUrl} size="sm" />
      <span className="truncate text-sm font-semibold">{current.name}</span>
    </span>
  );
  if (organizations.length <= 1) return <div className="px-1">{header}</div>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="hover:bg-muted flex w-full items-center justify-between gap-2 rounded-md px-1 py-1"
        aria-label={t("nav.switchOrganization")}
      >
        {header}
        <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>{t("nav.switchOrganization")}</DropdownMenuLabel>
        {organizations.map((o) => (
          <DropdownMenuItem key={o.id} onSelect={() => (window.location.href = o.href)}>
            <Check className={o.active ? "opacity-100" : "opacity-0"} />
            <span className="truncate">{o.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
