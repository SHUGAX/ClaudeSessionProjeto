import { Copy, FileText, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Pagination } from "@/components/ui/pagination";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DocumentFiltersBar } from "@/features/documents/filters-bar";
import { DocumentStatusBadge } from "@/features/documents/status-badge";
import { can } from "@/lib/auth/permissions";
import { formatBusinessDate, formatTimestamp, todayIso } from "@/lib/dates";
import { listDocuments, PAGE_SIZE, parseDocumentFilters } from "@/lib/documents/queries";
import { getI18n } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money";
import { logger } from "@/lib/observability/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTenantContext } from "@/lib/tenancy/context";
import { tenantPath } from "@/lib/tenancy/urls";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("documents.title") };
}

export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const ctx = await requireTenantContext(slug);
  const { t, locale } = await getI18n();
  const filters = parseDocumentFilters(await searchParams);
  const supabase = await createSupabaseServerClient();

  const [settings, suppliers, categories] = await Promise.all([
    supabase.from("organization_settings").select("timezone").eq("organization_id", ctx.organization.id).maybeSingle(),
    supabase.from("suppliers").select("id, name").eq("organization_id", ctx.organization.id).order("name").limit(1000),
    supabase.from("categories").select("id, name").eq("organization_id", ctx.organization.id).order("name"),
  ]);
  const timezone = settings.data?.timezone ?? "Europe/Lisbon";

  let result: Awaited<ReturnType<typeof listDocuments>> | null = null;
  try {
    result = await listDocuments(supabase, ctx.organization.id, filters, timezone);
  } catch (error) {
    logger.error("documents_list_failed", { error });
  }

  const base = tenantPath(slug, "/documents");
  const raw = await searchParams;
  const hrefFor = (page: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(raw)) if (typeof v === "string" && v && k !== "page") qs.set(k, v);
    qs.set("page", String(page));
    return `${base}?${qs.toString()}`;
  };
  const pageCount = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;
  const today = todayIso(timezone);
  const hasFilters = Object.keys(raw).some((k) => k !== "page" && raw[k]);

  return (
    <>
      <PageHeader
        title={t("documents.title")}
        description={t("documents.subtitle")}
        actions={
          can.uploadDocuments(ctx.role) ? (
            <Link href={tenantPath(slug, "/upload")} className={buttonVariants()}>
              <Plus /> {t("documents.upload")}
            </Link>
          ) : null
        }
      />
      <div className="mb-4">
        <DocumentFiltersBar
          action={base}
          values={{
            q: filters.q,
            status: filters.status,
            type: filters.type,
            supplier: filters.supplier,
            category: filters.category,
            from: filters.from,
            to: filters.to,
            due: filters.due,
            min: filters.min,
            max: filters.max,
            duplicates: filters.duplicates,
            archived: filters.archived,
            sort: filters.sort,
          }}
          suppliers={suppliers.data ?? []}
          categories={categories.data ?? []}
        />
      </div>

      {!result ? (
        <Callout tone="danger">{t("errors.database")}</Callout>
      ) : (
        <Card>
          {result.rows.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={t("documents.emptyTitle")}
              description={hasFilters ? t("documents.emptyBody") : t("documents.emptyNoDocsBody")}
              action={
                !hasFilters && can.uploadDocuments(ctx.role) ? (
                  <Link href={tenantPath(slug, "/upload")} className={buttonVariants({ size: "sm" })}>
                    {t("documents.upload")}
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <>
              <Table>
                <THead>
                  <tr>
                    <TH>{t("documents.columns.document")}</TH>
                    <TH>{t("documents.columns.supplier")}</TH>
                    <TH className="hidden md:table-cell">{t("documents.columns.issueDate")}</TH>
                    <TH className="hidden lg:table-cell">{t("documents.columns.dueDate")}</TH>
                    <TH className="text-right">{t("documents.columns.total")}</TH>
                    <TH>{t("documents.columns.status")}</TH>
                    <TH className="hidden xl:table-cell">{t("documents.columns.category")}</TH>
                    <TH className="hidden xl:table-cell">{t("documents.columns.uploadedAt")}</TH>
                  </tr>
                </THead>
                <TBody>
                  {result.rows.map((row) => {
                    const overdue = row.status === "validated" && !row.paid_at && row.due_date && row.due_date < today;
                    return (
                      <TR key={row.id} className="relative">
                        <TD className="max-w-[16rem]">
                          <Link
                            href={tenantPath(slug, `/documents/${row.id}`)}
                            className="font-medium text-foreground after:absolute after:inset-0 hover:text-primary"
                          >
                            {row.document_number ?? <span className="text-muted-foreground">{t("documents.unnamed")}</span>}
                          </Link>
                          <p className="truncate text-xs text-muted-foreground">
                            {t.dynamic(`documentTypes.${row.document_type}`)} · {row.original_filename}
                          </p>
                        </TD>
                        <TD className="max-w-[14rem]">
                          <p className="truncate">{row.suppliers?.name ?? row.supplier_name ?? "—"}</p>
                          {row.supplier_tax_id ? (
                            <p className="tabular text-xs text-muted-foreground">{row.supplier_tax_id}</p>
                          ) : null}
                        </TD>
                        <TD className="tabular hidden whitespace-nowrap md:table-cell">
                          {formatBusinessDate(row.issue_date, locale)}
                        </TD>
                        <TD className={cn("tabular hidden whitespace-nowrap lg:table-cell", overdue && "font-medium text-danger")}>
                          {formatBusinessDate(row.due_date, locale)}
                          {row.paid_at ? <span className="ml-1 text-xs text-success">· {t("documents.paid")}</span> : null}
                        </TD>
                        <TD className="tabular whitespace-nowrap text-right font-medium">
                          {formatMoney(row.total, row.currency, locale)}
                        </TD>
                        <TD>
                          <div className="flex flex-wrap items-center gap-1">
                            <DocumentStatusBadge status={row.status} />
                            {row.possible_duplicate_of ? (
                              <span title={t("documents.possibleDuplicate")} className="text-warning">
                                <Copy className="size-3.5" aria-label={t("documents.possibleDuplicate")} />
                              </span>
                            ) : null}
                          </div>
                        </TD>
                        <TD className="hidden text-muted-foreground xl:table-cell">{row.categories?.name ?? "—"}</TD>
                        <TD className="tabular hidden whitespace-nowrap text-muted-foreground xl:table-cell">
                          {formatTimestamp(row.created_at, locale, timezone)}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
              <div className="flex items-center justify-between border-t border-border">
                <p className="px-4 text-[13px] text-muted-foreground">{t.plural("common.results", result.total)}</p>
                <Pagination
                  page={filters.page}
                  pageCount={pageCount}
                  hrefFor={hrefFor}
                  labels={{
                    previous: t("common.previous"),
                    next: t("common.next"),
                    page: t("common.page", { page: filters.page, total: pageCount }),
                  }}
                />
              </div>
            </>
          )}
        </Card>
      )}
    </>
  );
}
