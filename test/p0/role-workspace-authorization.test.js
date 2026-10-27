import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("full organization detail is private to an active member of that organization", () => {
  const service = read("src/organization-jobs/service.js");
  assert.match(service, /export async function getOrganization\(orgId,viewerId=null\)/);
  assert.match(service, /if\(!viewerId\) throw error\(403/);
  assert.match(service, /organization_membership om where om\.organization_id=\$1 and om\.user_id=\$2 and om\.status='active'/);
  assert.match(service, /export async function getPublicOrganizationProfile\(orgId\)/);
  assert.match(service, /return \{\.\.\.org,users\}/);
});

test("reviewer queue derives scope from the authenticated viewer, not a caller-supplied reviewerId", () => {
  const service = read("src/verification/service.js");
  const server = read("server.js");
  assert.match(service, /if\(!filters\.viewerId\) throw error\(403/);
  assert.match(service, /vc\.assigned_reviewer_id=\$N",filters\.viewerId/);
  assert.match(server, /verification\.listCases\(\{viewerId:identity\.sub/);
});

test("verification case reads fail closed when no viewer identity is supplied", () => {
  const service = read("src/verification/service.js");
  assert.match(service, /getCase\(caseId,viewerId=null\)\{ if\(!viewerId\) throw error\(403/);
  assert.match(service, /if\(existing\.rows\[0\]\) return getCase\(existing\.rows\[0\]\.id,actorId\)/);
});

test("reviewer case details enforce assignment unless the viewer has elevated authority", () => {
  const service = read("src/verification/service.js");
  assert.match(service, /Only the assigned reviewer, an independent appeal reviewer, or an explicitly authorized verification manager may view this case/);
  assert.match(service, /row\.assigned_reviewer_id!==viewerId/);
});

test("review assignment requires a system administrator or explicit verification.manage permission", () => {
  const service = read("src/verification/service.js");
  const server = read("server.js");
  assert.match(service, /Only a verification manager may assign review cases/);
  assert.match(server, /anyRoleOrPermission\(identity,\["system_admin"\],\["verification\.manage"\]\)/);
});

test("membership activation is separate from application approval and payment verification", () => {
  const server = read("server.js");
  const membership = read("src/membership/service.js");
  assert.match(server, /membership\.verifyPayment\(/);
  assert.match(server, /membership\.activateApplication\(/);
  assert.match(membership, /payment/i);
  assert.match(membership, /activateApplication/);
});
test("verification claim, evidence, and claim-status writes enforce assignment at service level", () => {
  const service = read("src/verification/service.js");
  assert.match(service, /else await assertAssignedReviewer\(db,caseId,actorId\)/);
  assert.match(service, /await assertAssignedReviewer\(db,row\.case_id,actorId\)/);
  const server = read("server.js");
  assert.equal((server.match(/verification\.getCase\(parts\[4\],identity\.sub\)/g) || []).length, 3, "case detail, claim, and evidence routes must pass the authenticated viewer");
});
test("verification manager permission is honored by service-level assigned-reviewer checks", () => {
  const service = read("src/verification/service.js");
  assert.match(service, /r\.role_code='system_admin'\) or exists\(select 1 from app_user_permission up where up\.user_id=\$1 and up\.permission_code='verification\.manage'/);
});

test("support inquiry lists and actions are scoped to unassigned or self-assigned work unless explicitly authorized for all", () => {
  const support = read("src/platform/support-bot.js");
  const server = read("server.js");
  assert.match(support, /filters\.actorId/);
  assert.match(support, /c\.assigned_to is null or c\.assigned_to=\$2/);
  assert.match(support, /case when c\.consent_to_contact then c\.contact_email else null end as contact_email/);
  assert.match(support, /case when c\.consent_to_contact then c\.contact_phone else null end as contact_phone/);
  assert.match(support, /async function assertConversationScope/);
  assert.match(support, /row\.assigned_to!==actorId/);
  assert.match(support, /assertConversationScope\(db,actorId,id,canManageAll,true\)/);
  assert.match(server, /adminListConversations\(\{actorId:identity\.sub,canViewAll/);
  assert.match(server, /adminUpdateConversation\(identity\.sub,parts\[5\],await body\(req\),requestId,canManageAll\)/);
  assert.match(server, /adminReplyToConversation\(identity\.sub,parts\[5\],await body\(req\),requestId,canManageAll\)/);
});

test("support inquiry transfer is manager-only, validates active support recipients, and records handoff reason", () => {
  const support = read("src/platform/support-bot.js");
  assert.match(support, /hasTransfer&&!canManageAll/);
  assert.match(support, /support\.inquiry_transferred/);
  assert.match(support, /fromAssignee:current\.assigned_to,toAssignee:r\.rows\[0\]\.assigned_to/);
  assert.match(support, /Choose an active Support Desk colleague with support permissions/);
  assert.match(support, /Add a short handoff reason/);
  assert.match(support, /for update/);
});

test("membership expiry is persisted through an auditable batch runner", () => {
  const service = read("src/membership/service.js");
  const runner = read("scripts/expire-memberships.js");
  const packageJson = JSON.parse(read("package.json"));
  assert.match(service, /export async function expireDueMemberships\(batchSize=500\)/);
  assert.match(service, /status='active' and end_date is not null and end_date<current_date/);
  assert.match(service, /'membership\.expired','membership_record'/);
  assert.match(runner, /expireDueMemberships/);
  const server = read("server.js");
  assert.match(server, /setInterval\(\(\)=>void runMembershipExpiry\(\),60\*60\*1000\)/);
  assert.match(server, /void runMembershipExpiry\(\)/);
  assert.equal(packageJson.scripts["memberships:expire"], "node scripts/expire-memberships.js");
});

test("professional profile edits are available before membership while verification remains membership-gated", () => {
  const policy = read("src/platform/identity-policy.js");
  const membership = read("src/membership/service.js");
  const verification = read("src/verification/service.js");
  assert.match(policy, /export async function assertProfessionalProfileCapability\(db,\s*userId,\s*\{\s*requireActiveMembership\s*=\s*false\s*\}\s*=\s*\{\}\)/);
  assert.match(membership, /await assertProfessionalProfileAccess\(db,userId\);/);
  const updateStart = membership.indexOf("export async function updateProfile(");
  const updateEnd = membership.indexOf("export async function listMyApplications(", updateStart);
  assert.ok(updateStart >= 0 && updateEnd > updateStart);
  assert.match(membership.slice(updateStart, updateEnd), /input\.visibility\s*===\s*"public".*requireActiveMembership:\s*true/);
  assert.match(verification, /assertProfessionalProfileCapability\(db,userId,\{requireActiveMembership:true\}\)/);
});
test("organization roster and ownership changes remain restricted to the dedicated owner/admin workflow", () => {
  const service = read("src/organization-jobs/service.js");
  const listStart = service.indexOf("export async function listOrganizationUsers(");
  const listEnd = service.indexOf("async function assertSystemAdmin(", listStart);
  assert.ok(listStart >= 0 && listEnd > listStart);
  assert.match(service.slice(listStart, listEnd), /orgRole\(db,orgId,actorUserId,\["owner","administrator"\]\)/);
  assert.match(service, /Ownership transfer uses a separate controlled workflow/);
  assert.match(service, /The owner role cannot be changed here/);
});

test("administrator audit history is exposed through a protected read-only route and workspace tab", () => {
  const service = read("src/platform/admin-audit.js");
  const server = read("server.js");
  const adminUi = read("web/app/admin/page.tsx");
  assert.match(service, /from audit_log/);
  assert.match(server, /p==="api\/v1\/admin\/audit-log".*anyRoleOrPermission\(identity,\["system_admin"\],\["audit\.view"\]\)/);
  assert.match(adminUi, /tab === "audit" && roles\.includes\("system_admin"\)/);
  assert.match(adminUi, /getList<AuditEvent>\("\/api\/v1\/admin\/audit-log\?limit=100"/);
});


test("recruiting interview scheduling validates organization/job-team scope and private notes stay restricted", () => {
  const service = read("src/organization-jobs/service.js");
  const start = service.indexOf("export async function scheduleInterview(");
  const end = service.indexOf("export async function respondInterview(", start);
  const interview = service.slice(start, end);
  assert.match(interview, /INVALID_INTERVIEWER/);
  assert.match(interview, /organization_membership om where om\.organization_id=\$2/);
  assert.match(interview, /job_team_member jt where jt\.job_id=\$3/);
  assert.match(interview, /Interviews can only be scheduled for an active application/);
  const notesStart = service.indexOf("export async function listApplicationNotes(");
  const notesEnd = service.indexOf("export async function scheduleInterview(", notesStart);
  assert.match(service.slice(notesStart, notesEnd), /n\.visibility<>'private' or n\.author_user_id=\$2 or \$3::boolean/);
});

test("verification write routes reject cross-case claim/evidence references and require independent appeal authority", () => {
  const service = read("src/verification/service.js");
  assert.match(service, /assertEvidenceIdsForCase/);
  assert.match(service, /Every evidence reference must belong to this verification case/);
  assert.match(service, /The selected claim does not belong to this verification case/);
  assert.match(service, /Independent appeal reviewer role required/);
  assert.match(service, /A reason is required for every appeal decision/);
});

test("support escalation, priority and waiting states are persisted and routed", () => {
  const support = read("src/platform/support-bot.js");
  const server = read("server.js");
  const migration = read("db/migrations/20261023_support_inquiry_workflow.sql");
  const supportUi = read("web/app/admin/support/page.tsx");
  assert.match(support, /export async function escalateConversation/);
  assert.match(support, /support\.inquiry_escalated/);
  assert.match(support, /support_conversation_workflow/);
  assert.match(support, /waitingOn/);
  assert.match(support, /support.inquiries.manage/);
  assert.match(server, /supportBot\.escalateConversation/);
  assert.match(migration, /priority text not null default 'normal'/);
  assert.match(migration, /waiting_on text not null default 'none'/);
  assert.match(migration, /escalated_at timestamptz/);
  assert.match(support, /escalatedOnly/);
  assert.match(support, /support.inquiry_escalated/);
  assert.match(supportUi, /Transfer inquiry/);
  assert.match(supportUi, /Escalate to manager/);
  assert.match(supportUi, /Escalated queue/);
});


test("private verification files require case assignment, manager authority, or independent appeal access", () => {
  const files = read("src/platform/private-file-storage.js");
  const verification = read("src/verification/service.js");
  assert.match(files, /vc\.assigned_reviewer_id=\$2 or \$3=true/);
  assert.match(files, /a\.status in \('submitted','under_review'\) and vc\.subject_user_id<>\$2 and d\.decided_by<>\$2/);
  assert.doesNotMatch(files, /or \$5=true/);
  assert.match(verification, /independentAppealReviewer/);
  assert.match(verification, /pendingIndependentAppeal/);
});

test("reference workflow requires active membership for requesters, referee consent, assigned reviewer assessment, and assignment history", () => {
  const service = read("src/verification/service.js");
  const server = read("server.js");
  const migration = read("db/migrations/20261023110000_verification_reference_and_assignment_history.sql");
  const ui = read("web/app/verification/page.tsx");
  assert.match(service, /export async function requestReference/);
  assert.match(service, /export async function listMyReferenceRequests/);
  assert.match(service, /export async function respondReferenceRequest/);
  assert.match(service, /export async function reviewReferenceRequest/);
  assert.match(service, /await assertMemberVerificationAccess\(db,actorId\)/);
  assert.match(service, /Only the named referee can respond to this request/);
  assert.match(service, /A referee must consent and respond before the reviewer can assess this reference/);
  assert.match(service, /verification_case_assignment_history/);
  assert.match(server, /verification\.requestReference/);
  assert.match(server, /verification\.respondReferenceRequest/);
  assert.match(server, /verification\.reviewReferenceRequest/);
  assert.match(server, /verification\.listMyReferenceRequests/);
  assert.match(migration, /verification_reference_request/);
  assert.match(migration, /create table if not exists verification_case_assignment_history/);
  assert.match(ui, /Reference requests sent to you/);
  assert.match(ui, /Send reference request/);
  assert.match(ui, /Assignment history/);
});

test("reviewer private portfolio evidence must be attached to the authorized case, not merely belong to its subject", () => {
  const files = read("src/platform/private-file-storage.js");
  assert.match(files, /join verification_evidence ve on ve\.file_object_id=pi\.evidence_file_id and ve\.case_id=vc\.id/);
  assert.match(files, /appealPortfolioEvidence/);
  assert.match(files, /a\.status in \('submitted','under_review'\) and vc\.subject_user_id<>\$2 and d\.decided_by<>\$2/);
});

test("Member workspace preserves non-member profile and public-feature access and uses only self-scoped APIs", () => {
  const page = read("web/app/member/page.tsx");
  const shell = read("web/components/shell.tsx");
  assert.match(page, /What should I do next/);
  assert.match(page, /You do not need active membership to update your own profile or explore public opportunities/);
  assert.match(page, /\/api\/v1\/me\/application-tracking/);
  assert.match(page, /\/api\/v1\/me\/saved-items/);
  assert.match(page, /\/api\/v1\/notifications/);
  assert.match(page, /\/api\/v1\/me\/verification\/cases/);
  assert.match(shell, /\["\/member","My workspace",LayoutDashboard\]/);
});

test("Employer recruitment workspace keeps vacancy and applicant views organization/job scoped", () => {
  const page = read("web/app/recruitment/page.tsx");
  const service = read("src/organization-jobs/service.js");
  assert.match(page, /Employer ATS · organization-scoped/);
  assert.match(page, /Candidate information is shown only after the server authorizes your role for this job/);
  assert.match(service, /orgRole\(db,orgId,actorUserId/);
  assert.match(service, /organization_id/);
  assert.match(service, /INVALID_INTERVIEWER/);
});

test("verification.manage permission is accepted consistently by reviewer routes and decision service", () => {
  const server = read("server.js");
  const service = read("src/verification/service.js");
  assert.match(server, /anyRoleOrPermission\(identity,\["verification_reviewer","ethics_reviewer","system_admin"\],\["verification\.manage"\]\)/);
  assert.match(service, /permission_code='verification\.manage'/);
});

test("checklist results must reference an active item attached to the case program and use a valid outcome", () => {
  const service = read("src/verification/service.js");
  assert.match(service, /join verification_program_checklist pc on pc\.program_id=vc\.program_id and pc\.checklist_id=i\.checklist_id where vc\.id=\$1 and i\.active=true/);
  assert.match(service, /Choose a valid checklist outcome/);
  assert.match(service, /Checklist response must be a structured object/);
});

test("CV storage remains private by default and sharing is limited to the applicant's selected application with revocation", () => {
  const talent = read("src/talent/service.js");
  const server = read("server.js");
  const files = read("src/platform/private-file-storage.js");
  const migration = read("db/migrations/20261023111000_member_cv_vault.sql");
  const cvPage = read("web/app/member/cv/page.tsx");
  const employerPage = read("web/app/recruitment/page.tsx");
  assert.match(talent, /export async function getMyCv/);
  assert.match(talent, /export async function saveMyCv/);
  assert.match(talent, /export async function shareMyCvWithApplication/);
  assert.match(talent, /export async function revokeMyCvShare/);
  assert.match(talent, /Only your own applications can receive your CV/);
  assert.match(talent, /talent\.cv_sharing_revoked/);
  assert.match(server, /api\/v1\/me\/cv\/share/);
  assert.match(files, /job_application_attachment aa join job_application a on a\.id=aa\.application_id join job j on j\.id=a\.job_id/);
  assert.match(files, /om\.role_code in \('owner','administrator','recruiter','project_manager'\)/);
  assert.match(files, /jt\.active=true/);
  assert.match(files, /jt\.role_code in \('hiring_manager','recruiter','interviewer'\)/);
  assert.match(migration, /cv_file_id uuid references file_object\(id\)/);
  assert.match(cvPage, /Your CV, your choice/);
  assert.match(cvPage, /Revoke CV access/);
  assert.match(employerPage, /Documents the applicant shared with this application/);
  assert.match(employerPage, /Open private document/);
  assert.match(read("src/organization-jobs/service.js"), /attachments from job_application a join job j on j\.id=a\.job_id/);
});

test("Reviewer checklist and claim assessment actions are case-scoped and evidence-linked", () => {
  const service = read("src/verification/service.js");
  const server = read("server.js");
  const ui = read("web/app/verification/page.tsx");
  assert.match(service, /checklistItems:checklistItems\.rows/);
  assert.match(service, /expectedCaseId&&row\.case_id!==expectedCaseId/);
  assert.match(server, /verification\.setClaimStatus\(b\.claimId,b\.status,identity\.sub,requestId,parts\[4\]\)/);
  assert.match(ui, /Reviewer checklist/);
  assert.match(ui, /Save checklist result/);
  assert.match(ui, /Save assessment/);
  assert.match(ui, /Evidence linked to this checklist item/);
});

test("Serve-Community routes discovery into existing private workflows without replacing them", () => {
  const marketplace = read("web/app/serve-community/page.tsx");
  const shell = read("web/components/shell.tsx");
  const services = read("web/app/services/page.tsx");
  const mentorship = read("web/app/mentorship/page.tsx");
  const demand = read("web/app/service-demand/page.tsx");
  const lifecycle = read("src/services-mentorship/service.js");
  assert.match(marketplace, /href:"\/services"/);
  assert.match(marketplace, /href:"\/mentorship"/);
  assert.match(marketplace, /href:"\/service-demand"/);
  assert.match(marketplace, /href:"\/jobs"/);
  assert.match(marketplace, /A public listing is not a private agreement/);
  assert.match(shell, /\["\/serve-community","Serve-Community",Search\]/);
  assert.match(shell, /const desktopPrimary=visibleNav\.filter\(\(\[href\]\)=>\["\\/serve-community","\\/jobs"\]\.includes\(href\)\)/);
  assert.match(shell, /const mobilePrimary=visibleNav\.filter\(\(\[href\]\)=>\["\\/serve-community","\\/jobs"\]\.includes\(href\)\)/);
  assert.doesNotMatch(shell, /\["\/marketplace","Marketplace",Search\]/);
  assert.match(services, /Back to Serve-Community/);
  assert.match(mentorship, /Back to Serve-Community/);
  assert.match(demand, /Back to Serve-Community/);
  assert.match(read("web/next.config.js"), /source: "\/marketplace", destination: "\/serve-community", permanent: true/);
  assert.match(lifecycle, /revision_requested/);
  assert.match(lifecycle, /"disputed"/);
});


test("Mentorship requires both participants to consent before activation", () => {
 const service = read("src/services-mentorship/service.js");
 const server = read("server.js");
 const ui = read("web/app/mentorship/page.tsx");
 const migration = read("db/migrations/20261023120000_mentorship_explicit_mentee_consent.sql");
 assert.match(service, /respondToMenteeMatch/);
 assert.match(service, /mentee_consent_status/);
 assert.match(server, /mentee-response/);
 assert.match(ui, /Accept this mentor/);
 assert.match(migration, /mentee_consent_status/);
});
