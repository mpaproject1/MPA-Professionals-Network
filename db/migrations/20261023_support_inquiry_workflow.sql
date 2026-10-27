-- Durable support workflow metadata without changing the existing conversation status vocabulary.
create table if not exists support_conversation_workflow (
  conversation_id uuid primary key references support_conversation(id) on delete cascade,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  waiting_on text not null default 'none' check (waiting_on in ('none','member','organization','provider','internal')),
  escalated_at timestamptz,
  escalated_by uuid references app_user(id) on delete set null,
  escalation_reason text,
  updated_by uuid references app_user(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_conversation_workflow_escalation_idx
  on support_conversation_workflow (escalated_at desc) where escalated_at is not null;
create index if not exists support_conversation_workflow_queue_idx
  on support_conversation_workflow (priority, waiting_on, updated_at desc);
