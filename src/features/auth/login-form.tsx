"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { useI18n } from "@/lib/i18n/client";
import { loginAction } from "./actions";

export function LoginForm({
  next,
  tenant,
  forgotPasswordHref,
}: {
  next?: string;
  tenant?: string;
  forgotPasswordHref: string;
}) {
  const { t } = useI18n();
  const [state, action] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {tenant ? <input type="hidden" name="tenant" value={tenant} /> : null}
      <FormMessage error={state?.error} />
      <Field label={t("auth.email")} htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </Field>
      <Field
        label={t("auth.password")}
        htmlFor="password"
        aside={
          <Link href={forgotPasswordHref} className="text-primary text-xs hover:underline">
            {t("auth.forgotPassword")}
          </Link>
        }
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <SubmitButton className="mt-1 w-full" pendingLabel={t("auth.signingIn")}>
        {t("auth.signIn")}
      </SubmitButton>
    </form>
  );
}
