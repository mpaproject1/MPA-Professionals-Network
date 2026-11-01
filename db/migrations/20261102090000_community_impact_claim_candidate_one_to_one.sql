-- Enforce one-to-one reconciliation in both directions. Existing duplicates are
-- deliberately surfaced as a migration failure; do not silently choose a winner.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM community_impact_claim_candidate_link
    GROUP BY candidate_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one-to-one Community Impact reconciliation: duplicate candidate links exist';
  END IF;
END $$;

ALTER TABLE community_impact_claim_candidate_link
  DROP CONSTRAINT IF EXISTS community_impact_claim_candidate_link_candidate_id_key;
ALTER TABLE community_impact_claim_candidate_link
  ADD CONSTRAINT community_impact_claim_candidate_link_candidate_id_key UNIQUE (candidate_id);
