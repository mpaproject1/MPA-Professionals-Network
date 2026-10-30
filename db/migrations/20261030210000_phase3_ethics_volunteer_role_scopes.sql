-- Phase 3: independent professional ethics cases and member volunteer pledges.
-- No existing verification, membership, organization or payment records are rewritten.

create table if not exists ethics_case (
  id uuid primary key default gen_random_uuid(),
  case_reference text not null unique,
  reporter_user_id uuid not null references app_user(id) on delete restrict,
  subject_user_id uuid references app_user(id) on delete set null,
  organization_id uuid references organization(id) on delete set null,
  title text not null check (length(trim(title)) between 5 and 160),
  category text not null check (category in ('professional_conduct','integrity','conflict_of_interest','confidentiality','harassment','discrimination','safeguarding','misuse_of_resources','misrepresentation','governance_concern','shariah_governance_referral','other')),
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  status text not null default 'submitted' check (status in ('submitted','triage','investigation','respondent_response','panel_review','decision_pending','decided','referred','closed','withdrawn')),
  incident_summary text not null check (length(trim(incident_summary)) between 20 and 6000),
  incident_date date,
  location_text text,
  framework_references jsonb not null default '[]'::jsonb check (jsonb_typeof(framework_references)='array'),
  confidentiality_level text not null default 'restricted' check (confidentiality_level in ('restricted','highly_restricted')),
  assigned_reviewer_id uuid references app_user(id) on delete set null,
  assigned_at timestamptz,
  triage_notes text,
  reviewer_assessment text,
  respondent_response text,
  findings text,
  decision text check (decision is null or decision in ('substantiated','partially_substantiated','not_substantiated','inconclusive','referred_to_authority','no_action')),
  decision_reason text,
  decided_by uuid references app_user(id),
  decided_at timestamptz,
  outcome_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status <> 'decided') or (decision is not null and decided_by is not null and decided_at is not null and length(trim(coalesce(decision_reason,''))) >= 8))
);
alter table ethics_case add column if not exists subject_name text;
alter table ethics_case add column if not exists organization_name text;

create index if not exists ethics_case_queue_idx on ethics_case(status,severity desc,created_at) where status not in ('closed','withdrawn');
create index if not exists ethics_case_assignee_idx on ethics_case(assigned_reviewer_id,status,updated_at desc);
create index if not exists ethics_case_reporter_idx on ethics_case(reporter_user_id,created_at desc);
create index if not exists ethics_case_subject_idx on ethics_case(subject_user_id,created_at desc) where subject_user_id is not null;

create table if not exists ethics_case_assignment_history (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references ethics_case(id) on delete restrict,
  previous_reviewer_id uuid references app_user(id),
  new_reviewer_id uuid references app_user(id),
  changed_by uuid not null references app_user(id),
  reason text not null check (length(trim(reason)) >= 8),
  created_at timestamptz not null default now()
);
create table if not exists ethics_case_panel_member (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references ethics_case(id) on delete restrict,
  reviewer_id uuid not null references app_user(id) on delete restrict,
  assigned_by uuid not null references app_user(id),
  created_at timestamptz not null default now(),
  active boolean not null default true,
  unique(case_id,reviewer_id)
);
create table if not exists ethics_case_review (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references ethics_case(id) on delete restrict,
  reviewer_id uuid not null references app_user(id),
  review_type text not null check (review_type in ('investigation','panel')),
  recommendation text not null check (recommendation in ('substantiated','partially_substantiated','not_substantiated','inconclusive','refer','no_action')),
  assessment text not null check (length(trim(assessment)) between 20 and 6000),
  created_at timestamptz not null default now(),
  unique(case_id,reviewer_id,review_type)
);
create table if not exists ethics_case_conflict (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references ethics_case(id) on delete restrict,
  reviewer_id uuid not null references app_user(id),
  reason text not null check (length(trim(reason)) between 8 and 2000),
  resolution text not null default 'recused' check (resolution in ('recused','cleared')),
  resolved_by uuid references app_user(id),
  created_at timestamptz not null default now(),
  unique(case_id,reviewer_id)
);
create table if not exists ethics_case_event (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references ethics_case(id) on delete restrict,
  actor_user_id uuid references app_user(id),
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ethics_case_event_history_idx on ethics_case_event(case_id,created_at desc);

create table if not exists ethics_case_evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references ethics_case(id) on delete restrict,
  file_object_id uuid not null references file_object(id) on delete restrict,
  description text not null check (length(trim(description)) between 5 and 500),
  added_by uuid not null references app_user(id),
  created_at timestamptz not null default now(),
  unique(case_id,file_object_id)
);

insert into app_permission(permission_code,area,label,description,sensitive,system_only) values
 ('verification.appeal.review','Verification','Review independent verification appeals','Access and decide verification appeals independently from the original case reviewer.',true,false),
 ('ethics.case.intake','Ethics','Submit a confidential ethics concern','Submit a confidential professional ethics concern for independent review.',true,false),
 ('ethics.case.review','Ethics','Review assigned ethics cases','Access assigned ethics cases, edit reviewer assessments and record independent panel recommendations.',true,false),
 ('ethics.case.assign','Ethics','Assign ethics reviewers','Assign ethics case owners and panel members; system administrator authority only.',true,true)
on conflict(permission_code) do update set area=excluded.area,label=excluded.label,description=excluded.description,sensitive=excluded.sensitive,system_only=excluded.system_only;

create table if not exists member_volunteer_pledge (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  service_title text not null check (length(trim(service_title)) between 4 and 120),
  service_category text not null check (length(trim(service_category)) between 2 and 80),
  description text not null check (length(trim(description)) between 20 and 2000),
  beneficiary_scopes text[] not null check (cardinality(beneficiary_scopes)>0 and beneficiary_scopes <@ array['community','mpa','members']::text[]),
  availability_details text not null check (length(trim(availability_details)) between 5 and 500),
  hours_per_week numeric(5,2) not null check (hours_per_week > 0 and hours_per_week <= 60),
  duration_weeks integer not null check (duration_weeks between 1 and 104),
  available_from date,
  delivery_mode text not null default 'flexible' check (delivery_mode in ('remote','in_person','hybrid','flexible')),
  location_text text,
  status text not null default 'active' check (status in ('active','paused','completed','withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (available_from is null or available_from >= date '2000-01-01')
);
create index if not exists member_volunteer_pledge_user_idx on member_volunteer_pledge(user_id,status,updated_at desc);
create index if not exists member_volunteer_pledge_report_idx on member_volunteer_pledge(status,service_category);

