# Security and tenant isolation

## Threat model highlights

Tenants are mutually untrusted companies. The most important property is that
no user of company A can read or change anything of company B, whatever URL,
API call or Data API request they craft.

## Layers of tenant isolation

1. **Database (primary)** — Row Level Security on every tenant table.
   Visibility requires an *active membership* of `auth.uid()` in an *active*
   organization (`public.user_org_ids()`); writes additionally check the role.
   The tenant slug is never used by policies.
2. **Storage** — private `documents` bucket; the read policy derives the
   organization from the object path (`organizations/{org}/…`) and applies the
   same membership check. Signed URLs are created with the *user's* session
   (so storage RLS is enforced) and live 120 s. End users cannot write, move or
   delete originals.
3. **Application** — `resolveTenant(slug)` verifies authentication, membership
   and organization status for every tenant page; route handlers load the
   target record through RLS and check the role in **that record's**
   organization (`loadAuthorizedDocument`). Foreign and missing records are
   indistinguishable (404).
4. **Integrity triggers** — protect system fields (storage path, hash, MIME,
   validation metadata, processing state), forbid moving rows between
   organizations, enforce the document state machine, block role escalation
   (only owners manage owners, nobody edits their own membership), keep at
   least one owner, make audit/extraction/history tables append-only.
5. **Grants** — `anon` has no table privileges; `authenticated` only has the
   column-level privileges it needs; privileged functions are executable only
   by the service role.

The subdomain only *identifies* a tenant; it never grants access.

## Roles

| Capability | viewer | member | manager | admin | owner |
|---|:-:|:-:|:-:|:-:|:-:|
| View documents, suppliers, categories, alerts | ✓ | ✓ | ✓ | ✓ | ✓ |
| Upload, review, validate, archive documents | | ✓ | ✓ | ✓ | ✓ |
| Create suppliers (during validation) | | ✓ | ✓ | ✓ | ✓ |
| Edit suppliers, manage categories | | | ✓ | ✓ | ✓ |
| Manage users/invitations, settings, audit log, usage | | | | ✓ | ✓ |
| Manage owners | | | | | ✓ |

Helpers: `src/lib/auth/permissions.ts` (mirrored by RLS policies).
SaaS super admins (`platform_admins`) use a separate area and **have no
implicit access to tenant documents** (verified by tests).

## Service role

`SUPABASE_SERVICE_ROLE_KEY` exists only in server code (`src/lib/supabase/admin.ts`
imports `server-only`; it is never prefixed `NEXT_PUBLIC_`). It is used after
authorization for: extraction records, audit log, usage counters, alerts
refresh, onboarding/invitations, signed upload URLs, logo uploads.

## Web security controls

| Risk | Control |
|---|---|
| XSS | React escaping; no `dangerouslySetInnerHTML`; CSP (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`); SVG logos rejected; email templates escape HTML |
| CSRF | SameSite=Lax cookies; Server Actions origin check; route handlers require same-origin `Origin`; logout is POST-only |
| Open redirect | `safeRedirectTarget` allows relative paths or root-domain hosts only |
| IDOR / broken tenant authorization | RLS + record-derived organization + composite FKs |
| Mass assignment | Zod schemas, column grants, guard triggers |
| SQL injection | parameterized PostgREST queries; search terms sanitized before `or()` filters; no LLM-generated SQL |
| File upload attacks | extension pre-check, magic-byte verification server-side, size limits (bucket + server), fixed storage keys, originals rendered by pdf.js on a canvas (never as HTML), served from the storage domain |
| MIME spoofing | browser MIME ignored; detected type stored |
| SSRF | no user-supplied URLs are fetched |
| Brute force | Postgres rate limiting on login, password reset, invitations, uploads, AI processing; Supabase Auth limits |
| Session | Supabase SSR cookies refreshed in the proxy; `getUser()` validation server-side |
| Secret leakage | env validated with Zod (names only in errors); logger redacts sensitive keys; `.env*` git-ignored |
| AI prompt injection | prompt instructs to ignore instructions in documents; output schema-constrained and Zod-validated; AI cannot trigger actions |
| Invitation tokens | 256-bit random, only SHA-256 stored, single use, 7-day expiry, links never placed in URLs of admin pages |

## Verification

- `tests/db/rls.test.ts` (46 tests) — run with `TEST_DATABASE_URL`.
- `e2e/tenant-isolation.spec.ts` — URL manipulation, foreign document id via
  page, API and signed URL, unauthenticated access, roles.
- `e2e/subdomain.spec.ts` — production topology (opt-in).

## Reporting

Report vulnerabilities privately to the platform owner (contact to be defined
in `SECURITY.md` at the repository root before production).
