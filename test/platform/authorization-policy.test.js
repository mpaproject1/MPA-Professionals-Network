import test from "node:test";
import assert from "node:assert/strict";
import { requireRole } from "../../src/platform/auth.js";
import {
  canAssignRole,
  effectiveCapabilities,
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
  assert.deepEqual(capabilities, ["custom.read", "members.view", "users.manage", "verification.appeal.review"]);
  assert.equal(hasAnyRoleOrPermission(identity, ["organization_admin"], []), true);
  assert.equal(capabilities.includes("organizations.manage"), false);
});
