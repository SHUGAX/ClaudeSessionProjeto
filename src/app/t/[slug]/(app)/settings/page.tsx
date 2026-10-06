import type { Metadata } from "next";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { PageHeader } from "@/components/ui/misc";
import { OrganizationSettingsForm, ProfileForm } from "@/features/settings/settings-forms";
import { can } from "@/lib/auth/permissions";
import { getProfile } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTenantContext } from "@/lib/tenancy/context";
import { formatBytes } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("settings.title") };
}

function UsageRow({ label, used, limit, unlimited }: { label: string; used: string; limit: string | null; unlimited: string }) {
  return (
    <div className="flex items-center justify-between py-2 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular font-medium">
        {used} / {limit ?? unlimited}
      </span>
    </div>
  );
}

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireTenantContext(slug);
  const { t, locale } = await getI18n();
  const supabase = await createSupabaseServerClient();
  const orgId = ctx.organization.id;
  const isAdmin = can.manageOrganization(ctx.role);

  const [profile, settings, limits, plan] = await Promise.all([
    getProfile(),
    supabase
      .from("organization_settings")
      .select("default_currency, default_language, due_soon_days")
      .eq("organization_id", orgId)
      .maybeSingle(),
    isAdmin ? supabase.rpc("organization_limits", { p_org: orgId }) : Promise.resolve({ data: null }),
    supabase.from("organizations").select("plans(name)").eq("id", orgId).maybeSingle(),
  ]);
  const l = limits.data?.[0];
  const n = (v: number | null | undefined) => (v == null ? null : new Intl.NumberFormat(locale).format(v));

  return (
    <div className="max-w-4xl">
      <PageHeader title={t("settings.title")} description={t("settings.subtitle")} />
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader title={t("settings.organization")} />
          <CardContent>
            {!isAdmin ? (
              <div className="mb-4">
                <Callout tone="info">{t("settings.readOnly")}</Callout>
              </div>
            ) : null}
            <OrganizationSettingsForm
              disabled={!isAdmin}
              values={{
                name: ctx.organization.name,
                legalName: ctx.organization.legalName,
                taxId: ctx.organization.taxId,
                defaultCurrency: settings.data?.default_currency ?? "EUR",
                defaultLanguage: settings.data?.default_language ?? "pt-PT",
                dueSoonDays: settings.data?.due_soon_days ?? 7,
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader title={t("settings.profile")} />
          <CardContent>
            <ProfileForm
              fullName={profile?.full_name ?? null}
              preferredLanguage={profile?.preferred_language ?? locale}
              email={ctx.user.email}
            />
          </CardContent>
        </Card>

        {isAdmin && l ? (
          <Card>
            <CardHeader
              title={t("settings.usage")}
              description={`${t("settings.plan")}: ${plan.data?.plans?.name ?? t("settings.noPlan")}`}
            />
            <CardContent className="divide-y divide-border py-2">
              <UsageRow label={t("settings.usersUsage")} used={n(l.active_users) ?? "0"} limit={n(l.max_users)} unlimited={t("settings.unlimited")} />
              <UsageRow
                label={t("settings.documentsUsage")}
                used={n(l.documents_this_month) ?? "0"}
                limit={n(l.max_documents_per_month)}
                unlimited={t("settings.unlimited")}
              />
              <UsageRow
                label={t("settings.aiUsage")}
                used={n(l.ai_calls_this_month) ?? "0"}
                limit={n(l.max_ai_calls_per_month)}
                unlimited={t("settings.unlimited")}
              />
              <UsageRow
                label={t("settings.storageUsage")}
                used={formatBytes(Number(l.storage_bytes), locale)}
                limit={l.max_storage_bytes == null ? null : formatBytes(Number(l.max_storage_bytes), locale)}
                unlimited={t("settings.unlimited")}
              />
              <p className="pt-3 text-xs text-muted-foreground">{t("settings.limitsHint")}</p>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader title={t("settings.dataPrivacy")} />
          <CardContent>
            <p className="text-[13px] text-muted-foreground">{t("settings.dataPrivacyBody")}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
