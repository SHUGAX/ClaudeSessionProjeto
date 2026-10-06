import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState, StatCard } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DocumentStatusBadge } from "@/features/documents/status-badge";
import { SupplierForm } from "@/features/suppliers/supplier-form";
import { can } from "@/lib/auth/permissions";
import { formatBusinessDate } from "@/lib/dates";
import { getI18n } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTenantContext } from "@/lib/tenancy/context";
import { tenantPath } from "@/lib/tenancy/urls";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("suppliers.title") };
}

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await requireTenantContext(slug);
  const { t, locale } = await getI18n();
  const supabase = await createSupabaseServerClient();
  const orgId = ctx.organization.id;

  const { data: supplier } = await supabase
    .from("suppliers")
    .select(
      "id, name, legal_name, tax_id, tax_country, email, phone, address, iban, notes, default_category_id",
    )
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!supplier) notFound();

  const [documents, summaries, categories, settings] = await Promise.all([
    supabase
      .from("documents")
      .select(
        "id, document_number, original_filename, issue_date, due_date, total::text, currency, status",
      )
      .eq("organization_id", orgId)
      .eq("supplier_id", id)
      .neq("status", "archived")
      .order("issue_date", { ascending: false, nullsFirst: false })
      .limit(20),
    supabase.rpc("supplier_summaries", { p_org: orgId }),
    supabase.from("categories").select("id, name").eq("organization_id", orgId).order("name"),
    supabase
      .from("organization_settings")
      .select("default_currency")
      .eq("organization_id", orgId)
      .maybeSingle(),
  ]);
  const summary = (summaries.data ?? []).find((s) => s.supplier_id === id);
  const currency = settings.data?.default_currency ?? "EUR";
  const canManage = can.manageSuppliers(ctx.role);

  return (
    <>
      <Link
        href={tenantPath(slug, "/suppliers")}
        className="text-muted-foreground hover:text-foreground mb-1.5 inline-flex items-center gap-1 text-[13px]"
      >
        <ArrowLeft className="size-3.5" aria-hidden /> {t("suppliers.title")}
      </Link>
      <h1 className="mb-1 text-xl font-semibold tracking-tight">{supplier.name}</h1>
      <p className="tabular text-muted-foreground mb-6 text-[13px]">{supplier.tax_id ?? "—"}</p>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label={t("suppliers.documents")} value={summary?.document_count ?? 0} />
        <StatCard
          label={t("suppliers.totalInvoiced")}
          value={formatMoney(String(summary?.total_amount ?? 0), currency, locale)}
        />
        <StatCard
          label={t("suppliers.lastDocument")}
          value={formatBusinessDate(summary?.last_issue_date ?? null, locale)}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title={t("suppliers.recentDocuments")} />
          {(documents.data ?? []).length === 0 ? (
            <EmptyState title={t("documents.emptyTitle")} />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>{t("documents.columns.document")}</TH>
                  <TH>{t("documents.columns.issueDate")}</TH>
                  <TH className="text-right">{t("documents.columns.total")}</TH>
                  <TH>{t("documents.columns.status")}</TH>
                </tr>
              </THead>
              <TBody>
                {(documents.data ?? []).map((d) => (
                  <TR key={d.id} className="relative">
                    <TD>
                      <Link
                        href={tenantPath(slug, `/documents/${d.id}`)}
                        className="hover:text-primary font-medium after:absolute after:inset-0"
                      >
                        {d.document_number ?? d.original_filename}
                      </Link>
                    </TD>
                    <TD className="tabular">{formatBusinessDate(d.issue_date, locale)}</TD>
                    <TD className="tabular text-right">
                      {formatMoney(d.total, d.currency, locale)}
                    </TD>
                    <TD>
                      <DocumentStatusBadge status={d.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title={t("suppliers.contact")} />
          <CardContent>
            <SupplierForm
              supplier={supplier}
              categories={categories.data ?? []}
              disabled={!canManage}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
