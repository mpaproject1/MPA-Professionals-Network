-- Network-Plus Increment 5: additive Business Discovery domain.
-- Canonical app_user and organization identities remain the only identity records.
-- Existing service_listing/service_request rows are intentionally untouched.
-- No backfill, conversion, production execution, or implicit owner assignment.

create table if not exists network_plus_business (
  id uuid primary key default gen_random_uuid(),
  business_kind text not null check (business_kind in ('individual','organization','joint')),
  display_name text not null check (length(trim(display_name)) between 2 and 160),
  trading_name text,
  description text not null check (length(trim(description)) between 20 and 5000),
  website text,
  geography_reference_item_id uuid references reference_item(id) on delete restrict,
  location_label text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','submitted','under_review','changes_requested','verified','rejected','suspended','expired')),
  moderation_status text not null default 'not_submitted'
    check (moderation_status in ('not_submitted','pending_review','approved','rejected','suspended')),
  publication_status text not null default 'draft'
    check (publication_status in ('draft','published','paused','suspended','archived')),
  verified_at timestamptz,
  verification_expires_at timestamptz,
  verified_by uuid references app_user(id) on delete restrict,
  created_by uuid not null references app_user(id) on delete restrict,
  request_idempotency_hash text,
  request_fingerprint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (website is null or website ~* '^https://[^[:space:]]+$')
);
create unique index if not exists ux_network_plus_business_idempotency_hash
  on network_plus_business(request_idempotency_hash)
  where request_idempotency_hash is not null;
create index if not exists ix_network_plus_business_discovery
  on network_plus_business (display_name, created_at desc)
  where publication_status='published' and verification_status='verified' and moderation_status='approved';

create table if not exists network_plus_business_ownership (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references network_plus_business(id) on delete restrict,
  owner_type text not null check (owner_type in ('member','organization')),
  owner_user_id uuid references app_user(id) on delete restrict,
  owner_organization_id uuid references organization(id) on delete restrict,
  owner_role text not null check (owner_role in ('primary_owner','co_owner')),
  consent_status text not null default 'pending' check (consent_status in ('pending','accepted','declined','withdrawn','disputed')),
  status text not null default 'pending' check (status in ('pending','active','suspended','removed')),
  consented_at timestamptz,
  created_by uuid not null references app_user(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (owner_type='member' and owner_user_id is not null and owner_organization_id is null)
    or (owner_type='organization' and owner_organization_id is not null and owner_user_id is null)
  ),
  check ((consent_status='accepted' and consented_at is not null) or consent_status<>'accepted')
);
create unique index if not exists ux_network_plus_business_member_owner
  on network_plus_business_ownership(business_id,owner_user_id)
  where owner_type='member' and status in ('pending','active');
create unique index if not exists ux_network_plus_business_org_owner
  on network_plus_business_ownership(business_id,owner_organization_id)
  where owner_type='organization' and status in ('pending','active');
create unique index if not exists ux_network_plus_business_primary_owner
  on network_plus_business_ownership(business_id)
  where owner_role='primary_owner' and status in ('pending','active');
create index if not exists ix_network_plus_business_owner_user
  on network_plus_business_ownership(owner_user_id,business_id,status)
  where owner_type='member';

-- Operational delegation is separate from legal ownership. No organization role
-- grants these capabilities automatically; every assignment is business-scoped.
create table if not exists network_plus_business_access (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references network_plus_business(id) on delete restrict,
  user_id uuid not null references app_user(id) on delete restrict,
  capability_code text not null check (capability_code in ('business.manage_listing','business.respond_requests','business.accept_terms')),
  granted_by uuid not null references app_user(id) on delete restrict,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique(business_id,user_id,capability_code),
  check (expires_at is null or expires_at>created_at)
);
create index if not exists ix_network_plus_business_access_user
  on network_plus_business_access(user_id,business_id,capability_code)
  where revoked_at is null;

create table if not exists network_plus_business_verification_case (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references network_plus_business(id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft','submitted','under_review','changes_requested','verified','rejected','suspended','appealed','closed')),
  submitted_by uuid not null references app_user(id) on delete restrict,
  reviewer_user_id uuid references app_user(id) on delete restrict,
  decision_reason text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reviewer_user_id is null or reviewer_user_id<>submitted_by)
);
create index if not exists ix_network_plus_business_verification_queue
  on network_plus_business_verification_case(status,submitted_at)
  where status in ('submitted','under_review','appealed');

