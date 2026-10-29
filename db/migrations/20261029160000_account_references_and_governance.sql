-- Workstream 6: immutable human-facing account references and auditable backfill.
-- UUID primary keys remain unchanged for all relationships, APIs and historical audit records.
create sequence if not exists app_user_account_reference_seq start with 1;
create or replace function next_account_reference_suffix() returns text language plpgsql as $$
declare n bigint;
begin n:=nextval('app_user_account_reference_seq'); return lpad(n::text,greatest(6,length(n::text)),'0'); end; $$;
alter table app_user add column if not exists account_reference text, add column if not exists account_reference_source text, add column if not exists account_reference_assigned_at timestamptz;
update app_user set account_reference='MPA-'||to_char((created_at at time zone 'UTC')::date,'YYYYMMDD')||'-'||next_account_reference_suffix(),account_reference_source='migration_backfill',account_reference_assigned_at=coalesce(account_reference_assigned_at,now()) where account_reference is null;
update app_user set account_reference_source=coalesce(account_reference_source,'migration_backfill'),account_reference_assigned_at=coalesce(account_reference_assigned_at,now()) where account_reference is not null and (account_reference_source is null or account_reference_assigned_at is null);
alter table app_user alter column account_reference set not null, alter column account_reference_source set not null, alter column account_reference_assigned_at set not null;
alter table app_user drop constraint if exists ck_app_user_account_reference_source;
alter table app_user add constraint ck_app_user_account_reference_source check(account_reference_source in ('migration_backfill','database_generated'));
create unique index if not exists uq_app_user_account_reference on app_user(account_reference);
create or replace function assign_immutable_account_reference() returns trigger language plpgsql as $$
begin
 if tg_op='UPDATE' then
  if new.account_reference is distinct from old.account_reference or new.account_reference_source is distinct from old.account_reference_source or new.account_reference_assigned_at is distinct from old.account_reference_assigned_at then
   raise exception 'Account reference and its provenance are immutable' using errcode='23514';
  end if;
  return new;
 end if;
 new.account_reference:='MPA-'||to_char((coalesce(new.created_at,now()) at time zone 'UTC')::date,'YYYYMMDD')||'-'||next_account_reference_suffix();
 new.account_reference_source:='database_generated'; new.account_reference_assigned_at:=now(); return new;
end; $$;
drop trigger if exists trg_app_user_immutable_account_reference on app_user;
create trigger trg_app_user_immutable_account_reference before insert or update on app_user for each row execute function assign_immutable_account_reference();
insert into audit_log(actor_user_id,action,resource_type,resource_id,outcome,metadata)
select null,'account.reference.backfilled','app_user',u.id::text,'success',jsonb_build_object('accountReference',u.account_reference,'provenance',u.account_reference_source,'dateSource','app_user.created_at interpreted as UTC','migration','20261029160000_account_references_and_governance')
from app_user u where u.account_reference_source='migration_backfill' and not exists(select 1 from audit_log a where a.action='account.reference.backfilled' and a.resource_type='app_user' and a.resource_id=u.id::text and a.metadata->>'migration'='20261029160000_account_references_and_governance');
