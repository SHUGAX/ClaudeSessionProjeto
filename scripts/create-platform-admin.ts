/**
 * Grants SaaS platform-administrator rights to a user.
 *   pnpm admin:create --email you@company.pt
 * If the user does not exist yet, an invitation/recovery-style account is
 * created WITHOUT a password and a password-recovery email is triggered so the
 * person sets their own password (passwords are never generated or emailed).
 * Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and APP_URL.
 */
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

const emailArg = process.argv.indexOf("--email");
const email = emailArg > -1 ? process.argv[emailArg + 1]?.trim().toLowerCase() : undefined;
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Usage: pnpm admin:create --email you@company.pt");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key)
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function main() {
  let { data: profile } = await db.from("profiles").select("id").eq("email", email!).maybeSingle();
  if (!profile) {
    const { data, error } = await db.auth.admin.createUser({ email: email!, email_confirm: true });
    if (error || !data.user) throw new Error(`Could not create user: ${error?.message}`);
    profile = { id: data.user.id };
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const { error: resetError } = await db.auth.resetPasswordForEmail(email!, {
      redirectTo: `${appUrl}/auth/callback?next=/reset-password`,
    });
    console.log(
      resetError
        ? `User created. Send a password reset from the login page ("Esqueceu-se da palavra-passe?").`
        : `User created. A password-setup email was sent to ${email}.`,
    );
  }
  const { error } = await db.from("platform_admins").upsert({ user_id: profile.id });
  if (error) throw new Error(error.message);
  console.log(`${email} is now a platform administrator.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
