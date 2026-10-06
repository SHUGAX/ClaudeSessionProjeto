# Testing

| Suite                      | Command                                                                                 | Needs                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Unit (128)                 | `pnpm test:unit`                                                                        | nothing                                                                     |
| Database / RLS (46)        | `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres pnpm test:db` | any PostgreSQL ≥ 15 superuser; a throw-away database is created and dropped |
| End-to-end (12 + 1 opt-in) | `pnpm test:e2e`                                                                         | running Supabase, seeded data, `.env.local`, `DATABASE_URL`                 |

The RLS suite applies `tests/db/supabase-shim.sql` (minimal `auth`/`storage`
emulation and Supabase roles) followed by every migration, then runs queries as
`authenticated`/`anon` with JWT claims — exactly how PostgREST executes them.
Without `TEST_DATABASE_URL` the suite is skipped.

## E2E environment

Option A — Supabase CLI:

```bash
pnpm db:start && pnpm seed --reset
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
pnpm test:e2e
```

Option B — `e2e/stack` (no Docker Hub images for Postgres/GoTrue needed):

```bash
# requires local PostgreSQL (postgres/postgres), docker images postgrest/postgrest:v16.4
# and supabase/storage-api:v1.79.28, and the GoTrue release binary extracted to $GOTRUE_DIR
GOTRUE_DIR=/path/to/auth ./e2e/stack/up.sh
cat /tmp/docuflow-e2e-stack/env >> .env.local     # plus the app variables from .env.example
pnpm seed --reset
set -a; source .env.local; set +a; pnpm test:e2e
./e2e/stack/down.sh
```

E2E uses `AI_PROVIDER=mock`; synthetic PDFs embed the expected extraction so
values can be asserted. Failure markers: `MOCK_AI_FAIL`, `MOCK_AI_INVALID`.
Rate-limit buckets are reset in `e2e/global-setup.ts`.

Subdomain topology test: see the header of `e2e/subdomain.spec.ts`.
