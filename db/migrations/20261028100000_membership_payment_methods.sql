-- Membership payment methods are configured by authorized administrators. Never store provider secrets here.
create table if not exists membership_payment_method (
  method_code text primary key check (method_code ~ '^[a-z][a-z0-9_]{1,39}$'),
  method_type text not null check (method_type in ('chapa','telebirr','bank_transfer','cash','manual')),
  display_name text not null,
  enabled boolean not null default false,
  currency char(3) not null default 'ETB',
  instructions text not null default '',
  bank_name text,
  account_name text,
  account_number text,
  provider_code text,
  qr_image_url text,
  metadata jsonb not null default '{}'::jsonb,
  updated_by uuid references app_user(id) on delete restrict,
  updated_at timestamptz not null default now()
);
alter table payment_transaction add column if not exists payment_method_code text;
create index if not exists ix_membership_payment_method_enabled on membership_payment_method(enabled,method_type);

create table if not exists membership_payment_webhook_event (
  payload_sha256 char(64) not null,
  environment_mode text not null check (environment_mode in ('test','live')),
  event_type text not null,
  merchant_reference text,
  result_status text not null check (result_status in ('processed','pending')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  primary key(environment_mode,payload_sha256)
);
