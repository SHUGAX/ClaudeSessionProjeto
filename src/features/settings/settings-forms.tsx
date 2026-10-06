"use client";

import { useActionState, useEffect } from "react";
import { useTenant } from "@/components/tenant/tenant-provider";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { toast } from "@/components/ui/toast";
import { LOCALE_LABELS, LOCALES } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/client";
import { saveOrganizationSettingsAction, saveProfileAction } from "./actions";

export function OrganizationSettingsForm({
  values,
  disabled,
}: {
  values: {
    name: string;
    legalName: string | null;
    taxId: string | null;
    defaultCurrency: string;
    defaultLanguage: string;
    dueSoonDays: number;
  };
  disabled: boolean;
}) {
  const { t } = useI18n();
  const { slug } = useTenant();
  const [state, action] = useActionState(saveOrganizationSettingsAction, undefined);
  useEffect(() => {
    if (state?.success) toast(t.dynamic(state.success));
  }, [state, t]);
  return (
    <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <input type="hidden" name="tenant" value={slug} />
      <div className="sm:col-span-2">
        <FormMessage error={state?.error} />
      </div>
      <Field label={t("settings.displayName")} htmlFor="o-name">
        <Input
          id="o-name"
          name="name"
          defaultValue={values.name}
          required
          maxLength={200}
          disabled={disabled}
        />
      </Field>
      <Field label={t("settings.legalName")} htmlFor="o-legal">
        <Input
          id="o-legal"
          name="legalName"
          defaultValue={values.legalName ?? ""}
          maxLength={300}
          disabled={disabled}
        />
      </Field>
      <Field label={t("settings.taxId")} htmlFor="o-tax">
        <Input
          id="o-tax"
          name="taxId"
          defaultValue={values.taxId ?? ""}
          maxLength={40}
          disabled={disabled}
        />
      </Field>
      <Field label={t("settings.defaultCurrency")} htmlFor="o-currency">
        <Input
          id="o-currency"
          name="defaultCurrency"
          defaultValue={values.defaultCurrency}
          maxLength={3}
          className="uppercase"
          disabled={disabled}
        />
      </Field>
      <Field label={t("settings.defaultLanguage")} htmlFor="o-lang">
        <Select
          id="o-lang"
          name="defaultLanguage"
          defaultValue={values.defaultLanguage}
          disabled={disabled}
        >
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {LOCALE_LABELS[l]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("settings.dueSoonDays")} htmlFor="o-due">
        <Input
          id="o-due"
          name="dueSoonDays"
          type="number"
          min={1}
          max={90}
          defaultValue={values.dueSoonDays}
          disabled={disabled}
        />
      </Field>
      <Field label={t("admin.form.logo")} htmlFor="o-logo" className="sm:col-span-2">
        <Input
          id="o-logo"
          name="logo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={disabled}
          className="py-1"
        />
      </Field>
      {!disabled ? (
        <div className="flex justify-end sm:col-span-2">
          <SubmitButton>{t("common.save")}</SubmitButton>
        </div>
      ) : null}
    </form>
  );
}

export function ProfileForm({
  fullName,
  preferredLanguage,
  email,
}: {
  fullName: string | null;
  preferredLanguage: string;
  email: string;
}) {
  const { t } = useI18n();
  const [state, action] = useActionState(saveProfileAction, undefined);
  useEffect(() => {
    if (state?.success) toast(t.dynamic(state.success));
  }, [state, t]);
  return (
    <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <FormMessage error={state?.error} />
      </div>
      <Field label={t("common.email")} htmlFor="p-email">
        <Input id="p-email" value={email} readOnly disabled />
      </Field>
      <Field label={t("settings.fullName")} htmlFor="p-name">
        <Input
          id="p-name"
          name="fullName"
          defaultValue={fullName ?? ""}
          maxLength={200}
          autoComplete="name"
        />
      </Field>
      <Field label={t("settings.preferredLanguage")} htmlFor="p-lang">
        <Select id="p-lang" name="preferredLanguage" defaultValue={preferredLanguage}>
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {LOCALE_LABELS[l]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex items-end justify-end">
        <SubmitButton>{t("common.save")}</SubmitButton>
      </div>
    </form>
  );
}
