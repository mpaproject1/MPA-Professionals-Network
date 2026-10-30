-- MPA governance: no vacancy may be publicly visible without an explicit MPA review decision.
alter table job
  add column if not exists review_status text not null default 'not_submitted',
  add column if not exists review_submitted_at timestamptz,
  add column if not exists reviewed_by uuid references app_user(id) on delete restrict,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_reason text;

alter table job drop constraint if exists job_review_status_check;
alter table job add constraint job_review_status_check
  check (review_status in ('not_submitted','pending','approved','rejected','correction_required'));

create index if not exists ix_job_mpa_review_queue
  on job(review_status,review_submitted_at,created_at)
  where status='pending_review';

-- Existing published vacancies must be reviewed under the new mandatory policy.
-- They are removed from public discovery immediately until an authorized reviewer approves them.
update job
set status='pending_review',
    review_status='pending',
    review_submitted_at=coalesce(review_submitted_at,published_at,created_at,now()),
    reviewed_by=null,
    reviewed_at=null,
    review_reason='Queued for mandatory MPA review under the vacancy publication policy.',
    updated_at=now()
where status='published';

-- Keep pre-existing pending-review vacancies in the explicit review queue as well.
update job
set review_status='pending',
    review_submitted_at=coalesce(review_submitted_at,created_at,now())
where status='pending_review' and review_status='not_submitted';
