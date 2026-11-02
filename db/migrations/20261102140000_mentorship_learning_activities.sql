create table if not exists mentorship_learning_activity (
  id uuid primary key default gen_random_uuid(),
  mentorship_id uuid not null references mentorship(id) on delete cascade,
  created_by uuid not null references app_user(id),
  title text not null check (length(btrim(title)) between 4 and 180),
  instructions text not null check (length(btrim(instructions)) between 10 and 4000),
  due_at timestamptz,
  status text not null default 'published' check (status in ('published','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mentorship_learning_activity_relationship_idx
  on mentorship_learning_activity(mentorship_id, status, created_at desc);

create table if not exists mentorship_learning_submission (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references mentorship_learning_activity(id) on delete cascade,
  submitted_by uuid not null references app_user(id),
  version integer not null check (version > 0),
  response text not null check (length(btrim(response)) between 10 and 10000),
  status text not null default 'submitted' check (status in ('submitted','accepted','changes_requested')),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(activity_id, submitted_by, version)
);

create index if not exists mentorship_learning_submission_activity_idx
  on mentorship_learning_submission(activity_id, submitted_at desc);

create table if not exists mentorship_learning_review (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references mentorship_learning_submission(id) on delete cascade,
  reviewer_user_id uuid not null references app_user(id),
  decision text not null check (decision in ('accepted','changes_requested')),
  feedback text not null check (length(btrim(feedback)) between 5 and 3000),
  created_at timestamptz not null default now()
);

create index if not exists mentorship_learning_review_submission_idx
  on mentorship_learning_review(submission_id, created_at desc);
