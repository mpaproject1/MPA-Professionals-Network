-- Allow the existing auditable membership payment reversal ledger to reference
-- a historical imported membership record that has no membership_application row.
alter table membership_payment_reversal
  alter column application_id drop not null;

alter table membership_payment_reversal
  add column if not exists membership_record_id uuid references membership_record(id) on delete restrict;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='ck_membership_payment_reversal_subject'
      and conrelid='membership_payment_reversal'::regclass
  ) then
    alter table membership_payment_reversal
      add constraint ck_membership_payment_reversal_subject
      check (application_id is not null or membership_record_id is not null);
  end if;
end $$;

create index if not exists ix_membership_payment_reversal_membership_record
  on membership_payment_reversal(membership_record_id,created_at desc)
  where membership_record_id is not null;
