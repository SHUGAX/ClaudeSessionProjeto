-- =============================================================================
-- Security: identity helpers, integrity guards and Row Level Security.
--
-- Isolation model: every tenant-owned row carries organization_id; a row is
-- visible only when auth.uid() has an ACTIVE membership in an ACTIVE
-- organization with that id. Write policies additionally check the role.
-- The service role (server-only) bypasses RLS and is used exclusively for
-- system writes (AI results, audit logs, usage counters, onboarding).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Identity helpers (SECURITY DEFINER so they can read memberships without
-- recursing into RLS; they only ever expose data about auth.uid()).
-- ---------------------------------------------------------------------------
create or replace function public.user_org_ids(p_roles public.member_role[] default null)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = auth.uid()
    and m.status = 'active'
    and o.status = 'active'
    and (p_roles is null or m.role = any (p_roles));
$$;

create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.user_org_ids() as ids(id) where ids.id = p_org);
$$;

create or replace function public.has_org_role(p_org uuid, p_roles public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.user_org_ids(p_roles) as ids(id) where ids.id = p_org);
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

-- Users that share at least one active organization with the caller.
create or replace function public.shares_org_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.user_id = p_user
      and m.organization_id in (select public.user_org_ids())
  );
$$;

-- Public tenant information used for branded login pages and safe error pages.
-- Exposes only display information, never data.
create or replace function public.get_tenant_public_info(p_slug text)
returns table (id uuid, name text, slug text, logo_path text, status public.organization_status)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.name, o.slug, o.logo_path, o.status
  from public.organizations o
  where o.slug = lower(p_slug);
$$;

