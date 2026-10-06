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
      <header className="border-border bg-surface border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/admin" className="flex items-center gap-2">
            <BrandMark name={publicEnv().NEXT_PUBLIC_APP_NAME} className="text-sm" />
            <span className="bg-foreground text-background rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
              Admin
            </span>
          </Link>
          <nav className="flex items-center gap-4 text-[13px]" aria-label={t("admin.title")}>
            <Link
              href="/admin"
              className="text-muted-foreground hover:text-foreground flex items-center gap-1.5"
            >
              <LayoutDashboard className="size-4" aria-hidden /> {t("admin.dashboard")}
            </Link>
            <Link
              href="/admin/organizations"
              className="text-muted-foreground hover:text-foreground flex items-center gap-1.5"
            >
              <Building2 className="size-4" aria-hidden /> {t("admin.organizations")}
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <LanguageSwitcher className="hidden sm:inline-flex" />
            <span className="text-muted-foreground hidden text-[13px] md:inline">{user.email}</span>
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
