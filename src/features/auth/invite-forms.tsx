"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { useI18n } from "@/lib/i18n/client";
import { acceptInvitationExistingUserAction, acceptInvitationNewUserAction } from "./actions";
import { NewPasswordFields } from "./password-forms";

export function AcceptInvitationNewUserForm({ token, email }: { token: string; email: string }) {
  const { t } = useI18n();
  const [state, action] = useActionState(acceptInvitationNewUserAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <FormMessage error={state?.error} vars={{ email }} />
      <Field label={t("auth.email")} htmlFor="email">
        <Input id="email" value={email} readOnly disabled autoComplete="username" />
      </Field>
      <Field label={t("invite.fullName")} htmlFor="fullName">
        <Input id="fullName" name="fullName" autoComplete="name" maxLength={200} required />
      </Field>
      <NewPasswordFields />
      <SubmitButton className="w-full" pendingLabel={t("invite.accepting")}>
        {t("invite.accept")}
      </SubmitButton>
    </form>
  );
}

export function AcceptInvitationExistingUserForm({ token, email }: { token: string; email: string }) {
  const { t } = useI18n();
  const [state, action] = useActionState(acceptInvitationExistingUserAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <FormMessage error={state?.error} vars={{ email }} />
      <SubmitButton className="w-full" pendingLabel={t("invite.accepting")}>
        {t("invite.accept")}
      </SubmitButton>
    </form>
  );
}
