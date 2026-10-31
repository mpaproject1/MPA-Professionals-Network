create table if not exists community_impact_recognition_program_event (
 id uuid primary key default gen_random_uuid(),
 program_id uuid not null references community_impact_recognition_program(id) on delete restrict,
 actor_user_id uuid references app_user(id) on delete restrict,
 event_code text not null check(event_code in('created','updated','activated','deactivated')),
 before_snapshot jsonb not null default '{}'::jsonb,
 after_snapshot jsonb not null default '{}'::jsonb,
 rationale text not null check(length(trim(rationale)) between 12 and 2000),
 created_at timestamptz not null default now()
);
create or replace function community_impact_recognition_program_event_immutable() returns trigger language plpgsql as $$ begin raise exception 'Recognition program governance history is append-only'; end; $$;
drop trigger if exists trg_community_impact_recognition_program_event_immutable on community_impact_recognition_program_event;
create trigger trg_community_impact_recognition_program_event_immutable before update or delete on community_impact_recognition_program_event for each row execute function community_impact_recognition_program_event_immutable();
create or replace function community_impact_recognition_program_no_delete() returns trigger language plpgsql as $$ begin raise exception 'Recognition programs are retained; deactivate instead of deleting'; end; $$;
drop trigger if exists trg_community_impact_recognition_program_no_delete on community_impact_recognition_program;
create trigger trg_community_impact_recognition_program_no_delete before delete on community_impact_recognition_program for each row execute function community_impact_recognition_program_no_delete();