-- Memberships of the caller with organization display data (used for the
-- organization selector; includes suspended organizations so the UI can explain).
create or replace function public.my_memberships()
returns table (
  organization_id uuid,
  organization_name text,
  organization_slug text,
  organization_status public.organization_status,
  logo_path text,
  role public.member_role
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.name, o.slug, o.status, o.logo_path, m.role
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = auth.uid() and m.status = 'active'
  order by o.name;
$$;

-- ---------------------------------------------------------------------------
-- Profile provisioning
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, preferred_language)
  values (
    new.id,
    lower(new.email),
    nullif(left(new.raw_user_meta_data ->> 'full_name', 200), ''),
    case when new.raw_user_meta_data ->> 'preferred_language' = 'en' then 'en' else 'pt-PT' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email and new.email is not null then
    update public.profiles set email = lower(new.email) where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- Profiles: users may only change display preferences.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_end_user_request() then
    if new.id is distinct from old.id or new.email is distinct from old.email
       or new.created_at is distinct from old.created_at then
      raise exception 'Only full_name and preferred_language can be changed' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger guard_profile_update before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------------
-- Organizations: tenant admins may edit display data only.
-- ---------------------------------------------------------------------------
create or replace function public.guard_organization_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_end_user_request() then
    if new.id is distinct from old.id
       or new.slug is distinct from old.slug
       or new.status is distinct from old.status
       or new.plan_id is distinct from old.plan_id
       or new.max_users is distinct from old.max_users
       or new.max_documents_per_month is distinct from old.max_documents_per_month
       or new.max_ai_calls_per_month is distinct from old.max_ai_calls_per_month
       or new.max_storage_bytes is distinct from old.max_storage_bytes
       or new.suspended_at is distinct from old.suspended_at
       or new.suspended_reason is distinct from old.suspended_reason
       or new.logo_path is distinct from old.logo_path
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Only platform administrators can change these organization fields'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger guard_organization_update before update on public.organizations
  for each row execute function public.guard_organization_update();

-- ---------------------------------------------------------------------------
-- Generic: tenant-owned rows can never move between organizations.
-- ---------------------------------------------------------------------------
create or replace function public.prevent_organization_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger prevent_organization_change before update on public.organization_settings
  for each row execute function public.prevent_organization_change();
create trigger prevent_organization_change before update on public.organization_members
  for each row execute function public.prevent_organization_change();
create trigger prevent_organization_change before update on public.invitations
  for each row execute function public.prevent_organization_change();
create trigger prevent_organization_change before update on public.categories
  for each row execute function public.prevent_organization_change();
create trigger prevent_organization_change before update on public.suppliers
  for each row execute function public.prevent_organization_change();
create trigger prevent_organization_change before update on public.documents
  for each row execute function public.prevent_organization_change();
create trigger prevent_organization_change before update on public.document_line_items
  for each row execute function public.prevent_organization_change();
create trigger prevent_organization_change before update on public.alerts
  for each row execute function public.prevent_organization_change();

-- ---------------------------------------------------------------------------
-- Memberships: role escalation and last-owner protection.
-- ---------------------------------------------------------------------------
create or replace function public.guard_membership_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_org uuid := coalesce(new.organization_id, old.organization_id);
  v_remaining_owners integer;
begin
  if public.is_end_user_request() then
    if tg_op = 'UPDATE' then
      if new.user_id is distinct from old.user_id or new.created_at is distinct from old.created_at then
        raise exception 'Membership identity is immutable' using errcode = '42501';
      end if;
      if old.user_id = auth.uid() and (new.role is distinct from old.role or new.status is distinct from old.status) then
        raise exception 'You cannot change your own membership' using errcode = '42501';
      end if;
    end if;
    -- Only owners can grant, change or remove the owner role.
    if (tg_op <> 'INSERT' and old.role = 'owner') or (tg_op <> 'DELETE' and new.role = 'owner') then
      if not public.has_org_role(v_org, array['owner']::public.member_role[]) then
        raise exception 'Only owners can manage owner memberships' using errcode = '42501';
      end if;
    end if;
  end if;

  -- Every organization keeps at least one active owner (applies to everyone).
  if tg_op in ('UPDATE', 'DELETE') and old.role = 'owner' and old.status = 'active' then
    select count(*) into v_remaining_owners
    from public.organization_members
    where organization_id = v_org and role = 'owner' and status = 'active' and id <> old.id;
    if v_remaining_owners = 0
       and (tg_op = 'DELETE' or new.role <> 'owner' or new.status <> 'active')
       and exists (select 1 from public.organizations where id = v_org) then
      raise exception 'An organization must keep at least one active owner' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger guard_membership_change before insert or update or delete on public.organization_members
  for each row execute function public.guard_membership_change();

-- ---------------------------------------------------------------------------
-- Documents: protect system-managed columns and enforce the state machine for
-- end users. System transitions (processing) are performed by the service role.
-- ---------------------------------------------------------------------------
create or replace function public.guard_document_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_end_user_request() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.storage_path is distinct from
       ('organizations/' || new.organization_id || '/documents/' || new.id || '/' ||
        regexp_replace(new.storage_path, '^.*/', '')) then
      raise exception 'Invalid storage path' using errcode = '42501';
    end if;
    if new.storage_path !~ '/original\.(pdf|jpg|png|tiff)$' then
      raise exception 'Invalid storage file name' using errcode = '42501';
    end if;
    new.status := 'uploading';
    new.processing_status := 'pending';
    new.review_status := 'pending';
    new.uploaded_by := auth.uid();
    new.updated_by := auth.uid();
    new.mime_type := null;
    new.file_size := null;
    new.file_sha256 := null;
    new.current_extraction_id := null;
    new.possible_duplicate_of := null;
    new.validated_by := null;
    new.validated_at := null;
    new.archived_by := null;
    new.archived_at := null;
    new.processing_started_at := null;
    new.processing_error := null;
    return new;
  end if;

  -- UPDATE
  if new.storage_path is distinct from old.storage_path
     or new.original_filename is distinct from old.original_filename
     or new.mime_type is distinct from old.mime_type
     or new.file_size is distinct from old.file_size
     or new.file_sha256 is distinct from old.file_sha256
     or new.uploaded_by is distinct from old.uploaded_by
     or new.created_at is distinct from old.created_at
     or new.current_extraction_id is distinct from old.current_extraction_id
     or new.processing_status is distinct from old.processing_status
     or new.processing_started_at is distinct from old.processing_started_at
     or new.processing_error is distinct from old.processing_error then
    raise exception 'System-managed document fields cannot be changed' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if old.status in ('uploading', 'uploaded', 'processing') and new.status <> 'archived' then
      raise exception 'Document is not ready for review' using errcode = '42501';
    end if;
    if new.status not in ('review_required', 'validated', 'archived') then
      raise exception 'Invalid status transition' using errcode = '42501';
    end if;
  end if;

  if new.status = 'validated' and old.status is distinct from 'validated' then
    new.review_status := 'validated';
    new.validated_by := auth.uid();
    new.validated_at := now();
  elsif new.validated_by is distinct from old.validated_by or new.validated_at is distinct from old.validated_at then
    raise exception 'Validation metadata is system-managed' using errcode = '42501';
  end if;

  if new.status = 'archived' and old.status is distinct from 'archived' then
    new.archived_by := auth.uid();
    new.archived_at := now();
  elsif new.status <> 'archived' and old.status = 'archived' then
    new.archived_by := null;
    new.archived_at := null;
  elsif new.archived_by is distinct from old.archived_by or new.archived_at is distinct from old.archived_at then
    raise exception 'Archive metadata is system-managed' using errcode = '42501';
  end if;

  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger guard_document_write before insert or update on public.documents
  for each row execute function public.guard_document_write();

-- Status history is written by the database itself, whoever changed the status.
create or replace function public.record_document_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.document_status_history (organization_id, document_id, from_status, to_status, changed_by)
    values (
      new.organization_id,
      new.id,
      case when tg_op = 'UPDATE' then old.status else null end,
      new.status,
      coalesce(auth.uid(), new.updated_by)
    );
  end if;
  return new;
end;
$$;

create trigger record_document_status after insert or update of status on public.documents
  for each row execute function public.record_document_status();

-- Alerts: end users may only dismiss.
create or replace function public.guard_alert_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_end_user_request() then
    if new.type is distinct from old.type or new.document_id is distinct from old.document_id
       or new.dedupe_key is distinct from old.dedupe_key or new.due_date is distinct from old.due_date
       or new.resolved_at is distinct from old.resolved_at or new.created_at is distinct from old.created_at
       or new.status <> 'dismissed' then
      raise exception 'Alerts can only be dismissed' using errcode = '42501';
    end if;
    new.dismissed_by := auth.uid();
    new.dismissed_at := now();
  end if;
  return new;
end;
$$;
create trigger guard_alert_update before update on public.alerts
  for each row execute function public.guard_alert_update();

-- Invitations: end users may only revoke.
create or replace function public.guard_invitation_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_end_user_request() then
    if new.email is distinct from old.email or new.role is distinct from old.role
       or new.token_hash is distinct from old.token_hash or new.expires_at is distinct from old.expires_at
       or new.accepted_at is distinct from old.accepted_at or new.accepted_by is distinct from old.accepted_by
       or new.invited_by is distinct from old.invited_by
       or old.status <> 'pending' or new.status <> 'revoked' then
      raise exception 'Invitations can only be revoked' using errcode = '42501';
    end if;
    new.revoked_at := now();
  end if;
  return new;
end;
$$;
create trigger guard_invitation_update before update on public.invitations
  for each row execute function public.guard_invitation_update();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.plans enable row level security;
alter table public.profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_settings enable row level security;
alter table public.organization_members enable row level security;
alter table public.invitations enable row level security;
alter table public.categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.documents enable row level security;
alter table public.document_extractions enable row level security;
alter table public.document_line_items enable row level security;
alter table public.document_validation_events enable row level security;
alter table public.document_status_history enable row level security;
alter table public.audit_logs enable row level security;
alter table public.alerts enable row level security;
alter table public.organization_usage enable row level security;
alter table public.rate_limits enable row level security;

-- Plans: readable by authenticated users (no secrets inside).
create policy plans_select on public.plans for select to authenticated using (true);

-- Profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_org_with(id));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Platform admins: a user may only see their own row (to know they are admin).
create policy platform_admins_select_own on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()));

