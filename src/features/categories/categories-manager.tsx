"use client";

import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useTenant } from "@/components/tenant/tenant-provider";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n/client";
import { createCategoryAction, deleteCategoryAction, renameCategoryAction } from "./actions";

export function CategoryCreateForm() {
  const { t } = useI18n();
  const { slug } = useTenant();
  const [state, action] = useActionState(createCategoryAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="tenant" value={slug} />
      <FormMessage error={state?.error} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input name="name" placeholder={t("categories.name")} aria-label={t("categories.name")} required maxLength={100} />
        <Input name="code" placeholder={`${t("categories.code")} (${t("common.optional")})`} aria-label={t("categories.code")} maxLength={40} className="sm:w-48" />
        <SubmitButton>
          <Plus /> {t("common.add")}
        </SubmitButton>
      </div>
    </form>
  );
}

export function CategoryRow({ id, name, code, canManage }: { id: string; name: string; code: string | null; canManage: boolean }) {
  const { t } = useI18n();
  const { slug } = useTenant();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [pending, startTransition] = useTransition();

  const handle = (promise: Promise<{ error?: string } | undefined>) =>
    startTransition(async () => {
      const result = await promise;
      if (result?.error) toast(t.dynamic(result.error), "error");
      else setEditing(false);
    });

  return (
    <li className="flex items-center gap-3 px-5 py-2.5">
      {editing ? (
        <Input value={value} onChange={(e) => setValue(e.target.value)} className="h-8 max-w-sm" maxLength={100} autoFocus aria-label={t("categories.name")} />
      ) : (
        <span className="flex-1 text-sm">
          {name}
          {code ? <span className="ml-2 font-mono text-xs text-muted-foreground">{code}</span> : null}
        </span>
      )}
      {canManage ? (
        <div className="ml-auto flex gap-1">
          {editing ? (
            <>
              <Button size="icon-sm" variant="ghost" disabled={pending} onClick={() => handle(renameCategoryAction(slug, id, value))} aria-label={t("common.save")}>
                <Check />
              </Button>
              <Button size="icon-sm" variant="ghost" onClick={() => setEditing(false)} aria-label={t("common.cancel")}>
                <X />
              </Button>
            </>
          ) : (
            <>
              <Button size="icon-sm" variant="ghost" onClick={() => setEditing(true)} aria-label={t("common.edit")}>
                <Pencil />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  if (window.confirm(t("categories.deleteConfirm", { name }))) handle(deleteCategoryAction(slug, id));
                }}
                aria-label={t("common.delete")}
              >
                <Trash2 />
              </Button>
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}
