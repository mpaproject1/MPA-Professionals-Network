-- Staff-entered records for completed offline Serve-Community projects.
-- Kept separate from member-led initiative and participation lifecycle records.
create table if not exists serve_community_offline_project (
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(trim(title)) between 5 and 160),
 category text not null check(category in('education','community_care','digital_inclusion','environment','livelihoods','accessibility','other')),
 summary text not null check(length(trim(summary)) between 20 and 360),
 public_story text not null check(length(trim(public_story)) between 40 and 5000),
 completion_date date not null,
 location_label text not null check(length(trim(location_label)) between 2 and 160),
 delivery_mode text not null check(delivery_mode in('in_person','remote','hybrid')),
 offline_source text not null default 'offline' check(offline_source='offline'),
 activity_summary text not null check(length(trim(activity_summary)) between 20 and 2000),
 output_summary text not null check(length(trim(output_summary)) between 10 and 2000),
 beneficiary_count integer check(beneficiary_count is null or beneficiary_count between 0 and 100000000),
 beneficiary_definition text,
 beneficiary_count_method text,
 beneficiary_count_evidence text,
 outcome_metrics jsonb not null default '[]'::jsonb check(jsonb_typeof(outcome_metrics)='array'),
 image_urls jsonb not null default '[]'::jsonb check(jsonb_typeof(image_urls)='array'),
 video_urls jsonb not null default '[]'::jsonb check(jsonb_typeof(video_urls)='array'),
 image_alt_text jsonb not null default '[]'::jsonb check(jsonb_typeof(image_alt_text)='array'),
 consent_confirmed boolean not null default false,
 consent_note text,
 source_reference text,
 status text not null default 'draft' check(status in('draft','submitted','approved','rejected','archived')),
 public_visible boolean not null default false,
 review_reason text,
 created_by uuid not null references app_user(id) on delete restrict,
 updated_by uuid not null references app_user(id) on delete restrict,
 submitted_at timestamptz,
 reviewed_by uuid references app_user(id) on delete restrict,
 reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check((beneficiary_count is null and beneficiary_definition is null and beneficiary_count_method is null and beneficiary_count_evidence is null) or
       (beneficiary_count is not null and length(trim(coalesce(beneficiary_definition,''))) between 8 and 500 and length(trim(coalesce(beneficiary_count_method,''))) between 8 and 1000 and length(trim(coalesce(beneficiary_count_evidence,''))) between 8 and 1500)),
 check(status<>'approved' or (reviewed_by is not null and reviewed_at is not null and public_visible=true)),
 check(reviewed_by is null or reviewed_by<>created_by)
);
create index if not exists ix_sc_offline_project_public on serve_community_offline_project(completion_date desc,id) where status='approved' and public_visible=true;
create index if not exists ix_sc_offline_project_review on serve_community_offline_project(status,submitted_at) where status in('submitted','rejected');
create table if not exists serve_community_offline_project_event (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references serve_community_offline_project(id) on delete restrict,
 actor_user_id uuid not null references app_user(id) on delete restrict,
 event_code text not null check(event_code in('created','updated','submitted','approved','rejected','archived','republished')),
 from_status text,
 to_status text not null,
 reason text not null check(length(trim(reason)) between 4 and 1000),
 request_id text,
 created_at timestamptz not null default now()
);
create index if not exists ix_sc_offline_project_event_history on serve_community_offline_project_event(project_id,created_at desc);
create or replace function serve_community_offline_project_history_immutable() returns trigger language plpgsql as $$ begin raise exception 'Offline project review history is append-only'; end; $$;
drop trigger if exists trg_sc_offline_project_event_immutable on serve_community_offline_project_event;
create trigger trg_sc_offline_project_event_immutable before update or delete on serve_community_offline_project_event for each row execute function serve_community_offline_project_history_immutable();
insert into app_permission(permission_code,area,label,description,sensitive,system_only) values
('serve_community.projects.manage','Serve-Community','Enter offline completed projects','Create and edit draft records documenting completed offline Serve-Community projects; submission does not publish.',true,true),
('serve_community.projects.approve','Serve-Community','Approve offline completed projects','Independently review offline project claims, media consent and outcome evidence before public publication.',true,true)
on conflict(permission_code) do update set area=excluded.area,label=excluded.label,description=excluded.description,sensitive=excluded.sensitive,system_only=excluded.system_only;
comment on table serve_community_offline_project is 'Staff-entered offline completed-project records; kept distinct from platform initiative and participation records. Only independently approved, public-visible rows feed the public portfolio.';
comment on column serve_community_offline_project.beneficiary_count is 'Optional evidenced beneficiary count; never inferred from platform member participation.';
