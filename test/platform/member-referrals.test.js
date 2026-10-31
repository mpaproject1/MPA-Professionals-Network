import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration=await readFile(new URL("../../db/migrations/20261031200000_member_referrals.sql",import.meta.url),"utf8");
const applicationMigration=await readFile(new URL("../../db/migrations/20261031210000_job_application_referral_code.sql",import.meta.url),"utf8");
const service=await readFile(new URL("../../src/platform/member-referrals.js",import.meta.url),"utf8");
const membership=await readFile(new URL("../../src/membership/service.js",import.meta.url),"utf8");
const jobs=await readFile(new URL("../../src/organization-jobs/service.js",import.meta.url),"utf8");
const routes=await readFile(new URL("../../server.js",import.meta.url),"utf8");

test("referral schema enforces separate types and duplicate prevention",()=>{
 assert.match(migration,/member_referral_code/);
 assert.match(migration,/check\(referrer_user_id<>referred_user_id\)/);
 assert.match(migration,/uq_member_referral_membership_referred/);
 assert.match(migration,/uq_member_referral_employment_application/);
 assert.match(migration,/prevent_member_referral_history_mutation/);
 assert.match(applicationMigration,/alter table job_application add column if not exists referral_code/);
});
test("membership attribution follows registration, application, review and activation events",()=>{
 for(const name of ["captureMembershipRegistration","recordMembershipMilestone","recordMembershipActivated"])assert.ok(service.includes(name));
 assert.ok(membership.includes("captureMembershipRegistration"));
 assert.ok(membership.includes("membership_application_submitted"));
 assert.ok(membership.includes("recordMembershipActivated"));
});
test("employment attribution attaches to formal applications and verified hiring milestones",()=>{
 assert.ok(jobs.includes("captureEmploymentApplication"));
 assert.ok(jobs.includes("recordJobApplicationStage"));
 assert.ok(service.includes("confirmEmploymentOutcome"));
 assert.ok(service.includes("verifyEmploymentReferral"));
 assert.ok(service.includes("candidate_and_employer_confirmation"));
});
test("referral scoring requires an independently approved active policy",()=>{
 assert.ok(migration.includes("member_referral_score_policy"));
 assert.ok(migration.includes("member_referral_score_ledger"));
 assert.ok(service.includes("approved_by<>created_by"));
 assert.ok(service.includes("status='active'"));
});
test("member and admin APIs are exposed",()=>{
 assert.ok(routes.includes('p==="api/v1/me/referrals"'));
 assert.ok(routes.includes('p==="api/v1/admin/referrals"'));
 assert.ok(routes.includes("verifyEmploymentReferral"));
});
