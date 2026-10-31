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
 category text not null check(category in('education_skills','community_care','digital_inclusion','environment_sustainability','livelihoods_economic_opportunity','accessibility_inclusion','mentorship_knowledge_sharing','professional_pro_bono_services','employment_referrals','partnerships_organizational_capacity','other_review_required')),
 contribution_type text not null check(contribution_type in('initiative_participation','project_delivery','mentoring','professional_service','referral','partnership','knowledge_resource','other')),
 contribution_role text not null check(contribution_role in('lead','co_lead','contributor','mentor','reviewer_organizer','partner_organization','other')),
 start_date date not null,
 end_date date,
 organization_name text,
 project_title text,
 location_summary text check(location_summary is null or length(trim(location_summary)) between 2 and 120),
 activity_summary text not null check(length(trim(activity_summary)) between 20 and 2000),
 output_summary text not null check(length(trim(output_summary)) between 10 and 2000),
 outcome_summary text,
 sustained_impact_summary text,
 beneficiary_count integer check(beneficiary_count is null or beneficiary_count between 0 and 1000000000),
 beneficiary_count_method text,
 desired_visibility text not null default 'private' check(desired_visibility in('private','member_visible','public_requested')),
 public_consent boolean not null default false,
 public_consent_version text,
 public_consent_at timestamptz,
 media_rights_confirmed boolean not null default false,
 retention_policy_version_id uuid not null references community_impact_retention_policy_version(id) on delete restrict,
 retention_rule_snapshot jsonb not null check(jsonb_typeof(retention_rule_snapshot)='object'),
 consent_retention_policy_version_id uuid not null references community_impact_retention_policy_version(id) on delete restrict,
 consent_retention_rule_snapshot jsonb not null check(jsonb_typeof(consent_retention_rule_snapshot)='object'),
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
 check((beneficiary_count is null and beneficiary_count_method is null) or (beneficiary_count is not null and length(trim(coalesce(beneficiary_count_method,''))) between 8 and 500)),
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
 retention_policy_version_id uuid not null references community_impact_retention_policy_version(id) on delete restrict,
 retention_rule_snapshot jsonb not null check(jsonb_typeof(retention_rule_snapshot)='object'),
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
 retention_policy_version_id uuid not null references community_impact_retention_policy_version(id) on delete restrict,
 retention_rule_snapshot jsonb not null check(jsonb_typeof(retention_rule_snapshot)='object'),
 decision_retention_policy_version_id uuid references community_impact_retention_policy_version(id) on delete restrict,
 decision_retention_rule_snapshot jsonb check(decision_retention_rule_snapshot is null or jsonb_typeof(decision_retention_rule_snapshot)='object'),
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
 event_code text not null check(event_code in('created','updated','evidence_attached','evidence_removed','submitted','assigned','clarification_requested','clarification_responded','verified','declined','withdrawn','appeal_submitted','appeal_assigned','appeal_upheld','appeal_overturned','revoked')),
 from_status text,
 to_status text,
 reason text not null check(length(trim(reason)) between 4 and 2000),
 request_id text,
 metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
 retention_policy_version_id uuid not null references community_impact_retention_policy_version(id) on delete restrict,
 retention_rule_snapshot jsonb not null check(jsonb_typeof(retention_rule_snapshot)='object'),
 created_at timestamptz not null default now()
);
create index if not exists ix_community_impact_claim_event_history on community_impact_claim_event(claim_id,created_at desc);
create or replace function community_impact_claim_guard() returns trigger language plpgsql as $ci$
begin
 if TG_OP='DELETE' then raise exception 'Community Impact claims cannot be deleted outside approved retention processing'; end if;
 if NEW.id is distinct from OLD.id or NEW.tracking_reference is distinct from OLD.tracking_reference
  or NEW.claimant_user_id is distinct from OLD.claimant_user_id or NEW.idempotency_hash is distinct from OLD.idempotency_hash
  or NEW.request_fingerprint is distinct from OLD.request_fingerprint or NEW.retention_policy_version_id is distinct from OLD.retention_policy_version_id
  or NEW.retention_rule_snapshot is distinct from OLD.retention_rule_snapshot
  or NEW.consent_retention_policy_version_id is distinct from OLD.consent_retention_policy_version_id
  or NEW.consent_retention_rule_snapshot is distinct from OLD.consent_retention_rule_snapshot
  or NEW.created_at is distinct from OLD.created_at then
  raise exception 'Community Impact claim identity and retention provenance are immutable';
 end if;
 if NEW.status is distinct from OLD.status and not (
  (OLD.status='draft' and NEW.status in('submitted','withdrawn')) or
  (OLD.status='submitted' and NEW.status in('under_review','clarification_requested','verified','declined','withdrawn')) or
  (OLD.status='under_review' and NEW.status in('clarification_requested','verified','declined','withdrawn')) or
  (OLD.status='clarification_requested' and NEW.status in('submitted','withdrawn')) or
  (OLD.status='declined' and NEW.status in('submitted','revoked')) or
  (OLD.status='verified' and NEW.status='revoked')
 ) then raise exception 'Invalid Community Impact claim state transition'; end if;
 if OLD.status not in('draft','clarification_requested') and (
  NEW.category is distinct from OLD.category or NEW.contribution_type is distinct from OLD.contribution_type
  or NEW.contribution_role is distinct from OLD.contribution_role or NEW.start_date is distinct from OLD.start_date
  or NEW.end_date is distinct from OLD.end_date or NEW.organization_name is distinct from OLD.organization_name
  or NEW.project_title is distinct from OLD.project_title or NEW.location_summary is distinct from OLD.location_summary or NEW.activity_summary is distinct from OLD.activity_summary
  or NEW.output_summary is distinct from OLD.output_summary or NEW.outcome_summary is distinct from OLD.outcome_summary or NEW.sustained_impact_summary is distinct from OLD.sustained_impact_summary or NEW.beneficiary_count is distinct from OLD.beneficiary_count or NEW.beneficiary_count_method is distinct from OLD.beneficiary_count_method
  or NEW.desired_visibility is distinct from OLD.desired_visibility or NEW.public_consent is distinct from OLD.public_consent
  or NEW.public_consent_version is distinct from OLD.public_consent_version or NEW.media_rights_confirmed is distinct from OLD.media_rights_confirmed
 ) then raise exception 'Submitted Community Impact claim details cannot be edited; use clarification or appeal workflows'; end if;
 return NEW;
