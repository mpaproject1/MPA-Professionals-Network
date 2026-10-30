-- General finance receipts and independently verifiable payment vouchers.
-- These records do not create or mutate membership applications or membership status.
create table if not exists finance_payment_record (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,
  payer_type text not null check (payer_type in ('member','organization','sponsor','donor','other')),
  payer_name text not null,
  payer_email text,
  payer_phone text,
  payer_user_id uuid references app_user(id) on delete set null,
  organization_name text,
  amount numeric(14,2) not null check (amount > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  purpose text not null,
  payment_method text not null check (payment_method in ('bank_transfer','cash','mobile_money','cheque','card','other')),
  payment_date date not null,
  bank_name text,
  bank_reference text,
  external_reference text,
  evidence_file_id uuid references file_object(id) on delete set null,
  notes text,
  status text not null default 'recorded' check (status in ('recorded','verified','rejected','reversed')),
  recorded_by uuid not null references app_user(id),
  request_id text,
  verified_at timestamptz,
  verified_by uuid references app_user(id),
  verification_note text,
  reversed_at timestamptz,
  reversed_by uuid references app_user(id),
  reversal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status <> 'verified') or (verified_at is not null and verified_by is not null)),
  check ((status <> 'reversed') or (reversed_at is not null and reversed_by is not null and length(trim(coalesce(reversal_reason,''))) >= 8))
);
create index if not exists finance_payment_record_status_date_idx on finance_payment_record(status,payment_date desc,created_at desc);
create index if not exists finance_payment_record_payer_user_idx on finance_payment_record(payer_user_id) where payer_user_id is not null;
create index if not exists finance_payment_record_reference_idx on finance_payment_record(bank_reference) where bank_reference is not null;
create index if not exists finance_payment_record_evidence_idx on finance_payment_record(evidence_file_id) where evidence_file_id is not null;
create table if not exists finance_payment_voucher (
  id uuid primary key default gen_random_uuid(),
  payment_record_id uuid not null references finance_payment_record(id) on delete restrict,
  voucher_number text not null unique,
  verification_token_sha256 char(64) not null,
  issued_by uuid not null references app_user(id),
  issued_at timestamptz not null default now(),
  revoked_by uuid references app_user(id),
  revoked_at timestamptz,
  revocation_reason text,
  created_at timestamptz not null default now(),
  unique(payment_record_id, id),
  check ((revoked_at is null) or (revoked_by is not null and length(trim(coalesce(revocation_reason,''))) >= 8))
);
create unique index if not exists finance_payment_voucher_one_active_idx on finance_payment_voucher(payment_record_id) where revoked_at is null;
insert into app_permission(permission_code,area,label,description,sensitive,system_only) values
 ('finance.payment.record','Finance','Record manual finance payments','Record manual receipts and attach evidence; does not verify receipt or issue vouchers.',true,false),
 ('finance.voucher.issue','Finance','Issue verified payment vouchers','Issue branded QR-verifiable receipts for independently verified payments.',true,false)
on conflict(permission_code) do update set area=excluded.area,label=excluded.label,description=excluded.description,sensitive=excluded.sensitive,system_only=excluded.system_only;

alter table finance_payment_record add column if not exists organization_id uuid references organization(id) on delete set null;
create index if not exists finance_payment_record_organization_idx on finance_payment_record(organization_id) where organization_id is not null;
