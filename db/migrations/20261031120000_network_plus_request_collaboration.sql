-- Increment 6: typed Network-Plus requests and accepted-engagement workspaces.
-- Additive only. Existing Serve-Community, mentorship, Jobs and legacy service requests remain unchanged.
create table if not exists network_plus_request (
  id uuid primary key default gen_random_uuid(),
  intent text not null check (intent in ('service_request','supplier_inquiry','referral','expertise_request','partnership_proposal','collaboration_request')),
  status text not null default 'draft' check (status in ('draft','submitted','under_review','clarification_requested','accepted','declined','withdrawn','in_progress','completed','disputed','closed')),
  requester_user_id uuid not null references app_user(id) on delete restrict,
  recipient_user_id uuid references app_user(id) on delete restrict,
  recipient_organization_id uuid references organization(id) on delete restrict,
  business_id uuid references network_plus_business(id) on delete restrict,
  service_listing_id uuid references network_plus_service_listing(id) on delete restrict,
  subject text not null check (length(trim(subject)) between 3 and 180),
  summary text not null check (length(trim(summary)) between 10 and 500),
  request_details jsonb not null default '{}'::jsonb,
  terms jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  withdrawn_at timestamptz,
  completed_at timestamptz,
  closed_at timestamptz,
  disputed_at timestamptz,
  idempotency_hash text,
  request_fingerprint text,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((recipient_user_id is not null)::int + (recipient_organization_id is not null)::int = 1),
  check (jsonb_typeof(request_details)='object' and jsonb_typeof(terms)='object'),
  check (status not in ('accepted','in_progress','completed','disputed') or accepted_at is not null),
  check (status<>'completed' or completed_at is not null),
  check (status<>'withdrawn' or withdrawn_at is not null)
);
create unique index if not exists ux_network_plus_request_idempotency on network_plus_request(requester_user_id,idempotency_hash) where idempotency_hash is not null;
create index if not exists ix_network_plus_request_requester on network_plus_request(requester_user_id,status,updated_at desc);
create index if not exists ix_network_plus_request_recipient_user on network_plus_request(recipient_user_id,status,updated_at desc) where recipient_user_id is not null;
create index if not exists ix_network_plus_request_recipient_org on network_plus_request(recipient_organization_id,status,updated_at desc) where recipient_organization_id is not null;
create index if not exists ix_network_plus_request_business on network_plus_request(business_id,created_at desc) where business_id is not null;

create table if not exists network_plus_request_participant (
  request_id uuid not null references network_plus_request(id) on delete restrict,
  user_id uuid not null references app_user(id) on delete restrict,
  participant_role text not null check (participant_role in ('requester','recipient_representative','additional_participant')),
  consent_status text not null default 'pending' check (consent_status in ('pending','accepted','declined','revoked')),
  consented_at timestamptz,
  added_by uuid not null references app_user(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(request_id,user_id),
  check ((consent_status='accepted' and consented_at is not null) or consent_status<>'accepted')
);
create index if not exists ix_network_plus_request_participant_user on network_plus_request_participant(user_id,request_id);

create table if not exists network_plus_request_event (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references network_plus_request(id) on delete restrict,
  actor_user_id uuid not null references app_user(id) on delete restrict,
  event_code text not null,
  from_status text,
  to_status text,
  reason text,
  request_id_header text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ix_network_plus_request_event_history on network_plus_request_event(request_id,created_at);

-- A workspace is a consequence of recipient acceptance, never of submission.
create table if not exists network_plus_collaboration_workspace (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references network_plus_request(id) on delete restrict,
  status text not null default 'active' check (status in ('active','blocked','disputed','completed','closed')),
  purpose text not null check (length(trim(purpose)) between 3 and 2000),
  scope text not null check (length(trim(scope)) between 3 and 5000),
  timeline jsonb not null default '{}'::jsonb,
  created_by uuid not null references app_user(id) on delete restrict,
  accepted_at timestamptz not null,
  completed_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(timeline)='object')
);
create table if not exists network_plus_collaboration_milestone (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references network_plus_collaboration_workspace(id) on delete restrict,
  title text not null check (length(trim(title)) between 2 and 180),
  description text,
  owner_user_id uuid references app_user(id) on delete restrict,
  due_at timestamptz,
  status text not null default 'not_started' check (status in ('not_started','in_progress','blocked','completed','cancelled')),
  completion_evidence jsonb not null default '[]'::jsonb,
  created_by uuid not null references app_user(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(completion_evidence)='array')
);
create index if not exists ix_network_plus_milestone_workspace on network_plus_collaboration_milestone(workspace_id,status,due_at);
create table if not exists network_plus_collaboration_event (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references network_plus_collaboration_workspace(id) on delete restrict,
  actor_user_id uuid not null references app_user(id) on delete restrict,
  event_type text not null check (event_type in ('update','blocker','decision','outcome','milestone')),
  title text not null check (length(trim(title)) between 2 and 180),
  body text not null check (length(trim(body)) between 2 and 4000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(metadata)='object')
);
create index if not exists ix_network_plus_collaboration_event on network_plus_collaboration_event(workspace_id,created_at desc);

comment on table network_plus_request is 'Private typed Network-Plus request lifecycle. Submission is not acceptance or an agreement.';
comment on table network_plus_request_participant is 'Explicit participant membership and consent for a private request.';
comment on table network_plus_collaboration_workspace is 'Created only in the same transaction as explicit recipient acceptance.';
comment on table network_plus_collaboration_milestone is 'Participant-visible milestone tracking for accepted engagements.';
comment on table network_plus_collaboration_event is 'Participant-visible updates, blockers, decisions and outcomes; immutable history.';