end; $ci$;
drop trigger if exists trg_community_impact_claim_guard on community_impact_claim;
create trigger trg_community_impact_claim_guard before update or delete on community_impact_claim for each row execute function community_impact_claim_guard();
create or replace function community_impact_claim_assignment_guard() returns trigger language plpgsql as $ci$
begin
 if TG_OP='DELETE' then raise exception 'Community Impact claim assignment history cannot be deleted'; end if;
 if NEW.id is distinct from OLD.id or NEW.claim_id is distinct from OLD.claim_id
  or NEW.reviewer_user_id is distinct from OLD.reviewer_user_id or NEW.assigned_by is distinct from OLD.assigned_by
  or NEW.assigned_at is distinct from OLD.assigned_at then raise exception 'Community Impact reviewer assignment provenance is immutable'; end if;
 if OLD.active=false or (NEW.active=true and OLD.active=false) then raise exception 'Closed reviewer assignments cannot be reactivated'; end if;
 return NEW;
end; $ci$;
drop trigger if exists trg_community_impact_claim_assignment_guard on community_impact_claim_assignment;
create trigger trg_community_impact_claim_assignment_guard before update or delete on community_impact_claim_assignment for each row execute function community_impact_claim_assignment_guard();
create or replace function community_impact_claim_appeal_guard() returns trigger language plpgsql as $ci$
begin
 if TG_OP='DELETE' then raise exception 'Community Impact claim appeals cannot be deleted'; end if;
 if NEW.id is distinct from OLD.id or NEW.claim_id is distinct from OLD.claim_id
  or NEW.decision_id is distinct from OLD.decision_id or NEW.claimant_user_id is distinct from OLD.claimant_user_id
  or NEW.rationale is distinct from OLD.rationale or NEW.retention_policy_version_id is distinct from OLD.retention_policy_version_id
  or NEW.retention_rule_snapshot is distinct from OLD.retention_rule_snapshot or NEW.created_at is distinct from OLD.created_at then
  raise exception 'Community Impact appeal origin and retention provenance are immutable';
 end if;
 if NEW.status is distinct from OLD.status and not (
  (OLD.status='submitted' and NEW.status in('under_review','withdrawn')) or
  (OLD.status='under_review' and NEW.status in('upheld','overturned'))
 ) then raise exception 'Invalid Community Impact appeal state transition'; end if;
 if NEW.assigned_reviewer_id is distinct from OLD.assigned_reviewer_id and not (OLD.status='submitted' and NEW.status='under_review') then raise exception 'Appeal reviewer can only be assigned during assignment'; end if;
 if (NEW.decision_rationale is distinct from OLD.decision_rationale or NEW.decision_retention_policy_version_id is distinct from OLD.decision_retention_policy_version_id or NEW.decision_retention_rule_snapshot is distinct from OLD.decision_retention_rule_snapshot or NEW.decided_at is distinct from OLD.decided_at) and not (OLD.status='under_review' and NEW.status in('upheld','overturned')) then raise exception 'Appeal decision fields can only be set during independent decision'; end if;
 return NEW;
