import { ScrollText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Pagination } from "@/components/ui/pagination";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { can } from "@/lib/auth/permissions";
import { formatTimestamp } from "@/lib/dates";
import { getI18n } from "@/lib/i18n/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTenantContext } from "@/lib/tenancy/context";
import { tenantPath } from "@/lib/tenancy/urls";

const PAGE = 50;
const ENTITY_TYPES = [
  "document",
  "supplier",
  "category",
  "member",
  "invitation",
  "settings",
  "organization",
] as const;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("audit.title") };
}

function summarize(values: unknown): string {
  if (!values || typeof values !== "object") return "";
  return Object.entries(values as Record<string, unknown>)
    .slice(0, 4)
    .map(
      ([k, v]) =>
        `${k}: ${v == null ? "∅" : typeof v === "object" ? JSON.stringify(v) : String(v)}`,
    )
    .join(" · ")
    .slice(0, 200);
}

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ entity?: string; page?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireTenantContext(slug);
  if (!can.viewAuditLog(ctx.role)) notFound();
  const { t, locale } = await getI18n();
  const supabase = await createSupabaseServerClient();
  const entity = ENTITY_TYPES.find((e) => e === sp.entity);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  let query = supabase
    .from("audit_logs")
    .select(
      "id, action, entity_type, entity_id, actor_type, new_values, created_at, profiles(full_name, email)",
      { count: "exact" },
    )
    .eq("organization_id", ctx.organization.id)
    .order("created_at", { ascending: false });
  if (entity) query = query.eq("entity_type", entity);
  const { data: logs, count } = await query.range((page - 1) * PAGE, page * PAGE - 1);
  const pageCount = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const base = tenantPath(slug, "/audit");

  return (
    <>
      <PageHeader title={t("audit.title")} description={t("audit.subtitle")} />
      <div className="mb-4 flex flex-wrap gap-2 text-[13px]">
        <Link
          href={base}
          className={
            !entity ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
          }
        >
          {t("common.all")}
        </Link>
        {ENTITY_TYPES.map((e) => (
          <Link
            key={e}
            href={`${base}?entity=${e}`}
            className={
              entity === e
                ? "text-primary font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }
          >
            {e}
          </Link>
        ))}
      </div>
      <Card>
        {(logs ?? []).length === 0 ? (
          <EmptyState icon={ScrollText} title={t("audit.emptyTitle")} />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>{t("audit.when")}</TH>
                  <TH>{t("audit.actor")}</TH>
                  <TH>{t("audit.action")}</TH>
                  <TH className="hidden lg:table-cell">{t("audit.changes")}</TH>
                </tr>
              </THead>
              <TBody>
                {(logs ?? []).map((log) => (
                  <TR key={log.id}>
                    <TD className="tabular text-muted-foreground whitespace-nowrap">
                      {formatTimestamp(log.created_at, locale)}
                    </TD>
                    <TD className="max-w-[12rem] truncate">
                      {log.profiles?.full_name ?? log.profiles?.email ?? t("audit.system")}
                    </TD>
                    <TD>
                      {log.entity_type === "document" && log.entity_id ? (
                        <Link
                          href={tenantPath(slug, `/documents/${log.entity_id}`)}
                          className="hover:text-primary"
                        >
                          {t.dynamic(`audit.actions.${log.action.replace(".", "_")}`, log.action)}
                        </Link>
                      ) : (
                        t.dynamic(`audit.actions.${log.action.replace(".", "_")}`, log.action)
                      )}
                    </TD>
                    <TD className="text-muted-foreground hidden max-w-md truncate text-xs lg:table-cell">
                      {summarize(log.new_values)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination
              page={page}
              pageCount={pageCount}
              hrefFor={(p) =>
                `${base}?${new URLSearchParams({ ...(entity ? { entity } : {}), page: String(p) })}`
              }
              labels={{
                previous: t("common.previous"),
                next: t("common.next"),
                page: t("common.page", { page, total: pageCount }),
              }}
            />
          </>
        )}
      </Card>
    </>
  );
}
