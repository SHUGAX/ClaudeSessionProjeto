import { FolderTree } from "lucide-react";
import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { CategoryCreateForm, CategoryRow } from "@/features/categories/categories-manager";
import { can } from "@/lib/auth/permissions";
import { getI18n } from "@/lib/i18n/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTenantContext } from "@/lib/tenancy/context";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("categories.title") };
}

export default async function CategoriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireTenantContext(slug);
  const { t } = await getI18n();
  const supabase = await createSupabaseServerClient();
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, code")
    .eq("organization_id", ctx.organization.id)
    .order("name");
  const canManage = can.manageCategories(ctx.role);

  return (
    <div className="max-w-3xl">
      <PageHeader title={t("categories.title")} description={t("categories.subtitle")} />
      {canManage ? (
        <Card className="mb-4">
          <CardContent>
            <CategoryCreateForm />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        {(categories ?? []).length === 0 ? (
          <EmptyState
            icon={FolderTree}
            title={t("categories.emptyTitle")}
            description={t("categories.emptyBody")}
          />
        ) : (
          <ul className="divide-border divide-y">
            {(categories ?? []).map((c) => (
              <CategoryRow key={c.id} id={c.id} name={c.name} code={c.code} canManage={canManage} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
