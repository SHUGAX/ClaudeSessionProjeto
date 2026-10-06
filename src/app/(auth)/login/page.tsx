import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/layout/auth-shell";
import { LoginForm } from "@/features/auth/login-form";
import { postLoginDestination } from "@/lib/auth/post-login";
import { getSessionUser } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("auth.loginTitle") };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  if (await getSessionUser()) redirect(await postLoginDestination(next));
  const { t } = await getI18n();
  return (
    <AuthShell
      title={t("auth.loginTitle")}
      subtitle={t("auth.loginSubtitle")}
      footer={<p className="mx-auto max-w-xs leading-relaxed">{t("auth.noPublicSignup")}</p>}
    >
      <LoginForm next={next} forgotPasswordHref="/forgot-password" />
    </AuthShell>
  );
}
