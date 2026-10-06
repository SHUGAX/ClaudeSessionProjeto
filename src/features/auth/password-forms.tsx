"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { useI18n } from "@/lib/i18n/client";
import { forgotPasswordAction, resetPasswordAction } from "./actions";

export function ForgotPasswordForm() {
  const { t } = useI18n();
  const [state, action] = useActionState(forgotPasswordAction, undefined);
  if (state?.success) return <FormMessage success={state.success} />;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage error={state?.error} />
      <Field label={t("auth.email")} htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <SubmitButton className="w-full">{t("auth.sendResetLink")}</SubmitButton>
    </form>
  );
}

export function NewPasswordFields() {
  const { t } = useI18n();
  return (
    <>
      <Field label={t("auth.newPassword")} htmlFor="password" hint={t("auth.passwordRules")}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </Field>
      <Field label={t("auth.confirmPassword")} htmlFor="confirm">
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </Field>
    </>
  );
}

export function ResetPasswordForm() {
  const { t } = useI18n();
  const [state, action] = useActionState(resetPasswordAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage error={state?.error} />
      <NewPasswordFields />
      <SubmitButton className="w-full">{t("auth.updatePassword")}</SubmitButton>
    </form>
  );
}
