-- Expand the active initial score baseline with fully policy-configured evidence, outcome and rounding scales.
-- The five approved dimension weights are unchanged. The prior seed remains immutable as version 1.
update community_impact_score_policy_version set status='superseded' where version=1 and status='active';
insert into community_impact_score_policy_event(policy_version_id,event_code,rationale,metadata)
select id,'superseded','Replaced by the fully specified initial scoring policy version 2; five-dimension weights are unchanged.',jsonb_build_object('replacedByVersion',2)
from community_impact_score_policy_version where version=1
and not exists(select 1 from community_impact_score_policy_event e where e.policy_version_id=community_impact_score_policy_version.id and e.event_code='superseded');

insert into community_impact_score_policy_version(version,schema_version,policy_hash,policy,status,evaluation_only,public_score_enabled,rationale,change_summary,created_by)
values(2,1,'a5efe8d4a57bca794a7db1c611708eb5dc074182f31bedf948972a90f7eb04dc','{"mode":"evaluation","publicScoreEnabled":false,"dimensions":[{"key":"measurable_community_outcomes","label":"Measurable community outcomes","weight":30,"minimumEvidenceQuality":"adequate","ratings":{"min":0,"max":5,"step":1}},{"key":"quality_and_significance","label":"Quality and significance","weight":25,"minimumEvidenceQuality":"adequate","ratings":{"min":0,"max":5,"step":1}},{"key":"verified_contribution_responsibility","label":"Verified contribution and responsibility","weight":20,"minimumEvidenceQuality":"adequate","ratings":{"min":0,"max":5,"step":1}},{"key":"sustainability","label":"Sustainability","weight":15,"minimumEvidenceQuality":"adequate","ratings":{"min":0,"max":5,"step":1}},{"key":"collaboration_knowledge_sharing","label":"Collaboration and knowledge sharing","weight":10,"minimumEvidenceQuality":"adequate","ratings":{"min":0,"max":5,"step":1}}],"calculation":{"basePoints":100,"rounding":"4dp","roleFactors":{"lead":1,"co_lead":1,"contributor":1,"mentor":1,"reviewer_organizer":1,"partner_organization":1,"other":1},"minimumEvidenceQuality":"adequate","evidenceQualityRank":{"insufficient":0,"limited":1,"adequate":2,"strong":3,"exceptional":4},"minimumOutcomeMaturity":"output","outcomeMaturityRank":{"activity":0,"output":1,"outcome":2,"sustained_impact":3},"requiredAssessmentStatus":"approved","requiredClaimStatus":"verified","sourceCaps":{},"categoryCaps":{},"periodCaps":{},"diminishingReturns":[],"eligibleSourceTypes":["serve_community_participation","offline_completed_project","mentorship","professional_service","employment_referral","network_plus_collaboration","network_plus_partnership","historical_contribution"]},"publication":{"enabled":false,"consentRequired":true,"minimumGroupSize":5}}'::jsonb,'active',true,false,
'Initial docs/62 Section 8 baseline with configurable evidence quality, outcome maturity and rating scales; private evaluation only.',
'Operational schema expansion of initial five-dimension scoring baseline; weights unchanged.',null)
on conflict(version) do nothing;

update community_impact_score_active_policy set policy_version_id=(select id from community_impact_score_policy_version where version=2),activated_by=null,activated_at=now() where singleton=true;
insert into community_impact_score_policy_event(policy_version_id,event_code,rationale,metadata)
select id,'activated','Activated the initial docs/62 five-dimension policy for private evaluation only.',jsonb_build_object('version',2,'publicScoreEnabled',false)
from community_impact_score_policy_version where version=2
and not exists(select 1 from community_impact_score_policy_event e where e.policy_version_id=community_impact_score_policy_version.id and e.event_code='activated');
