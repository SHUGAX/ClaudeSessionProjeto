import Link from "next/link";
import type { ReactNode } from "react";
import { LanguageSwitcher } from "@/features/i18n/language-switcher";
import { publicEnv } from "@/lib/env";
import { getI18n } from "@/lib/i18n/server";
import { BrandMark, OrganizationLogo } from "./brand";

export async function AuthShell({
  title,
  subtitle,
  children,
  organization,
  footer,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  organization?: { name: string; logoUrl: string | null };
  footer?: ReactNode;
}) {
  const { t } = await getI18n();
  const appName = publicEnv().NEXT_PUBLIC_APP_NAME;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <BrandMark name={appName} className="text-sm" />
        <LanguageSwitcher />
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">
          {organization ? (
            <div className="mb-6 flex items-center gap-3">
              <OrganizationLogo name={organization.name} logoUrl={organization.logoUrl} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-base font-semibold">{organization.name}</p>
                <p className="text-xs text-muted-foreground">{t("common.poweredBy", { app: appName })}</p>
              </div>
            </div>
          ) : null}
          <div className="rounded-lg border border-border bg-surface p-6 shadow-[var(--shadow-card)] sm:p-7">
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
            {subtitle ? <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{subtitle}</p> : null}
            <div className="mt-6">{children}</div>
          </div>
          {footer ? <div className="mt-4 text-center text-[13px] text-muted-foreground">{footer}</div> : null}
        </div>
      </main>
      <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-5 text-xs text-muted-foreground">
        <Link href="/legal/privacy" className="hover:text-foreground">
          {t("legal.privacy")}
        </Link>
        <Link href="/legal/terms" className="hover:text-foreground">
          {t("legal.terms")}
        </Link>
        <Link href="/legal/cookies" className="hover:text-foreground">
          {t("legal.cookies")}
        </Link>
      </footer>
    </div>
  );
}
