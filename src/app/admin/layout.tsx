import { Building2, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/layout/brand";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { Toaster } from "@/components/ui/toast";
import { LanguageSwitcher } from "@/features/i18n/language-switcher";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";
import { publicEnv } from "@/lib/env";
import { getI18n } from "@/lib/i18n/server";

export const metadata = { title: "Admin" };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requirePlatformAdminPage();
  const { t } = await getI18n();
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/admin" className="flex items-center gap-2">
            <BrandMark name={publicEnv().NEXT_PUBLIC_APP_NAME} className="text-sm" />
            <span className="rounded bg-foreground px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-background">
              Admin
            </span>
          </Link>
          <nav className="flex items-center gap-4 text-[13px]" aria-label={t("admin.title")}>
            <Link href="/admin" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
              <LayoutDashboard className="size-4" aria-hidden /> {t("admin.dashboard")}
            </Link>
            <Link href="/admin/organizations" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
              <Building2 className="size-4" aria-hidden /> {t("admin.organizations")}
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <LanguageSwitcher className="hidden sm:inline-flex" />
            <span className="hidden text-[13px] text-muted-foreground md:inline">{user.email}</span>
            <SignOutButton label={t("common.signOut")} />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {children}
      </main>
      <Toaster />
    </div>
  );
}
