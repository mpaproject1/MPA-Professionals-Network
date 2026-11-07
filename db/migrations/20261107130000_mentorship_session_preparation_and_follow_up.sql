-- Structured preparation and follow-up for confirmed mentorship sessions.
ALTER TABLE mentorship_session
  ADD COLUMN IF NOT EXISTS preparation_checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS agreed_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS outcome_summary text,
  ADD COLUMN IF NOT EXISTS session_timezone text NOT NULL DEFAULT 'Africa/Addis_Ababa';

ALTER TABLE mentorship_session
  DROP CONSTRAINT IF EXISTS mentorship_session_preparation_checklist_array_check;
ALTER TABLE mentorship_session
  ADD CONSTRAINT mentorship_session_preparation_checklist_array_check
  CHECK (jsonb_typeof(preparation_checklist)='array' AND jsonb_array_length(preparation_checklist)<=20);

ALTER TABLE mentorship_session
  DROP CONSTRAINT IF EXISTS mentorship_session_agreed_actions_array_check;
ALTER TABLE mentorship_session
  ADD CONSTRAINT mentorship_session_agreed_actions_array_check
  CHECK (jsonb_typeof(agreed_actions)='array' AND jsonb_array_length(agreed_actions)<=20);

ALTER TABLE mentorship_session
  DROP CONSTRAINT IF EXISTS mentorship_session_outcome_summary_length_check;
ALTER TABLE mentorship_session
  ADD CONSTRAINT mentorship_session_outcome_summary_length_check
  CHECK (outcome_summary IS NULL OR length(outcome_summary)<=2000);

COMMENT ON COLUMN mentorship_session.preparation_checklist IS 'Participant-shared preparation checklist for a mutually confirmed session.';
COMMENT ON COLUMN mentorship_session.agreed_actions IS 'Participant-shared follow-up actions recorded after a mentorship session.';
COMMENT ON COLUMN mentorship_session.outcome_summary IS 'Brief participant-shared outcome record; not a confidential safeguarding report.';
COMMENT ON COLUMN mentorship_session.session_timezone IS 'IANA timezone used when proposing and documenting this session.';

-- Supports the bounded, frequent lookup for confirmed upcoming-session reminders.
CREATE INDEX IF NOT EXISTS mentorship_session_reminder_due_idx
  ON mentorship_session(scheduled_start_at)
  WHERE status='scheduled' AND coordination_status='accepted';
