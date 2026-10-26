-- Serve-Community G6: evidence-backed completion, requester outcome decisions and fulfilment rules.
-- Defaults preserve ongoing programs as owner-managed and require accepted delivery evidence.
ALTER TABLE service_listing
  ADD COLUMN IF NOT EXISTS completion_evidence_policy text NOT NULL DEFAULT 'accepted_delivery',
  ADD COLUMN IF NOT EXISTS fulfilment_rule text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS fulfilment_target_count integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='service_listing_completion_evidence_policy_check') THEN
    ALTER TABLE service_listing ADD CONSTRAINT service_listing_completion_evidence_policy_check
      CHECK (completion_evidence_policy IN ('accepted_delivery','private_file','description_only'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='service_listing_fulfilment_rule_check') THEN
    ALTER TABLE service_listing ADD CONSTRAINT service_listing_fulfilment_rule_check
      CHECK (fulfilment_rule IN ('manual','single_engagement','engagement_count'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='service_listing_fulfilment_target_count_check') THEN
    ALTER TABLE service_listing ADD CONSTRAINT service_listing_fulfilment_target_count_check
      CHECK (fulfilment_target_count BETWEEN 1 AND 1000000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='service_listing_single_engagement_target_check') THEN
    ALTER TABLE service_listing ADD CONSTRAINT service_listing_single_engagement_target_check
      CHECK (fulfilment_rule <> 'single_engagement' OR fulfilment_target_count=1);
  END IF;
END $$;

ALTER TABLE service_request
  ADD COLUMN IF NOT EXISTS provider_completion_submitted_by uuid REFERENCES app_user(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS requester_outcome_decision text,
  ADD COLUMN IF NOT EXISTS requester_outcome_decision_by uuid REFERENCES app_user(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS requester_outcome_decision_at timestamptz,
  ADD COLUMN IF NOT EXISTS requester_outcome_note text,
  ADD COLUMN IF NOT EXISTS final_outcome_summary text,
  ADD COLUMN IF NOT EXISTS completion_evidence_delivery_id uuid REFERENCES service_request_delivery(id) ON DELETE RESTRICT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='service_request_requester_outcome_decision_check') THEN
    ALTER TABLE service_request ADD CONSTRAINT service_request_requester_outcome_decision_check
      CHECK (requester_outcome_decision IS NULL OR requester_outcome_decision IN ('accepted','revision_requested','disputed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='service_request_outcome_decision_actor_check') THEN
    ALTER TABLE service_request ADD CONSTRAINT service_request_outcome_decision_actor_check
      CHECK ((requester_outcome_decision IS NULL AND requester_outcome_decision_by IS NULL AND requester_outcome_decision_at IS NULL)
          OR (requester_outcome_decision IS NOT NULL AND requester_outcome_decision_by IS NOT NULL AND requester_outcome_decision_at IS NOT NULL));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS service_request_completion_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES service_request(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('submitted','accepted','revision_requested','disputed','resubmitted','reopened')),
  outcome_summary text,
  evidence_delivery_id uuid REFERENCES service_request_delivery(id) ON DELETE RESTRICT,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_service_request_completion_event_request_created
  ON service_request_completion_event(request_id,created_at DESC);

COMMENT ON COLUMN service_listing.completion_evidence_policy IS 'Per-listing evidence requirement: accepted delivery, private-file-backed delivery, or explicit description-only service evidence.';
COMMENT ON COLUMN service_listing.fulfilment_rule IS 'manual keeps ongoing programs open until owner action; single_engagement or engagement_count fulfil only after the defined number of requester-accepted engagements.';
COMMENT ON COLUMN service_request.provider_completed_at IS 'Provider completion submission timestamp; distinct from requester acceptance and final completion.';
COMMENT ON COLUMN service_request.requester_outcome_decision IS 'Latest requester decision on provider-submitted outcome; accepted, revision_requested or disputed.';
COMMENT ON TABLE service_request_completion_event IS 'Append-only evidence-backed provider submissions and requester outcome decisions, retaining actor and timestamp history.';
