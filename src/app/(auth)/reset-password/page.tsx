import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/layout/auth-shell";
import { Callout } from "@/components/ui/callout";
import { ResetPasswordForm } from "@/features/auth/password-forms";
import { getSessionUser } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("auth.resetTitle") };
}

export default async function ResetPasswordPage() {
  const { t } = await getI18n();
  const user = await getSessionUser();
  return (
    <AuthShell title={t("auth.resetTitle")} subtitle={user ? t("auth.resetSubtitle") : undefined}>
      {user ? (
        <ResetPasswordForm />
      ) : (
        <div className="flex flex-col gap-4">
          <Callout tone="danger">{t("auth.linkInvalid")}</Callout>
          <Link href="/forgot-password" className="text-primary text-sm hover:underline">
            {t("auth.forgotTitle")}
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
