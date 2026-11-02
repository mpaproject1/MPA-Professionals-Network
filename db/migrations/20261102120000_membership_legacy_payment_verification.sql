-- Finance verification gate for historical membership imports.
-- Import approval alone is not proof of membership dues payment and must not unlock account claiming.
create table if not exists membership_legacy_payment_verification (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references membership_record(id) on delete restrict,
  payment_reference text not null,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  payment_date date not null,
  payment_method text not null check (payment_method in ('bank_transfer','telebirr','cash','mobile_money','other')),
  evidence_reference text not null,
  finance_note text,
  verified_by uuid not null references app_user(id) on delete restrict,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint uq_membership_legacy_payment_verification_membership unique (membership_id)
);

create unique index if not exists uq_membership_legacy_payment_reference
  on membership_legacy_payment_verification(lower(payment_reference));

create index if not exists ix_membership_legacy_payment_verification_verified_at
  on membership_legacy_payment_verification(verified_at desc);
