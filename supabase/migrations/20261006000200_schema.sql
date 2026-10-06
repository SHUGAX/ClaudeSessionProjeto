-- =============================================================================
-- Core schema.
-- All tenant-owned tables carry organization_id directly so that Row Level
-- Security policies are simple, uniform and index-friendly.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Plans (commercial configuration; prices live outside the system)
-- ---------------------------------------------------------------------------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_-]{2,40}$'),
  name text not null check (char_length(name) between 1 and 100),
  monthly_document_limit integer check (monthly_document_limit >= 0),
  monthly_ai_limit integer check (monthly_ai_limit >= 0),
  user_limit integer check (user_limit >= 0),
  storage_limit_bytes bigint check (storage_limit_bytes >= 0),
  features jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null check (email = lower(email)),
  full_name text check (char_length(full_name) <= 200),
  preferred_language text not null default 'pt-PT' check (preferred_language in ('pt-PT', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (email);

-- Platform (SaaS) super administrators. Never writable by end users.
create table public.platform_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Organizations (tenants)
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  legal_name text check (char_length(legal_name) <= 300),
  tax_id text check (char_length(tax_id) <= 40),
  slug text not null unique
    check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,61})[a-z0-9]$' and slug !~ '--' and not public.is_reserved_slug(slug)),
  logo_path text check (char_length(logo_path) <= 500),
  status public.organization_status not null default 'active',
  plan_id uuid references public.plans (id) on delete set null,
  -- Per-organization overrides; null means "use the plan value", and a null plan value means unlimited.
  max_users integer check (max_users >= 0),
  max_documents_per_month integer check (max_documents_per_month >= 0),
  max_ai_calls_per_month integer check (max_ai_calls_per_month >= 0),
  max_storage_bytes bigint check (max_storage_bytes >= 0),
  suspended_at timestamptz,
  suspended_reason text check (char_length(suspended_reason) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index organizations_status_idx on public.organizations (status);

create table public.organization_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  default_currency char(3) not null default 'EUR' check (default_currency ~ '^[A-Z]{3}$'),
  default_language text not null default 'pt-PT' check (default_language in ('pt-PT', 'en')),
  timezone text not null default 'Europe/Lisbon' check (char_length(timezone) <= 64),
  due_soon_days integer not null default 7 check (due_soon_days between 1 and 90),
  brand_color text check (brand_color ~ '^#[0-9a-fA-F]{6}$'),
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Memberships (user <-> organization, many-to-many)
-- ---------------------------------------------------------------------------
create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'member',
  status public.membership_status not null default 'active',
  invited_by uuid references public.profiles (id) on delete set null,
  invited_at timestamptz,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id, status);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) between 3 and 320),
  role public.member_role not null default 'member',
  -- Only the SHA-256 hash of the token is stored; the token itself is only sent by email.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status public.invitation_status not null default 'pending',
  invited_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index invitations_one_pending_per_email
  on public.invitations (organization_id, email) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  code text check (char_length(code) <= 40),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);
create unique index categories_org_name_unique on public.categories (organization_id, lower(name));

-- ---------------------------------------------------------------------------
-- Suppliers
-- ---------------------------------------------------------------------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 300),
  legal_name text check (char_length(legal_name) <= 300),
  tax_id text check (char_length(tax_id) <= 40),
  tax_id_normalized text generated always as (public.normalize_tax_id(tax_id)) stored,
  tax_country char(2) check (tax_country ~ '^[A-Z]{2}$'),
  email text check (char_length(email) <= 320),
  phone text check (char_length(phone) <= 50),
  address text check (char_length(address) <= 500),
  iban text check (char_length(iban) <= 50),
  notes text check (char_length(notes) <= 2000),
  default_category_id uuid,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  -- The category must belong to the same organization.
  foreign key (default_category_id, organization_id)
    references public.categories (id, organization_id) on delete set null (default_category_id)
);
-- Supplier tax IDs are unique per organization (not globally).
create unique index suppliers_org_tax_id_unique
  on public.suppliers (organization_id, tax_id_normalized) where tax_id_normalized is not null;
