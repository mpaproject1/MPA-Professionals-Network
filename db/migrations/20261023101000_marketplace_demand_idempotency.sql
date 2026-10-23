-- Marketplace private demand intake: safely replay a request when its response is lost.
-- Store only the hash of the random client key, never the raw key.
ALTER TABLE marketplace_demand
  ADD COLUMN IF NOT EXISTS request_idempotency_hash text,
  ADD COLUMN IF NOT EXISTS request_fingerprint text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_marketplace_demand_idempotency_hash
  ON marketplace_demand(request_idempotency_hash)
  WHERE request_idempotency_hash IS NOT NULL;

COMMENT ON COLUMN marketplace_demand.request_idempotency_hash IS
  'Hash of the client-generated one-time submission key; used to replay the same private demand request after uncertain network outcomes.';
COMMENT ON COLUMN marketplace_demand.request_fingerprint IS
  'Hash of the normalized request payload and requester identity associated with the idempotency key.';
