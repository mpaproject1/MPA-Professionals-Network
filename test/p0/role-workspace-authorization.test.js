import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

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

test("reviewer case details enforce assignment unless the viewer has elevated authority", () => {
  const service = read("src/verification/service.js");
  assert.match(service, /Only the assigned reviewer or an explicitly authorized verification manager may view this case/);
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
  assert.match(support, /async function assertConversationScope/);
  assert.match(support, /row\.assigned_to!==actorId/);
  assert.match(support, /assertConversationScope\(db,actorId,id,canManageAll,true\)/);
  assert.match(server, /adminListConversations\(\{actorId:identity\.sub,canViewAll/);
  assert.match(server, /adminUpdateConversation\(identity\.sub,parts\[5\],await body\(req\),requestId,canManageAll\)/);
  assert.match(server, /adminReplyToConversation\(identity\.sub,parts\[5\],await body\(req\),requestId,canManageAll\)/);
});

test("membership expiry is persisted through an auditable batch runner", () => {
  const service = read("src/membership/service.js");
  const runner = read("scripts/expire-memberships.js");
  const packageJson = JSON.parse(read("package.json"));
  assert.match(service, /export async function expireDueMemberships\(batchSize=500\)/);
  assert.match(service, /status='active' and end_date is not null and end_date<current_date/);
  assert.match(service, /'membership\.expired','membership_record'/);
  assert.match(runner, /expireDueMemberships/);
  assert.equal(packageJson.scripts["memberships:expire"], "node scripts/expire-memberships.js");
});

test("professional profile edits are available before membership while verification remains membership-gated", () => {
  const policy = read("src/platform/identity-policy.js");
  const membership = read("src/membership/service.js");
  const verification = read("src/verification/service.js");
  assert.match(policy, /export async function assertProfessionalProfileCapability\(db,userId,\{ requireActiveMembership = false \} = \{\}\)/);
  assert.match(membership, /await assertProfessionalProfileAccess\(db,userId\);/);
  const updateStart = membership.indexOf("export async function updateProfile(");
  const updateEnd = membership.indexOf("export async function listMyApplications(", updateStart);
  assert.ok(updateStart >= 0 && updateEnd > updateStart);
  assert.doesNotMatch(membership.slice(updateStart, updateEnd), /requireActiveMembership:true/);
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
  assert.match(adminUi, /api<AuditEvent>\("\/api\/v1\/admin\/audit-log\?limit=100"/);
});
