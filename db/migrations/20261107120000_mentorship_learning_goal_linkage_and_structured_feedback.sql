-- Additive goal linkage and structured assessment fields for mentorship learning.
-- Existing activities and free-text reviews remain valid and readable.
ALTER TABLE mentorship_learning_activity
  ADD COLUMN IF NOT EXISTS goal_id uuid REFERENCES mentorship_goal(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS mentorship_learning_activity_goal_idx
  ON mentorship_learning_activity(goal_id) WHERE goal_id IS NOT NULL;

ALTER TABLE mentorship_learning_review
  ADD COLUMN IF NOT EXISTS strengths text,
  ADD COLUMN IF NOT EXISTS areas_to_improve text,
  ADD COLUMN IF NOT EXISTS recommended_next_action text,
  ADD COLUMN IF NOT EXISTS further_resources text,
  ADD COLUMN IF NOT EXISTS overall_assessment text;

ALTER TABLE mentorship_learning_review
  DROP CONSTRAINT IF EXISTS mentorship_learning_review_overall_assessment_check;
ALTER TABLE mentorship_learning_review
  ADD CONSTRAINT mentorship_learning_review_overall_assessment_check
  CHECK (overall_assessment IS NULL OR overall_assessment IN ('exceeds_expectations','meets_expectations','developing','needs_support'));

ALTER TABLE mentorship_learning_review
  DROP CONSTRAINT IF EXISTS mentorship_learning_review_structured_lengths_check;
ALTER TABLE mentorship_learning_review
  ADD CONSTRAINT mentorship_learning_review_structured_lengths_check CHECK (
    (strengths IS NULL OR length(btrim(strengths)) BETWEEN 3 AND 1200) AND
    (areas_to_improve IS NULL OR length(btrim(areas_to_improve)) BETWEEN 3 AND 1200) AND
    (recommended_next_action IS NULL OR length(btrim(recommended_next_action)) BETWEEN 3 AND 1200) AND
    (further_resources IS NULL OR length(btrim(further_resources)) <= 1200)
  );

COMMENT ON COLUMN mentorship_learning_activity.goal_id IS 'Optional link to a goal in the same mentorship relationship; enforced by the service layer.';
COMMENT ON COLUMN mentorship_learning_review.overall_assessment IS 'Structured mentor assessment; nullable for backward compatibility with historical free-text reviews.';
