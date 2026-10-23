import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { QrScanner } from "@/features/scan/qr-scanner";
import { getI18n } from "@/lib/i18n/server";
import { requireTenantContext } from "@/lib/tenancy/context";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("scan.title") };
}

export default async function ScanPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireTenantContext(slug);
  const { t } = await getI18n();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("scan.title")} description={t("scan.subtitle")} />
      <QrScanner />
    </div>
  );
}
