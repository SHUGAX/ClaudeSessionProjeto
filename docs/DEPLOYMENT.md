# Deployment (Vercel + Supabase)

## 1. Supabase

1. Create a project in an **EU region**.
2. Link and push migrations: `supabase link --project-ref <ref>` then
   `supabase db push`.
3. Auth → Providers: email enabled, **signups disabled**; password min length
   10, letters + digits; configure SMTP (custom provider) for production.
4. Auth → URL configuration: Site URL `https://app.example.com`; redirect URLs
   `https://app.example.com/**`, `https://*.example.com/**`.
5. Auth → Email templates → *Reset password*: use
   `supabase/templates/recovery.html` (`/auth/confirm?token_hash=…`).
6. Storage buckets are created by the migration (verify `documents` is private).
7. Create the first platform admin: `pnpm admin:create --email you@company.pt`
   (with production env vars in the shell, never committed).

## 2. Vercel

1. Import the repository; framework Next.js; install `pnpm install`; build
   `pnpm build`.
2. Environment variables (Production): see `.env.example`.
   `NEXT_PUBLIC_TENANT_ROUTING=subdomain`, `NEXT_PUBLIC_ROOT_DOMAIN=example.com`,
   `APP_URL=https://app.example.com`, `AUTH_COOKIE_DOMAIN=.example.com`,
   `AI_PROVIDER=gemini`, `GEMINI_*`, `EMAIL_*`, `CRON_SECRET`,
   `SUPABASE_SERVICE_ROLE_KEY` (sensitive).
3. Region close to Supabase (e.g. `fra1`/`cdg1` with an EU Supabase project).
4. `vercel.json` schedules `/api/cron/maintenance` daily (Vercel sends
   `Authorization: Bearer $CRON_SECRET`).
5. Functions: `/api/documents/[id]/process` uses `maxDuration = 120`
   (plan must allow it).

## 3. Domain and DNS

| Record | Value |
|---|---|
| `example.com` (apex) | A record to Vercel (or ALIAS/ANAME) |
| `app`, `admin`, `www` | CNAME to Vercel |
| `*` | CNAME `cname.vercel-dns.com` (wildcard) |

Add `example.com` and `*.example.com` to the Vercel project. Wildcard
certificates on Vercel require using Vercel nameservers (or another
certificate strategy — check current Vercel docs). Verify:
`https://empresa.example.com/api/health`.

## 4. Smoke test

Follow the scenario in `docs/PRODUCTION_CHECKLIST.md` (create tenant →
invitation → upload → validate → cross-tenant denial).

## Previews

Preview deployments (`*.vercel.app`) are treated as central hosts; use
`NEXT_PUBLIC_TENANT_ROUTING=path` for preview environments with a separate
Supabase project (never production data).
