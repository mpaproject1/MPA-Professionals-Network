import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { requireRole } from "../../src/platform/auth.js";
import {
  assertKnownPermissionCodes,
  canAssignRole,
  effectiveCapabilities,
  hasAnyRoleOrPermission,
  isKnownPermission,
  PERMISSION_CATALOG,
  roleMetadata,
} from "../../src/platform/authorization-policy.js";
import { assertFinancePaymentQueueAccess, assertMembershipReviewQueueAccess, assertPaymentReversalAccess, assertPaymentVerificationAccess } from "../../src/platform/workspace-authorization.js";

test("all authorization entry points use the same appeal-reviewer capability", () => {
  const identity = { roles: ["appeal_reviewer"], permissions: [] };
  assert.equal(hasAnyRoleOrPermission(identity, ["appeal_reviewer"], []), true);
  assert.doesNotThrow(() => requireRole(identity, "appeal_reviewer"));
  assert.equal(hasAnyRoleOrPermission(identity, ["verification_reviewer"], []), false);
  assert.throws(() => requireRole(identity, "verification_reviewer"), { statusCode: 403 });
});

test("unknown roles fail closed and cannot be assigned through platform administration", () => {
  const metadata = roleMetadata("role_added_without_policy");
  assert.equal(metadata.scope, "unknown");
  assert.equal(metadata.active, false);
  assert.equal(metadata.assignable, false);
  assert.equal(canAssignRole({ roles: ["system_admin"], permissions: [] }, "role_added_without_policy"), false);
});

test("organization, resource, and personal identity roles are not platform-assignable", () => {
  const actor = { roles: ["system_admin"], permissions: [] };
  for (const role of ["organization_admin", "recruiter", "project_manager", "read_only", "mentor", "member", "professional"]) {
    assert.equal(roleMetadata(role).assignable, false, role);
    assert.equal(canAssignRole(actor, role), false, role);
  }
});

test("privileged platform roles can only be assigned by a system administrator", () => {
  assert.equal(canAssignRole({ roles: ["admin"], permissions: [] }, "supporting_staff"), true);
  assert.equal(canAssignRole({ roles: ["admin"], permissions: [] }, "finance_officer"), false);
  assert.equal(canAssignRole({ roles: ["system_admin"], permissions: [] }, "finance_officer"), true);
});

test("effective capabilities combine current role bundles and direct grants without adding tenant scope", () => {
  const identity = {
    roles: ["system_admin", "appeal_reviewer", "organization_admin"],
    permissions: ["members.view", "custom.read"],
  };
  const capabilities = effectiveCapabilities(identity);
  assert.deepEqual(capabilities, [
    "accounts.export",
    "accounts.export.contacts",
    "accounts.export.organizations",
    "members.export",
    "members.export.contacts",
    "members.view",
    "membership.cards.print",
    "users.manage",
    "verification.appeal.review",
  ]);
  assert.equal(hasAnyRoleOrPermission(identity, ["organization_admin"], []), true);
  assert.equal(capabilities.includes("organizations.manage"), false);
  assert.equal(capabilities.includes("custom.read"), false, "unclassified direct grants must not become effective capabilities");
  assert.equal(hasAnyRoleOrPermission({ roles: [], permissions: ["custom.read"] }, [], ["custom.read"]), false, "unclassified direct grants must not satisfy evaluator checks");
});

