-- Community Impact retention policy registry.
-- No retention duration is seeded and no deletion worker is enabled by this migration.
create table if not exists community_impact_retention_policy_version (
 id uuid primary key default gen_random_uuid(),
 version integer not null unique check(version>0),
 schema_version integer not null check(schema_version>0),
 policy_hash text not null check(policy_hash ~ '^[a-f0-9]{64} not null default 'in_review' check(status in('in_review','approved','active','superseded','revoked')),
 policy jsonb not null check(jsonb_typeof(policy)='object'),
 rationale text not null check(length(trim(rationale)) between 12 and 2000),
 change_summary text not null check(length(trim(change_summary)) between 8 and 1000),
 created_by uuid not null references app_user(id) on delete restrict,
 created_at timestamptz not null default now(),
 approved_by uuid references app_user(id) on delete restrict,
 approved_at timestamptz,
 approval_reference text,
 activated_at timestamptz,
 revoked_at timestamptz,
 check((status in('approved','active','superseded','revoked') and approved_by is not null and approved_at is not null and length(trim(coalesce(approval_reference,'')))>=8)
    or status='in_review'),
 check(approved_by is null or approved_by<>created_by)
);
create table if not exists community_impact_retention_active_policy (
 singleton boolean primary key default true check(singleton),
 policy_version_id uuid not null references community_impact_retention_policy_version(id) on delete restrict,
 activated_by uuid not null references app_user(id) on delete restrict,
 activated_at timestamptz not null default now()
);
create table if not exists community_impact_retention_policy_event (
 id uuid primary key default gen_random_uuid(),
 policy_version_id uuid not null references community_impact_retention_policy_version(id) on delete restrict,
 actor_user_id uuid not null references app_user(id) on delete restrict,
 event_code text not null check(event_code in('proposed','approved','activated','superseded','revoked')),
 reason text not null check(length(trim(reason)) between 8 and 2000),
 request_id text,
 metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
 created_at timestamptz not null default now()
);
create index if not exists ix_community_impact_retention_policy_status on community_impact_retention_policy_version(status,created_at desc);
create index if not exists ix_community_impact_retention_policy_event_history on community_impact_retention_policy_event(policy_version_id,created_at desc);
create or replace function community_impact_retention_policy_guard() returns trigger language plpgsql as $$
begin
 if TG_OP='DELETE' then raise exception 'Community Impact retention policy history cannot be deleted'; end if;
 if NEW.id is distinct from OLD.id or NEW.version is distinct from OLD.version
  or NEW.policy is distinct from OLD.policy or NEW.rationale is distinct from OLD.rationale
  or NEW.change_summary is distinct from OLD.change_summary or NEW.created_by is distinct from OLD.created_by
  or NEW.created_at is distinct from OLD.created_at then
  raise exception 'Community Impact retention policy content is immutable; create a new version';
 end if;
 if NEW.status is distinct from OLD.status and not (
  (OLD.status='in_review' and NEW.status='approved') or
  (OLD.status='approved' and NEW.status in('active','revoked')) or
  (OLD.status='active' and NEW.status in('superseded','revoked'))
 ) then raise exception 'Invalid Community Impact retention policy transition'; end if;
 if NEW.approved_by is distinct from OLD.approved_by and not (OLD.status='in_review' and NEW.status='approved') then raise exception 'Approval fields can only be set during approval'; end if;
 if NEW.activated_at is distinct from OLD.activated_at and not (OLD.status='approved' and NEW.status='active') then raise exception 'Activation fields can only be set during activation'; end if;
 return NEW;
end; $$;
drop trigger if exists trg_community_impact_retention_policy_guard on community_impact_retention_policy_version;
create trigger trg_community_impact_retention_policy_guard before update or delete on community_impact_retention_policy_version for each row execute function community_impact_retention_policy_guard();
create or replace function community_impact_retention_event_immutable() returns trigger language plpgsql as $$ begin raise exception 'Community Impact retention policy events are append-only'; end; $$;
drop trigger if exists trg_community_impact_retention_event_immutable on community_impact_retention_policy_event;
create trigger trg_community_impact_retention_event_immutable before update or delete on community_impact_retention_policy_event for each row execute function community_impact_retention_event_immutable();
insert into app_permission(permission_code,area,label,description,sensitive,system_only) values
('community_impact.retention.manage','Community Impact','Propose retention policies','Create and inspect Community Impact retention policy proposals; cannot approve or activate policies.',true,true),
('community_impact.retention.approve','Community Impact','Approve retention policies','Independently approve or activate Community Impact retention policy versions.',true,true)
on conflict(permission_code) do update set area=excluded.area,label=excluded.label,description=excluded.description,sensitive=excluded.sensitive,system_only=excluded.system_only;
comment on table community_impact_retention_policy_version is 'Immutable versioned retention configuration. No initial policy is seeded; approval and activation are explicit.';
comment on table community_impact_retention_active_policy is 'Single active approved Community Impact retention policy. No row means retention enforcement is not authorized.';
comment on table community_impact_retention_policy_event is 'Append-only proposal, approval, activation, supersession and revocation history.';
),
 status text not null default 'in_review' check(status in('in_review','approved','active','superseded','revoked')),
 policy jsonb not null check(jsonb_typeof(policy)='object'),
 rationale text not null check(length(trim(rationale)) between 12 and 2000),
 change_summary text not null check(length(trim(change_summary)) between 8 and 1000),
 created_by uuid not null references app_user(id) on delete restrict,
 created_at timestamptz not null default now(),
 approved_by uuid references app_user(id) on delete restrict,
 approved_at timestamptz,
 approval_reference text,
 activated_at timestamptz,
 revoked_at timestamptz,
 check((status in('approved','active','superseded','revoked') and approved_by is not null and approved_at is not null and length(trim(coalesce(approval_reference,'')))>=8)
    or status='in_review'),
 check(approved_by is null or approved_by<>created_by)
);
create table if not exists community_impact_retention_active_policy (
 singleton boolean primary key default true check(singleton),
 policy_version_id uuid not null references community_impact_retention_policy_version(id) on delete restrict,
 activated_by uuid not null references app_user(id) on delete restrict,
 activated_at timestamptz not null default now()
);
create table if not exists community_impact_retention_policy_event (
 id uuid primary key default gen_random_uuid(),
 policy_version_id uuid not null references community_impact_retention_policy_version(id) on delete restrict,
 actor_user_id uuid not null references app_user(id) on delete restrict,
 event_code text not null check(event_code in('proposed','approved','activated','superseded','revoked')),
 reason text not null check(length(trim(reason)) between 8 and 2000),
 request_id text,
 metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
 created_at timestamptz not null default now()
);
create index if not exists ix_community_impact_retention_policy_status on community_impact_retention_policy_version(status,created_at desc);
create index if not exists ix_community_impact_retention_policy_event_history on community_impact_retention_policy_event(policy_version_id,created_at desc);
create or replace function community_impact_retention_policy_guard() returns trigger language plpgsql as $$
begin
 if TG_OP='DELETE' then raise exception 'Community Impact retention policy history cannot be deleted'; end if;
 if NEW.id is distinct from OLD.id or NEW.version is distinct from OLD.version
  or NEW.policy is distinct from OLD.policy or NEW.rationale is distinct from OLD.rationale
  or NEW.change_summary is distinct from OLD.change_summary or NEW.created_by is distinct from OLD.created_by
  or NEW.created_at is distinct from OLD.created_at then
  raise exception 'Community Impact retention policy content is immutable; create a new version';
 end if;
 if NEW.status is distinct from OLD.status and not (
  (OLD.status='in_review' and NEW.status in('approved','revoked')) or
  (OLD.status='approved' and NEW.status in('active','revoked')) or
  (OLD.status='active' and NEW.status in('superseded','revoked'))
 ) then raise exception 'Invalid Community Impact retention policy transition'; end if;
 if NEW.approved_by is distinct from OLD.approved_by and not (OLD.status='in_review' and NEW.status='approved') then raise exception 'Approval fields can only be set during approval'; end if;
 if NEW.activated_at is distinct from OLD.activated_at and not (OLD.status='approved' and NEW.status='active') then raise exception 'Activation fields can only be set during activation'; end if;
 return NEW;
