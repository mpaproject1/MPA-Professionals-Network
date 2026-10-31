-- Increment 7: isolated, reviewed public-benefit initiatives. No legacy rows are migrated or altered.
create table if not exists serve_community_initiative(
 id uuid primary key default gen_random_uuid(),owner_user_id uuid references app_user(id) on delete restrict,owner_organization_id uuid references organization(id) on delete restrict,
 title text not null check(length(trim(title)) between 5 and 160),category text not null check(category in('education','community_care','digital_inclusion','environment','livelihoods','accessibility','other')),
 summary text not null check(length(trim(summary)) between 20 and 360),description text not null check(length(trim(description)) between 40 and 5000),
 delivery_mode text not null default 'flexible' check(delivery_mode in('remote','in_person','hybrid','flexible')),location_label text,capacity integer check(capacity is null or capacity between 1 and 100000),
 eligibility text,expected_commitment text,status text not null default 'draft' check(status in('draft','submitted','under_review','clarification_requested','approved','published','rejected','suspended','completed','archived')),
 review_reason text,created_by uuid not null references app_user(id) on delete restrict,submitted_by uuid references app_user(id) on delete restrict,reviewed_by uuid references app_user(id) on delete restrict,
 submitted_at timestamptz,reviewed_at timestamptz,published_at timestamptz,expires_at timestamptz,request_idempotency_hash text,request_fingerprint text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check((owner_user_id is not null and owner_organization_id is null) or(owner_user_id is null and owner_organization_id is not null)),
 check(reviewed_by is null or reviewed_by<>created_by),check(submitted_by is null or submitted_by=created_by),
 check(request_idempotency_hash is null or length(request_idempotency_hash)=64),check(request_fingerprint is null or length(request_fingerprint)=64)
);
create unique index if not exists ux_serve_community_initiative_idempotency_hash on serve_community_initiative(request_idempotency_hash) where request_idempotency_hash is not null;
create index if not exists ix_serve_community_initiative_public on serve_community_initiative(category,created_at desc) where status='published';
create index if not exists ix_serve_community_initiative_owner on serve_community_initiative(owner_user_id,updated_at desc);
create index if not exists ix_serve_community_initiative_org on serve_community_initiative(owner_organization_id,updated_at desc);
create table if not exists serve_community_initiative_event(
 id uuid primary key default gen_random_uuid(),initiative_id uuid not null references serve_community_initiative(id) on delete restrict,actor_user_id uuid not null references app_user(id) on delete restrict,
 event_code text not null,from_status text,to_status text,reason text not null check(length(trim(reason)) between 4 and 1000),request_id text,metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),created_at timestamptz not null default now()
);
create index if not exists ix_serve_community_initiative_event_history on serve_community_initiative_event(initiative_id,created_at desc);
create table if not exists serve_community_participation(
 id uuid primary key default gen_random_uuid(),initiative_id uuid not null references serve_community_initiative(id) on delete restrict,participant_user_id uuid not null references app_user(id) on delete restrict,
 status text not null default 'submitted' check(status in('submitted','accepted','declined','withdrawn','completed')),application_note text,availability_note text,
 consent_version text not null,privacy_notice_version text not null,consent_text_hash text not null check(length(consent_text_hash)=64),contact_consent boolean not null default false,consented_at timestamptz not null,
 request_idempotency_hash text,request_fingerprint text,decision_reason text,decided_by uuid references app_user(id) on delete restrict,decided_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(request_idempotency_hash is null or length(request_idempotency_hash)=64),check(request_fingerprint is null or length(request_fingerprint)=64),
 check((decided_by is null)=(decided_at is null)),check(decided_by is null or decided_by<>participant_user_id)
);
create unique index if not exists ux_serve_community_participation_idempotency_hash on serve_community_participation(request_idempotency_hash) where request_idempotency_hash is not null;
create unique index if not exists ux_serve_community_participation_active on serve_community_participation(initiative_id,participant_user_id) where status in('submitted','accepted');
create index if not exists ix_serve_community_participation_owner on serve_community_participation(initiative_id,status,created_at);
create index if not exists ix_serve_community_participation_member on serve_community_participation(participant_user_id,created_at desc);
create table if not exists serve_community_participation_consent_event(
 id uuid primary key default gen_random_uuid(),participation_id uuid not null references serve_community_participation(id) on delete restrict,actor_user_id uuid not null references app_user(id) on delete restrict,
 consent_type text not null check(consent_type in('participation_terms','privacy_notice','share_contact_with_initiative_owner')),consent_version text not null,consent_text_hash text not null check(length(consent_text_hash)=64),
 decision text not null check(decision in('granted','withdrawn')),scope jsonb not null default '[]'::jsonb check(jsonb_typeof(scope)='array'),created_at timestamptz not null default now()
);
create index if not exists ix_serve_community_consent_history on serve_community_participation_consent_event(participation_id,created_at desc);
create table if not exists serve_community_participation_event(
 id uuid primary key default gen_random_uuid(),participation_id uuid not null references serve_community_participation(id) on delete restrict,actor_user_id uuid not null references app_user(id) on delete restrict,
 event_code text not null,from_status text,to_status text,reason text not null check(length(trim(reason)) between 4 and 1000),request_id text,created_at timestamptz not null default now()
);
create index if not exists ix_serve_community_participation_event_history on serve_community_participation_event(participation_id,created_at desc);
-- Legacy service classification is individually proposed, independently approved and reversible; it never mutates the source listing.
create table if not exists serve_community_legacy_classification(
 id uuid primary key default gen_random_uuid(),service_listing_id uuid not null unique references service_listing(id) on delete restrict,initiative_id uuid not null references serve_community_initiative(id) on delete restrict,
 status text not null default 'proposed' check(status in('proposed','approved','rejected','reversed')),proposed_by uuid not null references app_user(id) on delete restrict,reviewed_by uuid references app_user(id) on delete restrict,
 reason text not null check(length(trim(reason)) between 8 and 1000),reviewed_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(reviewed_by is null or reviewed_by<>proposed_by)
);
create unique index if not exists ux_serve_community_legacy_classification_initiative on serve_community_legacy_classification(initiative_id) where status='approved';
create table if not exists serve_community_legacy_classification_event(
 id uuid primary key default gen_random_uuid(),classification_id uuid not null references serve_community_legacy_classification(id) on delete restrict,actor_user_id uuid not null references app_user(id) on delete restrict,
 event_code text not null,from_status text,to_status text not null,reason text not null check(length(trim(reason)) between 8 and 1000),created_at timestamptz not null default now()
);
create or replace function serve_community_reject_history_mutation() returns trigger language plpgsql as $$ begin raise exception 'Serve-Community event and consent history is append-only'; end; $$;
drop trigger if exists trg_serve_community_initiative_event_immutable on serve_community_initiative_event;
create trigger trg_serve_community_initiative_event_immutable before update or delete on serve_community_initiative_event for each row execute function serve_community_reject_history_mutation();
drop trigger if exists trg_serve_community_participation_event_immutable on serve_community_participation_event;
create trigger trg_serve_community_participation_event_immutable before update or delete on serve_community_participation_event for each row execute function serve_community_reject_history_mutation();
drop trigger if exists trg_serve_community_consent_event_immutable on serve_community_participation_consent_event;
create trigger trg_serve_community_consent_event_immutable before update or delete on serve_community_participation_consent_event for each row execute function serve_community_reject_history_mutation();
drop trigger if exists trg_serve_community_legacy_classification_event_immutable on serve_community_legacy_classification_event;
create trigger trg_serve_community_legacy_classification_event_immutable before update or delete on serve_community_legacy_classification_event for each row execute function serve_community_reject_history_mutation();
insert into app_role(role_code,name,description) values('serve_community_reviewer','Serve-Community Initiative Reviewer','Independently reviews community initiatives and legacy classifications; self-review is prohibited.') on conflict(role_code) do update set name=excluded.name,description=excluded.description;
insert into app_permission(permission_code,area,label,description,sensitive,system_only) values
('serve_community.initiatives.moderate','Serve-Community','Review community initiatives','Approve, publish, suspend and archive community initiatives; submitters cannot review their own records.',true,true),
('serve_community.legacy.classify','Serve-Community','Approve legacy classifications','Independently approve or reverse individual mappings from legacy service listings to separate initiatives.',true,true)
on conflict(permission_code) do update set area=excluded.area,label=excluded.label,description=excluded.description,sensitive=excluded.sensitive,system_only=excluded.system_only;
comment on table serve_community_initiative is 'Distinct public-benefit initiatives; only published reviewed records are public. Commercial service listings are never implicitly imported.';
comment on table serve_community_participation is 'Private consent-led volunteer applications; personal data and participation status are never public.';
comment on table serve_community_participation_consent_event is 'Append-only versioned consent grants and withdrawals.';
comment on table serve_community_legacy_classification is 'Auditable, independently approved and reversible legacy mapping; source listing is never modified.';
