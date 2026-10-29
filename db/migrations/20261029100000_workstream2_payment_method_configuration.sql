-- Workstream 2: immutable payment-method details captured at submission time.
-- Additive only. Never reconstruct a historical snapshot from mutable current configuration.
alter table payment_transaction
  add column if not exists payment_method_snapshot jsonb;

update payment_transaction
set payment_method_snapshot = request_payload->'methodSnapshot'
where payment_method_snapshot is null
  and jsonb_typeof(request_payload->'methodSnapshot') = 'object';

create index if not exists ix_payment_transaction_method_snapshot_present
  on payment_transaction(payment_method_code)
  where payment_method_snapshot is not null;
