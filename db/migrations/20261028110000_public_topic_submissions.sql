-- Public topic suggestions are a separate moderation queue, never private demand records.
create table if not exists marketplace_public_topic_submission (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references app_user(id) on delete restrict,
  demand_type text not null check (demand_type in ('service','mentorship')),
  title text not null check (char_length(title) between 4 and 180),
  summary text not null check (char_length(summary) between 10 and 1200),
  category text not null check (char_length(category) between 1 and 120),
  delivery_mode text not null check (delivery_mode in ('remote','onsite','hybrid','flexible')),
  location_label text,
  request_idempotency_hash char(64) not null unique,
  request_fingerprint char(64) not null,
  status text not null default 'pending_review' check (status in ('pending_review','approved','rejected','changes_requested')),
  reviewer_user_id uuid references app_user(id) on delete restrict,
  reviewer_note text,
  published_topic_id uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_marketplace_public_topic_submission_owner on marketplace_public_topic_submission(submitted_by,created_at desc);
create index if not exists ix_marketplace_public_topic_submission_review on marketplace_public_topic_submission(status,created_at);
