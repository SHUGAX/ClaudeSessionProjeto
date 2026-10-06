import { Building2, CheckCircle2, FileText, Sparkles, Users, XCircle } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";
import { formatTimestamp } from "@/lib/dates";
import { getI18n } from "@/lib/i18n/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

interface PlatformStats {
  organizations: number;
  active_organizations: number;
  users: number;
  documents: number;
  documents_this_month: number;
  extractions_success_30d: number;
  extractions_error_30d: number;
}

export default async function AdminDashboardPage() {
  await requirePlatformAdminPage();
  const { t, locale } = await getI18n();
  const db = createSupabaseAdminClient();
  const [{ data: statsData }, { data: activity }] = await Promise.all([
    db.rpc("platform_stats"),
    // Only organization-level events are shown here (no tenant document data).
    db
      .from("audit_logs")
      .select("id, action, created_at, organizations(name, slug)")
      .in("entity_type", ["organization", "invitation"])
      .order("created_at", { ascending: false })
      .limit(15),
  ]);
  const stats = statsData as unknown as PlatformStats | null;

  return (
    <>
      <PageHeader title={t("admin.title")} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t("admin.stats.organizations")}
          value={stats?.organizations ?? 0}
          icon={Building2}
          href="/admin/organizations"
        />
        <StatCard
          label={t("admin.stats.activeOrganizations")}
          value={stats?.active_organizations ?? 0}
          icon={CheckCircle2}
        />
        <StatCard label={t("admin.stats.users")} value={stats?.users ?? 0} icon={Users} />
        <StatCard
          label={t("admin.stats.documents")}
          value={stats?.documents ?? 0}
          hint={`${t("admin.stats.documentsThisMonth")}: ${stats?.documents_this_month ?? 0}`}
          icon={FileText}
        />
        <StatCard
          label={t("admin.stats.aiSuccess")}
          value={stats?.extractions_success_30d ?? 0}
          icon={Sparkles}
          tone="success"
        />
        <StatCard
          label={t("admin.stats.aiErrors")}
          value={stats?.extractions_error_30d ?? 0}
          icon={XCircle}
          tone={(stats?.extractions_error_30d ?? 0) > 0 ? "danger" : "neutral"}
        />
      </div>
      <Card className="mt-6">
        <CardHeader title={t("admin.recentActivity")} />
        {(activity ?? []).length === 0 ? (
          <EmptyState title={t("audit.emptyTitle")} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t("audit.when")}</TH>
                <TH>{t("admin.columns.name")}</TH>
                <TH>{t("audit.action")}</TH>
              </tr>
            </THead>
            <TBody>
              {(activity ?? []).map((a) => (
                <TR key={a.id}>
                  <TD className="tabular text-muted-foreground">
                    {formatTimestamp(a.created_at, locale)}
                  </TD>
                  <TD>{a.organizations?.name ?? "—"}</TD>
                  <TD>{t.dynamic(`audit.actions.${a.action.replace(".", "_")}`, a.action)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