-- Organizations
create policy organizations_select on public.organizations for select to authenticated
  using (id in (select public.user_org_ids()));
create policy organizations_update on public.organizations for update to authenticated
  using (id in (select public.user_org_ids(array['owner', 'admin']::public.member_role[])))
  with check (id in (select public.user_org_ids(array['owner', 'admin']::public.member_role[])));

-- Organization settings
create policy organization_settings_select on public.organization_settings for select to authenticated
  using (organization_id in (select public.user_org_ids()));
create policy organization_settings_update on public.organization_settings for update to authenticated
  using (organization_id in (select public.user_org_ids(array['owner', 'admin']::public.member_role[])))
  with check (organization_id in (select public.user_org_ids(array['owner', 'admin']::public.member_role[])));

-- Memberships (insert happens only through invitation acceptance on the server)
create policy organization_members_select on public.organization_members for select to authenticated
  using (organization_id in (select public.user_org_ids()));
create policy organization_members_update on public.organization_members for update to authenticated
  using (organization_id in (select public.user_org_ids(array['owner', 'admin']::public.member_role[])))
  with check (organization_id in (select public.user_org_ids(array['owner', 'admin']::public.member_role[])));
create policy organization_members_delete on public.organization_members for delete to authenticated
  using (organization_id in (select public.user_org_ids(array['owner', 'admin']::public.member_role[])));

