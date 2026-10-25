-- Operational mentorship workflows: consent-safe interest pool, session confirmation,
-- opt-in circles, notification acknowledgement state, and participant reports.
ALTER TABLE mentorship_request
  ADD COLUMN IF NOT EXISTS share_with_eligible_mentors boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN mentorship_request.share_with_eligible_mentors IS
  'Explicit participant choice allowing approved eligible mentors to view a minimized, contact-free summary while the request is unmatched.';

ALTER TABLE mentorship_match
  ADD COLUMN IF NOT EXISTS mentor_notification_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS mentor_notification_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS mentor_notification_detail text;
ALTER TABLE mentorship_match DROP CONSTRAINT IF EXISTS mentorship_match_mentor_notification_status_check;
ALTER TABLE mentorship_match ADD CONSTRAINT mentorship_match_mentor_notification_status_check
  CHECK (mentor_notification_status IN ('unknown','queued','delivered','failed'));
COMMENT ON COLUMN mentorship_match.mentor_notification_status IS
  'Notification evidence state. queued is not delivery confirmation; delivered is only valid after a trusted provider delivery event.';

ALTER TABLE mentorship_session
  ADD COLUMN IF NOT EXISTS coordination_status text NOT NULL DEFAULT 'accepted',
  ADD COLUMN IF NOT EXISTS proposed_by uuid REFERENCES app_user(id),
  ADD COLUMN IF NOT EXISTS responded_by uuid REFERENCES app_user(id),
  ADD COLUMN IF NOT EXISTS responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS proposal_note text;
ALTER TABLE mentorship_session DROP CONSTRAINT IF EXISTS mentorship_session_coordination_status_check;
ALTER TABLE mentorship_session ADD CONSTRAINT mentorship_session_coordination_status_check
  CHECK (coordination_status IN ('proposed','accepted','declined'));
COMMENT ON COLUMN mentorship_session.coordination_status IS
  'Mutual first-session coordination state; does not store or expose private contact addresses. Existing scheduled sessions remain accepted.';

ALTER TABLE mentor_profile
  ADD COLUMN IF NOT EXISTS circle_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS circle_name text;
COMMENT ON COLUMN mentor_profile.circle_enabled IS
  'Mentor opt-in to a counted participant circle. Disabled by default; participant identities are not exposed through the counter.';

CREATE TABLE IF NOT EXISTS mentorship_circle_membership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_profile_id uuid NOT NULL REFERENCES mentor_profile(id) ON DELETE CASCADE,
  participant_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  UNIQUE (mentor_profile_id, participant_user_id)
);
CREATE INDEX IF NOT EXISTS ix_mentorship_circle_active
  ON mentorship_circle_membership(mentor_profile_id, joined_at DESC)
  WHERE left_at IS NULL;

CREATE TABLE IF NOT EXISTS mentorship_match_interest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES mentorship_request(id) ON DELETE CASCADE,
  mentor_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','withdrawn','reviewed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, mentor_user_id)
);
CREATE INDEX IF NOT EXISTS ix_mentorship_match_interest_queue
  ON mentorship_match_interest(status, created_at DESC);

CREATE TABLE IF NOT EXISTS mentorship_participant_report (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentorship_id uuid NOT NULL REFERENCES mentorship(id) ON DELETE CASCADE,
  session_id uuid REFERENCES mentorship_session(id) ON DELETE SET NULL,
  reporter_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('safety_concern','boundary_concern','session_issue','conduct','other')),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 10 AND 4000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES app_user(id),
  resolution_note text,
  CHECK (resolution_note IS NULL OR length(resolution_note) <= 2000)
);
CREATE INDEX IF NOT EXISTS ix_mentorship_participant_report_queue
  ON mentorship_participant_report(status, created_at DESC);

COMMENT ON TABLE mentorship_participant_report IS
  'Participant-submitted confidential report. Reporter identity is derived from authentication; no contact-address fields are collected.';

-- Keep provider-delivery evidence separate from the dispatch queue status.
ALTER TABLE notification_outbox
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_event_type text;
ALTER TABLE notification_outbox DROP CONSTRAINT IF EXISTS notification_outbox_delivery_status_check;
ALTER TABLE notification_outbox ADD CONSTRAINT notification_outbox_delivery_status_check
  CHECK (delivery_status IN ('unknown','queued','sent','delivered','failed','cancelled'));
CREATE INDEX IF NOT EXISTS ix_notification_outbox_delivery_status
  ON notification_outbox(delivery_status, updated_at DESC);
COMMENT ON COLUMN notification_outbox.delivery_status IS
  'Provider evidence: queued, sent, delivered or failed. sent is not delivery confirmation; delivered requires a trusted provider webhook.';
