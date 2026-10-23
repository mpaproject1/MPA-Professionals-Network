-- Explicit two-party consent for coordinator-proposed mentorship matches.
-- Preserve consent only where an existing active relationship proves the match was accepted.
-- Pending, declined, cancelled, or otherwise historical matches must not be silently consented.
alter table mentorship_match
  add column if not exists mentee_consent_status text not null default 'pending',
  add column if not exists mentee_responded_at timestamptz,
  add column if not exists mentee_response_note text;

alter table mentorship_match
  drop constraint if exists mentorship_match_mentee_consent_status_check;
alter table mentorship_match
  add constraint mentorship_match_mentee_consent_status_check
  check (mentee_consent_status in ('pending','accepted','declined'));

update mentorship_match mm
set mentee_consent_status='accepted',
    mentee_responded_at=coalesce(mm.mentee_responded_at,m.created_at)
from mentorship m
where m.request_id=mm.request_id
  and m.mentor_user_id=mm.mentor_user_id
  and m.mentee_user_id=mm.mentee_user_id
  and m.status='active'
  and mm.mentee_consent_status='pending';

create index if not exists ix_mentorship_match_mentee_consent
  on mentorship_match(mentee_user_id,mentee_consent_status,status);
