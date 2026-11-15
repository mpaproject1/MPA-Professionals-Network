import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { requireRole } from "../../src/platform/auth.js";
import {
  assertKnownPermissionCodes,
  canAssignRole,
  effectiveCapabilities,
  isKnownPermission,
  PERMISSION_CATALOG,
  hasAnyRoleOrPermission,
  roleMetadata,
} from "../../src/platform/authorization-policy.js";

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
  assert.deepEqual(capabilities, ["members.view", "users.manage", "verification.appeal.review"]);
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

  const finance = effectiveCapabilities({ roles: ["finance_officer"], permissions: [] });
  assert.ok(finance.includes("finance.view"));
  assert.ok(finance.includes("finance.payment.verify"));
  assert.ok(finance.includes("finance.payment.reverse"));
  assert.ok(!finance.includes("membership.review"));
  assert.ok(!finance.includes("membership.activate"));
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
    assert.ok(["read", "write", "review", "review_write", "sensitive_read", "sensitive_write", "privileged_write"].includes(permission.actionClass), permission.code);
    assert.equal(typeof permission.globalDirectGrant, "boolean", permission.code);
    assert.equal(permission.assignable, permission.globalDirectGrant && !permission.systemOnly, permission.code);
  }
  assert.equal(PERMISSION_CATALOG["jobs.manage"].globalDirectGrant, false);
  assert.equal(PERMISSION_CATALOG["applications.manage"].globalDirectGrant, false);
  assert.equal(PERMISSION_CATALOG["files.view_private"].globalDirectGrant, false);
  assert.equal(PERMISSION_CATALOG["finance.view"].actionClass, "read");
  assert.equal(PERMISSION_CATALOG["permissions.manage"].systemOnly, true);
});
