# Implementation checklist (running)

Legend: [x] done · [~] partial · [ ] pending

## Foundation
- [x] Repo inspected (empty) → scaffolded Next.js 16 + TS strict + Tailwind v4 + pnpm
- [x] Supabase config (signup disabled, password policy, recovery template)
- [x] Migrations: base, schema, security (RLS), storage, functions, reference data
- [x] DB types generated (`pnpm db:types:url`)
- [ ] env modules, logger, errors

## Core
- [ ] i18n (pt-PT primary, en)
- [ ] Tenant resolution (proxy.ts), URL helpers, safe redirects
- [ ] Supabase clients (server, browser, admin, proxy)
- [ ] Auth: login, logout, forgot/reset password, invitation acceptance
- [ ] Platform admin: dashboard, organizations CRUD, plan/limits, invite admin
- [ ] Tenant shell + navigation + org switcher
- [ ] Upload (signed upload URL, magic-byte verification, SHA-256)
- [ ] AI provider abstraction + Gemini + mock
- [ ] Extraction pipeline + validation + duplicates + supplier matching
- [ ] Review screen + PDF/image viewer
- [ ] Document list/search/filters
- [ ] Suppliers, categories
- [ ] Dashboard, alerts
- [ ] Users & invitations (tenant)
- [ ] Settings (org, language)
- [ ] Audit trail UI
- [ ] Legal placeholder pages

## Quality
- [ ] Unit tests
- [ ] DB/RLS tests (plain Postgres + Supabase shim)
- [ ] E2E (Playwright) — requires running Supabase
- [ ] Docs (README, docs/*)
- [ ] Lint / typecheck / build clean
