-- The published MPA reference dictionaries, not hard-coded CHECK lists, govern extensible classification values.
ALTER TABLE community_impact_claim DROP CONSTRAINT IF EXISTS community_impact_claim_category_check;
ALTER TABLE community_impact_claim DROP CONSTRAINT IF EXISTS community_impact_claim_contribution_type_check;
ALTER TABLE community_impact_claim DROP CONSTRAINT IF EXISTS community_impact_claim_contribution_role_check;
-- The migration is also replayed by the compatibility gate against a schema
-- where this migration has already run. Remove the exact constraints it owns.
ALTER TABLE community_impact_claim DROP CONSTRAINT IF EXISTS community_impact_claim_category_code_check;
ALTER TABLE community_impact_claim DROP CONSTRAINT IF EXISTS community_impact_claim_contribution_type_code_check;
ALTER TABLE community_impact_claim DROP CONSTRAINT IF EXISTS community_impact_claim_contribution_role_code_check;
ALTER TABLE community_impact_claim
 ADD CONSTRAINT community_impact_claim_category_code_check CHECK (category ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
 ADD CONSTRAINT community_impact_claim_contribution_type_code_check CHECK (contribution_type ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
 ADD CONSTRAINT community_impact_claim_contribution_role_code_check CHECK (contribution_role ~ '^[a-z0-9][a-z0-9._-]{0,79}$');

ALTER TABLE community_impact_claim_evidence DROP CONSTRAINT IF EXISTS community_impact_claim_evidence_evidence_type_check;
ALTER TABLE community_impact_claim_evidence DROP CONSTRAINT IF EXISTS community_impact_claim_evidence_type_code_check;
ALTER TABLE community_impact_claim_evidence
 ADD CONSTRAINT community_impact_claim_evidence_type_code_check CHECK (evidence_type ~ '^[a-z0-9][a-z0-9._-]{0,79}$');

COMMENT ON COLUMN community_impact_claim.category IS 'Lowercase permanent code from the active published community_impact_contribution_categories reference dataset.';
COMMENT ON COLUMN community_impact_claim.contribution_type IS 'Lowercase permanent code from the active published community_impact_contribution_types reference dataset.';
COMMENT ON COLUMN community_impact_claim.contribution_role IS 'Lowercase permanent code from the active published community_impact_contributor_roles reference dataset.';
COMMENT ON COLUMN community_impact_claim_evidence.evidence_type IS 'Lowercase permanent code from the active published community_impact_evidence_types reference dataset.';