create table if not exists network_plus_business_verification_evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references network_plus_business_verification_case(id) on delete restrict,
  file_object_id uuid not null references file_object(id) on delete restrict,
  evidence_type text not null check (length(trim(evidence_type)) between 2 and 80),
  note text,
  created_by uuid not null references app_user(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(case_id,file_object_id)
);

create table if not exists network_plus_service_listing (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references network_plus_business(id) on delete restrict,
  created_by uuid not null references app_user(id) on delete restrict,
  title text not null check (length(trim(title)) between 3 and 160),
  summary text not null check (length(trim(summary)) between 20 and 500),
  description text not null check (length(trim(description)) between 40 and 8000),
  service_category text not null check (length(trim(service_category)) between 2 and 100),
  audience text not null default 'members' check (audience in ('members','organizations','both')),
  delivery_mode text not null default 'remote' check (delivery_mode in ('remote','onsite','hybrid')),
  location_label text,
  capacity integer check (capacity is null or capacity between 1 and 100000),
  pricing_model text not null default 'quote' check (pricing_model in ('free','fixed','hourly','quote')),
  price_amount numeric(14,2) check (price_amount is null or price_amount>=0),
  currency char(3),
  availability jsonb not null default '{}'::jsonb,
  credentials jsonb not null default '[]'::jsonb,
  status text not null default 'draft'
    check (status in ('draft','pending_review','changes_requested','published','paused','suspended','rejected','archived')),
  moderation_reason text,
  reviewed_by uuid references app_user(id) on delete restrict,
  reviewed_at timestamptz,
  published_at timestamptz,
  suspended_at timestamptz,
  suspension_reason text,
  expires_at timestamptz,
  request_idempotency_hash text,
  request_fingerprint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((pricing_model='free' and coalesce(price_amount,0)=0) or pricing_model<>'free'),
  check (pricing_model in ('free','quote') or (price_amount is not null and currency is not null)),
  check (currency is null or currency ~ '^[A-Z]{3}$'),
  check (jsonb_typeof(availability)='object'),
  check (jsonb_typeof(credentials)='array')
);
create unique index if not exists ux_network_plus_service_idempotency_hash
  on network_plus_service_listing(request_idempotency_hash)
  where request_idempotency_hash is not null;
create index if not exists ix_network_plus_service_discovery
  on network_plus_service_listing(status,service_category,created_at desc)
  where status='published';
create index if not exists ix_network_plus_service_business
  on network_plus_service_listing(business_id,status,created_at desc);

create table if not exists network_plus_business_event (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references network_plus_business(id) on delete restrict,
  actor_user_id uuid not null references app_user(id) on delete restrict,
  event_code text not null,
  from_status text,
  to_status text,
  reason text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ix_network_plus_business_event_history
  on network_plus_business_event(business_id,created_at desc);

create table if not exists network_plus_service_listing_event (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references network_plus_service_listing(id) on delete restrict,
  actor_user_id uuid not null references app_user(id) on delete restrict,
  event_code text not null,
  from_status text,
  to_status text,
  reason text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ix_network_plus_service_event_history
  on network_plus_service_listing_event(listing_id,created_at desc);

-- Register capabilities without granting them to any account. Direct assignments
-- remain governed by permissions.manage and independent reviewer appointment.
insert into app_permission(permission_code,area,label,description,sensitive,system_only) values
  ('business.verify','Network-Plus','Verify businesses','Review business verification evidence and decisions; conflicts and subject self-review are prohibited.',true,true),
  ('business.moderate','Network-Plus','Moderate business listings','Review business profiles and commercial service listings; creators cannot moderate their own submissions.',true,true)
on conflict(permission_code) do update set
  area=excluded.area,label=excluded.label,description=excluded.description,
  sensitive=excluded.sensitive,system_only=excluded.system_only;

comment on table network_plus_business is
  'Network-Plus commercial business identity; references canonical app_user/organization ownership and does not duplicate person or organization records.';
comment on table network_plus_business_ownership is
  'Explicit, consented legal/operating owner parties; member and organization identities remain canonical.';
comment on table network_plus_business_access is
  'Business-scoped operational delegation; organization roles do not grant business capabilities implicitly.';
comment on table network_plus_service_listing is
  'Commercial/professional listings for Network-Plus only; distinct from Serve-Community service_listing and its impact lifecycle.';
