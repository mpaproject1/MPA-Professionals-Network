-- Increment 2: policy-driven detection candidates. Source workflows remain authoritative.
create table if not exists community_impact_detection_policy_version (
 id uuid primary key default gen_random_uuid(),
 source_system text not null check(source_system='serve_community'),
 source_type text not null check(source_type in('initiative_participation','offline_completed_project')),
 version integer not null check(version>0),
 rules jsonb not null check(jsonb_typeof(rules)='object'),
 approval_reference text not null check(length(trim(approval_reference)) between 8 and 240),
 created_by uuid references app_user(id) on delete restrict,
 created_at timestamptz not null default now(),
 unique(source_system,source_type,version)
);
create table if not exists community_impact_detection_active_policy (
 source_system text not null,
 source_type text not null,
 policy_version_id uuid not null references community_impact_detection_policy_version(id) on delete restrict,
 activated_at timestamptz not null default now(),
 primary key(source_system,source_type)
);
create table if not exists community_impact_detection_candidate (
 id uuid primary key default gen_random_uuid(),
 source_system text not null check(source_system='serve_community'),
 source_type text not null check(source_type in('initiative_participation','offline_completed_project')),
 source_record_id uuid not null,
 source_event_id uuid not null,
 source_event_code text not null,
 source_event_version timestamptz not null,
 contributor_user_id uuid references app_user(id) on delete restrict,
 source_category text not null,
 canonical_category text not null,
 contribution_role text,
 attribution_status text not null check(attribution_status in('pending_confirmation','unattributed','confirmed','disputed')),
 detection_status text not null default 'detected' check(detection_status in('detected','dismissed','source_reversed')),
 confidence numeric(5,4) not null check(confidence between 0 and 1),
 policy_version_id uuid not null references community_impact_detection_policy_version(id) on delete restrict,
 detection_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(detection_metadata)='object'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(source_system,source_type,source_event_id),
 check((source_type='initiative_participation' and contributor_user_id is not null and attribution_status in('pending_confirmation','confirmed','disputed')) or
       (source_type='offline_completed_project' and contributor_user_id is null and attribution_status='unattributed'))
);
create index if not exists ix_community_impact_candidate_member on community_impact_detection_candidate(contributor_user_id,created_at desc) where contributor_user_id is not null;
create index if not exists ix_community_impact_candidate_review on community_impact_detection_candidate(detection_status,attribution_status,created_at);
create table if not exists community_impact_detection_candidate_event (
 id uuid primary key default gen_random_uuid(),
 candidate_id uuid not null references community_impact_detection_candidate(id) on delete restrict,
 actor_user_id uuid references app_user(id) on delete restrict,
 event_code text not null,
 reason text,
 metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
 created_at timestamptz not null default now()
);
create index if not exists ix_community_impact_candidate_event_history on community_impact_detection_candidate_event(candidate_id,created_at desc);
create or replace function community_impact_reject_history_mutation() returns trigger language plpgsql as $$ begin raise exception 'Community Impact policy and candidate history is immutable'; end; $$;
drop trigger if exists trg_community_impact_policy_version_immutable on community_impact_detection_policy_version;
create trigger trg_community_impact_policy_version_immutable before update or delete on community_impact_detection_policy_version for each row execute function community_impact_reject_history_mutation();
drop trigger if exists trg_community_impact_candidate_event_immutable on community_impact_detection_candidate_event;
create trigger trg_community_impact_candidate_event_immutable before update or delete on community_impact_detection_candidate_event for each row execute function community_impact_reject_history_mutation();

insert into community_impact_detection_policy_version(source_system,source_type,version,rules,approval_reference) values
('serve_community','initiative_participation',1,'{"enabled":true,"sourceEventCodes":["completed"],"sourceStatuses":["completed"],"parentStatuses":["completed"],"attributionMode":"authoritative_source_user","confidence":1,"requireContributorConfirmation":true,"defaultRole":"delivery_contributor","categoryMap":{"education":"education_skills","community_care":"community_care","digital_inclusion":"digital_inclusion","environment":"environment_sustainability","livelihoods":"livelihoods_economic_opportunity","accessibility":"accessibility_inclusion","other":"other_review_required"}}'::jsonb,'project-owner-approved-initial-policy-baseline'),
('serve_community','offline_completed_project',1,'{"enabled":true,"sourceEventCodes":["approve"],"sourceStatuses":["approved"],"parentStatuses":[],"attributionMode":"unattributed_until_evidenced","confidence":0,"requireContributorConfirmation":true,"defaultRole":null,"categoryMap":{"education":"education_skills","community_care":"community_care","digital_inclusion":"digital_inclusion","environment":"environment_sustainability","livelihoods":"livelihoods_economic_opportunity","accessibility":"accessibility_inclusion","other":"other_review_required"}}'::jsonb,'project-owner-approved-initial-policy-baseline')
on conflict(source_system,source_type,version) do nothing;
insert into community_impact_detection_active_policy(source_system,source_type,policy_version_id)
select source_system,source_type,id from community_impact_detection_policy_version where version=1
on conflict(source_system,source_type) do nothing;

insert into app_permission(permission_code,area,label,description,sensitive,system_only) values
('community_impact.detection.manage','Community Impact','Manage contribution detection','Run source reconciliation and inspect private detected-contribution candidates; does not grant verification or scoring authority.',true,true)
on conflict(permission_code) do update set area=excluded.area,label=excluded.label,description=excluded.description,sensitive=excluded.sensitive,system_only=excluded.system_only;

comment on table community_impact_detection_policy_version is 'Immutable, versioned source detection rules. New rules require a new version and active-policy pointer change.';
comment on table community_impact_detection_candidate is 'Private, idempotent detection projection over existing source records; never a verified achievement or score.';
comment on table community_impact_detection_candidate_event is 'Append-only history of detection and contributor attribution confirmation/dispute.';
