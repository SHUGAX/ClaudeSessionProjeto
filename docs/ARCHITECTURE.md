# Architecture

## Overview

One Next.js 16 application (App Router) serves every tenant, the central
account pages and the SaaS admin area. Supabase provides Postgres (with Row
Level Security as the primary isolation boundary), Auth and private Storage.
AI extraction is an isolated module behind a provider interface.

```
src/
  proxy.ts                 host → route mapping (+ Supabase session refresh)
  app/
    (auth)/login …         central account pages
    invite/[token]         invitation acceptance
    select-organization    multi-company selector
    admin/…                SaaS administration (platform admins only)
    t/[slug]/login         tenant-branded login
    t/[slug]/(app)/…       tenant application (dashboard, documents, …)
    api/documents/…        upload intent, finalize, process, signed file URL
    api/cron/maintenance   scheduled job (alerts, abandoned uploads)
    api/health             health probe
    legal/…                placeholder legal pages
  features/<area>/         UI + server actions per feature
  lib/
    ai/                    provider interface, Gemini, mock, schema, prompt, normalisation
    documents/             file types, upload, pipeline, repository, review, validation, duplicates, queries
    suppliers/matching.ts  supplier resolution
    auth/                  session, permissions, platform admin, post-login routing
    tenancy/               host resolution, slugs, URLs, tenant context
    security/              redirects, rate limiting, crypto, request checks
    i18n/                  dictionaries (pt-PT, en), translator, server/client helpers
    supabase/              clients (user, admin), generated types, helpers
    email/, audit.ts, invitations.ts, money.ts, dates.ts, observability/
supabase/migrations/       schema, RLS, storage, functions (single source of truth)
tests/unit, tests/db       Vitest (unit + RLS on plain Postgres)
e2e/                       Playwright + local Supabase test stack
```

## Key decisions

| Decision | Rationale |
|---|---|
| **Membership model** (`organization_members`) instead of `company_id` on users | users can belong to several companies with different roles |
| **RLS as primary isolation**, app checks as second layer | a bug in application code must not leak tenant data |
| `organization_id` on **every** tenant table + composite FKs `(id, organization_id)` | uniform, index-friendly policies; impossible to link rows across tenants |
| Service role **only server-side, after authorization**, for system writes | users cannot forge AI results, audit records or usage counters |
| Integrity **triggers** for system fields and state machine | protects against mass assignment through the public Data API |
| **Direct-to-storage signed uploads** + server verification | bypasses serverless body limits; server still validates real bytes and hash |
| Fixed storage key `organizations/{org}/documents/{doc}/original.{ext}` | no user-controlled paths (no traversal); mirrors DB authorization |
| AI behind `DocumentExtractionProvider` | swap Gemini for another provider without touching the app |
| Amounts as **decimal strings** end-to-end, `NUMERIC` in Postgres, `decimal.js` | no floating point in money |
| Business dates as `DATE` / `YYYY-MM-DD` strings | no timezone shifts |
| Separate `status`, `processing_status`, `review_status` | lifecycle, technical processing and human review are different concerns |
| Archive instead of delete | business documents have retention obligations |
| Append-only `audit_logs`, `document_extractions`, `document_status_history` | traceability; retries never overwrite history |
| Postgres-backed rate limiting | works across serverless instances |
| Path routing for dev, subdomain routing for prod (env switch) | wildcard DNS is not always available locally |
| No chart library; server-rendered bars | smaller bundles, accessible, no client JS |
| pdf.js **legacy** build, worker served from `/public` | broad browser support, strict CSP (`worker-src 'self'`) |

## Request flow (tenant page)

1. `proxy.ts` refreshes the session cookie and rewrites
   `empresa-a.example.com/documents` → `/t/empresa-a/documents`.
2. `t/[slug]/(app)/layout.tsx` calls `resolveTenant(slug)`: public tenant
   info → authenticated user → **active membership read through RLS** →
   organization active. Otherwise: 404 / suspended / login / access denied.
3. Pages query with the user's Supabase client (RLS) and always filter by the
   resolved `organization_id`.
4. Mutations (server actions, route handlers) re-resolve the context; route
   handlers derive the organization **from the target record**, never from input.

## Document pipeline

See [AI_PROCESSING.md](AI_PROCESSING.md). Upload intent → browser uploads to
private storage → finalize (magic bytes, size, SHA-256, exact duplicates) →
process (claim → provider → immutable extraction record → supplier match →
duplicates → validation → suggested values, `review_required`) → human review
→ validation (canonical values, validator, timestamp, audit).

## Extensibility

- **Other document types**: `document_type` enum is generic; type-specific
  data (e.g. contracts) should live in extension tables (`document_contract_terms`)
  keyed by `document_id`, not as more columns on `documents`.
- **Background processing**: `runExtractionPipeline` is pure orchestration
  with injected dependencies; it can run in a queue worker or a separate
  service unchanged.
- **Field highlights**: the PDF viewer renders pages into a positioned
  container; extraction bounding boxes can be overlaid in page coordinates.
- **Custom domains**: `resolveHost` is the single place where a host maps to a
  tenant; add a `organization_domains` lookup there.
