-- Network-Plus Phase 3: requester-owned disposition, durable closure history and review reminders.
-- Additive only. Lifecycle status remains authoritative for recipient decisions; disposition is a separate requester report.
alter table network_plus_request
  add column if not exists requester_disposition text not null default 'in_progress',
  add column if not exists requester_disposition_remark text,
  add column if not exists requester_disposition_updated_at timestamptz not null default now(),
  add column if not exists review_due_at timestamptz,
  add column if not exists review_reminder_sent_at timestamptz,
  add column if not exists recipient_withdrawn_at timestamptz;

alter table network_plus_request drop constraint if exists network_plus_request_status_check;
alter table network_plus_request add constraint network_plus_request_status_check check (status in (
  'draft','submitted','under_review','clarification_requested','accepted','declined','withdrawn',
  'recipient_withdrawn','in_progress','completed','disputed','closed'
));

do $phase3$
begin
  if not exists (select 1 from pg_constraint where conrelid='network_plus_request'::regclass and conname='network_plus_request_requester_disposition_check') then
    alter table network_plus_request add constraint network_plus_request_requester_disposition_check
      check (requester_disposition in ('in_progress','completed','cancelled'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='network_plus_request'::regclass and conname='network_plus_request_disposition_remark_check') then
    alter table network_plus_request add constraint network_plus_request_disposition_remark_check
      check (requester_disposition_remark is null or length(trim(requester_disposition_remark)) between 1 and 500);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='network_plus_request'::regclass and conname='network_plus_request_disposition_closure_remark_check') then
    alter table network_plus_request add constraint network_plus_request_disposition_closure_remark_check
      check (requester_disposition not in ('completed','cancelled') or length(trim(coalesce(requester_disposition_remark,''))) between 5 and 500);
  end if;
end $phase3$;

-- Existing submitted requests receive a first review date; drafts are not reminded before submission.
update network_plus_request
   set review_due_at=coalesce(submitted_at,created_at)+interval '7 days'
 where status not in ('draft','closed')
   and requester_disposition='in_progress'
   and review_due_at is null;

create index if not exists ix_network_plus_request_requester_disposition
  on network_plus_request(requester_user_id,requester_disposition,updated_at desc);
create index if not exists ix_network_plus_request_review_due
  on network_plus_request(review_due_at,id)
  where requester_disposition='in_progress' and review_due_at is not null
    and status not in ('draft','completed','closed');

comment on column network_plus_request.requester_disposition is
  'Requester-reported connection outcome; independent from the platform-observed request lifecycle status.';
comment on column network_plus_request.requester_disposition_remark is
  'Short requester-reported context; required for Completed and Cancelled dispositions.';
comment on column network_plus_request.review_due_at is
  'Next seven-day requester review reminder due time; null for closed dispositions or non-submitted drafts.';
