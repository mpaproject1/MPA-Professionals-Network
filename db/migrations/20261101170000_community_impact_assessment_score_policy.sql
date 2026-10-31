-- Bind each reviewer assessment to the exact active score policy whose rubric was used.
alter table community_impact_contribution_assessment
 add column if not exists score_policy_version_id uuid references community_impact_score_policy_version(id) on delete restrict;
create index if not exists ix_community_impact_assessment_score_policy
 on community_impact_contribution_assessment(score_policy_version_id,claim_id,created_at desc);
comment on column community_impact_contribution_assessment.score_policy_version_id is 'Exact scoring policy version used for the five-dimension reviewer rubric; legacy assessments remain null and must be reassessed before scoring.';
