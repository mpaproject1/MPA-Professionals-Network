-- Public opportunity intake: bind a stable client idempotency key to the exact submitted payload.
-- The key hash reuses the existing continuation-token hash column; the raw secret is never stored.
ALTER TABLE public_opportunity_inquiry
  ADD COLUMN IF NOT EXISTS idempotency_request_hash text;

COMMENT ON COLUMN public_opportunity_inquiry.idempotency_request_hash IS
  'SHA-256 fingerprint of the normalized first-stage inquiry payload and account identity for safe replay after an uncertain network outcome.';
