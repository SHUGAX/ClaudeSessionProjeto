-- =============================================================================
-- Base: extensions, enums and pure helper functions.
-- =============================================================================

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.organization_status as enum ('active', 'suspended');

create type public.member_role as enum ('owner', 'admin', 'manager', 'member', 'viewer');

create type public.membership_status as enum ('active', 'disabled');

create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');

create type public.document_type as enum (
  'invoice',
  'receipt',
  'credit_note',
  'quotation',
  'delivery_note',
  'contract',
  'other'
);

-- Lifecycle of the business document (what the user sees).
create type public.document_status as enum (
  'uploading',        -- record created, original not yet confirmed in storage
  'uploaded',         -- original stored and verified, awaiting AI processing
  'processing',       -- AI extraction running
  'review_required',  -- extraction finished, awaiting human review
  'validated',        -- human-validated canonical data
  'failed',           -- processing failed (original is safe, retry available)
  'archived'          -- soft-deleted / archived
);

-- Technical state of the AI processing step (independent of the review).
create type public.processing_status as enum ('pending', 'processing', 'success', 'error');

-- Human review state.
create type public.review_status as enum ('pending', 'needs_review', 'validated');

create type public.alert_type as enum (
  'due_soon',
  'overdue',
  'review_required',
  'possible_duplicate',
  'processing_failed'
);

create type public.alert_status as enum ('open', 'dismissed', 'resolved');

-- ---------------------------------------------------------------------------
-- Pure helper functions
-- ---------------------------------------------------------------------------

-- Keep in sync with src/lib/tenancy/slug.ts (RESERVED_SLUGS).
create or replace function public.is_reserved_slug(p_slug text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_slug = any (array[
    'www', 'app', 'admin', 'api', 'support', 'status', 'docs', 'mail', 'auth',
    'help', 'blog', 'static', 'assets', 'cdn', 'login', 'logout', 'signup',
    'billing', 'dashboard', 'smtp', 'imap', 'pop', 'ftp', 'ns1', 'ns2', 'test',
    'staging', 'dev', 'internal', 'root', 'system', 'supabase', 'vercel'
  ]);
$$;

-- Normalises a tax identifier for comparison: keeps only letters/digits, upper-case,
-- strips the "PT" prefix of Portuguese VAT numbers. Keep in sync with
-- src/lib/validation/tax-id.ts (normalizeTaxId).
create or replace function public.normalize_tax_id(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null then null
    else nullif(
      regexp_replace(
        upper(regexp_replace(p_value, '[^A-Za-z0-9]', '', 'g')),
        '^PT([0-9]{9})$',
        '\1'
      ),
      ''
    )
  end;
$$;

-- Normalises a document number for duplicate detection (case/whitespace insensitive).
-- Keep in sync with src/lib/documents/duplicates.ts (normalizeDocumentNumber).
create or replace function public.normalize_document_number(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(upper(regexp_replace(coalesce(p_value, ''), '\s+', '', 'g')), '');
$$;

create or replace function public.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_value::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Generic guard used for append-only tables (audit logs, extraction history...).
create or replace function public.prevent_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Table %.% is append-only', tg_table_schema, tg_table_name
    using errcode = '42501';
end;
$$;

-- Role claim of the current API request (anon / authenticated / service_role),
-- or null for direct database connections (migrations, administrators).
create or replace function public.jwt_role()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
$$;

-- True when the current statement runs on behalf of an end user (PostgREST
-- anon/authenticated roles), as opposed to the service role or a database
-- administrator. Works both in SECURITY INVOKER and SECURITY DEFINER contexts.
create or replace function public.is_end_user_request()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user in ('authenticated', 'anon')
      or coalesce(public.jwt_role(), '') in ('authenticated', 'anon');
$$;
