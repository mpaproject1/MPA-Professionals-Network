-- Increment 5: unified, policy-driven Community Impact score ledger.
-- The initial plan policy is active for private/evaluation calculation only. It is NOT publicly published.
create table if not exists community_impact_score_policy_version (
 id uuid primary key default gen_random_uuid(),
 version integer not null unique check(version>0),
 schema_version integer not null check(schema_version>0),
 policy_hash text not null check(policy_hash ~ '^[a-f0-9]{64}$'),
 policy jsonb not null check(jsonb_typeof(policy)='object'),
 status text not null check(status in('active','in_review','approved','superseded','revoked')),
 evaluation_only boolean not null default true,
 public_score_enabled boolean not null default false,
 rationale text not null check(length(trim(rationale)) between 12 and 2000),
 change_summary text not null check(length(trim(change_summary)) between 8 and 1000),
 created_by uuid references app_user(id) on delete restrict,
 approved_by uuid references app_user(id) on delete restrict,
 approval_reference text,
 effective_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 approved_at timestamptz,
 check(approved_by is null or approved_by<>created_by),
 check(public_score_enabled=false or (status='active' and evaluation_only=false and approved_by is not null and approved_at is not null and length(trim(coalesce(approval_reference,'')))>=8))
);
create table if not exists community_impact_score_active_policy (
 singleton boolean primary key default true check(singleton),
 policy_version_id uuid not null references community_impact_score_policy_version(id) on delete restrict,
 activated_by uuid references app_user(id) on delete restrict,
 activated_at timestamptz not null default now()
);
create table if not exists community_impact_score_policy_event (
 id uuid primary key default gen_random_uuid(),
 policy_version_id uuid not null references community_impact_score_policy_version(id) on delete restrict,
 actor_user_id uuid references app_user(id) on delete restrict,
 event_code text not null check(event_code in('seeded_initial','proposed','approved','activated','superseded','revoked')),
 rationale text not null check(length(trim(rationale)) between 8 and 2000),
 metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
 created_at timestamptz not null default now()
);
create table if not exists community_impact_score_ledger (
 id uuid primary key default gen_random_uuid(),
 subject_user_id uuid not null references app_user(id) on delete restrict,
 source_system text not null,
 source_type text not null check(source_type in('serve_community_participation','offline_completed_project','mentorship','professional_service','employment_referral','network_plus_collaboration','network_plus_partnership','historical_contribution')),
 source_record_id uuid not null,
 claim_id uuid references community_impact_claim(id) on delete restrict,
 assessment_id uuid references community_impact_contribution_assessment(id) on delete restrict,
 policy_version_id uuid not null references community_impact_score_policy_version(id) on delete restrict,
 entry_type text not null check(entry_type in('award','reversal','recalculation')),
 points numeric(14,4) not null check(points<>0),
 reverses_entry_id uuid references community_impact_score_ledger(id) on delete restrict,
 idempotency_key text not null unique,
 explanation jsonb not null check(jsonb_typeof(explanation)='object'),
 created_by uuid references app_user(id) on delete restrict,
 created_at timestamptz not null default now(),
 check((entry_type='reversal' and reverses_entry_id is not null and points<0) or (entry_type<>'reversal' and reverses_entry_id is null))
);
create index if not exists ix_community_impact_score_ledger_member on community_impact_score_ledger(subject_user_id,created_at desc);
create index if not exists ix_community_impact_score_ledger_source on community_impact_score_ledger(source_system,source_type,source_record_id,created_at desc);
create index if not exists ix_community_impact_score_ledger_policy on community_impact_score_ledger(policy_version_id,created_at desc);
create table if not exists community_impact_score_recalculation (
 id uuid primary key default gen_random_uuid(),
 subject_user_id uuid references app_user(id) on delete restrict,
 source_type text,
 source_record_id uuid,
 prior_policy_version_id uuid references community_impact_score_policy_version(id) on delete restrict,
 target_policy_version_id uuid not null references community_impact_score_policy_version(id) on delete restrict,
 initiated_by uuid not null references app_user(id) on delete restrict,
 rationale text not null check(length(trim(rationale)) between 12 and 2000),
 status text not null check(status in('completed','no_change','blocked')),
 summary jsonb not null check(jsonb_typeof(summary)='object'),
 created_at timestamptz not null default now()
);
create table if not exists community_impact_score_adjustment_event (
 id uuid primary key default gen_random_uuid(),
 ledger_entry_id uuid not null references community_impact_score_ledger(id) on delete restrict,
 actor_user_id uuid not null references app_user(id) on delete restrict,
 event_code text not null check(event_code in('reversed','recalculated','review_note')),
 reason_code text not null check(length(trim(reason_code)) between 3 and 80),
 rationale text not null check(length(trim(rationale)) between 12 and 2000),
 before_snapshot jsonb not null default '{}'::jsonb,
 after_snapshot jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create or replace function community_impact_score_ledger_immutable() returns trigger language plpgsql as $$
begin raise exception 'Community Impact score ledger is append-only; use reversal or recalculation entries'; end; $$;
drop trigger if exists trg_community_impact_score_ledger_immutable on community_impact_score_ledger;
create trigger trg_community_impact_score_ledger_immutable before update or delete on community_impact_score_ledger for each row execute function community_impact_score_ledger_immutable();
create or replace function community_impact_score_policy_immutable() returns trigger language plpgsql as $$
begin
 if TG_OP='DELETE' then raise exception 'Community Impact score policy history cannot be deleted'; end if;
 if NEW.id is distinct from OLD.id or NEW.version is distinct from OLD.version or NEW.schema_version is distinct from OLD.schema_version or NEW.policy_hash is distinct from OLD.policy_hash or NEW.policy is distinct from OLD.policy or NEW.created_by is distinct from OLD.created_by or NEW.created_at is distinct from OLD.created_at or NEW.rationale is distinct from OLD.rationale or NEW.change_summary is distinct from OLD.change_summary then raise exception 'Score policy content is immutable; create a new version'; end if;
 if OLD.status='active' and NEW.status not in('active','superseded','revoked') then raise exception 'Invalid active score policy transition'; end if;
 if OLD.status in('approved','superseded','revoked') and NEW.status not in(OLD.status,'active') then raise exception 'Invalid score policy transition'; end if;
 return NEW;
end; $$;
drop trigger if exists trg_community_impact_score_policy_immutable on community_impact_score_policy_version;
create trigger trg_community_impact_score_policy_immutable before update or delete on community_impact_score_policy_version for each row execute function community_impact_score_policy_immutable();

insert into app_permission(permission_code,area,label,description,sensitive,system_only) values
('community_impact.score.policy.manage','Community Impact','Manage score policies','Propose versioned Community Impact scoring policy changes.',true,true),
('community_impact.score.policy.approve','Community Impact','Approve score policies','Independently approve and activate scoring policy versions.',true,true),
('community_impact.score.recalculate','Community Impact','Recalculate contribution scores','Run audited score calculations, reversals and recalculation.',true,true),
('community_impact.score.reverse','Community Impact','Reverse contribution score entries','Reverse an incorrect or invalidated score ledger award with a reason.',true,true),
('community_impact.score.view_all','Community Impact','View all member score records','View restricted score ledger and explanations for governance operations.',true,true)
on conflict(permission_code) do update set area=excluded.area,label=excluded.label,description=excluded.description,sensitive=excluded.sensitive,system_only=excluded.system_only;

-- Values from docs/62 Section 8. This baseline is active internally for evaluation only.
-- No public score publication, member ranking, or opportunity eligibility is enabled.
insert into community_impact_score_policy_version(version,schema_version,policy_hash,policy,status,evaluation_only,public_score_enabled,rationale,change_summary,created_by)
values(1,1,encode(digest('mpa-community-impact-score-policy-v1-initial-five-dimension-baseline','sha256'),'hex'),
'{"mode":"evaluation","publicScoreEnabled":false,"dimensions":[{"key":"measurable_community_outcomes","label":"Measurable community outcomes","weight":30,"minimumEvidenceQuality":"adequate","ratings":{"min":0,"max":5}},{"key":"quality_and_significance","label":"Quality and significance","weight":25,"minimumEvidenceQuality":"adequate","ratings":{"min":0,"max":5}},{"key":"verified_contribution_responsibility","label":"Verified contribution and responsibility","weight":20,"minimumEvidenceQuality":"adequate","ratings":{"min":0,"max":5}},{"key":"sustainability","label":"Sustainability","weight":15,"minimumEvidenceQuality":"adequate","ratings":{"min":0,"max":5}},{"key":"collaboration_knowledge_sharing","label":"Collaboration and knowledge sharing","weight":10,"minimumEvidenceQuality":"adequate","ratings":{"min":0,"max":5}}],"calculation":{"basePoints":100,"rounding":"4dp","roleFactors":{"lead":1,"co_lead":1,"contributor":1,"mentor":1,"reviewer_organizer":1,"partner_organization":1,"other":1},"minimumEvidenceQuality":"adequate","requiredAssessmentStatus":"approved","requiredClaimStatus":"verified","sourceCaps":{},"categoryCaps":{},"periodCaps":{},"diminishingReturns":[],"eligibleSourceTypes":["serve_community_participation","offline_completed_project","mentorship","professional_service","employment_referral","network_plus_collaboration","network_plus_partnership","historical_contribution"]},"publication":{"enabled":false,"consentRequired":true,"minimumGroupSize":5}}'::jsonb,'active',true,false,
'Initial scoring baseline from docs/62 Section 8; evaluation-only until a separately approved public scoring decision.',
'Initial five-dimension weights 30/25/20/15/10; configurable versioned baseline.',null)
on conflict(version) do nothing;
insert into community_impact_score_active_policy(singleton,policy_version_id)
select true,id from community_impact_score_policy_version where version=1
on conflict(singleton) do nothing;
insert into community_impact_score_policy_event(policy_version_id,event_code,rationale,metadata)
select id,'seeded_initial','Seeded the approved plan baseline as active evaluation-only policy.',jsonb_build_object('sourceDocument','docs/62-community-impact-and-recognition-design.md','section','8','publicScoreEnabled',false)
from community_impact_score_policy_version where version=1
and not exists(select 1 from community_impact_score_policy_event e where e.policy_version_id=community_impact_score_policy_version.id and e.event_code='seeded_initial');
comment on table community_impact_score_ledger is 'Append-only score events. Corrections use compensating reversals and recalculation entries; never update or delete ledger rows.';