end; $$;
drop trigger if exists trg_community_impact_retention_policy_guard on community_impact_retention_policy_version;
create trigger trg_community_impact_retention_policy_guard before update or delete on community_impact_retention_policy_version for each row execute function community_impact_retention_policy_guard();
create or replace function community_impact_retention_event_immutable() returns trigger language plpgsql as $$ begin raise exception 'Community Impact retention policy events are append-only'; end; $$;
drop trigger if exists trg_community_impact_retention_event_immutable on community_impact_retention_policy_event;
create trigger trg_community_impact_retention_event_immutable before update or delete on community_impact_retention_policy_event for each row execute function community_impact_retention_event_immutable();
insert into app_permission(permission_code,area,label,description,sensitive,system_only) values
('community_impact.retention.manage','Community Impact','Propose retention policies','Create and inspect Community Impact retention policy proposals; cannot approve or activate policies.',true,true),
('community_impact.retention.approve','Community Impact','Approve retention policies','Independently approve or activate Community Impact retention policy versions.',true,true)
on conflict(permission_code) do update set area=excluded.area,label=excluded.label,description=excluded.description,sensitive=excluded.sensitive,system_only=excluded.system_only;
comment on table community_impact_retention_policy_version is 'Immutable versioned retention configuration. No initial policy is seeded; approval and activation are explicit.';
comment on table community_impact_retention_active_policy is 'Single active approved Community Impact retention policy. No row means retention enforcement is not authorized.';
comment on table community_impact_retention_policy_event is 'Append-only proposal, approval, activation, supersession and revocation history.';
