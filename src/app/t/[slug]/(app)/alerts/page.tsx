import {
  AlertTriangle,
  BellOff,
  CalendarClock,
  Copy,
  FileWarning,
  Inbox,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { DismissAlertButton } from "@/features/alerts/dismiss-button";
import { can } from "@/lib/auth/permissions";
import { formatBusinessDate, formatTimestamp } from "@/lib/dates";
import { getI18n } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AlertType } from "@/lib/supabase/types";
import { requireTenantContext } from "@/lib/tenancy/context";
import { tenantPath } from "@/lib/tenancy/urls";
import { cn } from "@/lib/utils";

const ICONS: Record<AlertType, { icon: LucideIcon; tone: string }> = {
  due_soon: { icon: CalendarClock, tone: "text-warning bg-warning-soft" },
  overdue: { icon: AlertTriangle, tone: "text-danger bg-danger-soft" },
  review_required: { icon: Inbox, tone: "text-info bg-info-soft" },
  possible_duplicate: { icon: Copy, tone: "text-warning bg-warning-soft" },
  processing_failed: { icon: FileWarning, tone: "text-danger bg-danger-soft" },
};

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("alerts.title") };
}

export default async function AlertsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ dismissed?: string }>;
}) {
  const { slug } = await params;
  const showDismissed = (await searchParams).dismissed === "1";
  const ctx = await requireTenantContext(slug);
  const { t, locale } = await getI18n();
  const supabase = await createSupabaseServerClient();
  const orgId = ctx.organization.id;

  await supabase.rpc("refresh_alerts", { p_org: orgId });
  const [{ data: alerts }, settings] = await Promise.all([
    supabase
      .from("alerts")
      .select(
        "id, type, status, due_date, created_at, documents(id, document_number, supplier_name, total::text, currency)",
      )
      .eq("organization_id", orgId)
      .in("status", showDismissed ? ["open", "dismissed"] : ["open"])
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("organization_settings")
      .select("timezone")
      .eq("organization_id", orgId)
      .maybeSingle(),
  ]);
  const timezone = settings.data?.timezone ?? "Europe/Lisbon";
  const canDismiss = can.editDocuments(ctx.role);

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={t("alerts.title")}
        description={t("alerts.subtitle")}
        actions={
          <Link
            href={tenantPath(slug, showDismissed ? "/alerts" : "/alerts?dismissed=1")}
            className="text-primary text-[13px] hover:underline"
          >
            {showDismissed ? t("alerts.title") : t("alerts.showDismissed")}
          </Link>
        }
      />
      <Card>
        {(alerts ?? []).length === 0 ? (
          <EmptyState
            icon={BellOff}
            title={t("alerts.emptyTitle")}
            description={t("alerts.emptyBody")}
          />
        ) : (
          <ul className="divide-border divide-y">
            {(alerts ?? []).map((alert) => {
              const { icon: Icon, tone } = ICONS[alert.type];
              const doc = alert.documents;
              return (
                <li
                  key={alert.id}
                  className={cn(
                    "flex items-center gap-3 px-5 py-3",
                    alert.status === "dismissed" && "opacity-60",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-md",
                      tone,
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {t.dynamic(`alerts.types.${alert.type}`)}
                      {alert.status === "dismissed" ? (
                        <Badge className="ml-2">{t("alerts.dismiss")}</Badge>
                      ) : null}
                    </p>
                    {doc ? (
                      <Link
                        href={tenantPath(slug, `/documents/${doc.id}`)}
                        className="text-muted-foreground hover:text-primary block truncate text-[13px]"
                      >
                        {[
                          doc.document_number ?? t("documents.unnamed"),
                          doc.supplier_name,
                          formatMoney(doc.total, doc.currency, locale),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </Link>
                    ) : null}
                    <p className="text-muted-foreground text-xs">
                      {alert.due_date
                        ? t(alert.type === "overdue" ? "alerts.dueWas" : "alerts.dueOn", {
                            date: formatBusinessDate(alert.due_date, locale),
                          })
                        : formatTimestamp(alert.created_at, locale, timezone)}
                    </p>
                  </div>
                  {canDismiss && alert.status === "open" ? (
                    <DismissAlertButton alertId={alert.id} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
