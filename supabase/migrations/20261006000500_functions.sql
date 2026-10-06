-- =============================================================================
-- Business functions: usage counters, rate limiting, alerts, dashboard metrics.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Usage counters (service role only)
-- ---------------------------------------------------------------------------
create or replace function public.increment_usage(
  p_org uuid,
  p_documents_uploaded integer default 0,
  p_documents_processed integer default 0,
  p_ai_calls integer default 0,
  p_ai_failures integer default 0
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.organization_usage as u
    (organization_id, period, documents_uploaded, documents_processed, ai_calls, ai_failures)
  values (
    p_org,
    date_trunc('month', now() at time zone 'utc')::date,
    p_documents_uploaded, p_documents_processed, p_ai_calls, p_ai_failures
  )
  on conflict (organization_id, period) do update set
    documents_uploaded = u.documents_uploaded + excluded.documents_uploaded,
    documents_processed = u.documents_processed + excluded.documents_processed,
    ai_calls = u.ai_calls + excluded.ai_calls,
    ai_failures = u.ai_failures + excluded.ai_failures,
    updated_at = now();
$$;

-- Effective limits and current consumption for an organization.
-- Null limit = unlimited. Organization overrides take precedence over the plan.
create or replace function public.organization_limits(p_org uuid)
returns table (
  max_users integer,
  max_documents_per_month integer,
  max_ai_calls_per_month integer,
  max_storage_bytes bigint,
  active_users integer,
  pending_invitations integer,
  documents_this_month integer,
  ai_calls_this_month integer,
  storage_bytes bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(o.max_users, p.user_limit),
    coalesce(o.max_documents_per_month, p.monthly_document_limit),
    coalesce(o.max_ai_calls_per_month, p.monthly_ai_limit),
    coalesce(o.max_storage_bytes, p.storage_limit_bytes),
    (select count(*)::integer from public.organization_members m
      where m.organization_id = o.id and m.status = 'active'),
    (select count(*)::integer from public.invitations i
      where i.organization_id = o.id and i.status = 'pending' and i.expires_at > now()),
    coalesce((select u.documents_uploaded from public.organization_usage u
      where u.organization_id = o.id and u.period = date_trunc('month', now() at time zone 'utc')::date), 0),
    coalesce((select u.ai_calls from public.organization_usage u
      where u.organization_id = o.id and u.period = date_trunc('month', now() at time zone 'utc')::date), 0),
    coalesce((select sum(d.file_size)::bigint from public.documents d where d.organization_id = o.id), 0)
  from public.organizations o
  left join public.plans p on p.id = o.plan_id
  where o.id = p_org
    and (
      -- Callable by the service role, platform admins, or members of the organization.
      not public.is_end_user_request()
      or public.is_platform_admin()
      or p_org in (select public.user_org_ids())
    );
$$;

-- ---------------------------------------------------------------------------
-- Fixed-window rate limiter (service role only). Returns true when allowed.
-- ---------------------------------------------------------------------------
create or replace function public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update set
    count = case
      when r.window_start < now() - make_interval(secs => p_window_seconds) then 1
      else r.count + 1
    end,
    window_start = case
      when r.window_start < now() - make_interval(secs => p_window_seconds) then now()
      else r.window_start
    end
  returning count into v_count;

  -- Opportunistic cleanup of stale buckets.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_count <= p_max;
end;
$$;

-- ---------------------------------------------------------------------------
-- Alerts. Idempotent; can be called after each relevant change and/or from a
-- scheduled job (pg_cron / Vercel Cron) with p_org = null for all tenants.
-- ---------------------------------------------------------------------------
create or replace function public.refresh_alerts(p_org uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Europe/Lisbon')::date;
  v_count integer := 0;
begin
  if public.is_end_user_request()
     and (p_org is null or p_org not in (select public.user_org_ids())) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  create temporary table if not exists _wanted_alerts (
    organization_id uuid,
    type public.alert_type,
    document_id uuid,
    due_date date,
    dedupe_key text
  ) on commit drop;
  truncate _wanted_alerts;

  insert into _wanted_alerts
  -- Due soon / overdue: validated, unpaid documents with a due date.
  select d.organization_id,
         case when d.due_date < v_today then 'overdue'::public.alert_type else 'due_soon'::public.alert_type end,
         d.id,
         d.due_date,
         (case when d.due_date < v_today then 'overdue:' else 'due_soon:' end) || d.id || ':' || d.due_date
  from public.documents d
  join public.organizations o on o.id = d.organization_id and o.status = 'active'
  left join public.organization_settings s on s.organization_id = d.organization_id
  where (p_org is null or d.organization_id = p_org)
    and d.status = 'validated'
    and d.paid_at is null
    and d.document_type in ('invoice', 'receipt', 'other')
    and d.due_date is not null
    and d.due_date <= v_today + coalesce(s.due_soon_days, 7)
  union all
  select d.organization_id, 'review_required', d.id, null, 'review_required:' || d.id
  from public.documents d
  join public.organizations o on o.id = d.organization_id and o.status = 'active'
  where (p_org is null or d.organization_id = p_org) and d.status = 'review_required'
  union all
  select d.organization_id, 'possible_duplicate', d.id, null, 'possible_duplicate:' || d.id || ':' || d.possible_duplicate_of
  from public.documents d
  join public.organizations o on o.id = d.organization_id and o.status = 'active'
  where (p_org is null or d.organization_id = p_org)
    and d.possible_duplicate_of is not null
    and d.status not in ('archived')
  union all
  select d.organization_id, 'processing_failed', d.id, null, 'processing_failed:' || d.id
  from public.documents d
  join public.organizations o on o.id = d.organization_id and o.status = 'active'
  where (p_org is null or d.organization_id = p_org) and d.status = 'failed';

  insert into public.alerts (organization_id, type, document_id, due_date, dedupe_key, status)
  select w.organization_id, w.type, w.document_id, w.due_date, w.dedupe_key, 'open'
  from _wanted_alerts w
  on conflict (organization_id, dedupe_key) do update
    set status = case when public.alerts.status = 'resolved' then 'open'::public.alert_status else public.alerts.status end,
        resolved_at = case when public.alerts.status = 'resolved' then null else public.alerts.resolved_at end;
  get diagnostics v_count = row_count;

  update public.alerts a
  set status = 'resolved', resolved_at = now()
  where (p_org is null or a.organization_id = p_org)
    and a.status = 'open'
    and not exists (
      select 1 from _wanted_alerts w
      where w.organization_id = a.organization_id and w.dedupe_key = a.dedupe_key
    );

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dashboard metrics (SECURITY INVOKER: RLS applies to every query inside).
-- Only validated documents count towards financial figures; amounts are
-- summed for the organization's default currency only.
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_metrics(p_org uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with settings as (
    select coalesce((select default_currency from public.organization_settings where organization_id = p_org), 'EUR') as currency,
           coalesce((select due_soon_days from public.organization_settings where organization_id = p_org), 7) as due_soon_days,
           (now() at time zone 'Europe/Lisbon')::date as today
  ),
  docs as (
    select d.*,
           case when d.document_type = 'credit_note' then -abs(d.total) else d.total end as signed_total
    from public.documents d
    where d.organization_id = p_org and d.status <> 'archived'
  ),
  money_docs as (
    select d.* from docs d, settings s
    where d.status = 'validated' and d.currency = s.currency and d.total is not null
      and d.document_type in ('invoice', 'receipt', 'credit_note', 'other')
  )
  select jsonb_build_object(
    'currency', (select currency from settings),
    'documents_this_month', (
      select count(*) from docs d, settings s
      where d.created_at >= date_trunc('month', s.today)),
    'amount_this_month', (
      select coalesce(sum(signed_total), 0) from money_docs d, settings s
      where d.issue_date >= date_trunc('month', s.today)::date),
    'requiring_review', (select count(*) from docs where status = 'review_required'),
    'failed', (select count(*) from docs where status = 'failed'),
    'possible_duplicates', (
      select count(*) from docs where possible_duplicate_of is not null and status <> 'validated'),
    'due_next_days', (
      select count(*) from money_docs d, settings s
      where d.paid_at is null and d.due_date between s.today and s.today + s.due_soon_days),
    'due_next_days_amount', (
      select coalesce(sum(signed_total), 0) from money_docs d, settings s
      where d.paid_at is null and d.due_date between s.today and s.today + s.due_soon_days),
    'overdue', (
      select count(*) from money_docs d, settings s where d.paid_at is null and d.due_date < s.today),
    'overdue_amount', (
      select coalesce(sum(signed_total), 0) from money_docs d, settings s
      where d.paid_at is null and d.due_date < s.today),
    'due_soon_days', (select due_soon_days from settings),
    'by_month', (
      select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m.month, 'YYYY-MM'), 'total', coalesce(t.total, 0)) order by m.month), '[]'::jsonb)
      from (
        select generate_series(date_trunc('month', s.today) - interval '11 months', date_trunc('month', s.today), interval '1 month')::date as month
        from settings s
      ) m
      left join (
        select date_trunc('month', issue_date)::date as month, sum(signed_total) as total
        from money_docs where issue_date is not null group by 1
      ) t on t.month = m.month),
    'by_supplier', (
      select coalesce(jsonb_agg(x order by (x ->> 'total')::numeric desc), '[]'::jsonb)
      from (
        select jsonb_build_object('id', supplier_id, 'name', coalesce(max(supplier_name), '—'), 'total', sum(signed_total)) as x
        from money_docs d, settings s
        where d.issue_date >= date_trunc('year', s.today)::date
        group by supplier_id
        order by sum(signed_total) desc
        limit 8
      ) q),
    'by_category', (
      select coalesce(jsonb_agg(x order by (x ->> 'total')::numeric desc), '[]'::jsonb)
      from (
        select jsonb_build_object('id', d.category_id, 'name', c.name, 'total', sum(d.signed_total)) as x
        from money_docs d
        cross join settings s
        left join public.categories c on c.id = d.category_id
        where d.issue_date >= date_trunc('year', s.today)::date
        group by d.category_id, c.name
        order by sum(d.signed_total) desc
        limit 8
      ) q)
  )
  where p_org in (select public.user_org_ids());