end; $ci$;
drop trigger if exists trg_community_impact_claim_appeal_guard on community_impact_claim_appeal;
create trigger trg_community_impact_claim_appeal_guard before update or delete on community_impact_claim_appeal for each row execute function community_impact_claim_appeal_guard();
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

-- Bind claim-evidence uploads to a specific draft/clarification claim before bytes are accepted.
alter table private_upload_session add column if not exists purpose text not null default 'general';
alter table private_upload_session add column if not exists purpose_reference_id uuid references community_impact_claim(id) on delete restrict;
alter table private_upload_session add constraint private_upload_session_purpose_scope_check
 check((purpose='general' and purpose_reference_id is null) or (purpose='community_impact_claim_evidence' and purpose_reference_id is not null));
create index if not exists ix_private_upload_session_claim_purpose on private_upload_session(purpose_reference_id,status) where purpose='community_impact_claim_evidence';

alter table private_upload_session add column if not exists retention_policy_version_id uuid references community_impact_retention_policy_version(id) on delete restrict;
alter table private_upload_session add column if not exists retention_rule_snapshot jsonb;
alter table private_upload_session add constraint private_upload_session_claim_retention_check
 check((purpose='general' and retention_policy_version_id is null and retention_rule_snapshot is null) or
       (purpose='community_impact_claim_evidence' and retention_policy_version_id is not null and jsonb_typeof(retention_rule_snapshot)='object'));

alter table community_impact_claim_evidence add column if not exists removed_at timestamptz;
alter table community_impact_claim_evidence add column if not exists removed_by uuid references app_user(id) on delete restrict;
alter table community_impact_claim_evidence add column if not exists removal_reason text;
alter table community_impact_claim_evidence add constraint community_impact_claim_evidence_removal_check
 check((removed_at is null and removed_by is null and removal_reason is null) or
       (removed_at is not null and removed_by is not null and length(trim(coalesce(removal_reason,''))) between 8 and 1000));
create index if not exists ix_community_impact_claim_evidence_active on community_impact_claim_evidence(claim_id,created_at) where removed_at is null;
