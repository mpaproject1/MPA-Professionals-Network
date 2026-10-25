-- Serve-Community G4: separate public listing announcements from private engagement updates.
-- No production data is changed by this migration; participant-audience listing announcements are archived
-- so they cannot remain a public-feed proxy for engagement-specific information.
ALTER TABLE service_request_feedback
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'service_quality';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='service_request_feedback_category_check') THEN
    ALTER TABLE service_request_feedback ADD CONSTRAINT service_request_feedback_category_check
      CHECK (category IN ('service_quality','communication','timeliness','outcome','accessibility','other'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS service_request_update (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES service_request(id) ON DELETE RESTRICT,
  author_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  category text NOT NULL CHECK (category IN ('progress','schedule_change','delivery_note','blocker','handover')),
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 10 AND 2000),
  request_idempotency_hash text,
  request_fingerprint text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (request_idempotency_hash IS NULL OR length(request_idempotency_hash)=64),
  CHECK (request_fingerprint IS NULL OR length(request_fingerprint)=64)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_service_request_update_idempotency_hash
  ON service_request_update(request_idempotency_hash)
  WHERE request_idempotency_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_service_request_update_request_created
  ON service_request_update(request_id,created_at DESC);

-- A listing feed is not an engagement thread. Preserve old participant-only announcements
-- as history but remove them from the active/public feed; G4 uses service_request_update instead.
UPDATE service_listing_announcement
   SET status='archived', moderation_reason=coalesce(moderation_reason,'Archived by G4 audience-boundary migration'),
       updated_at=now()
 WHERE audience='participants' AND status<>'archived';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='service_listing_announcement_participant_audience_archived_check') THEN
    ALTER TABLE service_listing_announcement ADD CONSTRAINT service_listing_announcement_participant_audience_archived_check
      CHECK (audience <> 'participants' OR status='archived');
  END IF;
END $$;

COMMENT ON TABLE service_request_update IS 'Append-only operational updates visible only to the authorized requester and provider-side participants of one service request. Not a messaging inbox.';
COMMENT ON COLUMN service_request_feedback.category IS 'Structured feedback category. Feedback remains tied to a completed service request and is not a public comment thread.';
