import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AuthShell } from "@/components/layout/auth-shell";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { AppFrame } from "@/components/tenant/app-frame";
import type { NavItem } from "@/components/tenant/sidebar-nav";
import { TenantProvider } from "@/components/tenant/tenant-provider";
import { OrganizationSwitcher, UserMenu } from "@/components/tenant/user-menu";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { can } from "@/lib/auth/permissions";
import { getMyMemberships, getProfile, isPlatformAdmin } from "@/lib/auth/session";
import { logoPublicUrl } from "@/lib/branding";
import { serverEnv } from "@/lib/env.server";
import { getI18n } from "@/lib/i18n/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveTenant } from "@/lib/tenancy/context";
import { isValidSlug } from "@/lib/tenancy/slug";
import { centralUrl, tenantPath, tenantUrl } from "@/lib/tenancy/urls";

export default async function TenantAppLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isValidSlug(slug)) notFound();
  const resolution = await resolveTenant(slug);
  const { t } = await getI18n();

  switch (resolution.kind) {
    case "not_found":
      notFound();
    case "unauthenticated": {
      const pathname = (await headers()).get("x-pathname") ?? "/";
      const next = pathname === "/" || pathname === `/t/${slug}` ? undefined : pathname;
      redirect(tenantPath(slug, next ? `/login?next=${encodeURIComponent(next)}` : "/login"));
    }
    case "suspended":
      return (
        <AuthShell
          title={t("auth.suspendedTitle")}
          organization={{ name: resolution.tenant.name, logoUrl: logoPublicUrl(resolution.tenant.logoPath) }}
        >
          <Callout tone="warning">{t("auth.suspendedBody")}</Callout>
        </AuthShell>
      );
    case "forbidden":
      return (
        <AuthShell title={t("auth.accessDeniedTitle")}>
          <div className="flex flex-col gap-4">
            <Callout tone="danger">{t("auth.accessDeniedBody")}</Callout>
            <p className="text-[13px] text-muted-foreground">{t("auth.loggedInAs", { email: resolution.user.email })}</p>
            <div className="flex items-center justify-between">
              <a href={centralUrl("/")} className="text-sm text-primary hover:underline">
                {t("errors.goHome")}
              </a>
              <SignOutButton label={t("auth.useAnotherAccount")} />
            </div>
          </div>
        </AuthShell>
      );
  }

  const { context } = resolution;
  const { organization, role, user } = context;
  const supabase = await createSupabaseServerClient();
  const [profile, memberships, platformAdmin, settingsResult, alertsResult] = await Promise.all([
    getProfile(),
    getMyMemberships(),
    isPlatformAdmin(),
    supabase
      .from("organization_settings")
      .select("default_currency, timezone")
      .eq("organization_id", organization.id)
      .maybeSingle(),
    supabase
      .from("alerts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .eq("status", "open"),
  ]);

  const href = (path: string) => tenantPath(slug, path);
  const navItems: NavItem[] = [
    { href: href("/"), label: "nav.dashboard", icon: "dashboard", exact: true },
    { href: href("/documents"), label: "nav.documents", icon: "documents" },
    ...(can.uploadDocuments(role) ? [{ href: href("/upload"), label: "nav.upload", icon: "upload" } as NavItem] : []),
    { href: href("/suppliers"), label: "nav.suppliers", icon: "suppliers" },
    { href: href("/categories"), label: "nav.categories", icon: "categories" },
    { href: href("/alerts"), label: "nav.alerts", icon: "alerts", badge: alertsResult.count ?? 0 },
    ...(can.manageUsers(role) ? [{ href: href("/users"), label: "nav.users", icon: "users" } as NavItem] : []),
    { href: href("/settings"), label: "nav.settings", icon: "settings" },
    ...(can.viewAuditLog(role) ? [{ href: href("/audit"), label: "nav.audit", icon: "audit" } as NavItem] : []),
  ];

  const appUrl = serverEnv().APP_URL;
  const organizations = memberships
    .filter((m) => m.organization_status === "active")
    .map((m) => ({
      id: m.organization_id,
      name: m.organization_name,
      href: tenantUrl(m.organization_slug, "/", appUrl),
      active: m.organization_id === organization.id,
    }));
  const simulatedAi = serverEnv().AI_PROVIDER === "mock";

  return (
    <TenantProvider
      value={{
        slug,
        organizationId: organization.id,
        organizationName: organization.name,
        role,
        userId: user.id,
        currency: settingsResult.data?.default_currency ?? "EUR",
        timezone: settingsResult.data?.timezone ?? "Europe/Lisbon",
      }}
    >
      <AppFrame
        sidebarHeader={
          <OrganizationSwitcher
            current={{ name: organization.name, logoUrl: logoPublicUrl(organization.logoPath) }}
            organizations={organizations}
          />
        }
        navItems={navItems}
        sidebarFooter={
          simulatedAi ? (
            <Badge tone="warning" className="w-full justify-center">
              {t("common.simulatedAi")}
            </Badge>
          ) : undefined
        }
        topbar={
          <UserMenu
            name={profile?.full_name ?? null}
            email={user.email}
            roleLabel={t.dynamic(`roles.${role}`)}
            settingsHref={href("/settings")}
            adminHref={platformAdmin ? centralUrl("/admin", appUrl) : undefined}
          />
        }
      >
        {children}
      </AppFrame>
    </TenantProvider>
  );
}
