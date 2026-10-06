import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/layout/auth-shell";
import { ForgotPasswordForm } from "@/features/auth/password-forms";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("auth.forgotTitle") };
}

export default async function ForgotPasswordPage() {
  const { t } = await getI18n();
  return (
    <AuthShell
      title={t("auth.forgotTitle")}
      subtitle={t("auth.forgotSubtitle")}
      footer={
        <Link href="/login" className="text-primary hover:underline">
          {t("auth.backToLogin")}
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
