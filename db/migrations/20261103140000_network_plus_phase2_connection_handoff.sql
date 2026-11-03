-- Network-Plus Phase 2: private connection requests, bilateral field consent and meeting handoff.
-- Additive only. Reuses network_plus_request, participants, event history and notification infrastructure.
alter table network_plus_request
  drop constraint if exists network_plus_request_intent_check,
  add constraint network_plus_request_intent_check check (intent in (
    'service_request','supplier_inquiry','referral','expertise_request',
    'partnership_proposal','collaboration_request','business_opportunity',
    'interest','question','quote_request','meeting_request'
  ));

create table if not exists network_plus_request_contact_consent (
  request_id uuid not null references network_plus_request(id) on delete restrict,
  recipient_user_id uuid not null references app_user(id) on delete restrict,
  field_code text not null check (field_code in ('email','phone','whatsapp','website','business_location')),
  requester_status text not null default 'pending' check (requester_status in ('pending','accepted','declined','revoked')),
  recipient_status text not null default 'pending' check (recipient_status in ('pending','accepted','declined','revoked')),
  requester_value_ciphertext text,
  recipient_value_ciphertext text,
  requester_consented_at timestamptz,
  recipient_consented_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(request_id,recipient_user_id,field_code),
  check ((requester_status='accepted' and requester_value_ciphertext is not null and requester_consented_at is not null) or requester_status<>'accepted'),
  check ((recipient_status='accepted' and recipient_value_ciphertext is not null and recipient_consented_at is not null) or recipient_status<>'accepted')
);
create index if not exists ix_network_plus_contact_consent_peer
  on network_plus_request_contact_consent(recipient_user_id,request_id,field_code);
comment on table network_plus_request_contact_consent is
  'Per-field bilateral contact release. Values are application-encrypted and returned only after both participants explicitly accept that field.';

create table if not exists network_plus_request_meeting (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references network_plus_request(id) on delete restrict,
  proposer_user_id uuid not null references app_user(id) on delete restrict,
  responder_user_id uuid not null references app_user(id) on delete restrict,
  status text not null default 'proposed' check (status in ('proposed','countered','confirmed','declined','cancelled')),
  place_type text not null check (place_type in ('office','coffee','online','other')),
  place_details text not null default '' check (length(place_details)<=500),
  starts_at timestamptz not null,
  timezone text not null,
  duration_minutes integer not null check (duration_minutes in (15,30,45,60,90,120)),
  counter_place_type text check (counter_place_type in ('office','coffee','online','other')),
  counter_place_details text check (counter_place_details is null or length(counter_place_details)<=500),
  counter_starts_at timestamptz,
  counter_timezone text,
  counter_duration_minutes integer check (counter_duration_minutes is null or counter_duration_minutes in (15,30,45,60,90,120)),
  confirmed_place_type text check (confirmed_place_type in ('office','coffee','online','other')),
  confirmed_place_details text,
  confirmed_starts_at timestamptz,
  confirmed_timezone text,
  confirmed_duration_minutes integer,
  confirmed_by uuid references app_user(id) on delete restrict,
  confirmed_at timestamptz,
  responded_by uuid references app_user(id) on delete restrict,
  responded_at timestamptz,
  idempotency_hash text not null,
  request_fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (responder_user_id<>proposer_user_id),
  check ((status='countered' and counter_place_type is not null and counter_starts_at is not null and counter_timezone is not null and counter_duration_minutes is not null and counter_duration_minutes in (15,30,45,60,90,120)) or status<>'countered'),
  check ((status='confirmed' and confirmed_place_type is not null and confirmed_at is not null and confirmed_by is not null and confirmed_starts_at is not null and confirmed_timezone is not null and confirmed_duration_minutes is not null and confirmed_duration_minutes in (15,30,45,60,90,120)) or status<>'confirmed')
);
create unique index if not exists ux_network_plus_request_meeting_active
  on network_plus_request_meeting(request_id) where status in ('proposed','countered');
create unique index if not exists ux_network_plus_request_meeting_idempotency
  on network_plus_request_meeting(request_id,proposer_user_id,idempotency_hash);
create index if not exists ix_network_plus_request_meeting_history
  on network_plus_request_meeting(request_id,created_at desc);
comment on table network_plus_request_meeting is
  'One-time participant-only meeting handoff. It records a proposal, one counterproposal and mutual confirmation; it is not a calendar or attendance system.';

create table if not exists network_plus_request_clarification (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references network_plus_request(id) on delete restrict,
  asked_by uuid not null references app_user(id) on delete restrict,
  answered_by uuid references app_user(id) on delete restrict,
  prompt_code text not null check (prompt_code in ('scope','budget','timeline','quantity','location','availability','eligibility','other')),
  question text not null check (length(trim(question)) between 3 and 1200),
  answer text check (answer is null or length(trim(answer)) between 3 and 2000),
  status text not null default 'open' check (status in ('open','answered','closed')),
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status='answered' and answer is not null and answered_by is not null and answered_at is not null) or status<>'answered')
);
create index if not exists ix_network_plus_request_clarification_open
  on network_plus_request_clarification(request_id,status,created_at desc);
comment on table network_plus_request_clarification is
  'Structured, private clarification exchanges attached to the canonical connection request; not a chat thread.';

