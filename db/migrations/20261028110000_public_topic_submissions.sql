-- Standalone public-topic suggestions use the existing moderated marketplace_demand_topic
-- workflow. Private requests remain in marketplace_demand and are never copied automatically.
ALTER TABLE marketplace_demand
  ADD COLUMN IF NOT EXISTS public_topic_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_topic_status text NOT NULL DEFAULT 'not_requested'
    CHECK (public_topic_status IN ('not_requested','pending_review','topic_published','declined'));

ALTER TABLE marketplace_demand_topic
  ADD COLUMN IF NOT EXISTS public_topic_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES app_user(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS request_idempotency_hash text,
  ADD COLUMN IF NOT EXISTS request_fingerprint text,
  ADD COLUMN IF NOT EXISTS tracking_reference text,
  ADD COLUMN IF NOT EXISTS reviewer_note text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES app_user(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- Pending suggestions have not been published; the publisher and published timestamp
-- are set only by an authorized reviewer when the topic is approved.
ALTER TABLE marketplace_demand_topic ALTER COLUMN published_by DROP NOT NULL;
ALTER TABLE marketplace_demand_topic ALTER COLUMN published_at DROP NOT NULL;
ALTER TABLE marketplace_demand_topic DROP CONSTRAINT IF EXISTS marketplace_demand_topic_status_check;
ALTER TABLE marketplace_demand_topic ADD CONSTRAINT marketplace_demand_topic_status_check
  CHECK (status IN ('pending_review','published','paused','matched','converted','closed','rejected','changes_requested'));

CREATE UNIQUE INDEX IF NOT EXISTS ux_marketplace_demand_topic_request_key
  ON marketplace_demand_topic(request_idempotency_hash) WHERE request_idempotency_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_marketplace_demand_topic_tracking_reference
  ON marketplace_demand_topic(tracking_reference) WHERE tracking_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_marketplace_demand_topic_submitted_by
  ON marketplace_demand_topic(submitted_by,created_at DESC) WHERE public_topic_mode=true;
CREATE INDEX IF NOT EXISTS ix_marketplace_demand_topic_review_queue
  ON marketplace_demand_topic(status,created_at) WHERE public_topic_mode=true;

COMMENT ON COLUMN marketplace_demand_topic.public_topic_mode IS
  'True for a standalone public-safe topic suggestion; no private marketplace_demand row is created.';
COMMENT ON COLUMN marketplace_demand_topic.request_idempotency_hash IS
  'Hash of a client submission key. The raw key is never stored.';
