-- Service listing creation: safely replay a draft creation after an uncertain response.
ALTER TABLE service_listing
  ADD COLUMN IF NOT EXISTS request_idempotency_hash text,
  ADD COLUMN IF NOT EXISTS request_fingerprint text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_service_listing_idempotency_hash
  ON service_listing(request_idempotency_hash)
  WHERE request_idempotency_hash IS NOT NULL;

COMMENT ON COLUMN service_listing.request_idempotency_hash IS
  'Hash of the client-generated one-time submission key; used to replay service listing creation after uncertain network outcomes.';
COMMENT ON COLUMN service_listing.request_fingerprint IS
  'Hash of the normalized listing payload and provider identity associated with the idempotency key.';