-- Invitations (visible to and manageable by organization admins only)
create policy invitations_select on public.invitations for select to authenticated
  using (organization_id in (select public.user_org_ids(array['owner', 'admin']::public.member_role[])));
create policy invitations_insert on public.invitations for insert to authenticated
  with check (
    organization_id in (select public.user_org_ids(array['owner', 'admin']::public.member_role[]))
    and invited_by = (select auth.uid())
    and status = 'pending'
    and (role <> 'owner' or public.has_org_role(organization_id, array['owner']::public.member_role[]))
  );
create policy invitations_update on public.invitations for update to authenticated
  using (organization_id in (select public.user_org_ids(array['owner', 'admin']::public.member_role[])))
  with check (organization_id in (select public.user_org_ids(array['owner', 'admin']::public.member_role[])));

-- Categories
create policy categories_select on public.categories for select to authenticated
  using (organization_id in (select public.user_org_ids()));
create policy categories_insert on public.categories for insert to authenticated
  with check (organization_id in (select public.user_org_ids(array['owner', 'admin', 'manager']::public.member_role[])));
create policy categories_update on public.categories for update to authenticated
  using (organization_id in (select public.user_org_ids(array['owner', 'admin', 'manager']::public.member_role[])))
  with check (organization_id in (select public.user_org_ids(array['owner', 'admin', 'manager']::public.member_role[])));
create policy categories_delete on public.categories for delete to authenticated
  using (organization_id in (select public.user_org_ids(array['owner', 'admin', 'manager']::public.member_role[])));

-- Suppliers (members create them while reviewing; managers maintain them)
create policy suppliers_select on public.suppliers for select to authenticated
  using (organization_id in (select public.user_org_ids()));
create policy suppliers_insert on public.suppliers for insert to authenticated
  with check (organization_id in (select public.user_org_ids(array['owner', 'admin', 'manager', 'member']::public.member_role[])));
create policy suppliers_update on public.suppliers for update to authenticated
  using (organization_id in (select public.user_org_ids(array['owner', 'admin', 'manager']::public.member_role[])))
  with check (organization_id in (select public.user_org_ids(array['owner', 'admin', 'manager']::public.member_role[])));

-- Documents (no DELETE policy: business documents are archived, not deleted)
create policy documents_select on public.documents for select to authenticated
  using (organization_id in (select public.user_org_ids()));
create policy documents_insert on public.documents for insert to authenticated
  with check (organization_id in (select public.user_org_ids(array['owner', 'admin', 'manager', 'member']::public.member_role[])));
create policy documents_update on public.documents for update to authenticated
  using (organization_id in (select public.user_org_ids(array['owner', 'admin', 'manager', 'member']::public.member_role[])))
  with check (organization_id in (select public.user_org_ids(array['owner', 'admin', 'manager', 'member']::public.member_role[])));

-- Line items (editable together with the document during review)
create policy line_items_select on public.document_line_items for select to authenticated
  using (organization_id in (select public.user_org_ids()));
create policy line_items_insert on public.document_line_items for insert to authenticated
  with check (organization_id in (select public.user_org_ids(array['owner', 'admin', 'manager', 'member']::public.member_role[])));
create policy line_items_update on public.document_line_items for update to authenticated
  using (organization_id in (select public.user_org_ids(array['owner', 'admin', 'manager', 'member']::public.member_role[])))
  with check (organization_id in (select public.user_org_ids(array['owner', 'admin', 'manager', 'member']::public.member_role[])));
create policy line_items_delete on public.document_line_items for delete to authenticated
  using (organization_id in (select public.user_org_ids(array['owner', 'admin', 'manager', 'member']::public.member_role[])));

