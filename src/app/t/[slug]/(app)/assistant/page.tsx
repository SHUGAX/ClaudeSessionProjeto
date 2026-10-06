import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { AssistantChat } from "@/features/assistant/assistant-chat";
import { getI18n } from "@/lib/i18n/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTenantContext } from "@/lib/tenancy/context";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("assistant.title") };
}

export default async function AssistantPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireTenantContext(slug);
  const { t } = await getI18n();
  const supabase = await createSupabaseServerClient();
  const { data: supplier } = await supabase
    .from("suppliers")
    .select("name")
    .eq("organization_id", ctx.organization.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return (
    <div className="max-w-3xl">
      <PageHeader title={t("assistant.title")} description={t("assistant.subtitle")} />
      <AssistantChat exampleSupplier={supplier?.name ?? null} />
    </div>
  );
}
