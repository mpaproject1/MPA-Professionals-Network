-- Community Impact governance completion: identity assurance, individual attribution,
-- reviewer-controlled reconciliation/assessment, conflict controls and non-destructive retention evaluation.
-- Additive only. No deletion worker, default retention period, or active policy is introduced.

create table if not exists community_impact_identity_assurance_case (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references app_user(id) on delete restrict,
 status text not null default 'draft' check(status in('draft','submitted','under_review','verified','declined','withdrawn','expired')),
 legal_name text not null check(length(trim(legal_name)) between 2 and 180),
 identity_country text not null check(length(trim(identity_country)) between 2 and 100),
 assurance_level text not null default 'standard' check(assurance_level in('standard','enhanced')),
 submitted_at timestamptz,
 decided_at timestamptz,
 current_reviewer_id uuid references app_user(id) on delete restrict,
 current_decision text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index if not exists uq_community_impact_identity_assurance_open on community_impact_identity_assurance_case(user_id) where status in('draft','submitted','under_review');
create table if not exists community_impact_identity_assurance_evidence (
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null references community_impact_identity_assurance_case(id) on delete restrict,
 file_object_id uuid not null references file_object(id) on delete restrict,
 evidence_kind text not null check(evidence_kind in('government_id','address_attestation','organization_attestation','other')),
 uploaded_by uuid not null references app_user(id) on delete restrict,
 retention_policy_version_id uuid not null references community_impact_retention_policy_version(id) on delete restrict,
 retention_rule_snapshot jsonb not null check(jsonb_typeof(retention_rule_snapshot)='object'),
 created_at timestamptz not null default now(),
 unique(case_id,file_object_id)
);
create table if not exists community_impact_identity_assurance_decision (
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null references community_impact_identity_assurance_case(id) on delete restrict,
 reviewer_user_id uuid not null references app_user(id) on delete restrict,
 decision_code text not null check(decision_code in('verified','declined','clarification_requested')),
 reason_code text not null check(length(trim(reason_code)) between 3 and 80),
 rationale text not null check(length(trim(rationale)) between 12 and 2000),
 retention_policy_version_id uuid not null references community_impact_retention_policy_version(id) on delete restrict,
 retention_rule_snapshot jsonb not null check(jsonb_typeof(retention_rule_snapshot)='object'),
 created_at timestamptz not null default now()
);
create table if not exists community_impact_detection_policy_governance (
 policy_version_id uuid primary key references community_impact_detection_policy_version(id) on delete restrict,
 status text not null check(status in('in_review','approved','active','superseded')),
 rationale text not null check(length(trim(rationale)) between 12 and 2000),
 created_by uuid not null references app_user(id) on delete restrict,
 approved_by uuid references app_user(id) on delete restrict,
 approval_reference text,
 approved_at timestamptz,
 activated_by uuid references app_user(id) on delete restrict,
 activated_at timestamptz,
 created_at timestamptz not null default now(),
 check((status in('approved','active','superseded') and approved_by is not null and approved_at is not null and length(trim(coalesce(approval_reference,'')))>=8) or status='in_review')
);
create table if not exists community_impact_detection_policy_event (
 id uuid primary key default gen_random_uuid(),
 policy_version_id uuid not null references community_impact_detection_policy_version(id) on delete restrict,
 actor_user_id uuid not null references app_user(id) on delete restrict,
 event_code text not null check(event_code in('proposed','approved','activated','superseded')),
 reason text not null check(length(trim(reason)) between 8 and 2000),
 metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
 created_at timestamptz not null default now()
);
create table if not exists community_impact_offline_attribution (
 id uuid primary key default gen_random_uuid(),
 candidate_id uuid not null references community_impact_detection_candidate(id) on delete restrict,
 contributor_user_id uuid not null references app_user(id) on delete restrict,
 proposed_by uuid not null references app_user(id) on delete restrict,
 contributor_confirmed_at timestamptz,
 contributor_confirmation_note text,
 contribution_role text not null check(contribution_role in('lead','co_lead','contributor','mentor','reviewer_organizer','partner_organization','other')),
 attribution_share numeric(5,2) not null check(attribution_share>0 and attribution_share<=100),
 rationale text not null check(length(trim(rationale)) between 12 and 2000),
 status text not null default 'submitted' check(status in('submitted','under_review','verified','declined','withdrawn')),
 assigned_reviewer_id uuid references app_user(id) on delete restrict,
 decided_by uuid references app_user(id) on delete restrict,
 decision_rationale text,
 created_at timestamptz not null default now(),
 decided_at timestamptz,
 unique(candidate_id,contributor_user_id),
 check((status='verified' and decided_by is not null and decided_at is not null and length(trim(coalesce(decision_rationale,'')))>=12) or status<>'verified')
);
create table if not exists community_impact_offline_attribution_evidence (
 attribution_id uuid not null references community_impact_offline_attribution(id) on delete restrict,
 file_object_id uuid not null references file_object(id) on delete restrict,
 uploaded_by uuid not null references app_user(id) on delete restrict,
 retention_policy_version_id uuid not null references community_impact_retention_policy_version(id) on delete restrict,
 retention_rule_snapshot jsonb not null check(jsonb_typeof(retention_rule_snapshot)='object'),
 created_at timestamptz not null default now(),
 primary key(attribution_id,file_object_id)
);
create table if not exists community_impact_claim_candidate_link (
 id uuid primary key default gen_random_uuid(),
 claim_id uuid not null references community_impact_claim(id) on delete restrict,
 candidate_id uuid not null references community_impact_detection_candidate(id) on delete restrict,
 linked_by uuid not null references app_user(id) on delete restrict,
 rationale text not null check(length(trim(rationale)) between 12 and 2000),
 created_at timestamptz not null default now(),
 unique(claim_id)
);
create table if not exists community_impact_reviewer_conflict (
 id uuid primary key default gen_random_uuid(),
 claim_id uuid not null references community_impact_claim(id) on delete restrict,
 reviewer_user_id uuid not null references app_user(id) on delete restrict,
 conflict_type text not null check(conflict_type in('personal_relationship','financial_interest','employment_affiliation','project_involvement','prior_decision','other')),
 declaration text not null check(length(trim(declaration)) between 12 and 2000),
 status text not null default 'declared' check(status in('declared','confirmed','dismissed','recused')),
 declared_by uuid not null references app_user(id) on delete restrict,
 resolved_by uuid references app_user(id) on delete restrict,
 resolution_rationale text,
 created_at timestamptz not null default now(),
 resolved_at timestamptz
);
create table if not exists community_impact_contribution_assessment (
 id uuid primary key default gen_random_uuid(),
 claim_id uuid not null references community_impact_claim(id) on delete restrict,
 reviewer_user_id uuid not null references app_user(id) on delete restrict,
 category text not null,
 contribution_type text not null,
 contribution_role text not null,
 evidence_quality text not null check(evidence_quality in('insufficient','limited','adequate','strong','exceptional')),
 outcome_maturity text not null check(outcome_maturity in('activity','output','outcome','sustained_impact')),
 attribution_share numeric(5,2) not null check(attribution_share>0 and attribution_share<=100),
 rubric jsonb not null check(jsonb_typeof(rubric)='object'),
 evidence_references uuid[] not null check(cardinality(evidence_references)>0),
 rationale text not null check(length(trim(rationale)) between 12 and 2000),
 risk_level text not null check(risk_level in('standard','elevated','high')),
 status text not null default 'pending_second_review' check(status in('pending_second_review','approved','rejected')),
 second_reviewer_user_id uuid references app_user(id) on delete restrict,
 second_review_rationale text,
 approved_at timestamptz,
 created_at timestamptz not null default now(),
 check((status='approved' and approved_at is not null and (risk_level='standard' or second_reviewer_user_id is not null)) or status<>'approved')
);
create table if not exists community_impact_contribution_assessment_event (
 id uuid primary key default gen_random_uuid(),
 assessment_id uuid not null references community_impact_contribution_assessment(id) on delete restrict,
 actor_user_id uuid not null references app_user(id) on delete restrict,
 event_code text not null check(event_code in('proposed','second_review_approved','second_review_rejected')),
 rationale text not null check(length(trim(rationale)) between 8 and 2000),
 created_at timestamptz not null default now()
);
create table if not exists community_impact_retention_evaluation (
 id uuid primary key default gen_random_uuid(),
 data_class text not null check(data_class in('claim_metadata','identity_assurance_artifacts','raw_evidence','consent_and_rights_records','reviewer_notes','referral_attribution_records','audit_events','score_ledger')),
 source_table text not null,
 source_record_id uuid not null,
 policy_version_id uuid not null references community_impact_retention_policy_version(id) on delete restrict,
 evaluated_at timestamptz not null default now(),
 due_at timestamptz,
 expiry_action text not null check(expiry_action in('hard_delete','anonymize','restrict_access','retain_minimal')),
 disposition text not null default 'review_required' check(disposition in('review_required','legal_hold','not_due','deletion_not_authorized')),
 metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
 unique(data_class,source_table,source_record_id,policy_version_id)
);
create table if not exists community_impact_governance_event (
 id uuid primary key default gen_random_uuid(),
 aggregate_type text not null,
 aggregate_id uuid not null,
 actor_user_id uuid references app_user(id) on delete restrict,
 event_code text not null,
 rationale text not null check(length(trim(rationale)) between 4 and 2000),
 metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
 created_at timestamptz not null default now()
);

insert into app_permission(permission_code,area,label,description,sensitive,system_only) values
('community_impact.identity.review','Community Impact','Verify non-member claimant identity','Review identity assurance for authenticated non-member claimants; does not grant membership.',true,true),
('community_impact.offline_attribution.review','Community Impact','Verify offline contributor attribution','Review evidence-backed individual attribution for offline projects.',true,true),
('community_impact.detection_policy.manage','Community Impact','Propose detection policy versions','Propose versioned detection rules; approval and activation are separate.',true,true),
('community_impact.detection_policy.approve','Community Impact','Approve detection policy versions','Independently approve and activate detection policy versions.',true,true),
('community_impact.claim.assess','Community Impact','Assess contribution claims','Record case-level assessment; does not grant global policy or source-record editing.',true,true),
('community_impact.claim.second_review','Community Impact','Second-review elevated assessments','Independently approve elevated/high-risk contribution assessments.',true,true),
('community_impact.retention.evaluate','Community Impact','Evaluate retention due dates','Evaluate retention eligibility without deleting or anonymizing records.',true,true)
on conflict(permission_code) do update set area=excluded.area,label=excluded.label,description=excluded.description,sensitive=excluded.sensitive,system_only=excluded.system_only;

create or replace function community_impact_block_conflicted_assignment() returns trigger language plpgsql as $$
begin
 if exists(select 1 from community_impact_reviewer_conflict c where c.claim_id=new.claim_id and c.reviewer_user_id=new.reviewer_user_id and c.status in('declared','confirmed','recused')) then
  raise exception 'Reviewer has a declared or confirmed conflict of interest';
 end if;
 return new;
end; $$;
drop trigger if exists trg_community_impact_block_conflicted_assignment on community_impact_claim_assignment;
create trigger trg_community_impact_block_conflicted_assignment before insert on community_impact_claim_assignment for each row execute function community_impact_block_conflicted_assignment();

create or replace function community_impact_governance_history_immutable() returns trigger language plpgsql as $$ begin raise exception 'Community Impact governance history is append-only'; end; $$;
drop trigger if exists trg_community_impact_policy_event_immutable on community_impact_detection_policy_event;
create trigger trg_community_impact_policy_event_immutable before update or delete on community_impact_detection_policy_event for each row execute function community_impact_governance_history_immutable();
drop trigger if exists trg_community_impact_assessment_event_immutable on community_impact_contribution_assessment_event;
create trigger trg_community_impact_assessment_event_immutable before update or delete on community_impact_contribution_assessment_event for each row execute function community_impact_governance_history_immutable();
drop trigger if exists trg_community_impact_governance_event_immutable on community_impact_governance_event;
create trigger trg_community_impact_governance_event_immutable before update or delete on community_impact_governance_event for each row execute function community_impact_governance_history_immutable();

comment on table community_impact_identity_assurance_case is 'Identity assurance for authenticated non-member claimants; verification does not create or grant membership.';
comment on table community_impact_offline_attribution is 'Evidence-backed proposed individual attribution for offline project candidates; staff entry identity is never inferred as contributor.';
comment on table community_impact_claim_candidate_link is 'Reviewer-controlled one-to-one reconciliation between a manual claim and a detected source candidate.';
comment on table community_impact_contribution_assessment is 'Immutable case-level assessment proposals with independent second review for elevated/high risk; not a global scoring policy.';
comment on table community_impact_retention_evaluation is 'Non-destructive retention evaluation ledger. No delete, anonymize or storage purge is executed by this table.';

create or replace function community_impact_block_conflicted_decision() returns trigger language plpgsql as $$
begin
 if exists(select 1 from community_impact_reviewer_conflict c where c.claim_id=new.claim_id and c.reviewer_user_id=new.reviewer_user_id and c.status in('declared','confirmed','recused')) then
  raise exception 'Reviewer has an active conflict of interest';
 end if;
 return new;
end; $$;
drop trigger if exists trg_community_impact_block_conflicted_decision on community_impact_claim_decision;
create trigger trg_community_impact_block_conflicted_decision before insert on community_impact_claim_decision for each row execute function community_impact_block_conflicted_decision();

alter table community_impact_offline_attribution add column if not exists contributor_confirmed_at timestamptz;
alter table community_impact_offline_attribution add column if not exists contributor_confirmation_note text;

create or replace function community_impact_detection_policy_activation_guard() returns trigger language plpgsql as $$
begin
 if not exists(select 1 from community_impact_detection_policy_governance g where g.policy_version_id=new.policy_version_id and g.status in('approved','active')) then
  raise exception 'Only independently approved Community Impact detection policies may be activated';
 end if;
 return new;
end; $$;
drop trigger if exists trg_community_impact_detection_policy_activation_guard on community_impact_detection_active_policy;
create trigger trg_community_impact_detection_policy_activation_guard before insert or update on community_impact_detection_active_policy for each row execute function community_impact_detection_policy_activation_guard();

create or replace function community_impact_offline_attribution_guard() returns trigger language plpgsql as $$
begin
 if TG_OP='DELETE' then raise exception 'Offline contributor attribution history cannot be deleted'; end if;
 if NEW.id is distinct from OLD.id or NEW.candidate_id is distinct from OLD.candidate_id
  or NEW.contributor_user_id is distinct from OLD.contributor_user_id or NEW.proposed_by is distinct from OLD.proposed_by
  or NEW.contribution_role is distinct from OLD.contribution_role or NEW.attribution_share is distinct from OLD.attribution_share
  or NEW.rationale is distinct from OLD.rationale or NEW.created_at is distinct from OLD.created_at then
  raise exception 'Offline attribution provenance is immutable';
 end if;
 if NEW.status is distinct from OLD.status and not (OLD.status='submitted' and NEW.status='under_review' or OLD.status='under_review' and NEW.status in('verified','declined')) then
  raise exception 'Invalid offline attribution lifecycle transition';
 end if;
 if OLD.contributor_confirmed_at is not null and (NEW.contributor_confirmed_at is distinct from OLD.contributor_confirmed_at or NEW.contributor_confirmation_note is distinct from OLD.contributor_confirmation_note) then
  raise exception 'Contributor confirmation is immutable';
 end if;
 return NEW;
end; $$;
drop trigger if exists trg_community_impact_offline_attribution_guard on community_impact_offline_attribution;
create trigger trg_community_impact_offline_attribution_guard before update or delete on community_impact_offline_attribution for each row execute function community_impact_offline_attribution_guard();

drop trigger if exists trg_community_impact_identity_decision_immutable on community_impact_identity_assurance_decision;
create trigger trg_community_impact_identity_decision_immutable before update or delete on community_impact_identity_assurance_decision for each row execute function community_impact_governance_history_immutable();
drop trigger if exists trg_community_impact_identity_evidence_immutable on community_impact_identity_assurance_evidence;
create trigger trg_community_impact_identity_evidence_immutable before update or delete on community_impact_identity_assurance_evidence for each row execute function community_impact_governance_history_immutable();
drop trigger if exists trg_community_impact_retention_evaluation_immutable on community_impact_retention_evaluation;
create trigger trg_community_impact_retention_evaluation_immutable before update or delete on community_impact_retention_evaluation for each row execute function community_impact_governance_history_immutable();

create or replace function community_impact_assessment_guard() returns trigger language plpgsql as $$
begin
 if TG_OP='DELETE' then raise exception 'Contribution assessments cannot be deleted'; end if;
 if NEW.id is distinct from OLD.id or NEW.claim_id is distinct from OLD.claim_id or NEW.reviewer_user_id is distinct from OLD.reviewer_user_id
  or NEW.category is distinct from OLD.category or NEW.contribution_type is distinct from OLD.contribution_type
  or NEW.contribution_role is distinct from OLD.contribution_role or NEW.evidence_quality is distinct from OLD.evidence_quality
  or NEW.outcome_maturity is distinct from OLD.outcome_maturity or NEW.attribution_share is distinct from OLD.attribution_share
  or NEW.rubric is distinct from OLD.rubric or NEW.evidence_references is distinct from OLD.evidence_references
  or NEW.rationale is distinct from OLD.rationale or NEW.risk_level is distinct from OLD.risk_level
  or NEW.created_at is distinct from OLD.created_at then
  raise exception 'Contribution assessment proposal is immutable';
 end if;
 if NEW.status is distinct from OLD.status and not (OLD.status='pending_second_review' and NEW.status in('approved','rejected')) then
  raise exception 'Invalid contribution assessment review transition';
 end if;
 return NEW;
end; $$;
drop trigger if exists trg_community_impact_assessment_guard on community_impact_contribution_assessment;
create trigger trg_community_impact_assessment_guard before update or delete on community_impact_contribution_assessment for each row execute function community_impact_assessment_guard();
