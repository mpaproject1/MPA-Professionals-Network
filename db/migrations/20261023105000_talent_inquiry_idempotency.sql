-- Professional-to-professional inquiry creation: safely replay an uncertain submission.
ALTER TABLE talent_inquiry
  ADD COLUMN IF NOT EXISTS request_idempotency_hash text,
  ADD COLUMN IF NOT EXISTS request_fingerprint text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_talent_inquiry_idempotency_hash
  ON talent_inquiry(request_idempotency_hash)
  WHERE request_idempotency_hash IS NOT NULL;

COMMENT ON COLUMN talent_inquiry.request_idempotency_hash IS
  'Hash of the client-generated one-time submission key; used to replay a talent inquiry after uncertain network outcomes.';
COMMENT ON COLUMN talent_inquiry.request_fingerprint IS
  'Hash of the normalized inquiry payload and requester identity associated with the idempotency key.';