$$;

-- Supplier totals (SECURITY INVOKER).
create or replace function public.supplier_summaries(p_org uuid)
returns table (supplier_id uuid, document_count bigint, total_amount numeric, last_issue_date date)
language sql
stable
security invoker
set search_path = ''
as $$
  select d.supplier_id,
         count(*),
         coalesce(sum(case when d.document_type = 'credit_note' then -abs(d.total) else d.total end)
                  filter (where d.status = 'validated'), 0),
         max(d.issue_date)
  from public.documents d
  where d.organization_id = p_org and d.supplier_id is not null and d.status <> 'archived'
  group by d.supplier_id;
$$;

-- ---------------------------------------------------------------------------
-- Platform statistics (service role only; used by the SaaS admin area).
-- ---------------------------------------------------------------------------
create or replace function public.platform_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'organizations', (select count(*) from public.organizations),
    'active_organizations', (select count(*) from public.organizations where status = 'active'),
    'users', (select count(*) from public.profiles),
    'documents', (select count(*) from public.documents),
    'documents_this_month', (
      select count(*) from public.documents where created_at >= date_trunc('month', now() at time zone 'utc')),
    'extractions_success_30d', (
      select count(*) from public.document_extractions
      where status = 'success' and created_at >= now() - interval '30 days'),
    'extractions_error_30d', (
      select count(*) from public.document_extractions
      where status = 'error' and created_at >= now() - interval '30 days')
  );
