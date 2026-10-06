<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project conventions (DocuFlow)

- Read `README.md` (status) and `docs/ARCHITECTURE.md` first.
- Tenant isolation is enforced by RLS (`supabase/migrations/*_security.sql`); never bypass it
  with the service role except for documented system writes after authorization.
- Every schema change is a new migration; regenerate `src/lib/supabase/database.types.ts`.
- User-facing strings live in `src/lib/i18n/messages/pt-PT.ts` (European Portuguese) and `en.ts`.
- Money: decimal strings + `decimal.js`; select NUMERIC columns as `col::text`.
- Run `pnpm lint && pnpm typecheck && pnpm test:unit` (and `test:db` with `TEST_DATABASE_URL`) before committing.
