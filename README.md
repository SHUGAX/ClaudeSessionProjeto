# DocuFlow — gestão inteligente de documentos empresariais

Multi-tenant B2B SaaS for companies to upload, store, extract (AI), validate,
organise and search business documents. The MVP focuses on **supplier
invoices**. UI language: **Português (Portugal)** (primary) and **English**.

```
ORIGINAL DOCUMENT  +  AI EXTRACTION  +  HUMAN-VALIDATED DATA  +  AUDIT TRAIL
```

The original file is never replaced or modified; AI output is a suggestion
until a person validates it; every relevant action is recorded in an
append-only audit log.

> Product name, domain and legal texts are placeholders. `DocuFlow` is set via
> `NEXT_PUBLIC_APP_NAME`.

---

## Contents

- [Status](#status)
- [Architecture](#architecture)
- [Technology stack](#technology-stack)
- [Local development](#local-development)
- [Environment variables](#environment-variables)
- [Supabase setup, migrations, RLS and storage](#supabase-setup-migrations-rls-and-storage)
- [Gemini configuration](#gemini-configuration)
- [Running tests](#running-tests)
- [Deployment and wildcard subdomains](#deployment-and-wildcard-subdomains)
- [Known limitations](#known-limitations)
- Detailed docs: [`docs/`](docs/) — architecture, database, security,
  multi-tenancy, AI processing, data flow, deployment, production checklist,
  testing, roadmap.

---

## Status

### COMPLETED (implemented and tested)

- **Multi-tenancy**: organizations, many-to-many memberships with roles
  (owner/admin/manager/member/viewer), tenant resolution by subdomain
  (`{slug}.example.com`) or path (`/t/{slug}` for local dev), reserved slugs,
  suspended organizations blocked at the database level.
- **Row Level Security** on every tenant table + storage, integrity triggers
  (immutable system fields, state machine, role-escalation and last-owner
  guards, append-only tables), explicit minimal grants. **46 SQL-level RLS
  tests** pass.
- **Authentication** (Supabase Auth): login, logout (POST), forgot/reset
  password (token-hash and PKCE flows), invitation acceptance with
  user-chosen password, no public signup, login rate limiting, safe
  post-login redirects (no open redirect), organization selector for
  multi-company users, tenant-branded login.
- **SaaS admin** (`/admin` or `admin.example.com`): platform stats, create
  organization + slug + plan + limits + logo + invitation of first owner,
  edit, suspend/reactivate, invite admins, usage per tenant. No access to
  tenant documents.
- **Secure document upload**: direct-to-private-storage signed upload URLs,
  server-side verification of magic bytes (PDF/JPEG/PNG/TIFF), size limits,
  SHA-256 hashing, exact-duplicate detection, plan limits (documents/month,
  storage).
- **AI extraction**: provider abstraction, Google Gemini implementation with
  structured JSON output, Zod re-validation, versioned prompt/schema,
  immutable extraction history (retries never overwrite), deterministic mock
  provider for development/tests, failures keep the original and are
  retryable, AI quota per month.
- **Deterministic validation**: totals arithmetic with tolerance, line-item
  sums, dates (invalid / due before issue / future / very old), ISO currency,
  Portuguese NIF checksum (warning only), IBAN checksum, negative totals,
  required fields per document type — errors vs warnings.
- **Duplicate detection**: identical file hash, same supplier + document
  number, same supplier + date + total; flagged, never merged.
- **Supplier resolution**: automatic link by normalised tax ID; name
  similarity only as a suggestion; supplier created on validation; default
  category suggestion.
- **Review screen**: pdf.js viewer (pagination, zoom, fit width, open,
  download) / image viewer, editable fields with live validation, AI-suggested
  markers, line items editor, save draft, validate, reopen, retry AI,
  archive/unarchive, mark paid/unpaid, optimistic concurrency, document history
  and extraction history.
- **Documents list**: server-side search (number, supplier, NIF, file name),
  filters (status, type, supplier, category, issue date range, due
  overdue/7/30 days, amount range, duplicates, archived), sorting, pagination.
- **Suppliers, categories, alerts** (due soon, overdue, to review, possible
  duplicate, processing failed), **dashboard** (KPIs + charts), **users &
  invitations**, **settings** (company, branding/logo, defaults, profile,
  language, usage/limits), **tenant audit log**.
- **i18n**: typed dictionaries pt-PT/en, language switcher, preference stored
  in profile.
- **Observability/security**: structured JSON logger with redaction, error
  reporting hook, `/api/health`, CSP and security headers, same-origin checks,
  rate limiting in Postgres, cron maintenance endpoint.
- **Tests**: 114 unit tests, 46 database/RLS tests, 11 Playwright end-to-end
  tests (+1 opt-in subdomain test) — all passing against a real local
  Supabase stack.

### PARTIALLY COMPLETED

- **Email**: provider abstraction with `console` (dev) and `resend`
  implementations and localized invitation template. Due-date email
  notifications are not sent (in-app alerts only).
- **MFA**: not enabled; Supabase Auth supports TOTP and the session handling is
  compatible, but enrollment UI is not built.
- **Legal pages**: placeholders only, clearly marked as drafts requiring legal
  review.
- **Charts**: lightweight server-rendered bar charts (no interactive charting).

### NOT IMPLEMENTED (by design or deferred — see docs/ROADMAP.md)

- AI chat assistant (architecture documented in `docs/AI_PROCESSING.md`).
- Email ingestion, ERP integrations, approval workflows, contract-specific
  fields, custom domains automation, SSO, data export UI, retention policies,
  vector/semantic search, field bounding-box highlights.
- Invoice issuing / certified billing / AT / SAF-T / ATCUD (explicitly out of
  scope).

### REQUIRES USER CONFIGURATION

- Supabase project (URL, anon key, service role key) and running the migrations.
- Gemini API key (`GEMINI_API_KEY`, `GEMINI_MODEL`) on a tier with an
  appropriate data-processing agreement **before real documents**.
- Domain + wildcard DNS + `NEXT_PUBLIC_ROOT_DOMAIN`, `APP_URL`,
  `AUTH_COOKIE_DOMAIN`.
- Email provider (`EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM`) and
  Supabase Auth SMTP + recovery email template.
- `CRON_SECRET` for scheduled maintenance.
- First platform administrator (`pnpm admin:create --email you@company.pt`).
- Legal review of privacy/terms/cookies, DPA with customers and subprocessors.

---

## Architecture

```
Browser ──► Next.js 16 (Vercel)                      Supabase (EU region)
            ├─ proxy.ts: host → tenant routing      ├─ Postgres + RLS (source of truth for isolation)
            ├─ Server Components (user session) ───►├─ Auth (GoTrue)
            ├─ Server Actions / Route Handlers      ├─ Storage (private "documents" bucket)
            │    └─ service role (server only) ────►│
            └─ AI provider abstraction ──────────────► Gemini API (only when processing is requested)
```

- Reads and user edits go through the **user's own Supabase session** →
  RLS enforces tenant isolation in the database.
- System writes (AI results, audit, usage, onboarding) use the **service role,
  server-only, after authorization**, always scoped by `organization_id`.
- Uploads go **browser → private storage** through short-lived signed upload
  URLs for server-chosen paths; the server then verifies the bytes.
- Business rules (arithmetic, NIF, duplicates, permissions, states) are
  deterministic TypeScript/SQL. AI only extracts.

More: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Technology stack

Next.js 16 (App Router, Turbopack, `proxy.ts`) · React 19 · TypeScript strict
· Tailwind CSS v4 · Radix primitives · lucide-react · Zod · Supabase
(Postgres, Auth, Storage) via `@supabase/ssr` · Google Gemini via
`@google/genai` · pdf.js · decimal.js · Vitest · Playwright · pnpm.

## Local development

Requirements: Node.js ≥ 20.9 (22 recommended), pnpm 10, Docker (for
`supabase start`).

```bash
pnpm install
cp .env.example .env.local          # fill in the values printed by `supabase start`
pnpm db:start                        # supabase start (applies migrations)
pnpm seed --reset                    # synthetic demo data
pnpm dev                             # http://localhost:3000
```

Demo accounts (password `Demo-Password-2026`, synthetic data only):

| Email | Role |
|---|---|
| `admin@docuflow.test` | platform (SaaS) administrator |
| `ana@empresa-a.test` | owner of Empresa A |
| `carla@empresa-a.test` | viewer of Empresa A |
| `bruno@empresa-b.test` | owner of Empresa B |
| `duarte@consultor.test` | member of both (organization selector) |

Local dev uses **path routing** (`/t/empresa-a`). To try subdomains locally see
[`docs/MULTITENANCY.md`](docs/MULTITENANCY.md).

No Docker Hub access? `e2e/stack/up.sh` starts an equivalent stack (GoTrue
binary + PostgREST + Storage API + gateway) on a local PostgreSQL — see
[`docs/TESTING.md`](docs/TESTING.md).

## Environment variables

See [`.env.example`](.env.example) (all variables documented). Summary:

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Supabase project |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | system writes, onboarding |
| `NEXT_PUBLIC_ROOT_DOMAIN` | public | e.g. `example.com` |
| `NEXT_PUBLIC_TENANT_ROUTING` | public | `subdomain` (prod) or `path` (dev) |
| `APP_URL` | server | central app URL, e.g. `https://app.example.com` |
| `AUTH_COOKIE_DOMAIN` | server | `.example.com` in subdomain mode |
| `AI_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `AI_TIMEOUT_MS` | server | AI |
| `EMAIL_PROVIDER`, `EMAIL_FROM`, `RESEND_API_KEY` | server | email |
| `LOG_LEVEL`, `CRON_SECRET` | server | operations |

Never commit `.env*` files (git-ignored).

## Supabase setup, migrations, RLS and storage

- Migrations: `supabase/migrations/*.sql` (schema, security/RLS, storage
  buckets and policies, functions, reference plans, RPCs). Apply with
  `supabase db push` (cloud) or `supabase db reset` (local).
- Types: `pnpm db:types` (local) or `DATABASE_URL=... pnpm db:types:url`.
- Storage: buckets are created by migration — `documents` (**private**, 25 MiB,
  PDF/JPEG/PNG/TIFF) and `organization-logos` (public, 1 MiB, PNG/JPEG/WebP).
- RLS overview: [`docs/SECURITY.md`](docs/SECURITY.md) and
  [`docs/DATABASE.md`](docs/DATABASE.md).
- Auth settings: signup disabled, password ≥ 10 chars with letters+digits,
  recovery template using `/auth/confirm?token_hash=…` (see
  `supabase/config.toml` and `supabase/templates/recovery.html`).

## Gemini configuration

```
AI_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash   # configuration, not code
```

**Before processing real client documents in production, confirm** the
provider terms, data processing agreement, data retention, training policy
(no training on customer data), processing location and international
transfer mechanisms. Do not use free tiers for confidential documents.
Development and tests use the offline `mock` provider and synthetic documents.
See [`docs/AI_PROCESSING.md`](docs/AI_PROCESSING.md).

## Running tests

```bash
pnpm lint && pnpm typecheck
pnpm test:unit                                                       # 114 tests, no services
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres pnpm test:db   # 46 RLS tests
pnpm test:e2e                                                        # needs Supabase + seed (docs/TESTING.md)
pnpm build
```

## Deployment and wildcard subdomains

Vercel + Supabase cloud (EU region). DNS: apex/`app`/`admin` and a wildcard
`*.example.com` pointing to Vercel; add the wildcard domain to the Vercel
project (Vercel issues the wildcard certificate when using its nameservers).
Set `NEXT_PUBLIC_TENANT_ROUTING=subdomain`, `NEXT_PUBLIC_ROOT_DOMAIN`,
`APP_URL=https://app.example.com`, `AUTH_COOKIE_DOMAIN=.example.com`. Full
guide: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) and
[`docs/PRODUCTION_CHECKLIST.md`](docs/PRODUCTION_CHECKLIST.md).

## Known limitations

- Line-item extraction quality depends on the model; line items are optional.
- TIFF files are stored and processed but most browsers cannot preview them
  (download is offered).
- Monetary dashboard figures only include validated documents in the
  organization's default currency.
- AI processing is synchronous within the request (≤ 120 s); a queue is
  recommended for high volumes (see roadmap).
- Signed upload URLs are valid for 2 hours (Supabase default); abandoned
  uploads are cleaned daily by the cron endpoint.
- This codebase does **not** by itself make the service legally compliant
  (GDPR or otherwise); see `docs/DATA_FLOW.md` and the production checklist.
