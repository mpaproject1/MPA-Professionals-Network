import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");
const [migration,service,server,initiatives,offline,compatibility]=await Promise.all([
 read("../../db/migrations/20261031150000_community_impact_detection.sql"),
 read("../../src/platform/community-impact-detection.js"),
 read("../../server.js"),
 read("../../src/platform/serve-community-initiatives.js"),
 read("../../src/platform/serve-community-offline-projects.js"),
 read("../../scripts/check-new-migration-compatibility.js")
]);
test("Increment 2 adds only private detection projections and immutable policy/event history",()=>{
 for(const table of ["community_impact_detection_policy_version","community_impact_detection_active_policy","community_impact_detection_candidate","community_impact_detection_candidate_event"])assert.match(migration,new RegExp("create table if not exists "+table,"i"));
 assert.match(migration,/trg_community_impact_policy_version_immutable/);assert.match(migration,/trg_community_impact_candidate_event_immutable/);assert.match(migration,/trg_community_impact_candidate_guard/);assert.ok(migration.includes('"sourceEventCodes":["approve"]'));assert.match(migration,/Community Impact source and detection provenance is immutable/);
 assert.match(migration,/unique\(source_system,source_type,source_event_id\)/);
 assert.doesNotMatch(migration,/alter table serve_community_participation|alter table serve_community_initiative|alter table serve_community_offline_project/i);
});
test("source detection rules and category mappings are versioned configuration, not application constants",()=>{
 assert.match(migration,/'initiative_participation',1,'\{"enabled":true/);assert.match(migration,/'offline_completed_project',1,'\{"enabled":true/);
 assert.match(service,/activePolicy\(/);assert.match(service,/rules\.sourceEventCodes/);assert.match(service,/rules\.categoryMap/);assert.match(service,/rules\.confidence/);
 assert.doesNotMatch(service,/education_skills.*community_care.*digital_inclusion/);
});
test("initiative completion candidates use authoritative source identity and remain unverified pending contributor confirmation",()=>{
 assert.match(service,/authoritative_source_user/);assert.match(service,/pending_confirmation/);assert.match(service,/confirmMyDetectedAttribution/);
 assert.match(service,/i\.status=any\(\$4::text\[\]\)/);assert.match(service,/p\.status=any\(\$3::text\[\]\)/);
 assert.match(service,/detection does not award points or publish profile data/i);
 assert.match(initiatives,/detectParticipationCompletion/);
});
test("offline projects create unattributed candidates instead of assigning the whole project to its editor",()=>{
 assert.match(service,/unattributed_until_evidenced/);assert.match(service,/attributionStatus:"unattributed"/);
 assert.match(offline,/detectOfflineProjectApproval/);
});
test("candidate ingestion is replay-safe and contributor confirmation/dispute is auditable",()=>{
 assert.match(service,/on conflict\(source_system,source_type,source_event_id\) do nothing/);
 assert.match(service,/attribution_confirmed/);assert.match(service,/attribution_disputed/);assert.match(service,/reconcileCandidateReversals/);assert.match(service,/source_reversed/);
 assert.match(migration,/community_impact_detection_candidate_event/);
});
test("private candidate and scan APIs are authenticated and scoped",()=>{
 for(const route of ["api/v1/admin/community-impact/detection/scan","api/v1/admin/community-impact/detection/candidates","api/v1/me/community-impact/detected","api/v1/me/community-impact/detected/"])assert.ok(server.includes(route),route);
 assert.match(service,/community_impact\.detection\.manage/);assert.match(service,/where c\.contributor_user_id=\$1/);
});
test("migration compatibility inventory includes the Increment 2 migration",()=>{
 assert.match(compatibility,/20261031150000_community_impact_detection\.sql/);
});
