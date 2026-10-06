#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Local "mini Supabase" for end-to-end tests in environments where the Supabase
# CLI docker images are unavailable. Prefer `supabase start` when possible.
#
# Requirements: a local PostgreSQL superuser connection, docker (images
# postgrest/postgrest and supabase/storage-api), the GoTrue binary
# (https://github.com/supabase/auth/releases) at $GOTRUE_DIR, and Node.js.
# NOT FOR PRODUCTION: uses fixed local secrets and superuser connections.
# -----------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(cd ../.. && pwd)"
STATE_DIR="${STATE_DIR:-/tmp/docuflow-e2e-stack}"
mkdir -p "$STATE_DIR/storage"

PG_HOST="${PG_HOST:-127.0.0.1}"
PG_PORT="${PG_PORT:-5432}"
PG_PASSWORD="${PG_PASSWORD:-postgres}"
DB="${E2E_DB:-docuflow_e2e}"
PG_SUPER="postgresql://postgres:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}"
GOTRUE_DIR="${GOTRUE_DIR:?Set GOTRUE_DIR to the extracted supabase/auth release directory}"
export JWT_SECRET="${JWT_SECRET:-local-e2e-jwt-secret-with-at-least-32-characters}"
eval "$(node keys.mjs)"

echo "→ resetting database $DB"
psql "$PG_SUPER/postgres" -qv ON_ERROR_STOP=1 -c "drop database if exists $DB with (force)" -c "create database $DB"
psql "$PG_SUPER/$DB" -qv ON_ERROR_STOP=1 <<SQL
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit password '${PG_PASSWORD}'; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin login superuser password '${PG_PASSWORD}'; end if;
end \$\$;
grant anon, authenticated, service_role to authenticator;
create schema if not exists auth authorization supabase_auth_admin;
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;
alter role supabase_auth_admin set search_path = auth;
SQL

echo "→ GoTrue (auth) migrations"
export GOTRUE_DB_DRIVER=postgres
export DATABASE_URL="postgres://supabase_auth_admin:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${DB}?sslmode=disable"
export API_EXTERNAL_URL="http://127.0.0.1:54321/auth/v1"
export GOTRUE_API_HOST=127.0.0.1
export PORT=9999
export GOTRUE_SITE_URL="http://localhost:3000"
export GOTRUE_URI_ALLOW_LIST="http://localhost:3000/**"
export GOTRUE_DISABLE_SIGNUP=true
export GOTRUE_JWT_SECRET="$JWT_SECRET"
export GOTRUE_JWT_EXP=3600
export GOTRUE_JWT_AUD=authenticated
export GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated
export GOTRUE_JWT_ADMIN_ROLES=service_role
export GOTRUE_EXTERNAL_EMAIL_ENABLED=true
export GOTRUE_MAILER_AUTOCONFIRM=true
export GOTRUE_PASSWORD_MIN_LENGTH=10
export GOTRUE_SMTP_HOST=127.0.0.1
export GOTRUE_SMTP_PORT=54325
export GOTRUE_SMTP_ADMIN_EMAIL=no-reply@example.test
export GOTRUE_SMTP_SENDER_NAME=DocuFlow
export GOTRUE_RATE_LIMIT_EMAIL_SENT=1000
export GOTRUE_LOG_LEVEL=warn
(cd "$GOTRUE_DIR" && ./auth migrate >/dev/null)
nohup sh -c "cd '$GOTRUE_DIR' && ./auth serve" >"$STATE_DIR/gotrue.log" 2>&1 &
echo $! >"$STATE_DIR/gotrue.pid"

psql "$PG_SUPER/$DB" -qv ON_ERROR_STOP=1 <<SQL
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
SQL

echo "→ mail catcher (mailpit) on 54324/54325"
docker rm -f docuflow-mail >/dev/null 2>&1 || true
docker run -d --name docuflow-mail --network host -e MP_UI_BIND_ADDR=0.0.0.0:54324 -e MP_SMTP_BIND_ADDR=0.0.0.0:54325 axllent/mailpit:v1.31.3 >/dev/null || echo "  (mailpit unavailable; emails will fail silently)"

echo "→ Storage API"
docker rm -f docuflow-storage >/dev/null 2>&1 || true
docker run -d --name docuflow-storage --network host \
  -e ANON_KEY="$ANON_KEY" -e SERVICE_KEY="$SERVICE_KEY" \
  -e AUTH_JWT_SECRET="$JWT_SECRET" -e PGRST_JWT_SECRET="$JWT_SECRET" -e AUTH_JWT_ALGORITHM=HS256 \
  -e DATABASE_URL="postgres://postgres:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${DB}" \
  -e STORAGE_BACKEND=file -e FILE_STORAGE_BACKEND_PATH=/var/lib/storage \
  -e TENANT_ID=stub -e REGION=local -e GLOBAL_S3_BUCKET=stub \
  -e FILE_SIZE_LIMIT=52428800 -e SERVER_PORT=5000 -e PORT=5000 -e LOG_LEVEL=warn \
  -v "$STATE_DIR/storage:/var/lib/storage" \
  supabase/storage-api:v1.79.28 >/dev/null

for i in $(seq 1 60); do
  if psql "$PG_SUPER/$DB" -tAc "select to_regclass('storage.objects') is not null and exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='storage' and p.proname='foldername')" 2>/dev/null | grep -q t; then break; fi
  sleep 1
done
sleep 3
# Same privileges as a Supabase project: RLS on storage.objects does the gatekeeping.
psql "$PG_SUPER/$DB" -qv ON_ERROR_STOP=1 <<SQL
grant usage on schema storage to anon, authenticated, service_role;
grant all on all tables in schema storage to anon, authenticated, service_role;
grant all on all functions in schema storage to anon, authenticated, service_role;
grant all on all sequences in schema storage to anon, authenticated, service_role;
SQL

echo "→ application migrations"
for f in "$ROOT"/supabase/migrations/*.sql; do
  psql "$PG_SUPER/$DB" -qv ON_ERROR_STOP=1 -f "$f" >/dev/null
done

echo "→ PostgREST"
docker rm -f docuflow-rest >/dev/null 2>&1 || true
docker run -d --name docuflow-rest --network host \
  -e PGRST_DB_URI="postgres://authenticator:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${DB}" \
  -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="$JWT_SECRET" \
  -e PGRST_DB_EXTRA_SEARCH_PATH=public,extensions -e PGRST_SERVER_PORT=54330 -e PGRST_DB_MAX_ROWS=1000 \
  postgrest/postgrest:v16.4 >/dev/null

echo "→ gateway on 54321"
nohup node gateway.mjs >"$STATE_DIR/gateway.log" 2>&1 &
echo $! >"$STATE_DIR/gateway.pid"

for i in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:54321/auth/v1/health" >/dev/null && curl -sf "http://127.0.0.1:54321/rest/v1/" -H "apikey: $ANON_KEY" >/dev/null && curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:54321/storage/v1/status" | grep -q 200; then
    break
  fi
  sleep 1
done

cat >"$STATE_DIR/env" <<ENV
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY
DATABASE_URL=$PG_SUPER/$DB
ENV
echo "✓ stack ready. Environment written to $STATE_DIR/env"
