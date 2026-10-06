import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AuthShell } from "@/components/layout/auth-shell";
import { Callout } from "@/components/ui/callout";
import { LoginForm } from "@/features/auth/login-form";
import { logoPublicUrl } from "@/lib/branding";
import { getI18n } from "@/lib/i18n/server";
import { centralUrl, tenantPath } from "@/lib/tenancy/urls";
import { resolveTenant } from "@/lib/tenancy/context";
import { isValidSlug } from "@/lib/tenancy/slug";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { t } = await getI18n();
  const resolution = isValidSlug(slug) ? await resolveTenant(slug) : null;
  const name = resolution && resolution.kind !== "not_found" ? (resolution.kind === "ok" ? resolution.context.organization.name : resolution.tenant.name) : null;
  return { title: name ? `${t("auth.loginTitle")} · ${name}` : t("auth.loginTitle") };
}

/** Tenant-branded login. Branding is public; access still requires membership. */
export default async function TenantLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { slug } = await params;
  const { next } = await searchParams;
  if (!isValidSlug(slug)) notFound();
  const resolution = await resolveTenant(slug);
  if (resolution.kind === "not_found") notFound();
  if (resolution.kind === "ok") redirect(tenantPath(slug, "/"));

  const { t } = await getI18n();
  const tenant = resolution.tenant;
  const organization = { name: tenant.name, logoUrl: logoPublicUrl(tenant.logoPath) };

  if (resolution.kind === "suspended") {
    return (
      <AuthShell title={t("auth.suspendedTitle")} organization={organization}>
        <Callout tone="warning">{t("auth.suspendedBody")}</Callout>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t("auth.loginTitle")}
      subtitle={t("auth.tenantLoginSubtitle", { organization: tenant.name })}
      organization={organization}
    >
      {resolution.kind === "forbidden" ? (
        <div className="mb-4">
          <Callout tone="warning">{t("auth.accessDeniedBody")}</Callout>
        </div>
      ) : null}
      <LoginForm next={next} tenant={slug} forgotPasswordHref={centralUrl("/forgot-password")} />
    </AuthShell>
  );
}
