alter table membership_fee_balance_disposition add column if not exists idempotency_key text;
create unique index if not exists membership_fee_balance_disposition_idempotency_idx
 on membership_fee_balance_disposition(idempotency_key) where idempotency_key is not null;