test("canonical permission catalogue exactly covers permission codes seeded by the authorization migrations", () => {
  const migrations = [
    "../../db/migrations/024_per_user_permission_matrix.sql",
    "../../db/migrations/20261030190000_membership_finance_permission_separation.sql",
    "../../db/migrations/20261030210000_phase3_ethics_volunteer_role_scopes.sql",
  ];
  const seeded = new Set();
  for (const migration of migrations) {
    const source = readFileSync(new URL(migration, import.meta.url), "utf8");
    for (const match of source.matchAll(/['"]([a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)+)['"]/g)) {
      if (isKnownPermission(match[1])) seeded.add(match[1]);
    }
  }
  for (const code of seeded) {
    assert.equal(PERMISSION_CATALOG[code].source, "migration-seeded", code);
  }
  const expectedSeeded = Object.values(PERMISSION_CATALOG)
    .filter((permission) => permission.source === "migration-seeded")
    .map((permission) => permission.code);
  assert.deepEqual([...seeded].sort(), expectedSeeded.sort());
});

test("permission catalogue fails closed for unknown grants and distinguishes legacy runtime codes", () => {
  assert.equal(isKnownPermission("finance.payment.verify"), true);
  assert.equal(isKnownPermission("permission.added_without_catalogue"), false);
  assert.throws(() => assertKnownPermissionCodes(["members.view", "permission.added_without_catalogue"]), {
    statusCode: 400,
    code: "UNKNOWN_PERMISSION",
  });
  assert.equal(PERMISSION_CATALOG["reports.sensitive"].source, "legacy-runtime");
  assert.equal(PERMISSION_CATALOG["support.inquiries.manage"].source, "legacy-runtime");
});

test("shared capability evaluator recognizes direct permissions but never invents tenant scope", () => {
  const identity = { roles: [], permissions: ["organizations.manage", "reports.sensitive"] };
  assert.equal(hasAnyRoleOrPermission(identity, [], ["organizations.manage"]), true);
  assert.equal(effectiveCapabilities(identity).includes("organizations.manage"), true);
  assert.equal(effectiveCapabilities(identity).includes("organization:123:manage"), false);
});

test("reviewer and finance role bundles preserve membership/finance separation", () => {
  const membership = effectiveCapabilities({ roles: ["membership_reviewer"], permissions: [] });
  assert.ok(membership.includes("membership.review"));
  assert.ok(membership.includes("membership.activate"));
  assert.ok(membership.includes("members.view"));
  assert.ok(!membership.includes("finance.payment.verify"));
  assert.ok(!membership.includes("finance.payment.reverse"));
  assert.equal(hasAnyRoleOrPermission({ roles: ["membership_reviewer"], permissions: [] }, [], ["membership.review"]), true);
  assert.equal(hasAnyRoleOrPermission({ roles: ["membership_reviewer"], permissions: [] }, [], ["finance.payment.verify"]), false);

  const finance = effectiveCapabilities({ roles: ["finance_officer"], permissions: [] });
  assert.ok(finance.includes("finance.view"));
  assert.ok(finance.includes("finance.payment.verify"));
  assert.ok(finance.includes("finance.payment.reverse"));
  assert.ok(!finance.includes("membership.review"));
  assert.ok(!finance.includes("membership.activate"));
  assert.equal(hasAnyRoleOrPermission({ roles: ["finance_officer"], permissions: [] }, [], ["finance.payment.verify"]), true);
  assert.equal(hasAnyRoleOrPermission({ roles: ["finance_officer"], permissions: [] }, [], ["membership.review"]), false);
});

test("database-backed service permission checks reference only canonical permission codes", () => {
  const serviceFiles = [
    "../../src/verification/service.js",
    "../../src/organization-jobs/service.js",
    "../../src/platform/support-bot.js",
    "../../src/membership/service.js",
  ];
  const referenced = new Set();
  for (const file of serviceFiles) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    for (const match of source.matchAll(/permission_code\s*=\s*'([a-z][a-z0-9_.-]+)'/g)) {
      referenced.add(match[1]);
    }
    for (const match of source.matchAll(/permission_code\s*=\s*any\s*\(\s*array\s*\[([^\]]+)\]/g)) {
      for (const code of match[1].matchAll(/'([a-z][a-z0-9_.-]+)'/g)) referenced.add(code[1]);
    }
  }
  assert.ok(referenced.size > 0, "service-level permission SQL inventory must not be empty");
  for (const code of referenced) assert.equal(isKnownPermission(code), true, code);
});

test("every registered permission documents action class and global grant boundary", () => {
  for (const permission of Object.values(PERMISSION_CATALOG)) {
    assert.ok(permission.description && permission.description.length >= 10, permission.code);
    assert.ok(["read", "write", "review", "review_write", "sensitive_read", "sensitive_write", "sensitive_export", "export", "privileged_write"].includes(permission.actionClass), permission.code);
    assert.equal(typeof permission.globalDirectGrant, "boolean", permission.code);
    assert.equal(permission.assignable, permission.globalDirectGrant && !permission.systemOnly, permission.code);
  }
  assert.equal(PERMISSION_CATALOG["jobs.manage"].globalDirectGrant, false);
  assert.equal(PERMISSION_CATALOG["applications.manage"].globalDirectGrant, false);
  assert.equal(PERMISSION_CATALOG["files.view_private"].globalDirectGrant, false);
  assert.equal(PERMISSION_CATALOG["finance.view"].actionClass, "read");
  assert.equal(PERMISSION_CATALOG["permissions.manage"].systemOnly, true);
});


test("Phase 4 action capabilities keep exports and membership-card printing separate from read access", () => {
  for (const code of ["members.export", "members.export.contacts", "accounts.export", "accounts.export.contacts", "accounts.export.organizations", "membership.cards.print"]) {
    assert.equal(isKnownPermission(code), true, code);
    assert.equal(PERMISSION_CATALOG[code].source, "policy-defined", code);
  }
  const readOnly = { roles: [], permissions: ["members.view", "users.view"] };
  assert.equal(hasAnyRoleOrPermission(readOnly, [], ["members.export"]), false);
  assert.equal(hasAnyRoleOrPermission(readOnly, [], ["accounts.export"]), false);
  assert.equal(hasAnyRoleOrPermission(readOnly, [], ["membership.cards.print"]), false);
  assert.equal(hasAnyRoleOrPermission({ roles: ["admin"], permissions: [] }, [], ["accounts.export.organizations"]), false);
  assert.equal(hasAnyRoleOrPermission({ roles: ["membership_reviewer"], permissions: [] }, [], ["membership.cards.print"]), false);
  assert.equal(hasAnyRoleOrPermission({ roles: ["finance_officer"], permissions: [] }, [], ["members.export"]), false);
  const root = { roles: ["system_admin"], permissions: [] };
  for (const code of ["members.export", "members.export.contacts", "accounts.export", "accounts.export.contacts", "accounts.export.organizations", "membership.cards.print"]) {
    assert.equal(hasAnyRoleOrPermission(root, [], [code]), true, code);
  }
});

test("Phase 4 review queues and finance decisions reject read or generic management permissions", () => {
  assert.throws(() => assertFinancePaymentQueueAccess({ roles: ["system_admin"], permissions: [] }), { statusCode: 403 });
  assert.throws(() => assertFinancePaymentQueueAccess({ roles: [], permissions: ["finance.manage"] }), { statusCode: 403 });
  assert.doesNotThrow(() => assertFinancePaymentQueueAccess({ roles: ["finance_officer"], permissions: [] }));
  assert.throws(() => assertMembershipReviewQueueAccess({ roles: [], permissions: ["members.view"] }), { statusCode: 403 });
  assert.doesNotThrow(() => assertMembershipReviewQueueAccess({ roles: ["membership_reviewer"], permissions: [] }));
  assert.throws(() => assertPaymentVerificationAccess({ roles: [], permissions: ["finance.manage"] }), { statusCode: 403 });
  assert.throws(() => assertPaymentReversalAccess({ roles: [], permissions: ["finance.manage"] }), { statusCode: 403 });
  assert.doesNotThrow(() => assertPaymentVerificationAccess({ roles: [], permissions: ["finance.payment.verify"] }));
  assert.throws(() => assertPaymentReversalAccess({ roles: [], permissions: ["finance.payment.verify"] }), { statusCode: 403 });
  assert.doesNotThrow(() => assertPaymentReversalAccess({ roles: [], permissions: ["finance.payment.reverse"] }));
  assert.throws(() => assertPaymentVerificationAccess({ roles: [], permissions: ["finance.payment.reverse"] }), { statusCode: 403 });
});

test("Phase 4 route and service source keep card printing, exports and membership evidence behind action gates", () => {
  const server = readFileSync(new URL("../../server.js", import.meta.url), "utf8");
  const batchRoute = server.match(/if\(req\.method==="POST" && p==="api\/v1\/admin\/membership-cards\/batch"\)([^\r\n]+)/)?.[1] || "";
  const printRoute = server.match(/if\(req\.method==="POST" && p==="api\/v1\/admin\/membership-cards\/print"\)([^\r\n]+)/)?.[1] || "";
  assert.match(batchRoute, /membership\.cards\.print/);
  assert.match(printRoute, /membership\.cards\.print/);
  assert.doesNotMatch(batchRoute, /members\.view/);
  assert.doesNotMatch(printRoute, /members\.view/);
  const directory = readFileSync(new URL("../../src/platform/directory-exports.js", import.meta.url), "utf8");
  assert.match(directory, /hasAnyRoleOrPermission\(identity, \[\], \["members\.export"\]\)/);
  assert.match(directory, /hasAnyRoleOrPermission\(identity, \[\], \["accounts\.export"\]\)/);
  assert.match(directory, /members\.export\.contacts/);
  assert.match(directory, /accounts\.export\.contacts/);
  assert.match(directory, /accounts\.export\.organizations/);
  const financeReceipts = readFileSync(new URL("../../src/platform/finance-receipts.js", import.meta.url), "utf8");
  assert.equal(PERMISSION_CATALOG["finance.payment.record"].source, "legacy-runtime");
  assert.equal(PERMISSION_CATALOG["finance.voucher.issue"].source, "legacy-runtime");
  assert.equal(PERMISSION_CATALOG["membership.cards.print"].assignable, true);
  assert.match(financeReceipts, /permission === "finance\.payment\.record"[\s\S]*finance\.manage/);
  assert.match(financeReceipts, /hasAnyRoleOrPermission\(identity, \["finance_officer"\], \[permission\]\)/);
  assert.doesNotMatch(financeReceipts.match(/function assertFinance[\s\S]*?function safeReceipt/)?.[0] || "", /system_admin|\["finance_officer","system_admin","admin"\]/);
  const privateFiles = readFileSync(new URL("../../src/platform/private-file-storage.js", import.meta.url), "utf8");
  const membershipGate = privateFiles.match(/const canReviewMembership=([^;]+);/)?.[1] || "";
  assert.doesNotMatch(membershipGate, /finance_officer|finance\.view|finance\.manage/);
  const financeFileGate = privateFiles.match(/const canReadFinanceEvidence=([^;]+);/)?.[1] || "";
  assert.match(financeFileGate, /roles\.includes\("finance_officer"\)/);
  assert.doesNotMatch(financeFileGate, /system_admin|admin|finance\.manage/);
  assert.match(privateFiles, /purpose:f\.purpose/);
});


test("Phase 5 resource scope is bound to the current tenant, assignment, participant and consent relationship", () => {
  const identityPolicy = readFileSync(new URL("../../src/platform/identity-policy.js", import.meta.url), "utf8");
  assert.match(identityPolicy, /om\.organization_id=\$1 and om\.user_id=\$2 and om\.status='active'/);

  const jobs = readFileSync(new URL("../../src/organization-jobs/service.js", import.meta.url), "utf8");
  assert.match(jobs, /membershipIsCurrentlyActiveSql\("m"\)/);
  assert.match(jobs, /j\.created_by is distinct from \$1 and j\.updated_by is distinct from \$1/);
  assert.match(jobs, /not exists\(select 1 from organization_membership om where om\.organization_id=j\.organization_id and om\.user_id=\$1 and om\.status='active'\)/);
  assert.match(jobs, /reviewerConflict=j\.created_by===reviewerId\|\|j\.updated_by===reviewerId/);

  const verification = readFileSync(new URL("../../src/verification/service.js", import.meta.url), "utf8");
  const assignedGate = verification.match(/async function assertAssignedReviewer[\s\S]*?export function allowedTransition/)?.[0] || "";
  assert.match(assignedGate, /row\.assigned_reviewer_id!==actorId/);
  assert.doesNotMatch(assignedGate, /system_admin|verification\.manage|can_manage/);
  const caseRead = verification.slice(verification.indexOf("export async function getCase"), verification.indexOf("export async function listCases"));
  assert.ok(caseRead.indexOf("row.assigned_reviewer_id!==viewerId") < caseRead.indexOf("const [claims,evidence"));
  assert.match(verification, /vc\.assigned_reviewer_id=\$N/);

  const privateFiles = readFileSync(new URL("../../src/platform/private-file-storage.js", import.meta.url), "utf8");
  assert.match(privateFiles, /vc\.assigned_reviewer_id=\$2 limit 1/);
  assert.match(privateFiles, /c\.submitted_by is distinct from \$2 and o\.created_by is distinct from \$2/);
  assert.doesNotMatch(privateFiles, /vc\.assigned_reviewer_id=\$2 or \$3=true/);
  assert.match(privateFiles, /membershipIsCurrentlyActiveSql\("mr"\)/);

  const business = readFileSync(new URL("../../src/network-plus/business-discovery.js", import.meta.url), "utf8");
  assert.match(business, /hasCurrentActiveMembership\(db,userId\)/);
  const requests = readFileSync(new URL("../../src/network-plus/request-collaboration.js", import.meta.url), "utf8");
  assert.match(requests, /hasCurrentActiveMembership\(db,userId\)/);
  assert.match(requests, /expires_at>now\(\)/);
  assert.match(requests, /support_case_reference=\$3/);

  const mentorship = readFileSync(new URL("../../src/services-mentorship/service.js", import.meta.url), "utf8");
  assert.match(mentorship, /membershipIsCurrentlyActiveSql\("m"\)/);
  assert.match(mentorship, /mentor_user_id!==userId&&.*mentee_user_id!==userId|mentor_user_id!==userId/);

  const ethics = readFileSync(new URL("../../src/ethics/service.js", import.meta.url), "utf8");
  const ethicsAssignment = ethics.match(/async function assertAssigned[\s\S]*?function text/)?.[0] || "";
  assert.match(ethicsAssignment, /assignment\.rowCount===0/);
  assert.doesNotMatch(ethicsAssignment, /system_admin/);
  assert.match(ethics, /c\.assigned_reviewer_id=\$1 or exists\(select 1 from ethics_case_panel_member/);

  const initiatives = readFileSync(new URL("../../src/platform/serve-community-initiatives.js", import.meta.url), "utf8");
  assert.match(initiatives, /i\.created_by is distinct from \$4 and i\.submitted_by is distinct from \$4/);
  assert.match(initiatives, /om\.organization_id=i\.owner_organization_id and om\.user_id=\$4/);
});
