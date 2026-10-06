import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { InvitationControls, InviteUserDialog, MemberControls, StatusBadge } from "@/features/users/users-ui";
import { assignableRoles, can, canManageMember } from "@/lib/auth/permissions";
import { formatTimestamp } from "@/lib/dates";
import { getI18n } from "@/lib/i18n/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTenantContext } from "@/lib/tenancy/context";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("users.title") };
}

export default async function UsersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireTenantContext(slug);
  if (!can.manageUsers(ctx.role)) notFound();
  const { t, locale } = await getI18n();
  const supabase = await createSupabaseServerClient();
  const orgId = ctx.organization.id;

  const [members, invitations, settings] = await Promise.all([
    supabase
      .from("organization_members")
      .select("id, user_id, role, status, joined_at, profiles!organization_members_user_id_fkey(full_name, email)")
      .eq("organization_id", orgId)
      .order("joined_at"),
    supabase
      .from("invitations")
      .select("id, email, role, expires_at, created_at")
      .eq("organization_id", orgId)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
    supabase.from("organization_settings").select("timezone").eq("organization_id", orgId).maybeSingle(),
  ]);
  const timezone = settings.data?.timezone ?? "Europe/Lisbon";
  const roles = assignableRoles(ctx.role);

  return (
    <div className="max-w-5xl">
      <PageHeader title={t("users.title")} description={t("users.subtitle")} actions={<InviteUserDialog roles={roles} />} />
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>{t("common.name")}</TH>
              <TH className="hidden md:table-cell">{t("common.status")}</TH>
              <TH className="hidden lg:table-cell">{t("users.joinedAt")}</TH>
              <TH className="text-right">{t("users.role")}</TH>
            </tr>
          </THead>
          <TBody>
            {(members.data ?? []).map((m) => {
              const name = m.profiles?.full_name ?? m.profiles?.email ?? "—";
              const isSelf = m.user_id === ctx.user.id;
              return (
                <TR key={m.id}>
                  <TD>
                    <p className="font-medium">
                      {name} {isSelf ? <span className="text-xs font-normal text-muted-foreground">{t("users.you")}</span> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">{m.profiles?.email}</p>
                  </TD>
                  <TD className="hidden md:table-cell">
                    <StatusBadge status={m.status} />
                  </TD>
                  <TD className="tabular hidden text-muted-foreground lg:table-cell">{formatTimestamp(m.joined_at, locale, timezone)}</TD>
                  <TD className="text-right">
                    {!isSelf && canManageMember(ctx.role, m.role) ? (
                      <MemberControls memberId={m.id} role={m.role} status={m.status} roles={roles} name={name} />
                    ) : (
                      <span className="text-[13px] text-muted-foreground">{t.dynamic(`roles.${m.role}`)}</span>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>

      {(invitations.data ?? []).length > 0 ? (
        <Card className="mt-5">
          <CardHeader title={t("users.pendingInvitations")} />
          <Table>
            <THead>
              <tr>
                <TH>{t("common.email")}</TH>
                <TH>{t("users.role")}</TH>
                <TH className="hidden md:table-cell">{t("users.expiresAt")}</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {(invitations.data ?? []).map((i) => (
                <TR key={i.id}>
                  <TD>{i.email}</TD>
                  <TD className="text-muted-foreground">{t.dynamic(`roles.${i.role}`)}</TD>
                  <TD className="tabular hidden text-muted-foreground md:table-cell">{formatTimestamp(i.expires_at, locale, timezone)}</TD>
                  <TD>
                    <InvitationControls invitationId={i.id} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}
