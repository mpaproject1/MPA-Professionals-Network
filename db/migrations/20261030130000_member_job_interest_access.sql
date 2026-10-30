-- Workstream 10: authenticated, eligible-member job-interest requests.
-- Keep the private continuation secret hash separate from the client idempotency key hash.
alter table public_opportunity_inquiry
  add column if not exists submission_idempotency_hash text;

create unique index if not exists ux_public_opportunity_inquiry_submission_idempotency
  on public_opportunity_inquiry(submission_idempotency_hash)
  where submission_idempotency_hash is not null;

create index if not exists ix_public_opportunity_inquiry_member_job
  on public_opportunity_inquiry(app_user_id, updated_at desc)
  where inquiry_type='job' and job_id is null;

-- Idempotent Support Desk status decisions for member job-interest requests.
create table if not exists public_opportunity_inquiry_decision_idempotency (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public_opportunity_inquiry(id) on delete restrict,
  actor_user_id uuid not null references app_user(id) on delete restrict,
  idempotency_key_hash text not null,
  payload_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  unique(inquiry_id,actor_user_id,idempotency_key_hash)
);
