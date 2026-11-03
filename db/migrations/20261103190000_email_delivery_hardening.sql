-- Email delivery hardening: event-level idempotency, provider event ledger,
-- recipient suppression, and immutable template version history.
alter table notification_outbox add column if not exists delivery_status text not null default 'queued';
alter table notification_outbox add column if not exists delivered_at timestamptz;
alter table notification_outbox add column if not exists delivery_event_at timestamptz;
alter table notification_outbox add column if not exists delivery_event_type text;
alter table notification_outbox add column if not exists email_event_key text;
create unique index if not exists uq_notification_outbox_email_event_key
  on notification_outbox(email_event_key) where channel='email' and email_event_key is not null;
create index if not exists ix_notification_outbox_email_delivery_status
  on notification_outbox(delivery_status,delivery_event_at desc) where channel='email';
create index if not exists ix_notification_outbox_email_provider_message_id
  on notification_outbox(provider_message_id) where channel='email' and provider_message_id is not null;

create table if not exists email_delivery_event (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  provider_message_id text not null,
  event_type text not null check(event_type in ('delivered','bounced','complained','failed')),
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  outbox_id uuid references notification_outbox(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(provider,provider_event_id)
);
create index if not exists ix_email_delivery_event_message
  on email_delivery_event(provider_message_id,occurred_at desc);

create table if not exists email_recipient_suppression (
  id uuid primary key default gen_random_uuid(),
  email_normalized text not null unique,
  reason text not null check(reason in ('hard_bounce','complaint','admin_suppressed')),
  source text not null default 'provider',
  provider_message_id text,
  created_at timestamptz not null default now(),
  cleared_at timestamptz,
  cleared_by uuid references app_user(id) on delete set null,
  clear_reason text
);
create index if not exists ix_email_recipient_suppression_active
  on email_recipient_suppression(email_normalized) where cleared_at is null;

create table if not exists email_template_version (
  id uuid primary key default gen_random_uuid(),
  template_code text not null,
  version_number integer not null,
  display_name text not null,
  audience text not null,
  subject_template text not null,
  text_template text not null,
  html_template text not null,
  enabled boolean not null,
  changed_by uuid references app_user(id) on delete set null,
  change_request_id text,
  created_at timestamptz not null default now(),
  unique(template_code,version_number)
);
insert into email_template_version(template_code,version_number,display_name,audience,subject_template,text_template,html_template,enabled,changed_by)
select t.template_code,1,t.display_name,t.audience,t.subject_template,t.text_template,t.html_template,t.enabled,t.updated_by
from email_notification_template t
where not exists(select 1 from email_template_version v where v.template_code=t.template_code);

-- Preserve historical send acceptance separately from provider delivery outcome.
-- Bounces and complaints must not rewrite a successful provider submission into a
-- misleading transport failure; reporting uses delivery_status and the event ledger.
