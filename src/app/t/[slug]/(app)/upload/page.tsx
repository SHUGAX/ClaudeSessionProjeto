import type { Metadata } from "next";
import { Callout } from "@/components/ui/callout";
import { PageHeader } from "@/components/ui/misc";
import { Uploader } from "@/features/documents/uploader";
import { can } from "@/lib/auth/permissions";
import { getI18n } from "@/lib/i18n/server";
import { requireTenantContext } from "@/lib/tenancy/context";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("upload.title") };
}

export default async function UploadPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireTenantContext(slug);
  const { t } = await getI18n();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("upload.title")} description={t("upload.subtitle")} />
      {can.uploadDocuments(ctx.role) ? <Uploader /> : <Callout tone="warning">{t("upload.errors.forbidden")}</Callout>}
    </div>
  );
}
