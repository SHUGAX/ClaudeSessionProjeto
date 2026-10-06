# Implementation checklist (running)

Legend: [x] done · [~] partial · [ ] pending

## Foundation

- [x] Next.js 16 + TS strict + Tailwind v4 + pnpm; ESLint 9, Prettier
- [x] Supabase config (signup disabled, password policy, recovery template)
- [x] Migrations: base, schema, security (RLS), storage, functions, reference data, line-items RPC
- [x] Generated DB types; env validation; logger; error abstraction

## Core

- [x] i18n pt-PT/en
- [x] Tenant resolution (proxy.ts) path + subdomain, safe redirects
- [x] Auth: login, logout, forgot/reset, invitations, org selector
- [x] Platform admin: stats, organizations CRUD, plan/limits, suspend, invite admin, logo
- [x] Tenant shell, dashboard, documents list/search, review, suppliers, categories, alerts, users, settings, audit
- [x] Secure upload, AI abstraction (Gemini + mock), pipeline, validation, duplicates, supplier matching
- [x] Cron maintenance endpoint
- [~] Email: console + Resend; no due-date notifications
- [x] AI assistant (predefined RLS-scoped tools, templated answers)
- [ ] MFA enrollment UI

## Quality

- [x] 128 unit tests · 46 RLS tests · 12 E2E (+1 opt-in subdomain)
- [x] Docs (README + docs/*), CI workflow
- [x] Lint / typecheck / build clean
