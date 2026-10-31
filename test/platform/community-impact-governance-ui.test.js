import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");
const [member,admin,nav,shell,migrationCheck]=await Promise.all([
 read("../../web/app/community-impact/identity-assurance/page.tsx"),
 read("../../web/app/admin/community-impact/governance/page.tsx"),
 read("../../web/app/admin/admin-workspace.tsx"),
 read("../../web/components/shell.tsx"),
 read("../../scripts/check-new-migration-compatibility.js")
]);
test("Member identity assurance uses private upload, explicit submission and contributor confirmation",()=>{
 assert.match(member,/uploadPrivateFile/);
 assert.match(member,/community-impact\/identity-assurance/);
 assert.match(member,/evidenceKind/);
 assert.match(member,/submit/);
 assert.match(member,/offline-attributions/);
 assert.match(member,/Confirm my offline attribution/);
 assert.match(shell,/community-impact\/identity-assurance/);
});
test("Administrator governance UI exposes identity, attribution, policy, COI, assessment and retention operations",()=>{
 for(const route of ["/api/v1/admin/community-impact/identity-assurance","/api/v1/admin/community-impact/offline-attributions","/api/v1/admin/community-impact/detection/policies","/api/v1/admin/community-impact/claims/","/api/v1/admin/community-impact/assessments/","/api/v1/admin/community-impact/retention/evaluate"])assert.ok(admin.includes(route),route);
 for(const phrase of ["Verify identity","Submit attribution with evidence","Approve version","Activate approved version","Declare reviewer conflict","Submit assessment for review","Record independent second review","Evaluate retention schedule"])assert.ok(admin.includes(phrase),phrase);
 assert.match(admin,/created_by!==actorId/);
 assert.match(admin,/assignedReviewerUserId===actorId/);
 assert.match(nav,/community-impact\/governance/);
});
test("Disposable migration rehearsal includes the new migration and verifies rollback leaves no new governance objects",()=>{
 assert.match(migrationCheck,/20261101090000_community_impact_governance_completion\.sql/);
 assert.match(migrationCheck,/rollbackTables/);
 assert.match(migrationCheck,/rollbackTriggers/);
 assert.match(migrationCheck,/MIGRATION_CHECK_ALLOW_ROLLBACK/);
 assert.match(migrationCheck,/disposable test\/sandbox\/CI\/verification database/);
});
