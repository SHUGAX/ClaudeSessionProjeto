"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { useTenant } from "@/components/tenant/tenant-provider";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n/client";
import { saveSupplierAction } from "./actions";

export interface SupplierFormValues {
  id?: string;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  tax_country: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  iban: string | null;
  notes: string | null;
  default_category_id: string | null;
}

export function SupplierForm({
  supplier,
  categories,
  disabled,
  onSaved,
}: {
  supplier?: SupplierFormValues;
  categories: Array<{ id: string; name: string }>;
  disabled?: boolean;
  onSaved?: () => void;
}) {
  const { t } = useI18n();
  const { slug, href } = useTenant();
  const router = useRouter();
  const [state, action] = useActionState(saveSupplierAction, undefined);

  useEffect(() => {
    if (state?.success) {
      toast(t.dynamic(state.success));
      onSaved?.();
      if (!supplier?.id && state.id) router.push(href(`/suppliers/${state.id}`));
      else router.refresh();
    }
  }, [state, supplier?.id, router, href, t, onSaved]);

  return (
    <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <input type="hidden" name="tenant" value={slug} />
      {supplier?.id ? <input type="hidden" name="id" value={supplier.id} /> : null}
      <div className="sm:col-span-2">
        <FormMessage error={state?.error} />
      </div>
      <Field label={t("suppliers.fields.name")} htmlFor="s-name" className="sm:col-span-2">
        <Input id="s-name" name="name" defaultValue={supplier?.name} required maxLength={300} disabled={disabled} />
      </Field>
      <Field label={t("suppliers.fields.legalName")} htmlFor="s-legal">
        <Input id="s-legal" name="legalName" defaultValue={supplier?.legal_name ?? ""} maxLength={300} disabled={disabled} />
      </Field>
      <Field label={t("suppliers.fields.taxId")} htmlFor="s-tax">
        <Input id="s-tax" name="taxId" defaultValue={supplier?.tax_id ?? ""} maxLength={40} disabled={disabled} className="tabular" />
      </Field>
      <Field label={t("suppliers.fields.taxCountry")} htmlFor="s-country">
        <Input id="s-country" name="taxCountry" defaultValue={supplier?.tax_country ?? ""} maxLength={2} disabled={disabled} className="uppercase" />
      </Field>
      <Field label={t("suppliers.fields.defaultCategory")} htmlFor="s-cat">
        <Select id="s-cat" name="defaultCategoryId" defaultValue={supplier?.default_category_id ?? ""} disabled={disabled}>
          <option value="">{t("common.none")}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("suppliers.fields.email")} htmlFor="s-email">
        <Input id="s-email" name="email" type="email" defaultValue={supplier?.email ?? ""} maxLength={320} disabled={disabled} />
      </Field>
      <Field label={t("suppliers.fields.phone")} htmlFor="s-phone">
        <Input id="s-phone" name="phone" defaultValue={supplier?.phone ?? ""} maxLength={50} disabled={disabled} />
      </Field>
      <Field label={t("suppliers.fields.iban")} htmlFor="s-iban">
        <Input id="s-iban" name="iban" defaultValue={supplier?.iban ?? ""} maxLength={50} disabled={disabled} className="tabular" />
      </Field>
      <Field label={t("suppliers.fields.address")} htmlFor="s-address">
        <Input id="s-address" name="address" defaultValue={supplier?.address ?? ""} maxLength={500} disabled={disabled} />
      </Field>
      <Field label={t("suppliers.fields.notes")} htmlFor="s-notes" className="sm:col-span-2">
        <Textarea id="s-notes" name="notes" defaultValue={supplier?.notes ?? ""} maxLength={2000} rows={2} disabled={disabled} />
      </Field>
      {!disabled ? (
        <div className="flex justify-end sm:col-span-2">
          <SubmitButton>{t("common.save")}</SubmitButton>
        </div>
      ) : null}
    </form>
  );
}
