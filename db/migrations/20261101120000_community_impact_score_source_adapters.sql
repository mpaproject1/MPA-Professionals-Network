-- Increment 5 source adapters: explicit reviewer-approved links from verified source workflows.
create table if not exists community_impact_score_source_link (
 id uuid primary key default gen_random_uuid(),
 claim_id uuid not null unique references community_impact_claim(id) on delete restrict,
 subject_user_id uuid not null references app_user(id) on delete restrict,
 source_system text not null,
 source_type text not null check(source_type in('serve_community_participation','offline_completed_project','mentorship','professional_service','employment_referral','network_plus_collaboration','network_plus_partnership','historical_contribution')),
 source_record_id uuid not null,
 source_snapshot jsonb not null check(jsonb_typeof(source_snapshot)='object'),
 linked_by uuid not null references app_user(id) on delete restrict,
 rationale text not null check(length(trim(rationale)) between 12 and 2000),
 created_at timestamptz not null default now(),
 unique(source_system,source_type,source_record_id,subject_user_id)
);
create index if not exists ix_community_impact_score_source_link_member on community_impact_score_source_link(subject_user_id,created_at desc);
create table if not exists community_impact_score_source_link_event (
 id uuid primary key default gen_random_uuid(),
 source_link_id uuid not null references community_impact_score_source_link(id) on delete restrict,
 actor_user_id uuid not null references app_user(id) on delete restrict,
 event_code text not null check(event_code in('linked','source_revalidated','source_invalidated')),
 rationale text not null check(length(trim(rationale)) between 8 and 2000),
 metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
 created_at timestamptz not null default now()
);
create or replace function community_impact_score_source_link_immutable() returns trigger language plpgsql as $$ begin raise exception 'Verified source-link provenance is append-only; create a new claim and review for correction'; end; $$;
drop trigger if exists trg_community_impact_score_source_link_immutable on community_impact_score_source_link;
create trigger trg_community_impact_score_source_link_immutable before update or delete on community_impact_score_source_link for each row execute function community_impact_score_source_link_immutable();
