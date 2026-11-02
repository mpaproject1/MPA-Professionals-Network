-- Balance dispositions and backfill application fee obligations without rewriting payment history.
create table if not exists membership_fee_balance_disposition (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references membership_fee_obligation(id) on delete restrict,
  disposition_type text not null check(disposition_type in ('will_pay_later','sponsored','honored_member','volunteer_activity_valuated')),
  amount numeric(14,2) not null check(amount > 0),
  currency char(3) not null check(currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending' check(status in ('pending','active','approved','rejected','closed')),
  due_date date,
  remark text not null check(length(trim(remark)) >= 8),
  details jsonb not null default '{}'::jsonb,
  requested_by uuid not null references app_user(id),
  approved_by uuid references app_user(id),
  approved_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((disposition_type='will_pay_later' and status in ('active','closed','rejected') and due_date is not null)
      or (disposition_type<>'will_pay_later' and status in ('pending','approved','rejected','closed'))),
  check (status<>'approved' or (approved_by is not null and approved_at is not null and approved_by<>requested_by))
);
create index if not exists membership_fee_disposition_due_idx on membership_fee_balance_disposition(status,due_date);
create index if not exists membership_fee_disposition_obligation_idx on membership_fee_balance_disposition(obligation_id,created_at desc);

-- Online application fee snapshots are authoritative. Historical membership records without
-- a saved fee snapshot are intentionally not guessed from today's product price.
insert into membership_fee_obligation(application_id,fee_snapshot,amount_due,currency,created_by)
select a.id,a.fee_snapshot,(a.fee_snapshot->>'amount')::numeric,upper(a.fee_snapshot->>'currency'),a.user_id
from membership_application a
where jsonb_typeof(a.fee_snapshot)='object'
  and coalesce(a.fee_snapshot->>'amount','') ~ '^[0-9]+([.][0-9]{1,2})?$'
  and upper(coalesce(a.fee_snapshot->>'currency','')) ~ '^[A-Z]{3}$'
on conflict(application_id) do nothing;

insert into membership_fee_obligation_payment(obligation_id,payment_transaction_id)
select o.id,ap.payment_transaction_id
from membership_fee_obligation o
join membership_application_payment ap on ap.application_id=o.application_id
on conflict(payment_transaction_id) do nothing;

create or replace function membership_link_application_payment_to_obligation() returns trigger language plpgsql as $$
begin
  insert into membership_fee_obligation_payment(obligation_id,payment_transaction_id)
  select id,new.payment_transaction_id from membership_fee_obligation where application_id=new.application_id
  on conflict(payment_transaction_id) do nothing;
  return new;
end $$;
drop trigger if exists trg_membership_application_payment_fee_obligation on membership_application_payment;
create trigger trg_membership_application_payment_fee_obligation
after insert on membership_application_payment
for each row execute function membership_link_application_payment_to_obligation();

-- Keep new application fee snapshots represented by a balance obligation from creation onward.
create or replace function membership_create_fee_obligation() returns trigger language plpgsql as $$
declare amount_text text; currency_text text;
begin
  amount_text:=new.fee_snapshot->>'amount';
  currency_text:=upper(new.fee_snapshot->>'currency');
  if coalesce(amount_text,'') ~ '^[0-9]+([.][0-9]{1,2})?$' and coalesce(currency_text,'') ~ '^[A-Z]{3}$' then
    insert into membership_fee_obligation(application_id,fee_snapshot,amount_due,currency,created_by)
    values(new.id,new.fee_snapshot,amount_text::numeric,currency_text,new.user_id)
    on conflict(application_id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists trg_membership_application_fee_obligation on membership_application;
create trigger trg_membership_application_fee_obligation
after insert on membership_application
for each row execute function membership_create_fee_obligation();
