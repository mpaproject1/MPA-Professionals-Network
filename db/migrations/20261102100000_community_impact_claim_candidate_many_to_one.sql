-- Correct the initial reconciliation cardinality: a claim may link to one
-- detection candidate, while a candidate may be linked from multiple claims.
-- The earlier forward migration added the inverse uniqueness rule; remove only
-- that constraint and retain UNIQUE (claim_id) from the governance table.
ALTER TABLE community_impact_claim_candidate_link
  DROP CONSTRAINT IF EXISTS community_impact_claim_candidate_link_candidate_id_key;
