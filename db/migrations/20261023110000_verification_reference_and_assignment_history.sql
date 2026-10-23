-- Reviewer reference consent/review and case-assignment history.
-- Source-only until reviewed migration execution; no database is changed by this commit.
alter table verification_reference_request
  add column if not exists requester_user_id uuid references app_user(id) on delete set null,
  add column if not exists referee_user_id uuid references app_user(id) on delete set null,
  add column if not exists response_text text,
  add column if not exists responded_by uuid references app_user(id) on delete set null,
  add column if not exists reviewed_by uuid references app_user(id) on delete set null,
  add column if not exists review_reason text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- Align persisted reference states with the service contract while preserving legacy values.
alter table verification_reference_request
  drop constraint if exists verification_reference_request_consent_status_check;
alter table verification_reference_request
  add constraint verification_reference_request_consent_status_check
  check (consent_status in ('pending','accepted','consented','declined','withdrawn'));

alter table verification_reference_request
  drop constraint if exists verification_reference_request_verification_status_check;
alter table verification_reference_request
  add constraint verification_reference_request_verification_status_check
  check (verification_status in ('pending','received','verified','insufficient','disputed','not_verified','needs_clarification'));

create index if not exists verification_reference_request_referee_idx
  on verification_reference_request(referee_user_id, consent_status, requested_at desc);
create index if not exists verification_reference_request_case_idx
  on verification_reference_request(case_id, requested_at desc);

create table if not exists verification_case_assignment_history (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references verification_case(id) on delete cascade,
  previous_reviewer_id uuid references app_user(id) on delete set null,
  new_reviewer_id uuid references app_user(id) on delete set null,
  changed_by uuid not null references app_user(id) on delete restrict,
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists verification_case_assignment_history_case_idx
  on verification_case_assignment_history(case_id, created_at desc);