$$;

create or replace function public.organization_overview()
returns table (
  id uuid,
  name text,
  slug text,
  status public.organization_status,
  plan_name text,
  created_at timestamptz,
  member_count bigint,
  document_count bigint,
  storage_bytes bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.name, o.slug, o.status, p.name, o.created_at,
         (select count(*) from public.organization_members m where m.organization_id = o.id and m.status = 'active'),
         (select count(*) from public.documents d where d.organization_id = o.id),
         coalesce((select sum(d.file_size)::bigint from public.documents d where d.organization_id = o.id), 0)
  from public.organizations o
  left join public.plans p on p.id = o.plan_id
  order by o.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Privileges for the functions defined in this migration.
-- ---------------------------------------------------------------------------
revoke all on function public.increment_usage(uuid, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.organization_limits(uuid) from public, anon;
revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.refresh_alerts(uuid) from public, anon;
revoke all on function public.dashboard_metrics(uuid) from public, anon;
revoke all on function public.supplier_summaries(uuid) from public, anon;
revoke all on function public.platform_stats() from public, anon, authenticated;
revoke all on function public.organization_overview() from public, anon, authenticated;

grant execute on function public.increment_usage(uuid, integer, integer, integer, integer) to service_role;
grant execute on function public.organization_limits(uuid) to authenticated, service_role;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
grant execute on function public.refresh_alerts(uuid) to authenticated, service_role;
grant execute on function public.dashboard_metrics(uuid) to authenticated, service_role;
grant execute on function public.supplier_summaries(uuid) to authenticated, service_role;
grant execute on function public.platform_stats() to service_role;
grant execute on function public.organization_overview() to service_role;
