import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");
const [migration,sourceMigration,service,server,member,admin,governance,checker]=await Promise.all([
 read("../../db/migrations/20261101110000_community_impact_unified_score.sql"),
 read("../../db/migrations/20261101120000_community_impact_score_source_adapters.sql"),
 read("../../src/platform/community-impact-score.js"),
 read("../../server.js"),
 read("../../web/app/community-impact/score/page.tsx"),
 read("../../web/app/admin/community-impact/scoring/page.tsx"),
 read("../../web/app/admin/community-impact/governance/page.tsx"),
 read("../../scripts/check-new-migration-compatibility.js"),
 read("../../db/migrations/20261101160000_community_impact_score_policy_rubric_config.sql")
]);
test("Initial active evaluation policy matches the approved five-dimension baseline and is not public",()=>{
 assert.match(migration,/"weight":30/);assert.match(migration,/"weight":25/);assert.match(migration,/"weight":20/);assert.match(migration,/"weight":15/);assert.match(migration,/"weight":10/);
 assert.match(migration,/'active',true,false/);assert.match(migration,/docs\/62-community-impact-and-recognition-design\.md/);
 assert.match(migration,/public_score_enabled=false/);
 assert.match(rubricMigration,/evidenceQualityRank/);
 assert.match(rubricMigration,/outcomeMaturityRank/);
 assert.match(rubricMigration,/status='superseded'/);
 assert.match(service,/exactly the five approved dimensions/);
 assert.match(service,/weights must total exactly 100%/);
 assert.match(service,/policy\.dimensions/);
});
test("Score ledger, policies and source links are immutable and duplicate-resistant",()=>{
 assert.match(migration,/community_impact_score_ledger_immutable/);
 assert.match(migration,/idempotency_key text not null unique/);
 assert.match(migration,/reverses_entry_id uuid/);
 assert.match(sourceMigration,/unique\(source_system,source_type,source_record_id,subject_user_id\)/);
 assert.match(sourceMigration,/unique references community_impact_claim/);
 assert.match(service,/already_recorded/);
 assert.match(service,/reverseEntry/);
 assert.match(service,/no_change/);
});
test("Source adapters require authoritative verified source lifecycle and claimant identity",()=>{
 for(const source of ["serve_community_participation","offline_completed_project","mentorship","professional_service","employment_referral","network_plus_collaboration","network_plus_partnership","historical_contribution"])assert.ok(service.includes(source),source);
 for(const gate of ["attribution_status='confirmed'","status='employment_verified'","s.status='completed'","r.status='completed'","p.consent_status='accepted'","status='verified'"])assert.ok(service.includes(gate),gate);
 assert.match(service,/SCORE_SOURCE_LINK_REQUIRED/);
 assert.match(service,/SCORE_ATTRIBUTION_MISMATCH/);
});
test("Scoring uses reviewer-assessed dimensions, policy weights, configured caps and role factors",()=>{
 assert.match(service,/assessment\.rubric/);assert.match(service,/weighted\+=normalized\*Number\(d\.weight\)\/100/);
 assert.match(service,/calc\.roleFactors/);assert.match(service,/calc\.categoryCaps/);assert.match(service,/calc\.sourceCaps/);assert.match(service,/calc\.periodCaps/);assert.match(service,/calc\.diminishingReturns/);
 assert.match(governance,/measurable_community_outcomes/);
 assert.match(governance,/collaboration_knowledge_sharing/);
});
test("Reversals and recalculations append compensating history without editing the ledger",()=>{
 assert.match(service,/entry_type:'reversal'/);assert.match(service,/reverses_entry_id/);
 assert.match(service,/community_impact_score_recalculation/);
 assert.match(migration,/before update or delete on community_impact_score_ledger/);
 assert.doesNotMatch(service,/update community_impact_score_ledger/i);
 assert.doesNotMatch(service,/delete from community_impact_score_ledger/i);
});
test("Member score view is private and administrator score operations are separately permissioned",()=>{
 assert.match(member,/\/api\/v1\/me\/community-impact\/score/);
 assert.match(member,/Why these points were awarded/);
 assert.match(member,/not publicly published/);
 assert.match(admin,/community-impact\/score\/policies/);
 assert.match(admin,/Append reversal entry/);
 assert.match(admin,/Verify and link authoritative source/);
 assert.match(server,/communityImpactScore\.getMyScore/);
 assert.match(server,/communityImpactScore\.linkVerifiedSource/);
 assert.match(server,/communityImpactScore\.reverseScoreEntry/);
 assert.match(checker,/20261101110000_community_impact_unified_score\.sql/);
 assert.match(checker,/20261101120000_community_impact_score_source_adapters\.sql/);
 assert.match(checker,/20261101160000_community_impact_score_policy_rubric_config\.sql/);
});
