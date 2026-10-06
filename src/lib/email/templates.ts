import type { Locale } from "@/lib/i18n/config";
import { MESSAGES } from "@/lib/i18n/messages";
import { createTranslator } from "@/lib/i18n/translate";
import type { MemberRole } from "@/lib/supabase/types";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function invitationEmail(params: {
  locale: Locale;
  appName: string;
  organizationName: string;
  inviterName: string;
  role: MemberRole;
  link: string;
  expiresInDays: number;
}): { subject: string; html: string; text: string } {
  const t = createTranslator(MESSAGES[params.locale], params.locale);
  const role = t.dynamic(`roles.${params.role}`);
  const vars = {
    organization: params.organizationName,
    inviter: params.inviterName,
    app: params.appName,
    role,
    days: params.expiresInDays,
  };
  const subject = t("email.inviteSubject", vars);
  const heading = t("email.inviteHeading", vars);
  const body = t("email.inviteBody", vars);
  const cta = t("email.inviteCta");
  const expiry = t("email.inviteExpiry", vars);
  const footer = t("email.footer", vars);

  const html = `<!doctype html>
<html lang="${params.locale}"><body style="margin:0;background:#f7f8fa;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border:1px solid #e3e7ee;border-radius:12px" cellpadding="0" cellspacing="0">
<tr><td style="padding:28px">
<p style="margin:0 0 4px;font-size:13px;color:#5b6474">${escapeHtml(params.appName)}</p>
<h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(heading)}</h1>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6">${escapeHtml(body)}</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(params.link)}" style="display:inline-block;background:#2a46b8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600">${escapeHtml(cta)}</a></p>
<p style="margin:0;font-size:12px;color:#5b6474;line-height:1.6">${escapeHtml(expiry)}</p>
</td></tr></table>
<p style="font-size:11px;color:#8a93a3;margin-top:16px">${escapeHtml(footer)}</p>
</td></tr></table></body></html>`;

  const text = `${heading}\n\n${body}\n\n${cta}: ${params.link}\n\n${expiry}\n\n${footer}`;
  return { subject, html, text };
}
