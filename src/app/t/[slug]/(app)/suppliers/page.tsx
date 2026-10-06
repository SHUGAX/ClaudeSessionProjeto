import { Search, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { NewSupplierDialog } from "@/features/suppliers/new-supplier-dialog";
import { can } from "@/lib/auth/permissions";
import { formatBusinessDate } from "@/lib/dates";
import { sanitizeSearchTerm } from "@/lib/documents/queries";
import { getI18n } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTenantContext } from "@/lib/tenancy/context";
import { tenantPath } from "@/lib/tenancy/urls";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("suppliers.title") };
}

export default async function SuppliersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { slug } = await params;
  const { q } = await searchParams;
  const ctx = await requireTenantContext(slug);
  const { t, locale } = await getI18n();
  const supabase = await createSupabaseServerClient();
  const orgId = ctx.organization.id;

  let query = supabase
    .from("suppliers")
    .select("id, name, tax_id, email, categories(name)")
    .eq("organization_id", orgId)
    .order("name")
    .limit(500);
  const term = q ? sanitizeSearchTerm(q) : "";
  if (term) query = query.or(`name.ilike."*${term}*",tax_id.ilike."*${term}*",legal_name.ilike."*${term}*"`);

  const [suppliers, summaries, categories, settings] = await Promise.all([
    query,
    supabase.rpc("supplier_summaries", { p_org: orgId }),
    supabase.from("categories").select("id, name").eq("organization_id", orgId).order("name"),
    supabase.from("organization_settings").select("default_currency").eq("organization_id", orgId).maybeSingle(),
  ]);
  const currency = settings.data?.default_currency ?? "EUR";
  const bySupplier = new Map((summaries.data ?? []).map((s) => [s.supplier_id, s]));
  const rows = suppliers.data ?? [];

  return (
    <>
      <PageHeader
        title={t("suppliers.title")}
        description={t("suppliers.subtitle")}
        actions={can.manageSuppliers(ctx.role) ? <NewSupplierDialog categories={categories.data ?? []} /> : null}
      />
      <form method="get" action={tenantPath(slug, "/suppliers")} className="relative mb-4 max-w-md" role="search">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input name="q" type="search" defaultValue={q} placeholder={t("suppliers.searchPlaceholder")} className="pl-9" aria-label={t("common.search")} />
      </form>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={Truck} title={t("suppliers.emptyTitle")} description={t("suppliers.emptyBody")} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t("suppliers.fields.name")}</TH>
                <TH>{t("suppliers.fields.taxId")}</TH>
                <TH className="hidden md:table-cell">{t("suppliers.fields.defaultCategory")}</TH>
                <TH className="text-right">{t("suppliers.documents")}</TH>
                <TH className="text-right">{t("suppliers.totalInvoiced")}</TH>
                <TH className="hidden lg:table-cell">{t("suppliers.lastDocument")}</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((s) => {
                const summary = bySupplier.get(s.id);
                return (
                  <TR key={s.id} className="relative">
                    <TD className="max-w-[18rem]">
                      <Link href={tenantPath(slug, `/suppliers/${s.id}`)} className="truncate font-medium after:absolute after:inset-0 hover:text-primary">
                        {s.name}
                      </Link>
                      {s.email ? <p className="truncate text-xs text-muted-foreground">{s.email}</p> : null}
                    </TD>
                    <TD className="tabular text-muted-foreground">{s.tax_id ?? "—"}</TD>
                    <TD className="hidden text-muted-foreground md:table-cell">{s.categories?.name ?? "—"}</TD>
                    <TD className="tabular text-right">{summary?.document_count ?? 0}</TD>
                    <TD className="tabular text-right font-medium">{formatMoney(String(summary?.total_amount ?? 0), currency, locale)}</TD>
                    <TD className="tabular hidden text-muted-foreground lg:table-cell">
                      {formatBusinessDate(summary?.last_issue_date ?? null, locale)}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
