import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/layout/auth-shell";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { AcceptInvitationExistingUserForm, AcceptInvitationNewUserForm } from "@/features/auth/invite-forms";
import { getSessionUser } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { findValidInvitation } from "@/lib/invitations";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("invite.title"), referrer: "no-referrer" };
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { t } = await getI18n();
  const invitation = await findValidInvitation(token);

  if (!invitation) {
    return (
      <AuthShell title={t("invite.title")}>
        <div className="flex flex-col gap-4">
          <Callout tone="danger">{t("invite.invalid")}</Callout>
          <Link href="/login" className="text-sm text-primary hover:underline">
            {t("auth.backToLogin")}
          </Link>
        </div>
      </AuthShell>
    );
  }

  const subtitle = t("invite.subtitle", {
    organization: invitation.organizationName,
    role: t.dynamic(`roles.${invitation.role}`),
  });
  const user = await getSessionUser();

  if (user) {
    if (user.email !== invitation.email) {
      return (
        <AuthShell title={t("invite.title")} subtitle={subtitle}>
          <div className="flex flex-col gap-4">
            <Callout tone="warning">{t("invite.wrongAccount", { email: invitation.email })}</Callout>
            <SignOutButton label={t("auth.useAnotherAccount")} />
          </div>
        </AuthShell>
      );
    }
    return (
      <AuthShell title={t("invite.title")} subtitle={subtitle}>
        <AcceptInvitationExistingUserForm token={token} email={invitation.email} />
      </AuthShell>
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin.from("profiles").select("id").eq("email", invitation.email).maybeSingle();
  if (existing) {
    return (
      <AuthShell title={t("invite.title")} subtitle={subtitle}>
        <div className="flex flex-col gap-4">
          <Callout tone="info">{t("invite.existingAccount")}</Callout>
          <Link
            href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
            className={buttonVariants({ variant: "primary", className: "w-full" })}
          >
            {t("invite.signInToAccept")}
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t("invite.createAccount")} subtitle={subtitle}>
      <AcceptInvitationNewUserForm token={token} email={invitation.email} />
    </AuthShell>
  );
}
