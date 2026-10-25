-- Serve-Community G3: explicit impact model and evidence-backed metrics.
-- No existing listing is assigned an impact model, reference price or discount by this migration.
ALTER TABLE service_listing
  ADD COLUMN IF NOT EXISTS impact_model text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS reference_price_amount numeric(12,2);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='service_listing_impact_model_check') THEN
    ALTER TABLE service_listing ADD CONSTRAINT service_listing_impact_model_check
      CHECK (impact_model IN ('standard','pro_bono','community_discount','capacity_grant'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='service_listing_reference_price_check') THEN
    ALTER TABLE service_listing ADD CONSTRAINT service_listing_reference_price_check
      CHECK (reference_price_amount IS NULL OR reference_price_amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='service_listing_impact_pricing_check') THEN
    ALTER TABLE service_listing ADD CONSTRAINT service_listing_impact_pricing_check CHECK (
      (impact_model='standard')
      OR (impact_model='pro_bono' AND pricing_model='free' AND coalesce(price_amount,0)=0 AND reference_price_amount IS NULL)
      OR (impact_model='community_discount' AND pricing_model IN ('fixed','hourly') AND price_amount IS NOT NULL AND price_amount > 0 AND reference_price_amount IS NOT NULL AND reference_price_amount > price_amount)
      OR (impact_model='capacity_grant' AND reference_price_amount IS NULL)
    );
  END IF;
END $$;

-- Correct the earlier legacy mapping: an owner pause is not a moderator suspension.
UPDATE service_listing SET lifecycle_status='paused'
 WHERE status='paused' AND lifecycle_status='suspended';

COMMENT ON COLUMN service_listing.impact_model IS 'Explicit service impact classification. Badge claims are derived from this persisted classification and validated pricing evidence.';
COMMENT ON COLUMN service_listing.reference_price_amount IS 'Documented comparable standard price for a discounted listing; must exceed the actual listing price.';
