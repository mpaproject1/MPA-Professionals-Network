-- Capture test-owned rows whose primary key is composite or is not a UUID id.
-- Keys are stored as JSON containing primary-key columns only; cleanup never uses
-- user-supplied table names or broad email/domain predicates.
create table if not exists test_portfolio_composite_record (
 portfolio_id uuid not null references test_portfolio(id) on delete restrict,
 table_name text not null,
 primary_key jsonb not null check(jsonb_typeof(primary_key)='object'),
 captured_at timestamptz not null default now(),
 primary key(portfolio_id,table_name,primary_key)
);
create index if not exists ix_test_portfolio_composite_lookup
 on test_portfolio_composite_record(portfolio_id,table_name);

create or replace function test_lab_capture_composite_owned_record() returns trigger language plpgsql as $$
declare
 row_data jsonb;
 key_data jsonb;
 portfolio uuid;
begin
 row_data:=to_jsonb(new);
 select jsonb_object_agg(a.attname,row_data->a.attname order by k.ord)
 into key_data
 from pg_index i
 cross join lateral unnest(i.indkey) with ordinality k(attnum,ord)
 join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum
 where i.indrelid=TG_RELID and i.indisprimary;
 if key_data is null then return new; end if;

 select a.portfolio_id into portfolio
 from test_portfolio_account a
 join test_portfolio p on p.id=a.portfolio_id and p.status='active'
 where exists(
  select 1 from jsonb_each_text(row_data) v
  where (v.key in (
   'user_id','created_by','updated_by','owner_user_id','actor_user_id',
   'reviewer_user_id','assigned_by','assigned_to_user_id','assignee_user_id',
   'submitted_by','decided_by','reviewed_by','approved_by','rejected_by',
   'requested_by','responded_by','completed_by','claimant_user_id',
   'member_user_id','mentor_user_id','mentee_user_id','candidate_user_id',
   'applicant_user_id','requester_user_id','provider_user_id','donor_user_id',
   'volunteer_user_id','representative_user_id','organization_owner_user_id',
   'recipient_user_id','invited_by','participant_user_id','reporter_user_id',
   'payer_user_id','subject_user_id','opened_by','changed_by','submitted_by_user_id'
  ) and v.value=a.user_id::text)
  or (v.key in ('email','recipient','candidate_email','contact_email')
      and lower(v.value)=lower(a.email))
 )
 limit 1;
 if portfolio is not null then
  insert into test_portfolio_composite_record(portfolio_id,table_name,primary_key)
  values(portfolio,TG_TABLE_NAME,key_data)
  on conflict do nothing;
 end if;
 return new;
end $$;

do $$
declare t record;
begin
 for t in
  select distinct c.relname table_name
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  join pg_index ix on ix.indrelid=c.oid and ix.indisprimary
  where n.nspname='public' and c.relkind='r'
    and c.relname not like 'test_portfolio%'
    and c.relname not in ('test_delivery_capture','test_portfolio_composite_record')
    and not exists(
      select 1 from pg_index single_ix
      join pg_attribute a on a.attrelid=single_ix.indrelid
        and a.attnum=any(single_ix.indkey)
      where single_ix.indrelid=c.oid and single_ix.indisprimary
        and single_ix.indnatts=1 and a.attname='id'
        and a.atttypid='uuid'::regtype
    )
 loop
  execute format('drop trigger if exists trg_test_lab_capture_composite_record on public.%I',t.table_name);
  execute format('create trigger trg_test_lab_capture_composite_record after insert or update on public.%I for each row execute function test_lab_capture_composite_owned_record()',t.table_name);
 end loop;
end $$;
