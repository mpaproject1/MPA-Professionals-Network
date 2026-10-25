-- Serve-Community G2: additive lifecycle, interest, pledge, agreement and announcement records.
-- Existing listing expiry is NULL by default; no existing program is assigned an expiry.
ALTER TABLE service_listing
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS lifecycle_status text;

UPDATE service_listing
   SET lifecycle_status = CASE status
     WHEN 'published' THEN 'active'
     WHEN 'closed' THEN 'archived'
     WHEN 'paused' THEN 'suspended'
     ELSE 'draft'
   END
 WHERE lifecycle_status IS NULL;

ALTER TABLE service_listing
  ALTER COLUMN lifecycle_status SET DEFAULT 'draft',
  ALTER COLUMN lifecycle_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='service_listing_lifecycle_status_check') THEN
    ALTER TABLE service_listing ADD CONSTRAINT service_listing_lifecycle_status_check
      CHECK (lifecycle_status IN ('draft','pending_review','active','fulfilled','archived','suspended','rejected'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS service_listing_lifecycle_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES service_listing(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  from_status text,
  to_status text NOT NULL CHECK (to_status IN ('draft','pending_review','active','fulfilled','archived','suspended','rejected')),
  reason text NOT NULL CHECK (length(trim(reason)) >= 4),
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_listing_lifecycle_event_listing_created_idx
  ON service_listing_lifecycle_event(listing_id,created_at DESC);

CREATE TABLE IF NOT EXISTS service_listing_interest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES service_listing(id) ON DELETE RESTRICT,
  individual_user_id uuid REFERENCES app_user(id) ON DELETE RESTRICT,
  organization_id uuid REFERENCES organization(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'interested' CHECK (status IN ('interested','withdrawn','invalidated')),
  invalidation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((individual_user_id IS NOT NULL AND organization_id IS NULL AND individual_user_id=actor_user_id)
      OR (individual_user_id IS NULL AND organization_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_service_listing_interest_active_individual
  ON service_listing_interest(listing_id,individual_user_id)
  WHERE status='interested' AND individual_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_service_listing_interest_active_organization
  ON service_listing_interest(listing_id,organization_id)
  WHERE status='interested' AND organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS service_listing_interest_listing_status_idx
  ON service_listing_interest(listing_id,status);

CREATE TABLE IF NOT EXISTS service_listing_pledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES service_listing(id) ON DELETE RESTRICT,
  individual_user_id uuid REFERENCES app_user(id) ON DELETE RESTRICT,
  organization_id uuid REFERENCES organization(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  description text NOT NULL CHECK (length(trim(description)) >= 4),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft','submitted','accepted','declined','withdrawn','fulfilled','cancelled')),
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((individual_user_id IS NOT NULL AND organization_id IS NULL AND individual_user_id=actor_user_id)
      OR (individual_user_id IS NULL AND organization_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS service_listing_pledge_listing_status_idx
  ON service_listing_pledge(listing_id,status);
CREATE INDEX IF NOT EXISTS service_listing_pledge_actor_created_idx
  ON service_listing_pledge(actor_user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS service_request_agreement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES service_request(id) ON DELETE RESTRICT,
  terms_version integer NOT NULL CHECK (terms_version > 0),
  terms jsonb NOT NULL,
  terms_hash text NOT NULL,
  provider_accepted_by uuid REFERENCES app_user(id) ON DELETE RESTRICT,
  provider_accepted_at timestamptz,
  requester_accepted_by uuid REFERENCES app_user(id) ON DELETE RESTRICT,
  requester_accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(request_id,terms_version),
  CHECK ((provider_accepted_by IS NULL) = (provider_accepted_at IS NULL)),
  CHECK ((requester_accepted_by IS NULL) = (requester_accepted_at IS NULL))
);
CREATE INDEX IF NOT EXISTS service_request_agreement_request_version_idx
  ON service_request_agreement(request_id,terms_version DESC);

CREATE TABLE IF NOT EXISTS service_listing_announcement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES service_listing(id) ON DELETE RESTRICT,
  author_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  audience text NOT NULL CHECK (audience IN ('public','members','participants')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','published','rejected','archived')),
  title text NOT NULL CHECK (length(trim(title)) >= 4),
  body text NOT NULL CHECK (length(trim(body)) >= 10),
  moderation_reason text,
  moderated_by uuid REFERENCES app_user(id) ON DELETE RESTRICT,
  moderated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_listing_announcement_listing_created_idx
  ON service_listing_announcement(listing_id,created_at DESC);

COMMENT ON COLUMN service_listing.expires_at IS 'Optional owner-selected expiry. NULL means no expiry; existing listings are not assigned expiry during migration.';
COMMENT ON COLUMN service_listing.lifecycle_status IS 'Canonical Serve-Community lifecycle, separate from legacy moderation and publication status.';
