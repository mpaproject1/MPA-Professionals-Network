-- Preserve the timezone selected by the proposer when a reschedule is approved.
ALTER TABLE mentorship_session_change_proposal
  ADD COLUMN IF NOT EXISTS proposed_timezone text;
ALTER TABLE mentorship_session_change_proposal
  DROP CONSTRAINT IF EXISTS mentorship_session_change_proposal_timezone_length_check;
ALTER TABLE mentorship_session_change_proposal
  ADD CONSTRAINT mentorship_session_change_proposal_timezone_length_check
  CHECK (proposed_timezone IS NULL OR length(proposed_timezone)<=80);
