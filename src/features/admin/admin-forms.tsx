"use client";

import { Copy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { FormMessage } from "@/components/ui/form-message";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n/client";
import { slugify } from "@/lib/tenancy/slug";
import {
  createOrganizationAction,
  deleteOrganizationAction,
  inviteOrganizationAdminAction,
  resendOrganizationInvitationAction,
  revokeOrganizationInvitationAction,
  setOrganizationStatusAction,
  updateOrganizationAction,
} from "./actions";

interface Plan {
  id: string;
  name: string;
}

export interface OrganizationFormValues {
  id?: string;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  slug: string;
  plan_id: string | null;
  max_users: number | null;
  max_documents_per_month: number | null;
  max_ai_calls_per_month: number | null;
  max_storage_bytes: number | null;
}

function InvitationLinkBox({ link }: { link: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <Callout tone="info">
      <p className="mb-2">{t("users.inviteLink")}</p>
      <div className="flex gap-2">
        <Input
          value={link}
          readOnly
          className="font-mono text-xs"
          aria-label="URL"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopied(true);
          }}
        >
          <Copy /> {copied ? t("common.copied") : t("common.copy")}
        </Button>
      </div>
    </Callout>
  );
}

function LimitFields({ values }: { values?: OrganizationFormValues }) {
  const { t } = useI18n();
  return (
    <fieldset className="grid grid-cols-2 gap-4 sm:col-span-2 lg:grid-cols-4">
      <legend className="mb-2 text-[13px] font-medium">{t("admin.form.limits")}</legend>
      <Field label={t("admin.form.maxUsers")} htmlFor="maxUsers">
        <Input
          id="maxUsers"
          name="maxUsers"
          type="number"
          min={0}
          defaultValue={values?.max_users ?? ""}
        />
      </Field>
      <Field label={t("admin.form.maxDocuments")} htmlFor="maxDocuments">
        <Input
          id="maxDocuments"
          name="maxDocuments"
          type="number"
          min={0}
          defaultValue={values?.max_documents_per_month ?? ""}
        />
      </Field>
      <Field label={t("admin.form.maxAiCalls")} htmlFor="maxAiCalls">
        <Input
          id="maxAiCalls"
          name="maxAiCalls"
          type="number"
          min={0}
          defaultValue={values?.max_ai_calls_per_month ?? ""}
        />
      </Field>
      <Field label={t("admin.form.maxStorageMb")} htmlFor="maxStorageMb">
        <Input
          id="maxStorageMb"
          name="maxStorageMb"
          type="number"
          min={0}
          defaultValue={
            values?.max_storage_bytes != null
              ? Math.round(values.max_storage_bytes / 1024 / 1024)
              : ""
          }
        />
      </Field>
    </fieldset>
  );
}

export function CreateOrganizationForm({
  plans,
  rootDomain,
}: {
  plans: Plan[];
  rootDomain: string;
}) {
  const { t } = useI18n();
  const [state, action] = useActionState(createOrganizationAction, undefined);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  if (state?.success && state.organizationId) {
    return (
      <div className="flex flex-col gap-4">
        <Callout tone="success">{t("admin.created", { email: state.email ?? "" })}</Callout>
        {state.link ? <InvitationLinkBox link={state.link} /> : null}
        <div>
          <Link href={`/admin/organizations/${state.organizationId}`} className={buttonVariants()}>
            {t("admin.detail")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <FormMessage error={state?.error} />
      </div>
      <Field label={t("admin.form.name")} htmlFor="name">
        <Input
          id="name"
          name="name"
          required
          maxLength={200}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
        />
      </Field>
      <Field
        label={t("admin.form.slug")}
        htmlFor="slug"
        hint={t("admin.form.slugHint", { example: `${slug || "empresa"}.${rootDomain}` })}
      >
        <Input
          id="slug"
          name="slug"
          required
          minLength={3}
          maxLength={63}
          pattern="[a-z0-9][a-z0-9-]{1,61}[a-z0-9]"
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value.toLowerCase());
          }}
        />
      </Field>
      <Field label={t("admin.form.legalName")} htmlFor="legalName">
        <Input id="legalName" name="legalName" maxLength={300} />
      </Field>
      <Field label={t("admin.form.taxId")} htmlFor="taxId">
        <Input id="taxId" name="taxId" maxLength={40} />
      </Field>
      <Field label={t("admin.form.plan")} htmlFor="planId">
        <Select id="planId" name="planId" defaultValue={plans[0]?.id ?? ""}>
          <option value="">{t("settings.noPlan")}</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label={t("admin.form.adminEmail")}
        htmlFor="adminEmail"
        hint={t("admin.form.adminEmailHint")}
      >
        <Input
          id="adminEmail"
          name="adminEmail"
          type="email"
          required
          maxLength={320}
          autoComplete="off"
        />
      </Field>
      <LimitFields />
      <Field label={t("admin.form.logo")} htmlFor="logo" className="sm:col-span-2">
        <Input
          id="logo"
          name="logo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="py-1"
        />
      </Field>
      <div className="flex justify-end sm:col-span-2">
        <SubmitButton>{t("admin.form.create")}</SubmitButton>
      </div>
    </form>
  );
}

