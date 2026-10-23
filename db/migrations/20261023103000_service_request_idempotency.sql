-- Service request creation: bind a stable client key to a single request and payload.
ALTER TABLE service_request
  ADD COLUMN IF NOT EXISTS request_idempotency_hash text,
  ADD COLUMN IF NOT EXISTS request_fingerprint text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_service_request_idempotency_hash
  ON service_request(request_idempotency_hash)
  WHERE request_idempotency_hash IS NOT NULL;

COMMENT ON COLUMN service_request.request_idempotency_hash IS
  'Hash of the client-generated one-time submission key; used to replay service request creation after uncertain network outcomes.';
COMMENT ON COLUMN service_request.request_fingerprint IS
  'Hash of the normalized request payload and requester identity associated with the idempotency key.';
