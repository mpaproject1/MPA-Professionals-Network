import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("vacancy publication is gated by an explicit MPA review decision",async()=>{
 const [service,server,migration,queuePage,adminPage]=await Promise.all([
  readFile(new URL("../../src/organization-jobs/service.js",import.meta.url),"utf8"),
  readFile(new URL("../../server.js",import.meta.url),"utf8"),
  readFile(new URL("../../db/migrations/20261030120000_job_vacancy_mpa_review.sql",import.meta.url),"utf8"),
  readFile(new URL("../../web/app/admin/jobs/review/page.tsx",import.meta.url),"utf8"),
  readFile(new URL("../../web/app/admin/page.tsx",import.meta.url),"utf8")
 ]);
 const submit=service.slice(service.indexOf("export async function publishJob"),service.indexOf("export async function reviewJob"));
 const review=service.slice(service.indexOf("export async function reviewJob"),service.indexOf("export async function changeJobStatus"));
 const status=service.slice(service.indexOf("export async function changeJobStatus"),service.indexOf("async function jobScopeAllowed"));
 const edit=service.slice(service.indexOf("export async function updateJob"),service.indexOf("async function assertJobReviewer"));
 const listing=service.slice(service.indexOf("export async function listJobs("),service.indexOf("export async function getJob("));
 assert.match(submit,/status='pending_review'/);
 assert.match(submit,/review_status='pending'/);
 assert.doesNotMatch(submit,/status='published'/);
 assert.match(submit,/already awaiting MPA review/);
 assert.match(review,/assertJobReviewer\(db,reviewerId\)/);
 assert.match(review,/decision==="approved"\?"published":"draft"/);
 assert.match(review,/review_status/);
 assert.match(review,/job\.review_decided/);
 assert.doesNotMatch(status,/\["draft","pending_review","published"/);
 assert.match(status,/Only an MPA reviewer may submit or publish/);
 assert.match(edit,/status=case when status='published' then 'pending_review'/);
 assert.match(edit,/review_status=case when status='published' then 'pending'/);
 assert.match(edit,/job\.review_resubmitted/);
 assert.match(listing,/j\.status='published'/);
 assert.match(server,/api\/v1\/review\/jobs/);
 assert.match(server,/anyRoleOrPermission\(identity,\["reviewer","system_admin"\],\["jobs\.review"\]\)/);
 assert.match(migration,/where status='published'/);
 assert.match(migration,/status='pending_review'/);
 assert.match(queuePage,/Approve and publish/);
 assert.match(queuePage,/Return for correction/);
 assert.match(adminPage,/\/admin\/jobs\/review/);
 assert.match(service,/const ORG_WRITE_ROLES=\["owner","administrator","recruiter","project_manager"\]/);
 assert.match(service,/const CANDIDATE_ROLES=\["owner","administrator","recruiter"\]/);
 assert.match(service,/if\(org && \["owner","administrator","recruiter"\]\.includes\(org\.role_code\)\)/);
});
test("organization app distinguishes active assignments from inactive prior relationships without exposing private organization data", async () => {
 const [service,server]=await Promise.all([
  readFile(new URL("../../src/organization-jobs/service.js",import.meta.url),"utf8"),
  readFile(new URL("../../server.js",import.meta.url),"utf8")
 ]);
 const access=service.slice(service.indexOf("export async function listMyOrganizationAccess"),service.indexOf("export async function listMyJobAssignments"));
 assert.match(access,/om\.status as membership_status/);
 assert.match(access,/where om\.user_id=\$1/);
 assert.match(access,/join organization o on o\.id=om\.organization_id/);
 assert.doesNotMatch(access,/o\.email|o\.phone|o\.address_text|verification_evidence/);
 assert.match(server,/p==="api\/v1\/me\/organization-access"\) return ok\(res,await organizationJobs\.listMyOrganizationAccess\(identity\.sub\)/);
});
