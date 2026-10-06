"use client";

import { Copy, MailPlus, MoreHorizontal, RotateCw, UserX, UserCheck, Trash2, XCircle } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { useTenant } from "@/components/tenant/tenant-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormMessage } from "@/components/ui/form-message";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n/client";
import type { MemberRole } from "@/lib/supabase/types";
import {
  changeRoleAction,
  inviteUserAction,
  removeMemberAction,
  resendInvitationAction,
  revokeInvitationAction,
  setMemberStatusAction,
  type UsersActionResult,
} from "./actions";

function InviteLink({ link }: { link: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <Callout tone="info">
      <p className="mb-2">{t("users.inviteLink")}</p>
      <div className="flex gap-2">
        <Input value={link} readOnly className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} aria-label="URL" />
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

export function InviteUserDialog({ roles }: { roles: MemberRole[] }) {
  const { t } = useI18n();
  const { slug } = useTenant();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(inviteUserAction, undefined);

  useEffect(() => {
    if (state?.ok && !state.link) {
      toast(t("users.inviteSent", { email: state.email ?? "" }));
    }
  }, [state, t]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <MailPlus /> {t("users.invite")}
        </Button>
      </DialogTrigger>
      <DialogContent title={t("users.inviteTitle")} description={t("users.inviteBody")} closeLabel={t("common.close")}>
        {state?.ok && state.link ? (
          <div className="flex flex-col gap-4">
            <Callout tone="success">{t("users.inviteSent", { email: state.email ?? "" })}</Callout>
            <InviteLink link={state.link} />
          </div>
        ) : (
          <form action={action} className="flex flex-col gap-4">
            <input type="hidden" name="tenant" value={slug} />
            <FormMessage error={state && !state.ok ? state.error : undefined} />
            <Field label={t("common.email")} htmlFor="invite-email">
              <Input id="invite-email" name="email" type="email" required maxLength={320} autoComplete="off" />
            </Field>
            <Field label={t("users.role")} htmlFor="invite-role">
              <Select id="invite-role" name="role" defaultValue="member">
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {t.dynamic(`roles.${r}`)} — {t.dynamic(`roleDescriptions.${r}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex justify-end">
              <SubmitButton>{t("users.invite")}</SubmitButton>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function useResult() {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<UsersActionResult>) =>
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) toast(t.dynamic(result.error ?? "errors.body"), "error");
      else if (result.success) toast(t.dynamic(result.success, undefined, { email: result.email ?? "" }));
    });
  return { pending, run };
}

export function MemberControls({
  memberId,
  role,
  status,
  roles,
  name,
}: {
  memberId: string;
  role: MemberRole;
  status: string;
  roles: MemberRole[];
  name: string;
}) {
  const { t } = useI18n();
  const { slug } = useTenant();
  const { pending, run } = useResult();
  return (
    <div className="flex items-center justify-end gap-2">
      <Select
        value={role}
        disabled={pending}
        onChange={(e) => run(() => changeRoleAction(slug, memberId, e.target.value))}
        aria-label={t("users.role")}
        className="h-8 w-40"
      >
        {[...new Set([role, ...roles])].map((r) => (
          <option key={r} value={r} disabled={!roles.includes(r)}>
            {t.dynamic(`roles.${r}`)}
          </option>
        ))}
      </Select>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t("common.actions")} disabled={pending}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {status === "active" ? (
            <DropdownMenuItem onSelect={() => run(() => setMemberStatusAction(slug, memberId, "disabled"))}>
              <UserX /> {t("users.deactivate")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => run(() => setMemberStatusAction(slug, memberId, "active"))}>
              <UserCheck /> {t("users.reactivate")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-danger"
            onSelect={() => {
              if (window.confirm(t("users.removeConfirm", { name }))) run(() => removeMemberAction(slug, memberId));
            }}
          >
            <Trash2 /> {t("common.remove")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function InvitationControls({ invitationId }: { invitationId: string }) {
  const { t } = useI18n();
  const { slug } = useTenant();
  const { pending, run } = useResult();
  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => resendInvitationAction(slug, invitationId))}>
        <RotateCw /> {t("users.resend")}
      </Button>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => revokeInvitationAction(slug, invitationId))}>
        <XCircle /> {t("users.revoke")}
      </Button>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  return status === "active" ? <Badge tone="success">{t("users.active")}</Badge> : <Badge>{t("users.disabled")}</Badge>;
}
