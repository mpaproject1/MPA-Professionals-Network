-- Disposable development test portfolios. Test records are discovered by provenance
-- triggers; reset is fail-closed and deletes only rows registered to one portfolio.
create table if not exists test_portfolio (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 environment text not null,
 database_name text not null,
 branch_ref text,
 commit_sha text,
 status text not null default 'active' check(status in ('active','reset')),
 created_by uuid not null references app_user(id) on delete restrict,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 reset_at timestamptz,
 reset_by uuid references app_user(id) on delete set null,
 reset_reason text,
 metadata jsonb not null default '{}'::jsonb
);
create unique index if not exists uq_test_portfolio_active_name on test_portfolio(lower(name)) where status='active';
create table if not exists test_portfolio_account (
 portfolio_id uuid not null references test_portfolio(id) on delete restrict,
 user_id uuid not null references app_user(id) on delete restrict,
 email text not null,
 display_name text not null,
 persona text not null,
 role_code text not null,
 password_ciphertext text not null,
 created_at timestamptz not null default now(),
 primary key(portfolio_id,user_id),
 unique(email)
);
create table if not exists test_portfolio_record (
 portfolio_id uuid not null references test_portfolio(id) on delete restrict,
 table_name text not null,
 entity_id uuid not null,
 captured_at timestamptz not null default now(),
 primary key(portfolio_id,table_name,entity_id)
);
create index if not exists ix_test_portfolio_record_lookup on test_portfolio_record(portfolio_id,table_name);
create table if not exists test_delivery_capture (
 id uuid primary key default gen_random_uuid(),
 portfolio_id uuid references test_portfolio(id) on delete set null,
 channel text not null check(channel in ('email','push','payment')),
 recipient text,
 event_code text not null,
 payload jsonb not null default '{}'::jsonb,
 captured_at timestamptz not null default now()
);
create index if not exists ix_test_delivery_capture_portfolio on test_delivery_capture(portfolio_id,channel,captured_at desc);

create or replace function test_lab_capture_owned_record() returns trigger language plpgsql as $$
declare row_data jsonb; portfolio uuid; entity uuid;
begin
 row_data:=to_jsonb(new);
 if row_data ? 'id' then
  begin entity:=(row_data->>'id')::uuid; exception when others then return new; end;
 else return new; end if;
 select a.portfolio_id into portfolio
 from test_portfolio_account a join test_portfolio p on p.id=a.portfolio_id and p.status='active'
 where exists(
  select 1 from jsonb_each_text(row_data) v
  where (v.key in ('user_id','created_by','updated_by','owner_user_id','actor_user_id','reviewer_user_id','assigned_by','assigned_to_user_id','assignee_user_id','submitted_by','decided_by','reviewed_by','approved_by','rejected_by','requested_by','responded_by','completed_by','claimant_user_id','member_user_id','mentor_user_id','mentee_user_id','candidate_user_id','applicant_user_id','requester_user_id','provider_user_id','donor_user_id','volunteer_user_id','representative_user_id','organization_owner_user_id','recipient_user_id','invited_by') and v.value=a.user_id::text)
     or (v.key in ('email','recipient','candidate_email','contact_email') and lower(v.value)=lower(a.email))
 )
 limit 1;
 if portfolio is not null then
  insert into test_portfolio_record(portfolio_id,table_name,entity_id)
  values(portfolio,TG_TABLE_NAME,entity)
  on conflict do nothing;
 end if;
 return new;
end $$;

do $$
declare t record;
begin
 for t in
  select distinct c.relname table_name
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  join pg_index ix on ix.indrelid=c.oid and ix.indisprimary
  join pg_attribute a on a.attrelid=c.oid and a.attnum=any(ix.indkey)
  where n.nspname='public' and c.relkind='r' and a.attname='id' and a.atttypid='uuid'::regtype
    and c.relname not like 'test_portfolio%'
    and c.relname<>'test_delivery_capture'
 loop
  execute format('drop trigger if exists trg_test_lab_capture_owned_record on public.%I',t.table_name);
  execute format('create trigger trg_test_lab_capture_owned_record after insert or update on public.%I for each row execute function test_lab_capture_owned_record()',t.table_name);
 end loop;
end $$;
