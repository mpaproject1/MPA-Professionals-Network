create table if not exists job_interview_change_proposal (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references job_interview(id) on delete restrict,
  proposed_by uuid not null references app_user(id) on delete restrict,
  previous_status text not null check (previous_status in ('scheduled','confirmed')),
  proposed_start timestamptz not null,
  proposed_end timestamptz not null,
  timezone text not null default 'Africa/Addis_Ababa',
  mode text not null check (mode in ('online','onsite','phone')),
  location_text text,
  meeting_url text,
  note text,
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','cancelled')),
  decided_by uuid references app_user(id) on delete restrict,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (proposed_end > proposed_start),
  check ((status='pending' and decided_by is null and decided_at is null)
      or (status<>'pending' and decided_by is not null and decided_at is not null))
);

create unique index if not exists ux_job_interview_change_pending
  on job_interview_change_proposal(interview_id)
  where status='pending';

create index if not exists ix_job_interview_change_history
  on job_interview_change_proposal(interview_id,created_at desc);

comment on table job_interview_change_proposal is
  'Auditable participant-proposed interview schedule changes. A proposal does not alter the active schedule until another participant accepts it.';
