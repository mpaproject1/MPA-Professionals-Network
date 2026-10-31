-- Increment 7: recognition programs, nominations and consent-gated achievement records.
create table if not exists community_impact_recognition_program (
 id uuid primary key default gen_random_uuid(),
 code text not null unique,
 title text not null check(length(trim(title)) between 3 and 160),
 description text not null check(length(trim(description)) between 12 and 2000),
 criteria jsonb not null check(jsonb_typeof(criteria)='array' and jsonb_array_length(criteria)>0),
 eligible_source_types text[] not null default '{}',
 accepts_member_nominations boolean not null default true,
 accepts_self_nominations boolean not null default true,
 accepts_non_member_nominations boolean not null default true,
 requires_verified_contribution boolean not null default true,
 active boolean not null default false,
 created_by uuid references app_user(id) on delete restrict,
 updated_by uuid references app_user(id) on delete restrict,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists community_impact_recognition_nomination (
 id uuid primary key default gen_random_uuid(),
 program_id uuid not null references community_impact_recognition_program(id) on delete restrict,
 nominator_user_id uuid not null references app_user(id) on delete restrict,
 nominee_user_id uuid references app_user(id) on delete restrict,
 nominee_type text not null check(nominee_type in('member','non_member')),
 nominee_name text not null check(length(trim(nominee_name)) between 2 and 180),
 nominee_email text,
 contribution_summary text not null check(length(trim(contribution_summary)) between 30 and 3000),
 evidence_references jsonb not null default '[]'::jsonb check(jsonb_typeof(evidence_references)='array'),
 related_claim_id uuid references community_impact_claim(id) on delete restrict,
 status text not null default 'submitted' check(status in('submitted','under_review','clarification_requested','approved','declined','withdrawn')),
 assigned_reviewer_id uuid references app_user(id) on delete restrict,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check((nominee_type='member' and nominee_user_id is not null) or (nominee_type='non_member' and nominee_user_id is null)),
 check(nominee_email is null or nominee_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);
create index if not exists ix_community_impact_recognition_nomination_queue on community_impact_recognition_nomination(status,created_at desc);
create index if not exists ix_community_impact_recognition_nomination_member on community_impact_recognition_nomination(nominee_user_id,created_at desc) where nominee_user_id is not null;
create table if not exists community_impact_recognition_event (
 id uuid primary key default gen_random_uuid(),
 nomination_id uuid not null references community_impact_recognition_nomination(id) on delete restrict,
 actor_user_id uuid references app_user(id) on delete restrict,
 event_code text not null check(event_code in('submitted','assigned','clarification_requested','approved','declined','withdrawn','public_consent_granted','public_consent_revoked')),
 rationale text,
 metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
 created_at timestamptz not null default now()
);
create table if not exists community_impact_achievement_award (
 id uuid primary key default gen_random_uuid(),
 nomination_id uuid not null unique references community_impact_recognition_nomination(id) on delete restrict,
 program_id uuid not null references community_impact_recognition_program(id) on delete restrict,
 recipient_user_id uuid references app_user(id) on delete restrict,
 recipient_name text not null,
 title text not null,
 citation text not null,
 awarded_by uuid not null references app_user(id) on delete restrict,
 public_opt_in boolean not null default false,
 public_consent_at timestamptz,
 public_consent_revoked_at timestamptz,
 awarded_at timestamptz not null default now(),
 check((public_opt_in=false) or public_consent_at is not null)
);
create index if not exists ix_community_impact_award_member on community_impact_achievement_award(recipient_user_id,awarded_at desc) where recipient_user_id is not null;
create index if not exists ix_community_impact_award_public on community_impact_achievement_award(public_opt_in,awarded_at desc);
create or replace function community_impact_recognition_event_immutable() returns trigger language plpgsql as $$ begin raise exception 'Recognition event history is append-only'; end; $$;
drop trigger if exists trg_community_impact_recognition_event_immutable on community_impact_recognition_event;
create trigger trg_community_impact_recognition_event_immutable before update or delete on community_impact_recognition_event for each row execute function community_impact_recognition_event_immutable();
create or replace function community_impact_award_guard() returns trigger language plpgsql as $$
begin
 if TG_OP='DELETE' then raise exception 'Achievement award history cannot be deleted'; end if;
 if NEW.id is distinct from OLD.id or NEW.nomination_id is distinct from OLD.nomination_id or NEW.program_id is distinct from OLD.program_id or NEW.recipient_user_id is distinct from OLD.recipient_user_id or NEW.recipient_name is distinct from OLD.recipient_name or NEW.title is distinct from OLD.title or NEW.citation is distinct from OLD.citation or NEW.awarded_by is distinct from OLD.awarded_by or NEW.awarded_at is distinct from OLD.awarded_at then raise exception 'Achievement award provenance is immutable'; end if;
 if NEW.public_opt_in is distinct from OLD.public_opt_in then
  if NEW.public_opt_in and NEW.public_consent_at is null then raise exception 'Public achievement requires explicit consent'; end if;
  if not NEW.public_opt_in and NEW.public_consent_revoked_at is null then raise exception 'Public achievement withdrawal must be timestamped'; end if;
 end if;
 return NEW;
end; $$;
drop trigger if exists trg_community_impact_award_guard on community_impact_achievement_award;
create trigger trg_community_impact_award_guard before update or delete on community_impact_achievement_award for each row execute function community_impact_award_guard();
insert into app_permission(permission_code,area,label,description,sensitive,system_only) values
('community_impact.recognition.manage','Community Impact','Manage recognition programs','Create and maintain recognition opportunities and criteria.',true,true),
('community_impact.recognition.review','Community Impact','Review recognition nominations','Assign, assess and decide recognition nominations independently.',true,true),
('community_impact.recognition.view_all','Community Impact','View recognition administration','View restricted nomination queues and award history.',true,true)
on conflict(permission_code) do update set area=excluded.area,label=excluded.label,description=excluded.description,sensitive=excluded.sensitive,system_only=excluded.system_only;
insert into community_impact_recognition_program(code,title,description,criteria,eligible_source_types,active,created_by)
values
('verified-community-impact','Verified Community Impact Recognition','Recognizes evidenced community outcomes, sustained service and responsible collaboration across MPA and community initiatives.',
'["Verified contribution and role","Reliable evidence and attributable responsibility","Measurable output or outcome","Quality, significance and sustainability","Collaboration, knowledge sharing or recipient confirmation"]'::jsonb,
array['serve_community_participation','offline_completed_project','mentorship','professional_service','employment_referral','network_plus_collaboration','network_plus_partnership','historical_contribution'],true,null)
on conflict(code) do nothing;
comment on table community_impact_achievement_award is 'Immutable recognition award with explicit consent gate for public profile display; awards do not automatically change score.';
