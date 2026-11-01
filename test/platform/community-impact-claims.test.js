import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const read=path=>readFile(new URL(path,import.meta.url),"utf8");
const [migration,service,server,privateFiles,compatibility,claimPage,reviewPage,adminWorkspace,retentionMigration,uploadHelper,taxonomyMigration,taxonomyConstraintsMigration,referenceService,referenceAdmin]=await Promise.all([
 read("../../db/migrations/20261031180000_community_impact_manual_claims.sql"),
 read("../../src/platform/community-impact-claims.js"),
 read("../../server.js"),
 read("../../src/platform/private-file-storage.js"),
 read("../../scripts/check-new-migration-compatibility.js"),
 read("../../web/app/community-impact/claims/page.tsx"),
 read("../../web/app/admin/community-impact/claims/page.tsx"),
 read("../../web/app/admin/admin-workspace.tsx"),
 read("../../db/migrations/20261031170000_community_impact_retention_policy.sql"),
 read("../../web/lib/private-upload.ts"),
 read("../../db/migrations/20261101280000_community_impact_governed_taxonomies.sql"),
 read("../../db/migrations/20261101290000_community_impact_taxonomy_code_constraints.sql"),
 read("../../src/platform/reference-portfolio.js"),
 read("../../web/app/admin/reference-portfolio/page.tsx")
]);
test("Increment 3 creates separate private claim, evidence, assignment, decision, appeal and event records",()=>{
 for(const table of ["community_impact_claim","community_impact_claim_evidence","community_impact_claim_assignment","community_impact_claim_decision","community_impact_claim_appeal","community_impact_claim_event"])assert.match(migration,new RegExp("create table if not exists "+table,"i"));
 assert.match(migration,/claimant_user_id uuid not null references app_user\(id\) on delete restrict/);
 assert.match(migration,/retention_policy_version_id uuid not null references community_impact_retention_policy_version/);
 assert.match(migration,/retention_rule_snapshot jsonb not null/);
 assert.match(migration,/file_object_id uuid unique references file_object\(id\)/);
 assert.match(migration,/claim history is append-only/i);
 assert.match(migration,/claim decisions are immutable/i);
 assert.match(migration,/evidence references can only be deleted by the approved retention processor/i);
 assert.match(migration,/current_setting\('app\.community_impact_retention_processing'/);
 assert.match(migration,/mentorship_knowledge_sharing/);
 assert.match(migration,/professional_pro_bono_services/);
 assert.match(migration,/employment_referrals/);
 assert.match(migration,/partnerships_organizational_capacity/);
 assert.match(migration,/beneficiary_count_method/);
 assert.match(migration,/sustained_impact_summary/);
 assert.match(migration,/location_summary/);
 assert.match(migration,/community_impact_claim_consent/);
 assert.match(migration,/consent_text_hash text not null/);
 assert.match(migration,/consent history is immutable/i);
 assert.match(migration,/evidence_url text/);
 assert.match(migration,/video/);
 assert.match(migration,/url/);
});
test("claim collection requires an active MPA retention schedule and never assumes membership",()=>{
 assert.match(service,/activeRetention\(db,"claim_metadata"\)/);
 assert.match(privateFiles,/raw_evidence/);
 assert.match(privateFiles,/retentionPolicyVersionId=policy.id/);
 assert.match(service,/file.retention_policy_version_id/);
 assert.match(service,/MPA must approve and activate a retention schedule/);
 assert.doesNotMatch(service,/membership_record|has_active_membership|MEMBERSHIP_REQUIRED/);
 assert.match(migration,/Membership is not required/);
 assert.match(migration,/Non-member identity assurance is outside this increment/);
});
test("claimants can create, edit, submit, attach private evidence, clarify, withdraw and appeal only their own records",()=>{
 for(const method of ["createClaim","updateMyClaim","attachClaimEvidence","attachClaimEvidenceUrl","removeClaimEvidence","submitMyClaim","respondToClarification","withdrawMyClaim","submitClaimAppeal","getMyClaim"])assert.match(service,new RegExp("export async function "+method));
 assert.match(service,/where c\.claimant_user_id=\$1/);
 assert.match(service,/ownedClaim\(tx,claimId,userId/);
 assert.match(service,/evidence<1/);
 assert.match(service,/Only your own confirmed claim-scoped private upload/);
 assert.match(service,/bytesDeleted:false/);
 assert.match(service,/evidence_removed/);
 assert.match(migration,/evidence_removed/);
 assert.match(service,/public_requested/);
 assert.match(service,/safeEvidenceUrl/);
 assert.match(service,/host.endsWith/);
 assert.match(service,/COMMUNITY_IMPACT_CLAIM_PUBLIC_CONSENT_REQUIRED/);
 assert.match(service,/PUBLIC_CONSENT_VERSION/);
 assert.match(service,/MEDIA_RIGHTS_VERSION/);
 assert.match(service,/consentChanges/);
});
test("review and appeal actions require assignment, separate permissions and independent decision-makers",()=>{
 assert.match(service,/community_impact\.claim\.review/);
 assert.match(service,/community_impact\.claim\.assign/);
 assert.match(service,/community_impact\.claim\.appeal_review/);
 assert.match(service,/currently assigned reviewer may decide/);
 assert.match(service,/original decision-maker cannot review this appeal/);
 assert.match(service,/assigned independent appeal reviewer may decide/);
 assert.match(migration,/uq_community_impact_claim_active_assignment/);
});
test("private claim evidence downloads are scoped to claimant or assigned reviewers",()=>{
 assert.match(privateFiles,/community_impact_claim_evidence/);
 assert.match(privateFiles,/if\(f\.purpose==="community_impact_claim_evidence"\)/);
 assert.match(migration,/decision_retention_policy_version_id uuid references community_impact_retention_policy_version/);
 assert.match(migration,/retention_rule_snapshot jsonb not null/);
 assert.match(privateFiles,/assigned_reviewer/);
 assert.match(privateFiles,/assigned_appeal_reviewer/);
 assert.match(privateFiles,/claimant_user_id===userId/);
 assert.match(privateFiles,/!claimAccess\.removed_at/);
 assert.match(privateFiles,/community_impact_claim_evidence/);
 assert.match(uploadHelper,/purposeReferenceId/);
 assert.match(migration,/purpose_reference_id uuid references community_impact_claim/);
});
test("claim and appeal APIs authenticate every operation",()=>{
 for(const route of ["api/v1/me/community-impact/claims","api/v1/admin/community-impact/claims","api/v1/admin/community-impact/claim-reviewers","api/v1/admin/community-impact/claim-appeals","clarification-response","parts[6]===\"evidence\"","attachClaimEvidenceUrl" ,"parts[6]===\"decision\"","parts[6]===\"assign\""])assert.ok(server.includes(route),route);
});
test("member and reviewer screens preserve private-by-default evidence boundaries",()=>{
 assert.match(claimPage,/private draft/i);
 assert.match(claimPage,/community_impact_contribution_categories/);
 assert.match(claimPage,/sustainedImpactSummary/);
 assert.match(claimPage,/beneficiaryCountMethod/);
 assert.match(claimPage,/External evidence URL/);
 assert.match(claimPage,/Attach private evidence link/);
 assert.match(claimPage,/not required/);
 assert.match(claimPage,/uploadPrivateFile/);
 assert.match(claimPage,/downloadPrivateFile/);
 assert.match(claimPage,/Request independent appeal review/);
 assert.match(claimPage,/Remove from claim/);
 assert.match(reviewPage,/assigned reviewer only/);
 assert.match(reviewPage,/Request clarification/);
 assert.match(reviewPage,/Overturn original decision/);
 assert.match(reviewPage,/Open private evidence link/);
 assert.match(adminWorkspace,/Impact claim review/);
});
test("Community Impact contribution taxonomies are editable through the versioned Reference Portfolio engine",()=>{
 for(const key of ["community_impact_contribution_categories","community_impact_contribution_types","community_impact_contributor_roles","community_impact_evidence_types"])assert.match(taxonomyMigration,new RegExp(key));
 assert.match(taxonomyMigration,/initial-governed-baseline/);
 assert.match(taxonomyConstraintsMigration,/community_impact_claim_category_code_check/);
 assert.match(taxonomyConstraintsMigration,/community_impact_claim_contribution_type_code_check/);
 assert.match(taxonomyConstraintsMigration,/community_impact_claim_contribution_role_code_check/);
 assert.match(taxonomyConstraintsMigration,/community_impact_claim_evidence_type_code_check/);
 assert.match(referenceService,/community_impact_%/);
 assert.match(referenceService,/reference_dataset_version v/);
 assert.match(service,/publishedTaxonomyCode/);
 assert.match(service,/community_impact_contribution_categories/);
 assert.match(service,/community_impact_contribution_types/);
 assert.match(service,/community_impact_contributor_roles/);
 assert.match(service,/community_impact_evidence_types/);
 assert.doesNotMatch(service,/const CATEGORIES=new Set/);
 assert.doesNotMatch(service,/const TYPES=new Set/);
 assert.match(claimPage,/api\/v1\/professional-reference-data/);
 assert.match(claimPage,/community_impact_contribution_categories/);
 assert.match(referenceAdmin,/Reference Portfolio/);
});
test("retention migration has valid hash constraint and immutable policy version fields",()=>{
 assert.match(retentionMigration,/policy_hash text not null check\(policy_hash ~ '\^\[a-f0-9\]\{64\}\$'\)/);
 assert.match(retentionMigration,/NEW\.schema_version is distinct from OLD\.schema_version/);
 assert.match(retentionMigration,/NEW\.policy_hash is distinct from OLD\.policy_hash/);
 assert.doesNotMatch(retentionMigration,/policy_hash ~ '\^\[a-f0-9\]\{64\} not null/);
});
test("migration compatibility inventory includes Increment 3",()=>{
 assert.match(compatibility,/20261031180000_community_impact_manual_claims\.sql/);
});
