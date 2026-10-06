import { redirect } from "next/navigation";
import { AuthShell } from "@/components/layout/auth-shell";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { getSessionUser } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";

export default async function NoAccessPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { t } = await getI18n();
  return (
    <AuthShell title={t("auth.noAccessTitle")} subtitle={t("auth.noAccessBody")}>
      <div className="text-muted-foreground flex flex-col gap-3 text-[13px]">
        <span>{t("auth.loggedInAs", { email: user.email })}</span>
        <SignOutButton label={t("auth.useAnotherAccount")} />
      </div>
    </AuthShell>
  );
}