create index suppliers_org_name_idx on public.suppliers (organization_id, lower(name));
create index suppliers_name_trgm_idx on public.suppliers using gin (name extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  document_type public.document_type not null default 'invoice',
  status public.document_status not null default 'uploading',
  processing_status public.processing_status not null default 'pending',
  review_status public.review_status not null default 'pending',

  -- Original file (never replaced by AI output)
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  storage_path text not null unique check (char_length(storage_path) <= 500),
  mime_type text check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/tiff')),
  file_size bigint check (file_size >= 0),
  file_sha256 text check (file_sha256 ~ '^[0-9a-f]{64}$'),

  -- Canonical business data (AI suggestion until validated by a human)
  supplier_id uuid,
  supplier_name text check (char_length(supplier_name) <= 300),
  supplier_tax_id text check (char_length(supplier_tax_id) <= 40),
  supplier_tax_id_normalized text generated always as (public.normalize_tax_id(supplier_tax_id)) stored,
  document_number text check (char_length(document_number) <= 100),
  document_number_normalized text generated always as (public.normalize_document_number(document_number)) stored,
  issue_date date,
  due_date date,
  currency char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  subtotal numeric(18, 4),
  tax_total numeric(18, 4),
  total numeric(18, 4),
  payment_reference text check (char_length(payment_reference) <= 100),
  iban text check (char_length(iban) <= 50),
  purchase_order text check (char_length(purchase_order) <= 100),
  category_id uuid,
  notes text check (char_length(notes) <= 4000),
  paid_at date,

  -- Processing / validation metadata
  current_extraction_id uuid,
  possible_duplicate_of uuid references public.documents (id) on delete set null,
  validation_issues jsonb not null default '[]'::jsonb check (jsonb_typeof(validation_issues) = 'array'),
  processing_started_at timestamptz,
  processing_error text check (char_length(processing_error) <= 100),

  uploaded_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  validated_by uuid references public.profiles (id) on delete set null,
  validated_at timestamptz,
  archived_by uuid references public.profiles (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (id, organization_id),
  foreign key (supplier_id, organization_id)
    references public.suppliers (id, organization_id) on delete set null (supplier_id),
  foreign key (category_id, organization_id)
    references public.categories (id, organization_id) on delete set null (category_id)
);
create index documents_org_created_idx on public.documents (organization_id, created_at desc);
create index documents_org_status_idx on public.documents (organization_id, status);
create index documents_org_issue_date_idx on public.documents (organization_id, issue_date);
create index documents_org_due_date_idx on public.documents (organization_id, due_date) where due_date is not null;
create index documents_org_supplier_idx on public.documents (organization_id, supplier_id);
create index documents_org_category_idx on public.documents (organization_id, category_id);
create index documents_org_hash_idx on public.documents (organization_id, file_sha256);
create index documents_org_dup_idx
  on public.documents (organization_id, document_number_normalized, supplier_tax_id_normalized);
create index documents_supplier_name_trgm_idx on public.documents using gin (supplier_name extensions.gin_trgm_ops);
create index documents_number_trgm_idx on public.documents using gin (document_number extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- AI extractions (append-only history; never overwritten)
-- ---------------------------------------------------------------------------
create table public.document_extractions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  document_id uuid not null,
  provider text not null check (char_length(provider) <= 50),
  model text not null check (char_length(model) <= 100),
  prompt_version text not null check (char_length(prompt_version) <= 50),
  schema_version text not null check (char_length(schema_version) <= 50),
  status text not null check (status in ('success', 'error')),
  raw_response jsonb,
  structured_data jsonb,
  confidence jsonb,
  error_code text check (char_length(error_code) <= 100),
  error_message text check (char_length(error_message) <= 1000),
  processing_duration_ms integer check (processing_duration_ms >= 0),
  input_tokens integer,
  output_tokens integer,
  triggered_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (document_id, organization_id)
    references public.documents (id, organization_id) on delete cascade
);
create index document_extractions_doc_idx on public.document_extractions (document_id, created_at desc);
create index document_extractions_org_idx on public.document_extractions (organization_id, created_at desc);

alter table public.documents
  add constraint documents_current_extraction_fk
  foreign key (current_extraction_id) references public.document_extractions (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Line items
-- ---------------------------------------------------------------------------
create table public.document_line_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  document_id uuid not null,
  position integer not null check (position >= 0),
  description text check (char_length(description) <= 1000),
  quantity numeric(18, 6),
  unit_price numeric(18, 6),
  tax_rate numeric(7, 4) check (tax_rate between 0 and 100),
  tax_amount numeric(18, 4),
  line_total numeric(18, 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (document_id, organization_id)
    references public.documents (id, organization_id) on delete cascade
);
create index document_line_items_doc_idx on public.document_line_items (document_id, position);

-- ---------------------------------------------------------------------------
-- Validation events (append-only)
-- ---------------------------------------------------------------------------
create table public.document_validation_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  document_id uuid not null,
  source text not null check (source in ('extraction', 'review_save', 'validation')),
  issues jsonb not null default '[]'::jsonb,
  error_count integer not null default 0,
  warning_count integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (document_id, organization_id)
    references public.documents (id, organization_id) on delete cascade
);
create index document_validation_events_doc_idx on public.document_validation_events (document_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Status history (append-only, filled by trigger)
-- ---------------------------------------------------------------------------
create table public.document_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  document_id uuid not null,
  from_status public.document_status,
  to_status public.document_status not null,
  changed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (document_id, organization_id)
    references public.documents (id, organization_id) on delete cascade
);
create index document_status_history_doc_idx on public.document_status_history (document_id, created_at);

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  -- Null for platform-level events (e.g. platform admin actions not tied to a tenant).
  organization_id uuid references public.organizations (id) on delete cascade,
  actor_user_id uuid references public.profiles (id) on delete set null,
  actor_type text not null default 'user' check (actor_type in ('user', 'system', 'platform_admin')),
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  entity_type text not null check (char_length(entity_type) <= 50),
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_org_created_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Alerts
-- ---------------------------------------------------------------------------
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  type public.alert_type not null,
  document_id uuid,
  dedupe_key text not null,
  status public.alert_status not null default 'open',
  due_date date,
  dismissed_by uuid references public.profiles (id) on delete set null,
  dismissed_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, dedupe_key),
  foreign key (document_id, organization_id)
    references public.documents (id, organization_id) on delete cascade
);
create index alerts_org_status_idx on public.alerts (organization_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- Usage counters (per organization per calendar month, UTC)
-- ---------------------------------------------------------------------------
create table public.organization_usage (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  period date not null check (extract(day from period) = 1),
  documents_uploaded integer not null default 0,
  documents_processed integer not null default 0,
  ai_calls integer not null default 0,
  ai_failures integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (organization_id, period)
);

-- ---------------------------------------------------------------------------
-- Rate limiting buckets (server-side only)
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  key text primary key check (char_length(key) <= 200),
  window_start timestamptz not null,
  count integer not null
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger set_updated_at before update on public.plans for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.organizations for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.organization_settings for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.organization_members for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.invitations for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.categories for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.suppliers for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.documents for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.document_line_items for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.alerts for each row execute function public.set_updated_at();

-- Append-only tables
create trigger prevent_update before update on public.audit_logs for each row execute function public.prevent_update();
create trigger prevent_update before update on public.document_extractions for each row execute function public.prevent_update();
create trigger prevent_update before update on public.document_status_history for each row execute function public.prevent_update();
create trigger prevent_update before update on public.document_validation_events for each row execute function public.prevent_update();