export function EditOrganizationForm({
  values,
  plans,
}: {
  values: OrganizationFormValues;
  plans: Plan[];
}) {
  const { t } = useI18n();
  const [state, action] = useActionState(updateOrganizationAction, undefined);
  useEffect(() => {
    if (state?.success) toast(t.dynamic(state.success));
  }, [state, t]);
  return (
    <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <input type="hidden" name="id" value={values.id} />
      <div className="sm:col-span-2">
        <FormMessage error={state?.error} />
      </div>
      <Field label={t("admin.form.name")} htmlFor="name">
        <Input id="name" name="name" required maxLength={200} defaultValue={values.name} />
      </Field>
      <Field label={t("admin.form.slug")} htmlFor="slug-ro">
        <Input id="slug-ro" value={values.slug} readOnly disabled />
      </Field>
      <Field label={t("admin.form.legalName")} htmlFor="legalName">
        <Input
          id="legalName"
          name="legalName"
          maxLength={300}
          defaultValue={values.legal_name ?? ""}
        />
      </Field>
      <Field label={t("admin.form.taxId")} htmlFor="taxId">
        <Input id="taxId" name="taxId" maxLength={40} defaultValue={values.tax_id ?? ""} />
      </Field>
      <Field label={t("admin.form.plan")} htmlFor="planId">
        <Select id="planId" name="planId" defaultValue={values.plan_id ?? ""}>
          <option value="">{t("settings.noPlan")}</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("admin.form.logo")} htmlFor="logo">
        <Input
          id="logo"
          name="logo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="py-1"
        />
      </Field>
      <LimitFields values={values} />
      <div className="flex justify-end sm:col-span-2">
        <SubmitButton>{t("admin.form.save")}</SubmitButton>
      </div>
    </form>
  );
}

export function OrganizationStatusButton({
  id,
  name,
  status,
}: {
  id: string;
  name: string;
  status: string;
}) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const suspend = status === "active";
  return (
    <Button
      variant={suspend ? "danger-outline" : "secondary"}
      disabled={pending}
      onClick={() => {
        let reason: string | undefined;
        if (suspend) {
          if (!window.confirm(t("admin.suspendConfirm", { name }))) return;
          reason = window.prompt(t("admin.suspendReason")) ?? undefined;
        }
        startTransition(async () => {
          const result = await setOrganizationStatusAction(
            id,
            suspend ? "suspended" : "active",
            reason,
          );
          if (result?.error) toast(t.dynamic(result.error), "error");
          else toast(t("admin.updated"));
        });
      }}
    >
      {suspend ? t("admin.suspend") : t("admin.reactivate")}
    </Button>
  );
}

export function InviteOrganizationAdminForm({ organizationId }: { organizationId: string }) {
  const { t } = useI18n();
  const [state, action] = useActionState(inviteOrganizationAdminAction, undefined);
  return (
    <div className="flex flex-col gap-3">
      {state?.success ? (
        <Callout tone="success">{t("users.inviteSent", { email: state.email ?? "" })}</Callout>
      ) : null}
      {state?.link ? <InvitationLinkBox link={state.link} /> : null}
      <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <input type="hidden" name="id" value={organizationId} />
        <Field label={t("common.email")} htmlFor="inv-email" className="flex-1">
          <Input
            id="inv-email"
            name="email"
            type="email"
            required
            maxLength={320}
            autoComplete="off"
          />
        </Field>
        <SubmitButton>{t("admin.inviteAdmin")}</SubmitButton>
      </form>
      <p className="text-muted-foreground text-xs">{t("admin.reinviteHint")}</p>
      <FormMessage error={state?.error} />
    </div>
  );
}

/** Resend (new link) / revoke buttons for a pending or expired invitation. */
export function OrganizationInvitationActions({
  invitationId,
  status,
}: {
  invitationId: string;
  status: string;
}) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  if (status !== "pending" && status !== "expired") return null;
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex justify-end gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await resendOrganizationInvitationAction(invitationId);
              if (result?.error) toast(t.dynamic(result.error), "error");
              else {
                toast(t("users.inviteSent", { email: result?.email ?? "" }));
                setLink(result?.link ?? null);
              }
            })
          }
        >
          {t("users.resend")}
        </Button>
        {status === "pending" ? (
          <Button
            variant="danger-outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await revokeOrganizationInvitationAction(invitationId);
                if (result?.error) toast(t.dynamic(result.error), "error");
                else toast(t("admin.invitationRevoked"));
              })
            }
          >
            {t("users.revoke")}
          </Button>
        ) : null}
      </div>
      {link ? <InvitationLinkBox link={link} /> : null}
    </div>
  );
}

/** Permanent deletion; the platform administrator must type the slug. */
export function DeleteOrganizationForm({ id, slug }: { id: string; slug: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(undefined);
        startTransition(async () => {
          const result = await deleteOrganizationAction(id, confirm);
          if (result?.error) {
            setError(result.error);
            return;
          }
          toast(t("admin.deleted"));
          router.replace("/admin/organizations");
        });
      }}
    >
      <p className="text-muted-foreground text-[13px]">{t("admin.deleteDescription")}</p>
      <Field label={t("admin.deleteConfirmLabel", { slug })} htmlFor="delete-confirm">
        <Input
          id="delete-confirm"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
        />
      </Field>
      <FormMessage error={error} />
      <div className="flex justify-end">
        <Button
          type="submit"
          variant="danger"
          disabled={pending || confirm.trim().toLowerCase() !== slug}
          data-testid="delete-organization"
        >
          {t("admin.deleteButton")}
        </Button>
      </div>
    </form>
  );
}
