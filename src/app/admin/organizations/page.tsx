import { Plus } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";
import { formatTimestamp } from "@/lib/dates";
import { getI18n } from "@/lib/i18n/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatBytes } from "@/lib/utils";

export default async function AdminOrganizationsPage() {
  await requirePlatformAdminPage();
  const { t, locale } = await getI18n();
  const { data: organizations } = await createSupabaseAdminClient().rpc("organization_overview");

  return (
    <>
      <PageHeader
        title={t("admin.organizations")}
        actions={
          <Link href="/admin/organizations/new" className={buttonVariants()}>
            <Plus /> {t("admin.newOrganization")}
          </Link>
        }
      />
      <Card>
        {(organizations ?? []).length === 0 ? (
          <EmptyState title={t("admin.organizations")} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t("admin.columns.name")}</TH>
                <TH>{t("admin.columns.slug")}</TH>
                <TH className="hidden md:table-cell">{t("admin.columns.plan")}</TH>
                <TH>{t("admin.columns.status")}</TH>
                <TH className="text-right">{t("admin.columns.members")}</TH>
                <TH className="text-right">{t("admin.columns.documents")}</TH>
                <TH className="hidden text-right lg:table-cell">{t("admin.columns.storage")}</TH>
                <TH className="hidden lg:table-cell">{t("admin.columns.createdAt")}</TH>
              </tr>
            </THead>
            <TBody>
              {(organizations ?? []).map((o) => (
                <TR key={o.id} className="relative">
                  <TD>
                    <Link href={`/admin/organizations/${o.id}`} className="font-medium after:absolute after:inset-0 hover:text-primary">
                      {o.name}
                    </Link>
                  </TD>
                  <TD className="font-mono text-xs text-muted-foreground">{o.slug}</TD>
                  <TD className="hidden md:table-cell">{o.plan_name ?? "—"}</TD>
                  <TD>
                    <Badge tone={o.status === "active" ? "success" : "warning"}>{t.dynamic(`admin.status.${o.status}`)}</Badge>
                  </TD>
                  <TD className="tabular text-right">{o.member_count}</TD>
                  <TD className="tabular text-right">{o.document_count}</TD>
                  <TD className="tabular hidden text-right lg:table-cell">{formatBytes(Number(o.storage_bytes), locale)}</TD>
                  <TD className="tabular hidden text-muted-foreground lg:table-cell">{formatTimestamp(o.created_at, locale)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
