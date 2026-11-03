-- Governed member residence and fee-balance ledger.
-- Cash receipts remain payment_transaction records; non-cash settlements are separate,
-- maker/checker controlled adjustments and never inflate cash collection totals.

create table if not exists membership_geography_version (
  id uuid primary key default gen_random_uuid(),
  version_label text not null unique,
  source_name text not null,
  source_url text,
  source_version text,
  status text not null default 'draft' check(status in ('draft','published','retired')),
  created_by uuid references app_user(id) on delete set null,
  published_by uuid references app_user(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  check ((status <> 'published') or (published_by is not null and published_at is not null))
);

create table if not exists membership_geography_unit (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references membership_geography_version(id) on delete restrict,
  unit_code text not null,
  label text not null,
  unit_level text not null check(unit_level in ('country','region','federal_city','zone','sub_city','district','town')),
  parent_id uuid,
  country_iso3 char(3),
  country_m49 char(3),
  source_name text not null,
  source_version text,
  effective_from date,
  effective_to date,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(version_id,unit_code),
  unique(version_id,id),
  foreign key(version_id,parent_id) references membership_geography_unit(version_id,id) on delete restrict,
  check (effective_to is null or effective_from is null or effective_to >= effective_from),
  check ((unit_level='country' and parent_id is null and country_iso3 is not null and country_iso3 ~ '^[A-Z]{3}$' and country_m49 is not null and country_m49 ~ '^[0-9]{3}$')
      or (unit_level<>'country' and parent_id is not null and country_iso3 is null and country_m49 is null))
);
create index if not exists membership_geography_unit_parent_idx on membership_geography_unit(version_id,parent_id,unit_level,active);
create index if not exists membership_geography_unit_lookup_idx on membership_geography_unit(version_id,unit_level,active,label);

create or replace function membership_geography_validate_parent() returns trigger language plpgsql as $$
declare parent_level text; parent_country text;
begin
  if new.unit_level='country' then
    if new.parent_id is not null then raise exception 'Country geography units cannot have a parent'; end if;
    return new;
  end if;
  select unit_level,coalesce(country_iso3,'ETH') into parent_level,parent_country
    from membership_geography_unit where id=new.parent_id and version_id=new.version_id;
  if parent_level is null then raise exception 'Geography parent must exist in the same version'; end if;
  if new.unit_level in ('region','federal_city') and parent_level='country' then
    if parent_country <> 'ETH' then raise exception 'Ethiopian administrative units must belong to Ethiopia'; end if;
  elsif new.unit_level='zone' and parent_level='region' then null;
  elsif new.unit_level='sub_city' and parent_level='federal_city' then null;
  elsif new.unit_level='district' and parent_level in ('zone','sub_city') then null;
  elsif new.unit_level='town' and parent_level in ('zone','sub_city') then null;
  else
    raise exception 'Invalid geography hierarchy: % cannot be a child of %',new.unit_level,parent_level;
  end if;
  return new;
end $$;
drop trigger if exists trg_membership_geography_parent on membership_geography_unit;
create trigger trg_membership_geography_parent before insert or update of unit_level,parent_id,version_id on membership_geography_unit
for each row execute function membership_geography_validate_parent();

create table if not exists member_residence (
  user_id uuid primary key references app_user(id) on delete cascade,
  residence_type text not null check(residence_type in ('ethiopia','diaspora')),
  geography_version_id uuid references membership_geography_version(id) on delete restrict,
  country_unit_id uuid references membership_geography_unit(id) on delete restrict,
  admin_level_1_id uuid references membership_geography_unit(id) on delete restrict,
  admin_level_2_id uuid references membership_geography_unit(id) on delete restrict,
  admin_level_3_id uuid references membership_geography_unit(id) on delete restrict,
  diaspora_area text,
  street_address text,
  locality_note text,
  updated_at timestamptz not null default now(),
  check (length(coalesce(street_address,'')) <= 500),
  check (length(coalesce(diaspora_area,'')) <= 240),
  check (length(coalesce(locality_note,'')) <= 240),
  check ((residence_type='ethiopia' and country_unit_id is not null and admin_level_1_id is not null and diaspora_area is null)
      or (residence_type='diaspora' and country_unit_id is not null and admin_level_1_id is null and admin_level_2_id is null and admin_level_3_id is null and street_address is null))
);
create index if not exists member_residence_country_idx on member_residence(country_unit_id);
create index if not exists member_residence_admin1_idx on member_residence(admin_level_1_id) where admin_level_1_id is not null;

create or replace function member_residence_validate_hierarchy() returns trigger language plpgsql as $$
declare c record; a1 record; a2 record; a3 record; v_status text;
begin
  if new.geography_version_id is null then raise exception 'A published geography version is required'; end if;
  select status into v_status from membership_geography_version where id=new.geography_version_id;
  if v_status <> 'published' then raise exception 'Member residence must use a published geography version'; end if;
  select unit_level,country_iso3,version_id into c from membership_geography_unit where id=new.country_unit_id;
  if c.unit_level <> 'country' or c.version_id <> new.geography_version_id then raise exception 'Select a country from the active geography version'; end if;
  if new.residence_type='ethiopia' then
    if c.country_iso3 <> 'ETH' then raise exception 'Ethiopian residence must use Ethiopia as the country'; end if;
    select unit_level,parent_id,version_id into a1 from membership_geography_unit where id=new.admin_level_1_id;
    if a1.unit_level not in ('region','federal_city') or a1.parent_id<>new.country_unit_id or a1.version_id<>new.geography_version_id then raise exception 'Select an Ethiopian region or federal city'; end if;
    if new.admin_level_2_id is not null then
      select unit_level,parent_id,version_id into a2 from membership_geography_unit where id=new.admin_level_2_id;
      if a1.unit_level='region' and a2.unit_level<>'zone' then raise exception 'A region must be followed by a zone'; end if;
      if a1.unit_level='federal_city' and a2.unit_level<>'sub_city' then raise exception 'A federal city must be followed by a sub-city'; end if;
      if a2.parent_id<>new.admin_level_1_id or a2.version_id<>new.geography_version_id then raise exception 'The selected zone or sub-city does not belong to the selected region or federal city'; end if;
    end if;
    if new.admin_level_3_id is not null then
      if new.admin_level_2_id is null then raise exception 'Select a zone or sub-city before a district or town'; end if;
      select unit_level,parent_id,version_id into a3 from membership_geography_unit where id=new.admin_level_3_id;
      if a3.unit_level not in ('district','town') or a3.parent_id<>new.admin_level_2_id or a3.version_id<>new.geography_version_id then raise exception 'The selected district or town does not belong to the selected zone or sub-city'; end if;
    end if;
  else
    if c.country_iso3='ETH' then raise exception 'Choose Diaspora only when residence is outside Ethiopia'; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_member_residence_validate on member_residence;
create trigger trg_member_residence_validate before insert or update on member_residence
for each row execute function member_residence_validate_hierarchy();

create table if not exists membership_geography_import_batch (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  source_name text not null,
  source_version text not null,
  geography_version_id uuid references membership_geography_version(id) on delete restrict,
  status text not null default 'previewed' check(status in ('previewed','validated','applied','rejected')),
  row_count integer not null default 0,
  error_count integer not null default 0,
  imported_by uuid not null references app_user(id),
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);
create table if not exists membership_geography_import_row (
  batch_id uuid not null references membership_geography_import_batch(id) on delete cascade,
  row_number integer not null,
  row_data jsonb not null,
  errors jsonb not null default '[]'::jsonb,
  primary key(batch_id,row_number)
);

create table if not exists membership_fee_obligation (
  id uuid primary key default gen_random_uuid(),
  application_id uuid unique references membership_application(id) on delete restrict,
  membership_record_id uuid unique references membership_record(id) on delete restrict,
  fee_snapshot jsonb not null,
  amount_due numeric(14,2) not null check(amount_due >= 0),
  currency char(3) not null check(currency ~ '^[A-Z]{3}$'),
  due_date date,
  status text not null default 'open' check(status in ('open','settled','waived','cancelled')),
  created_by uuid references app_user(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(num_nonnulls(application_id,membership_record_id)=1)
);
create index if not exists membership_fee_obligation_status_idx on membership_fee_obligation(status,due_date);
create table if not exists membership_fee_obligation_payment (
  obligation_id uuid not null references membership_fee_obligation(id) on delete restrict,
  payment_transaction_id uuid not null unique references payment_transaction(id) on delete restrict,
  linked_by uuid references app_user(id) on delete set null,
  linked_at timestamptz not null default now(),
  primary key(obligation_id,payment_transaction_id)
);
create table if not exists membership_fee_adjustment (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references membership_fee_obligation(id) on delete restrict,
  adjustment_type text not null check(adjustment_type in ('sponsored','honored_member','volunteer_activity_valuated')),
  amount numeric(14,2) not null check(amount > 0),
  currency char(3) not null check(currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending' check(status in ('pending','approved','rejected','reversed')),
  remark text not null check(length(trim(remark)) >= 8),
  details jsonb not null default '{}'::jsonb,
  requested_by uuid not null references app_user(id),
  approved_by uuid references app_user(id),
  approved_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(status<>'approved' or (approved_by is not null and approved_at is not null and approved_by<>requested_by))
);
create index if not exists membership_fee_adjustment_obligation_idx on membership_fee_adjustment(obligation_id,status);

create table if not exists membership_payment_import_batch (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  status text not null default 'previewed' check(status in ('previewed','validated','applied','rejected')),
  row_count integer not null default 0,
  error_count integer not null default 0,
  imported_by uuid not null references app_user(id),
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create table if not exists membership_payment_import_row (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references membership_payment_import_batch(id) on delete cascade,
  row_number integer not null,
  row_data jsonb not null,
  status text not null default 'pending' check(status in ('pending','created','verified','rejected','unmatched','duplicate','error')),
  errors jsonb not null default '[]'::jsonb,
  payment_transaction_id uuid references payment_transaction(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(batch_id,row_number)
);
create unique index if not exists membership_payment_import_row_payment_idx on membership_payment_import_row(payment_transaction_id) where payment_transaction_id is not null;

create table if not exists membership_fee_reminder (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references membership_fee_obligation(id) on delete restrict,
  reminder_key text not null unique,
  due_balance numeric(14,2) not null,
  currency char(3) not null,
  scheduled_for timestamptz not null,
  status text not null default 'scheduled' check(status in ('scheduled','queued','sent','cancelled','failed')),
  member_outbox_id uuid,
  staff_outbox_id uuid,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists membership_fee_reminder_due_idx on membership_fee_reminder(status,scheduled_for);

create or replace view membership_fee_obligation_balance as
select o.id obligation_id,o.application_id,o.membership_record_id,o.amount_due,o.currency,o.due_date,o.status,
  coalesce(cash.verified_cash,0)::numeric(14,2) verified_cash,
  coalesce(adj.approved_adjustments,0)::numeric(14,2) approved_non_cash,
  greatest(0,o.amount_due-coalesce(cash.verified_cash,0)-coalesce(adj.approved_adjustments,0))::numeric(14,2) outstanding_balance,
  greatest(0,coalesce(cash.verified_cash,0)+coalesce(adj.approved_adjustments,0)-o.amount_due)::numeric(14,2) overpaid_balance
from membership_fee_obligation o
left join lateral (
  select sum(pt.amount) verified_cash
  from membership_fee_obligation_payment op
  join payment_transaction pt on pt.id=op.payment_transaction_id and pt.status='succeeded'
  where op.obligation_id=o.id
    and not exists(select 1 from membership_payment_reversal rev where rev.payment_transaction_id=pt.id)
) cash on true
left join lateral (
  select sum(a.amount) approved_adjustments
  from membership_fee_adjustment a where a.obligation_id=o.id and a.status='approved' and a.currency=o.currency
) adj on true;

insert into app_permission(permission_code,area,label,description,sensitive,system_only) values
 ('members.geography.manage','Membership','Manage member geography reference data','Import and publish versioned member geography data and review geography data quality.',true,false),
 ('finance.payment.record','Finance','Record membership payment receipts','Create pending membership payment receipts with actual amount received. Does not verify payments.',true,false),
 ('finance.payment.adjust','Finance','Approve non-cash membership fee adjustments','Approve sponsorship, honored-member and volunteer-activity fee settlements with maker/checker audit.',true,false),
 ('finance.payment.import','Finance','Import pending membership payments','Import payment rows into a pending queue; each payment still requires individual Finance verification.',true,false)
on conflict(permission_code) do update set area=excluded.area,label=excluded.label,description=excluded.description,sensitive=excluded.sensitive,system_only=excluded.system_only;
