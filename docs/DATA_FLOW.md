# Data flow and GDPR roles

> Technical description to support the legal/compliance work. It is not legal
> advice and does not by itself make the service compliant.

## Roles (likely B2B model)

| Party                                         | Role for uploaded documents                                               |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| Customer company (tenant)                     | **Controller** — decides what is uploaded and why                         |
| SaaS operator                                 | **Processor** — processes on the customer's documented instructions (DPA) |
| Supabase, Vercel, AI provider, email provider | **Subprocessors**                                                         |

For user account data (names, emails, login records) the operator's role must
be defined by counsel.

## Flow

```
User browser
  │ HTTPS (TLS)
  ├──► Next.js app (Vercel) ──► Supabase Auth ─────── account data (email, password hash by Supabase, sessions)
  │        │
  │        ├──► Supabase Postgres (EU) ────────────── document metadata, extracted fields, suppliers,
  │        │                                          audit log, usage counters, profiles
  │        ├──► Supabase Storage (EU, private) ◄──── original files (browser uploads directly
  │        │                                          with a short-lived signed URL)
  │        └──► AI provider (only on "process") ───── original file bytes + prompt
  │                 └──► structured JSON back ───────► stored as extraction record
  └──► Email provider (invitations) ───────────────── recipient email, organization name, link
```

## Data categories

| Category           | Where                                                      | Notes                                                                          |
| ------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Account data       | `auth.users`, `profiles`                                   | email, name, language                                                          |
| Membership/roles   | `organization_members`, `invitations`                      | invitation token stored as hash                                                |
| Original documents | Storage `documents`                                        | may contain personal data of third parties (suppliers' representatives, IBANs) |
| Extracted data     | `documents`, `document_line_items`, `document_extractions` | raw AI output kept for traceability                                            |
| Audit trail        | `audit_logs`                                               | actor id, action, changed values; **no IP addresses** stored                   |
| Operational logs   | Vercel logs                                                | ids and error codes only — no document content, no secrets                     |
| Rate limiting      | `rate_limits`                                              | hashed IP + hashed email, short-lived                                          |

## Minimisation and controls

- Private buckets, short-lived signed URLs, tenant isolation by RLS.
- No analytics or third-party trackers; only strictly necessary cookies
  (session, language).
- AI is called only when processing is requested; mock provider in dev/tests.
- Suspension blocks access immediately at the database level.

## Not yet implemented (needed for full readiness)

- Configurable retention and automatic deletion per tenant.
- Tenant data export (documents + data) and account deletion/anonymisation
  workflows (database cascades already support tenant deletion).
- Records of processing activities, DPIA, subprocessor list publication.
