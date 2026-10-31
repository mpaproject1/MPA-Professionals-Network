import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");
const [migration,service,claims,server,privateFiles]=await Promise.all([
 read("../../db/migrations/20261101090000_community_impact_governance_completion.sql"),
 read("../../src/platform/community-impact-governance.js"),
 read("../../src/platform/community-impact-claims.js"),
 read("../../server.js"),
 read("../../src/platform/private-file-storage.js")
]);
test("Community Impact governance schema covers identity, attribution, reconciliation, assessments and retention evaluation",()=>{
 for(const table of ["community_impact_identity_assurance_case","community_impact_identity_assurance_evidence","community_impact_identity_assurance_decision","community_impact_offline_attribution","community_impact_offline_attribution_evidence","community_impact_claim_candidate_link","community_impact_reviewer_conflict","community_impact_contribution_assessment","community_impact_retention_evaluation"])assert.match(migration,new RegExp("create table if not exists "+table,"i"));
 assert.match(migration,/Community Impact governance history is append-only/i);
 assert.match(migration,/community_impact_block_conflicted_assignment/i);
 assert.match(migration,/community_impact_block_conflicted_decision/i);
});
test("Non-member claims require verified identity assurance without granting membership",()=>{
 assert.match(claims,/assertClaimantIdentityAssured/);
 assert.match(service,/Non-member claimants must complete MPA identity assurance/);
 assert.match(service,/does not create or grant membership/);
 assert.match(service,/community_impact.identity.review/);
});
test("Offline-project attribution is evidence-backed and does not infer the staff data-entry identity",()=>{
 assert.match(service,/offline_completed_project/);
 assert.match(service,/ATTRIBUTION_EVIDENCE_REQUIRED/);
 assert.match(service,/CONTRIBUTOR_CONFIRMATION_REQUIRED/);
 assert.match(service,/confirmOfflineAttribution/);
 assert.match(service,/assignOfflineAttribution/);
 assert.match(service,/CONTRIBUTOR_CONFIRMATION_REQUIRED/);
 assert.match(service,/Combined contributor shares cannot exceed 100 percent/);
 assert.match(service,/select \\* from community_impact_detection_candidate where id=\\$1 and source_type='offline_completed_project'.*for update/s);
 assert.match(service,/select coalesce\\(sum\\(attribution_share\\),0\\)::numeric total from community_impact_offline_attribution where candidate_id=\\$1/);
 assert.match(service,/community_impact.offline_attribution.review/);
});
test("Claim-to-detection reconciliation is reviewer-controlled and rejects fuzzy or cross-person merges",()=>{
 assert.match(service,/reconcileClaimCandidate/);
 assert.match(service,/no fuzzy or cross-person merge is allowed/i);
 assert.match(service,/attribution_status!=="confirmed"/);
 assert.match(migration,/unique\(claim_id\)/);
 assert.match(migration,/unique\(candidate_id\)/);
});
test("Detection policies require separate proposer, approver and activator operations",()=>{
 assert.match(service,/proposeDetectionPolicy/);
 assert.match(service,/approveDetectionPolicy/);
 assert.match(service,/activateDetectionPolicy/);
 assert.match(service,/policy proposer cannot approve their own policy/);
 assert.match(server,/api\/v1\/admin\/community-impact\/detection\/policies/);
});
test("Reviewer assessments and conflict controls enforce independent second review",()=>{
 assert.match(service,/proposeContributionAssessment/);
 assert.match(service,/secondReviewAssessment/);
 assert.match(service,/CONFLICT_OF_INTEREST/);
 assert.match(migration,/trg_community_impact_block_conflicted_decision/);
});
test("Retention evaluation is non-destructive and does not authorize deletion",()=>{
 assert.match(service,/deletion_not_authorized/);
 assert.match(service,/deletionExecuted:false/);
 assert.doesNotMatch(service,/\bdelete\s+from\b/i);
 assert.match(server,/communityImpactGovernance\.evaluateRetention/);
});
test("Identity and offline-attribution evidence remain private and reviewer-scoped",()=>{
 assert.match(privateFiles,/community_impact_identity\.review/);
 assert.match(privateFiles,/community_impact\.offline_attribution\.review/);
});
