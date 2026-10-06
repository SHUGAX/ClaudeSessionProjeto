# Database

All objects are created by migrations in `supabase/migrations/` (no manual SQL).

| Migration | Content |
|---|---|
| `…0100_base.sql` | extensions (`pg_trgm`), enums, pure helpers (`normalize_tax_id`, `normalize_document_number`, `is_reserved_slug`, `jwt_role`, `is_end_user_request`) |
| `…0200_schema.sql` | tables, constraints, indexes, `updated_at` + append-only triggers |
| `…0300_security.sql` | identity helpers, integrity guards, RLS policies, grants |
| `…0400_storage.sql` | buckets and storage policies |
| `…0500_functions.sql` | usage, limits, rate limiting, alerts, dashboard, admin stats |
| `…0600_reference_data.sql` | default plans (limits only, no prices) |
| `…0700_line_items_rpc.sql` | atomic line-item replacement (SECURITY INVOKER) |

## Tables

| Table | Notes |
|---|---|
| `plans` | limits (`monthly_document_limit`, `monthly_ai_limit`, `user_limit`, `storage_limit_bytes`), `features` JSONB |
| `organizations` | tenant; `slug` unique + DNS-safe + not reserved; `status` active/suspended; per-tenant limit overrides |
| `organization_settings` | currency, language, timezone, due-soon days, brand colour |
| `profiles` | 1:1 with `auth.users` (created by trigger); email, name, language |
| `platform_admins` | SaaS super admins (no end-user writes) |
| `organization_members` | user ↔ organization, `role`, `status`; unique (org, user) |
| `invitations` | **token hash only** (SHA-256), expiry, one pending per email per org |
| `categories` | unique name per org (case-insensitive) |
| `suppliers` | `tax_id_normalized` (generated) unique **per organization**; default category |
| `documents` | original file metadata (path, MIME, size, SHA-256) + canonical data + three status columns + validation issues + duplicate pointer + paid date |
| `document_extractions` | append-only: provider, model, prompt/schema versions, raw + structured output, confidence, error, duration, tokens |
| `document_line_items` | positions with NUMERIC quantities/amounts |
| `document_validation_events` | append-only validation runs |
| `document_status_history` | append-only, written by trigger |
| `audit_logs` | append-only; actor, action, entity, old/new values, metadata |
| `alerts` | derived, idempotent (`dedupe_key`); open/dismissed/resolved |
| `organization_usage` | monthly counters (uploads, processed, AI calls/failures) |
| `rate_limits` | fixed-window counters (no end-user access) |

## Consistency rules

- UUID primary keys, `created_at`/`updated_at` (UTC `timestamptz`).
- Business dates are `DATE`. Money is `NUMERIC(18,4)`; rates `NUMERIC(7,4)`.
- Cross-tenant references are impossible thanks to composite foreign keys
  `(x_id, organization_id) → x(id, organization_id)` with
  `ON DELETE SET NULL (x_id)`.
- `document_number` is **not** unique (legitimate duplicates across suppliers);
  duplicates are detected, not prevented.
- Totals are not constrained to be positive (credit notes).
- Every organization keeps at least one active owner (trigger).

## Numeric values through the API

PostgREST returns `NUMERIC` as JSON numbers. The application selects money
columns as text (`total::text`) and sends decimal strings on writes
(`src/lib/supabase/values.ts`), so no float conversion happens.

## RPCs

| Function | Security | Callable by |
|---|---|---|
| `my_memberships()` | definer (caller's rows only) | authenticated |
| `get_tenant_public_info(slug)` | definer (display data only) | anon, authenticated |
| `dashboard_metrics(org)`, `supplier_summaries(org)`, `replace_document_line_items` | **invoker** (RLS applies) | authenticated |
| `organization_limits(org)` | definer, checks membership | authenticated, service |
| `refresh_alerts(org)` | definer, checks membership for end users | authenticated, service |
| `increment_usage`, `check_rate_limit`, `platform_stats`, `organization_overview` | definer | **service role only** |

## Types

`src/lib/supabase/database.types.ts` is generated (`pnpm db:types`). Regenerate
after every migration.
