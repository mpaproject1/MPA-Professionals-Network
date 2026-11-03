-- Durable, encrypted recovery for token-bound verification delivery.
-- Raw verification tokens are never stored in clear text or in the ordinary email outbox.
create table if not exists email_verification_delivery (
  id uuid primary key default gen_random_uuid(),
  verification_token_id uuid not null unique references email_verification_token(id) on delete cascade,
  encrypted_token text not null,
  encryption_iv text not null,
  encryption_tag text not null,
  status text not null default 'pending'
    check (status in ('pending','processing','sent','captured','failed','suppressed','expired')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  provider_message_id text,
  provider text,
  last_error text,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  captured_at timestamptz
);
create index if not exists ix_email_verification_delivery_due
  on email_verification_delivery(next_attempt_at,created_at)
  where status in ('pending','failed');
create index if not exists ix_email_verification_delivery_provider_message
  on email_verification_delivery(provider_message_id)
  where provider_message_id is not null;
alter table email_delivery_event
  add column if not exists verification_delivery_id uuid
  references email_verification_delivery(id) on delete set null;
create index if not exists ix_email_delivery_event_verification
  on email_delivery_event(verification_delivery_id)
  where verification_delivery_id is not null;

alter table email_verification_delivery
  add column if not exists provider_delivery_status text
    check (provider_delivery_status is null or provider_delivery_status in ('delivered','bounced','complained','failed')),
  add column if not exists delivery_event_at timestamptz;

-- Verification is a system-managed security message and cannot be restricted by audience.
update email_notification_template set audience='all' where template_code='account.email_verification';
