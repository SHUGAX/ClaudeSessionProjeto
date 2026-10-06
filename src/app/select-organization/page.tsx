import { ChevronRight, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/layout/auth-shell";
import { OrganizationLogo } from "@/components/layout/brand";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { Badge } from "@/components/ui/badge";
import { getMyMemberships, getSessionUser, isPlatformAdmin } from "@/lib/auth/session";
import { logoPublicUrl } from "@/lib/branding";
import { serverEnv } from "@/lib/env.server";
import { getI18n } from "@/lib/i18n/server";
import { tenantUrl } from "@/lib/tenancy/urls";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("auth.selectOrganizationTitle") };
}

export default async function SelectOrganizationPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/select-organization");
  const [{ t }, memberships, platformAdmin] = await Promise.all([getI18n(), getMyMemberships(), isPlatformAdmin()]);
  const appUrl = serverEnv().APP_URL;

  return (
    <AuthShell
      title={t("auth.selectOrganizationTitle")}
      subtitle={t("auth.selectOrganizationSubtitle")}
      footer={
        <div className="flex flex-col items-center gap-2">
          <span>{t("auth.loggedInAs", { email: user.email })}</span>
          <SignOutButton label={t("common.signOut")} />
        </div>
      }
    >
      <ul className="-mx-2 flex flex-col gap-1">
        {memberships.map((m) => {
          const active = m.organization_status === "active";
          const content = (
            <>
              <OrganizationLogo name={m.organization_name} logoUrl={logoPublicUrl(m.logo_path)} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{m.organization_name}</span>
                <span className="block text-xs text-muted-foreground">{t.dynamic(`roles.${m.role}`)}</span>
              </span>
              {active ? (
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              ) : (
                <Badge tone="warning">{t("auth.suspendedBadge")}</Badge>
              )}
            </>
          );
          return (
            <li key={m.organization_id}>
              {active ? (
                <a
                  href={tenantUrl(m.organization_slug, "/", appUrl)}
                  className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted"
                >
                  {content}
                </a>
              ) : (
                <div className="flex items-center gap-3 px-2 py-2 opacity-70">{content}</div>
              )}
            </li>
          );
        })}
        {platformAdmin ? (
          <li>
            <Link href="/admin" className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted">
              <span className="flex size-7 items-center justify-center rounded-md bg-muted">
                <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
              </span>
              <span className="flex-1 text-sm font-medium">{t("nav.platformAdmin")}</span>
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ) : null}
      </ul>
    </AuthShell>
  );
}