-- Read-only (for end users) system tables
create policy extractions_select on public.document_extractions for select to authenticated
  using (organization_id in (select public.user_org_ids()));
create policy validation_events_select on public.document_validation_events for select to authenticated
  using (organization_id in (select public.user_org_ids()));
create policy status_history_select on public.document_status_history for select to authenticated
  using (organization_id in (select public.user_org_ids()));

-- Audit logs: document history is visible to all members; the full log to admins.
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (
    organization_id in (select public.user_org_ids(array['owner', 'admin']::public.member_role[]))
    or (entity_type in ('document', 'supplier') and organization_id in (select public.user_org_ids()))
  );

-- Alerts
create policy alerts_select on public.alerts for select to authenticated
  using (organization_id in (select public.user_org_ids()));
create policy alerts_update on public.alerts for update to authenticated
  using (organization_id in (select public.user_org_ids(array['owner', 'admin', 'manager', 'member']::public.member_role[])))
  with check (organization_id in (select public.user_org_ids(array['owner', 'admin', 'manager', 'member']::public.member_role[])));

-- Usage: visible to organization admins.
create policy organization_usage_select on public.organization_usage for select to authenticated
  using (organization_id in (select public.user_org_ids(array['owner', 'admin']::public.member_role[])));

-- rate_limits: no policies at all (service role only).

-- ---------------------------------------------------------------------------
-- Grants. Explicit and minimal: anon gets nothing on tables; RLS still applies
-- to authenticated. The service role bypasses RLS.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant usage on schema public to anon, authenticated, service_role;

grant select on public.plans to authenticated;
grant select, update (full_name, preferred_language) on public.profiles to authenticated;
grant select on public.platform_admins to authenticated;
grant select, update (name, legal_name, tax_id) on public.organizations to authenticated;
grant select, update (default_currency, default_language, timezone, due_soon_days, brand_color, updated_by)
  on public.organization_settings to authenticated;
grant select, update (role, status), delete on public.organization_members to authenticated;
grant select, insert, update (status) on public.invitations to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update on public.suppliers to authenticated;
grant select, insert, update on public.documents to authenticated;
grant select, insert, update, delete on public.document_line_items to authenticated;
grant select on public.document_extractions to authenticated;
grant select on public.document_validation_events to authenticated;
grant select on public.document_status_history to authenticated;
grant select on public.audit_logs to authenticated;
grant select, update (status) on public.alerts to authenticated;
grant select on public.organization_usage to authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Functions callable by end users.
grant execute on function public.user_org_ids(public.member_role[]) to authenticated, service_role;
grant execute on function public.is_org_member(uuid) to authenticated, service_role;
grant execute on function public.has_org_role(uuid, public.member_role[]) to authenticated, service_role;
grant execute on function public.is_platform_admin() to authenticated, service_role;
grant execute on function public.shares_org_with(uuid) to authenticated, service_role;
grant execute on function public.my_memberships() to authenticated, service_role;
grant execute on function public.get_tenant_public_info(text) to anon, authenticated, service_role;
grant execute on function public.normalize_tax_id(text) to anon, authenticated, service_role;
grant execute on function public.normalize_document_number(text) to anon, authenticated, service_role;
grant execute on function public.is_reserved_slug(text) to anon, authenticated, service_role;
grant execute on function public.try_uuid(text) to authenticated, service_role;
grant execute on function public.is_end_user_request() to anon, authenticated, service_role;
grant execute on function public.jwt_role() to anon, authenticated, service_role;
-- Trigger functions run as part of the statement; they must be executable by the caller.
grant execute on function public.set_updated_at() to authenticated, service_role;
grant execute on function public.prevent_update() to authenticated, service_role;
grant execute on function public.prevent_organization_change() to authenticated, service_role;
grant execute on function public.guard_profile_update() to authenticated, service_role;
grant execute on function public.guard_organization_update() to authenticated, service_role;
grant execute on function public.guard_membership_change() to authenticated, service_role;
grant execute on function public.guard_document_write() to authenticated, service_role;
grant execute on function public.guard_alert_update() to authenticated, service_role;
grant execute on function public.guard_invitation_update() to authenticated, service_role;
grant execute on function public.record_document_status() to authenticated, service_role;
