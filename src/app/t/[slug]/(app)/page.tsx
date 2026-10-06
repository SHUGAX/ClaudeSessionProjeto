import { AlertTriangle, CalendarClock, Copy, FileText, Inbox, Upload, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
import { HorizontalBarChart, MonthlyColumnChart } from "@/features/dashboard/bar-chart";
import { DocumentStatusBadge } from "@/features/documents/status-badge";
import { can } from "@/lib/auth/permissions";
import { formatBusinessDate } from "@/lib/dates";
import { getI18n } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money";
import { logger } from "@/lib/observability/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTenantContext } from "@/lib/tenancy/context";
import { tenantPath } from "@/lib/tenancy/urls";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("dashboard.title") };
}

interface Metrics {
  currency: string;
  documents_this_month: number;
  amount_this_month: string | number;
  requiring_review: number;
  failed: number;
  possible_duplicates: number;
  due_next_days: number;
  due_next_days_amount: string | number;
  overdue: number;
  overdue_amount: string | number;
  due_soon_days: number;
  by_month: Array<{ month: string; total: string | number }>;
  by_supplier: Array<{ id: string | null; name: string; total: string | number }>;
  by_category: Array<{ id: string | null; name: string | null; total: string | number }>;
}

export default async function DashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireTenantContext(slug);
  const { t, locale } = await getI18n();
  const supabase = await createSupabaseServerClient();
  const orgId = ctx.organization.id;
  const href = (p: string) => tenantPath(slug, p);

  // Alerts are derived data: refresh them opportunistically (idempotent).
  await supabase.rpc("refresh_alerts", { p_org: orgId });
  const [metricsResult, recent, anyDocument] = await Promise.all([
    supabase.rpc("dashboard_metrics", { p_org: orgId }),
    supabase
      .from("documents")
      .select(
        "id, document_number, original_filename, supplier_name, issue_date, total::text, currency, status",
      )
      .eq("organization_id", orgId)
      .neq("status", "uploading")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("documents")
      .select("id", { head: true, count: "exact" })
      .eq("organization_id", orgId),
  ]);

  if (metricsResult.error)
    logger.error("dashboard_metrics_failed", { code: metricsResult.error.code });
  const m = metricsResult.data as unknown as Metrics | null;
  const currency = m?.currency ?? "EUR";
  const money = (v: string | number | undefined) =>
    formatMoney(v == null ? null : String(v), currency, locale);

  const header = (
    <PageHeader
      title={t("dashboard.title")}
      description={t("dashboard.subtitle")}
      actions={
        can.uploadDocuments(ctx.role) ? (
          <Link href={href("/upload")} className={buttonVariants()}>
            <Upload /> {t("dashboard.uploadFirst")}
          </Link>
        ) : null
      }
    />
  );

  if (!m) {
    return (
      <>
        {header}
        <Callout tone="danger">{t("errors.database")}</Callout>
      </>
    );
  }

  if ((anyDocument.count ?? 0) === 0) {
    return (
      <>
        {header}
        <Card>
          <EmptyState
            icon={Inbox}
            title={t("dashboard.emptyTitle")}
            description={t("dashboard.emptyBody")}
            action={
              can.uploadDocuments(ctx.role) ? (
                <Link href={href("/upload")} className={buttonVariants({ size: "sm" })}>
                  {t("dashboard.uploadFirst")}
                </Link>
              ) : undefined
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard
          label={t("dashboard.documentsThisMonth")}
          value={m.documents_this_month}
          icon={FileText}
          href={href("/documents")}
        />
        <StatCard
          label={t("dashboard.amountThisMonth")}
          value={money(m.amount_this_month)}
          icon={Wallet}
        />
        <StatCard
          label={t("dashboard.requiringReview")}
          value={m.requiring_review}
          icon={Inbox}
          tone={m.requiring_review > 0 ? "warning" : "neutral"}
          href={href("/documents?status=review_required")}
        />
        <StatCard
          label={t("dashboard.possibleDuplicates")}
          value={m.possible_duplicates}
          icon={Copy}
          tone={m.possible_duplicates > 0 ? "warning" : "neutral"}
          href={href("/documents?dup=1")}
        />
        <StatCard
          label={t("dashboard.dueSoon", { days: m.due_soon_days })}
          value={m.due_next_days}
          hint={money(m.due_next_days_amount)}
          icon={CalendarClock}
          href={href("/documents?due=next7&status=validated")}
        />
        <StatCard
          label={t("dashboard.overdue")}
          value={m.overdue}
          hint={money(m.overdue_amount)}
          icon={AlertTriangle}
          tone={m.overdue > 0 ? "danger" : "neutral"}
          href={href("/documents?due=overdue&status=validated")}
        />
      </div>
      <p className="text-muted-foreground mt-2 text-xs">
        {t("dashboard.validatedOnly", { currency })}
      </p>

      <div className="mt-6 grid grid-cols-1 items-start gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={t("dashboard.byMonth")} />
          <CardContent>
            <MonthlyColumnChart
              data={m.by_month.map((d) => ({ month: d.month, total: String(d.total) }))}
              currency={currency}
              locale={locale}
              emptyLabel={t("dashboard.noData")}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title={t("dashboard.recentDocuments")} />
          <ul className="divide-border divide-y">
            {(recent.data ?? []).map((d) => (
              <li key={d.id}>
                <Link
                  href={href(`/documents/${d.id}`)}
                  className="hover:bg-muted/50 flex items-center gap-3 px-5 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">
                      {d.document_number ?? d.original_filename}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {d.supplier_name ?? "—"} · {formatBusinessDate(d.issue_date, locale)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="tabular text-[13px]">
                      {formatMoney(d.total, d.currency, locale)}
                    </span>
                    <DocumentStatusBadge status={d.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title={t("dashboard.bySupplier")} />
          <CardContent>
            <HorizontalBarChart
              data={m.by_supplier.map((s, i) => ({
                key: s.id ?? `none-${i}`,
                label: s.name,
                value: String(s.total),
                href: s.id ? href(`/suppliers/${s.id}`) : undefined,
              }))}
              currency={currency}
              locale={locale}
              emptyLabel={t("dashboard.noData")}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title={t("dashboard.byCategory")} />
          <CardContent>
            <HorizontalBarChart
              data={m.by_category.map((c, i) => ({
                key: c.id ?? `none-${i}`,
                label: c.name ?? t("dashboard.uncategorized"),
                value: String(c.total),
                href: c.id ? href(`/documents?category=${c.id}`) : undefined,
              }))}
              currency={currency}
              locale={locale}
              emptyLabel={t("dashboard.noData")}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
