-- Mentorship requests: safely replay the same submission after an uncertain response.
ALTER TABLE mentorship_request
  ADD COLUMN IF NOT EXISTS request_idempotency_hash text,
  ADD COLUMN IF NOT EXISTS request_fingerprint text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_mentorship_request_idempotency_hash
  ON mentorship_request(request_idempotency_hash)
  WHERE request_idempotency_hash IS NOT NULL;

COMMENT ON COLUMN mentorship_request.request_idempotency_hash IS
  'Hash of the client-generated one-time submission key; used to replay a mentorship request after uncertain network outcomes.';
COMMENT ON COLUMN mentorship_request.request_fingerprint IS
  'Hash of the normalized mentorship request and mentee identity associated with the idempotency key.';
