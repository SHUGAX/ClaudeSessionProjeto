import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { CreateOrganizationForm } from "@/features/admin/admin-forms";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";
import { publicEnv } from "@/lib/env";
import { getI18n } from "@/lib/i18n/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export default async function NewOrganizationPage() {
  await requirePlatformAdminPage();
  const { t } = await getI18n();
  const { data: plans } = await createSupabaseAdminClient()
    .from("plans")
    .select("id, name")
    .eq("active", true)
    .order("name");
  return (
    <div className="max-w-3xl">
      <PageHeader title={t("admin.newOrganization")} />
      <Card>
        <CardContent className="py-5">
          <CreateOrganizationForm
            plans={plans ?? []}
            rootDomain={publicEnv().NEXT_PUBLIC_ROOT_DOMAIN}
          />
        </CardContent>
      </Card>
    </div>
  );
}
