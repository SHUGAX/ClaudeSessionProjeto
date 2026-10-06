import { ArrowLeft, ExternalLink, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { StatCard } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  EditOrganizationForm,
  InviteOrganizationAdminForm,
  OrganizationStatusButton,
} from "@/features/admin/admin-forms";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";
import { formatTimestamp } from "@/lib/dates";
import { serverEnv } from "@/lib/env.server";
import { getI18n } from "@/lib/i18n/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { tenantUrl } from "@/lib/tenancy/urls";
import { formatBytes } from "@/lib/utils";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminOrganizationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdminPage();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { t, locale } = await getI18n();
  const db = createSupabaseAdminClient();

  const { data: org } = await db
    .from("organizations")
    .select("id, name, legal_name, tax_id, slug, status, plan_id, max_users, max_documents_per_month, max_ai_calls_per_month, max_storage_bytes, suspended_reason, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!org) notFound();

  const [{ data: limits }, { data: plans }, { data: members }, { data: invitations }] = await Promise.all([
    db.rpc("organization_limits", { p_org: id }),
    db.from("plans").select("id, name").eq("active", true).order("name"),
    db
      .from("organization_members")
      .select("id, role, status, joined_at, profiles!organization_members_user_id_fkey(email, full_name)")
      .eq("organization_id", id)
      .order("joined_at"),
    db.from("invitations").select("id, email, role, status, expires_at, created_at").eq("organization_id", id).order("created_at", { ascending: false }).limit(20),
  ]);
  const l = limits?.[0];
  const unlimited = t("settings.unlimited");
  const usage = (used: number | string | undefined, max: number | string | null | undefined, bytes = false) => {
    const f = (v: number | string) => (bytes ? formatBytes(Number(v), locale) : new Intl.NumberFormat(locale).format(Number(v)));
    return `${f(used ?? 0)} / ${max == null ? unlimited : f(max)}`;
  };

  return (
    <>
      <Link href="/admin/organizations" className="mb-1.5 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden /> {t("admin.organizations")}
      </Link>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{org.name}</h1>
            <Badge tone={org.status === "active" ? "success" : "warning"}>{t.dynamic(`admin.status.${org.status}`)}</Badge>
          </div>
          <a
            href={tenantUrl(org.slug, "/", serverEnv().APP_URL)}
            className="mt-1 inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-primary"
            target="_blank"
            rel="noreferrer"
          >
            {tenantUrl(org.slug, "/", serverEnv().APP_URL)} <ExternalLink className="size-3" aria-hidden />
          </a>
        </div>
        <OrganizationStatusButton id={org.id} name={org.name} status={org.status} />
      </div>

      {org.status === "suspended" && org.suspended_reason ? (
        <div className="mb-4">
          <Callout tone="warning">{org.suspended_reason}</Callout>
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t("settings.usersUsage")} value={usage(l?.active_users, l?.max_users)} />
        <StatCard label={t("settings.documentsUsage")} value={usage(l?.documents_this_month, l?.max_documents_per_month)} />
        <StatCard label={t("settings.aiUsage")} value={usage(l?.ai_calls_this_month, l?.max_ai_calls_per_month)} />
        <StatCard label={t("settings.storageUsage")} value={usage(l?.storage_bytes, l?.max_storage_bytes, true)} />
      </div>

      <div className="mb-6">
        <Callout tone="info">
          <span className="inline-flex items-center gap-1.5">
            <ShieldAlert className="size-4" aria-hidden /> {t("admin.noDocumentAccess")}
          </span>
        </Callout>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title={t("admin.detail")} description={`${t("admin.columns.createdAt")}: ${formatTimestamp(org.created_at, locale)}`} />
          <CardContent>
            <EditOrganizationForm values={org} plans={plans ?? []} />
          </CardContent>
        </Card>
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title={t("admin.members")} />
            <Table>
              <TBody>
                {(members ?? []).map((m) => (
                  <TR key={m.id}>
                    <TD>
                      <p className="text-[13px] font-medium">{m.profiles?.full_name ?? m.profiles?.email}</p>
                      <p className="text-xs text-muted-foreground">{m.profiles?.email}</p>
                    </TD>
                    <TD className="text-right text-[13px] text-muted-foreground">
                      {t.dynamic(`roles.${m.role}`)} {m.status !== "active" ? `· ${t("users.disabled")}` : ""}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Card>
            <CardHeader title={t("admin.inviteAdmin")} />
            <CardContent>
              <InviteOrganizationAdminForm organizationId={org.id} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader title={t("admin.invitations")} />
            <Table>
              <THead>
                <tr>
                  <TH>{t("common.email")}</TH>
                  <TH>{t("common.status")}</TH>
                  <TH>{t("users.expiresAt")}</TH>
                </tr>
              </THead>
              <TBody>
                {(invitations ?? []).map((i) => (
                  <TR key={i.id}>
                    <TD className="text-[13px]">{i.email}</TD>
                    <TD className="text-[13px] text-muted-foreground">{i.status}</TD>
                    <TD className="tabular text-[13px] text-muted-foreground">{formatTimestamp(i.expires_at, locale)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>
      </div>
    </>
  );
}
