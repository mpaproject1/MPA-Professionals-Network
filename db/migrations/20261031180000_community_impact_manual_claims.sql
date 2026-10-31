-- Increment 3: authenticated-account manual claims and private evidence references.
-- Non-member/anonymous identity assurance is deliberately not implemented in this increment.
-- Claim/evidence creation requires an explicitly active MPA retention policy; no default is inferred.
create table if not exists community_impact_claim (
 id uuid primary key default gen_random_uuid(),
 tracking_reference text not null unique,
 claimant_user_id uuid not null references app_user(id) on delete restrict,
 idempotency_hash text not null,
 request_fingerprint text not null,
 status text not null default 'draft' check(status in('draft','submitted','under_review','clarification_requested','verified','declined','withdrawn','revoked')),
 category text not null check(category in('education_skills','community_care','digital_inclusion','environment_sustainability','livelihoods_economic_opportunity','accessibility_inclusion','other_review_required')),
 contribution_type text not null check(contribution_type in('initiative_participation','project_delivery','mentoring','professional_service','referral','partnership','knowledge_resource','other')),
 contribution_role text not null check(contribution_role in('lead','co_lead','contributor','mentor','reviewer_organizer','partner_organization','other')),
 start_date date not null,
 end_date date,
 organization_name text,
 project_title text,
 activity_summary text not null check(length(trim(activity_summary)) between 20 and 2000),
 output_summary text not null check(length(trim(output_summary)) between 10 and 2000),
 outcome_summary text,
 desired_visibility text not null default 'private' check(desired_visibility in('private','member_visible','public_requested')),
 public_consent boolean not null default false,
 public_consent_version text,
 public_consent_at timestamptz,
 media_rights_confirmed boolean not null default false,
 retention_policy_version_id uuid not null references community_impact_retention_policy_version(id) on delete restrict,
 retention_rule_snapshot jsonb not null check(jsonb_typeof(retention_rule_snapshot)='object'),
 current_reviewer_id uuid references app_user(id) on delete restrict,
 current_decision_code text check(current_decision_code in('verified','declined','clarification_requested','revoked')),
 current_decision_reason_code text,
 current_decision_rationale text,
 submitted_at timestamptz,
 closed_at timestamptz,
 last_activity_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(claimant_user_id,idempotency_hash),
 check(end_date is null or end_date>=start_date),
 check((desired_visibility<>'public_requested') or (public_consent=true and public_consent_version is not null and public_consent_at is not null and media_rights_confirmed=true)),
 check((current_decision_code is null and current_reviewer_id is null) or (current_decision_code is not null and current_reviewer_id is not null))
);
create index if not exists ix_community_impact_claim_owner on community_impact_claim(claimant_user_id,updated_at desc);
create index if not exists ix_community_impact_claim_queue on community_impact_claim(status,submitted_at desc) where status in('submitted','under_review','clarification_requested');
create table if not exists community_impact_claim_evidence (
 id uuid primary key default gen_random_uuid(),
 claim_id uuid not null references community_impact_claim(id) on delete restrict,
 file_object_id uuid not null unique references file_object(id) on delete restrict,
 evidence_type text not null check(evidence_type in('document','image','attestation','metric_source','other')),
 label text not null check(length(trim(label)) between 3 and 120),
 description text not null check(length(trim(description)) between 8 and 800),
 source_date date,
 uploaded_by uuid not null references app_user(id) on delete restrict,
 retention_policy_version_id uuid not null references community_impact_retention_policy_version(id) on delete restrict,
 retention_rule_snapshot jsonb not null check(jsonb_typeof(retention_rule_snapshot)='object'),
 created_at timestamptz not null default now()
);
create index if not exists ix_community_impact_claim_evidence_claim on community_impact_claim_evidence(claim_id,created_at);
create table if not exists community_impact_claim_assignment (
 id uuid primary key default gen_random_uuid(),
 claim_id uuid not null references community_impact_claim(id) on delete restrict,
 reviewer_user_id uuid not null references app_user(id) on delete restrict,
 assigned_by uuid not null references app_user(id) on delete restrict,
 active boolean not null default true,
 assigned_at timestamptz not null default now(),
 ended_at timestamptz,
 check((active=true and ended_at is null) or (active=false and ended_at is not null))
);
create unique index if not exists uq_community_impact_claim_active_assignment on community_impact_claim_assignment(claim_id) where active=true;
create index if not exists ix_community_impact_claim_reviewer on community_impact_claim_assignment(reviewer_user_id,assigned_at desc) where active=true;
create table if not exists community_impact_claim_decision (
 id uuid primary key default gen_random_uuid(),
 claim_id uuid not null references community_impact_claim(id) on delete restrict,
 reviewer_user_id uuid not null references app_user(id) on delete restrict,
 decision_code text not null check(decision_code in('verified','declined','clarification_requested','revoked')),
 reason_code text not null check(length(trim(reason_code)) between 3 and 80),
 rationale text not null check(length(trim(rationale)) between 12 and 2000),
 evidence_summary text,
 created_at timestamptz not null default now()
);
create index if not exists ix_community_impact_claim_decision_history on community_impact_claim_decision(claim_id,created_at desc);
create table if not exists community_impact_claim_appeal (
 id uuid primary key default gen_random_uuid(),
 claim_id uuid not null references community_impact_claim(id) on delete restrict,
 decision_id uuid not null references community_impact_claim_decision(id) on delete restrict,
 claimant_user_id uuid not null references app_user(id) on delete restrict,
 rationale text not null check(length(trim(rationale)) between 20 and 2000),
 status text not null default 'submitted' check(status in('submitted','under_review','upheld','overturned','withdrawn')),
 assigned_reviewer_id uuid references app_user(id) on delete restrict,
 decision_rationale text,
 decided_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check((status in('upheld','overturned') and assigned_reviewer_id is not null and decided_at is not null and length(trim(coalesce(decision_rationale,'')))>=12) or status not in('upheld','overturned')),
 unique(decision_id)
);
create table if not exists community_impact_claim_event (
 id uuid primary key default gen_random_uuid(),
 claim_id uuid not null references community_impact_claim(id) on delete restrict,
 actor_user_id uuid references app_user(id) on delete restrict,
 event_code text not null check(event_code in('created','updated','evidence_attached','submitted','assigned','clarification_requested','clarification_responded','verified','declined','withdrawn','appeal_submitted','appeal_assigned','appeal_upheld','appeal_overturned','revoked')),
 from_status text,
 to_status text,
 reason text not null check(length(trim(reason)) between 4 and 2000),
 request_id text,
 metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
 created_at timestamptz not null default now()
);
create index if not exists ix_community_impact_claim_event_history on community_impact_claim_event(claim_id,created_at desc);
create or replace function community_impact_claim_event_immutable() returns trigger language plpgsql as $$ begin raise exception 'Community Impact claim history is append-only'; end; $$;
drop trigger if exists trg_community_impact_claim_event_immutable on community_impact_claim_event;
create trigger trg_community_impact_claim_event_immutable before update or delete on community_impact_claim_event for each row execute function community_impact_claim_event_immutable();
create or replace function community_impact_claim_decision_immutable() returns trigger language plpgsql as $$ begin raise exception 'Community Impact claim decisions are immutable'; end; $$;
drop trigger if exists trg_community_impact_claim_decision_immutable on community_impact_claim_decision;
create trigger trg_community_impact_claim_decision_immutable before update or delete on community_impact_claim_decision for each row execute function community_impact_claim_decision_immutable();
insert into app_permission(permission_code,area,label,description,sensitive,system_only) values
('community_impact.claim.review','Community Impact','Review assigned contribution claims','Review only claims explicitly assigned to this reviewer; does not grant evidence access outside assigned claims.',true,true),
('community_impact.claim.assign','Community Impact','Assign contribution claim reviews','Assign contribution claims to authorized impact reviewers and inspect the review queue.',true,true),
('community_impact.claim.appeal_review','Community Impact','Review contribution claim appeals','Independently review assigned contribution claim appeals; cannot be the original decision-maker.',true,true)
on conflict(permission_code) do update set area=excluded.area,label=excluded.label,description=excluded.description,sensitive=excluded.sensitive,system_only=excluded.system_only;
comment on table community_impact_claim is 'Private authenticated-account contribution claims. Membership is not required. Non-member identity assurance is outside this increment.';
comment on table community_impact_claim_evidence is 'Private file references with immutable retention-policy snapshots. Evidence bytes remain in the private file store.';
comment on table community_impact_claim_decision is 'Append-only reviewer decisions; claim status is a current projection.';
comment on table community_impact_claim_event is 'Append-only claim and evidence lifecycle audit history.';
