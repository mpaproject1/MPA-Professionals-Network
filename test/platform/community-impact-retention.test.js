import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");
const [migration,service,server,compatibility]=await Promise.all([
 read("../../db/migrations/20261031170000_community_impact_retention_policy.sql"),
 read("../../src/platform/community-impact-retention.js"),
 read("../../server.js"),
 read("../../scripts/check-new-migration-compatibility.js")
]);
test("retention policy is versioned and has no unapproved default schedule",()=>{
 for(const table of ["community_impact_retention_policy_version","community_impact_retention_active_policy","community_impact_retention_policy_event"])assert.match(migration,new RegExp("create table if not exists "+table,"i"));
 assert.doesNotMatch(migration,/insert into community_impact_retention_policy_version/i);
 assert.doesNotMatch(migration,/retentionDays\s*[:=]\s*\d+/i);
 assert.match(migration,/No retention duration is seeded/);
 assert.match(migration,/no row means retention enforcement is not authorized/i);
});
test("retention configuration covers separate data classes and explicit expiry semantics",()=>{
 for(const key of ["claim_metadata","identity_assurance_artifacts","raw_evidence","consent_and_rights_records","reviewer_notes","audit_events","score_ledger"])assert.ok(service.includes('"'+key+'"'),key);
 for(const action of ["hard_delete","anonymize","restrict_access","retain_minimal"])assert.ok(service.includes('"'+action+'"'),action);
 assert.match(service,/retentionDays:integer\(item\.retentionDays/);
 assert.match(service,/graceDays:integer\(item\.graceDays/);
 assert.match(service,/legalHoldBehavior:"pause_and_preserve"/);
});
test("policy proposals require separate authorization, independent approval and explicit activation",()=>{
 assert.match(service,/community_impact\.retention\.manage/);
 assert.match(service,/community_impact\.retention\.approve/);
 assert.match(service,/row\.created_by===actorUserId/);
 assert.match(service,/Only an independently approved policy can be activated/);
 assert.match(service,/pg_advisory_xact_lock/);
 assert.match(migration,/approved_by<>created_by/);
 assert.match(migration,/policy content is immutable/);
 assert.match(migration,/events are append-only/i);
});
test("retention governance endpoints are authenticated and do not trigger deletion",()=>{
 for(const route of ["api/v1/admin/community-impact/retention-policy","api/v1/admin/community-impact/retention-policy/","/approve","/activate"])assert.ok(server.includes(route),route);
 assert.match(service,/enforcement:"inactive_until_approved_policy_and_evidence_integration"/);
 assert.match(service,/enforcement:"not_enabled_until_evidence_integration"/);
 assert.doesNotMatch(service,/delete from file_object|unlink\(|rm\(/i);
});
test("migration compatibility inventory includes the retention-policy migration",()=>{
 assert.match(compatibility,/20261031170000_community_impact_retention_policy\.sql/);
});
