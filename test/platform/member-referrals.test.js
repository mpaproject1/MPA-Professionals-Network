import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration=await readFile(new URL("../../db/migrations/20261031200000_member_referrals.sql",import.meta.url),"utf8");
const applicationMigration=await readFile(new URL("../../db/migrations/20261031210000_job_application_referral_code.sql",import.meta.url),"utf8");
const retentionMigration=await readFile(new URL("../../db/migrations/20261031230000_referral_retention_snapshots.sql",import.meta.url),"utf8");
const service=await readFile(new URL("../../src/platform/member-referrals.js",import.meta.url),"utf8");
const membership=await readFile(new URL("../../src/membership/service.js",import.meta.url),"utf8");
const jobs=await readFile(new URL("../../src/organization-jobs/service.js",import.meta.url),"utf8");
const routes=await readFile(new URL("../../server.js",import.meta.url),"utf8");
const emailVerification=await readFile(new URL("../../src/platform/email-verification.js",import.meta.url),"utf8");

test("referral schema enforces separate types and duplicate prevention",()=>{
 assert.match(migration,/member_referral_code/);
 assert.ok(migration.includes("check(referrer_user_id<>referred_user_id)"));
 assert.match(migration,/uq_member_referral_membership_referred/);
 assert.match(migration,/uq_member_referral_employment_application/);
 assert.match(migration,/prevent_member_referral_history_mutation/);
 assert.ok(migration.includes("unique(attribution_id,event_code)"));
 assert.match(applicationMigration,/alter table job_application add column if not exists referral_code/);
 assert.match(migration,/status_visibility_consent/);
 assert.match(retentionMigration,/retention_policy_snapshot/);
});
test("verified email advances an existing membership referral without exposing identity",()=>{
 assert.ok(emailVerification.includes('recordMembershipMilestone(db, row.user_id, "email_verified", row.user_id)'));
 assert.ok(service.includes('email_verified:"email_verified"'));
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
 assert.ok(service.includes("row.created_by===identity.sub"));
 assert.ok(service.includes("status='active'"));
});
test("member and admin APIs are exposed",()=>{
 assert.ok(routes.includes('p==="api/v1/me/referrals"'));
 assert.ok(routes.includes('p==="api/v1/admin/referrals"'));
 assert.ok(routes.includes("verifyEmploymentReferral"));
});


test("referral event insert values follow the declared SQL column order",()=>{
 const eventWriter=service.slice(service.indexOf("async function event"),service.indexOf("export async function ensureMyReferralCode"));
 assert.match(eventWriter,/member_referral_event\(attribution_id,actor_user_id,event_code,from_status,to_status,metadata,retention_policy_version_id,retention_policy_snapshot\)/);
 assert.match(eventWriter,/\[attribution,actor\|\|null,eventCode,fromStatus,toStatus,JSON\.stringify\(metadata\),retention\.versionId/);
 assert.doesNotMatch(eventWriter,/\[attribution,eventCode,fromStatus,toStatus,actor\|\|null/);
});
