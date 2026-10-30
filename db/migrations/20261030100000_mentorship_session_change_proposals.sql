-- Preserve confirmed mentorship session times while participants negotiate schedule changes.
-- A proposal is history; it never mutates the confirmed session until the other participant accepts.
CREATE TABLE IF NOT EXISTS mentorship_session_change_proposal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES mentorship_session(id) ON DELETE CASCADE,
  proposed_by uuid NOT NULL REFERENCES app_user(id),
  previous_start_at timestamptz NOT NULL,
  previous_end_at timestamptz NOT NULL,
  proposed_start_at timestamptz NOT NULL,
  proposed_end_at timestamptz NOT NULL,
  proposal_note text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','declined','withdrawn')),
  responded_by uuid REFERENCES app_user(id),
  responded_at timestamptz,
  response_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (previous_end_at > previous_start_at),
  CHECK (proposed_end_at > proposed_start_at),
  CHECK (proposal_note IS NULL OR length(proposal_note) <= 1000),
  CHECK (response_note IS NULL OR length(response_note) <= 1000),
  CHECK ((status='pending' AND responded_by IS NULL AND responded_at IS NULL)
      OR (status<>'pending' AND responded_by IS NOT NULL AND responded_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mentorship_session_one_pending_change
  ON mentorship_session_change_proposal(session_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS ix_mentorship_session_change_history
  ON mentorship_session_change_proposal(session_id,created_at DESC);
COMMENT ON TABLE mentorship_session_change_proposal IS
  'Append-only proposal history for participant-negotiated session schedule changes. The confirmed session remains unchanged until the non-proposing participant accepts.';
