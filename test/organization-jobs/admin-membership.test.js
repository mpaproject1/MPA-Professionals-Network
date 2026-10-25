import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import * as membership from "../../src/membership/service.js";
import * as organizationJobs from "../../src/organization-jobs/service.js";
import { getPool } from "../../src/platform/db.js";

async function account(label) {
  const suffix = randomUUID();
  const digits = [...suffix.replace(/-/g, "")].map(character => String(Number.parseInt(character, 16) % 10)).join("").slice(0, 8);
  const email = "org-membership-" + label + "-" + suffix + "@example.test";
  const created = await membership.register({
    email,
    password: "OrgMembershipP1Password!2026",
    firstName: "Organization",
    lastName: "AdminTest" + suffix.slice(0, 8),
    phone: "07" + digits,
  }, "org-membership-test-" + suffix);
  return { ...created.user, email };
}

test("platform organization membership changes validate authority, reasons, role/status and write audit records", async t => {
  if (!process.env.DATABASE_URL) {
    t.skip("requires the disposable PostgreSQL database configured by PR Quality");
    return;
  }
  const owner = await account("owner");
  const administrator = await account("admin");
  const member = await account("member");
  const org = await organizationJobs.registerOrganization(owner.id, {
    legalName: "Test organization " + randomUUID(),
    displayName: "Membership acceptance " + randomUUID(),
    organizationType: "nonprofit",
  }, randomUUID());
  const identity = { sub: administrator.id, roles: ["system_admin"], permissions: [] };
  const addRequestId = randomUUID();
  const updateRequestId = randomUUID();
  const db = getPool();

  await assert.rejects(
    organizationJobs.adminAddOrganizationUser({ sub: administrator.id, roles: ["supporting_staff"], permissions: [] }, org.id, {
      email: member.email, roleCode: "recruiter", reason: "valid test reason"
    }, randomUUID()),
    error => error.code === "FORBIDDEN"
  );
  await assert.rejects(
    organizationJobs.adminAddOrganizationUser(identity, org.id, {
      email: member.email, roleCode: "recruiter", reason: "short"
    }, randomUUID()),
    error => error.code === "AUDIT_REASON_REQUIRED"
  );

  const added = await organizationJobs.adminAddOrganizationUser(identity, org.id, {
    email: member.email, roleCode: "recruiter", reason: "Approved staffing assignment for the organization."
  }, addRequestId);
  assert.equal(added.organizationId, org.id);
  assert.equal(added.userId, member.id);
  assert.equal(added.roleCode, "recruiter");
  assert.equal(added.status, "active");
  assert.equal(added.audited, true);

  await assert.rejects(
    organizationJobs.adminAddOrganizationUser(identity, org.id, {
      email: member.email, roleCode: "recruiter", reason: "Duplicate membership test"
    }, randomUUID()),
    error => error.code === "MEMBERSHIP_EXISTS"
  );
  await assert.rejects(
    organizationJobs.adminUpdateOrganizationUser(identity, org.id, owner.id, {
      roleCode: "administrator", status: "active", reason: "Owner protection test"
    }, randomUUID()),
    error => error.code === "OWNER_PROTECTED"
  );

  const updated = await organizationJobs.adminUpdateOrganizationUser(identity, org.id, member.id, {
    roleCode: "read_only", status: "suspended", reason: "Access paused pending the organization review."
  }, updateRequestId);
  assert.equal(updated.roleCode, "read_only");
  assert.equal(updated.status, "suspended");
  assert.equal(updated.audited, true);

  const auditRows = await db.query(
    "select action, metadata from audit_log where request_id in ($1,$2) order by action",
    [addRequestId, updateRequestId]
  );
  assert.ok(auditRows.rows.some(row => row.action === "organization.membership.admin_added"));
  assert.ok(auditRows.rows.some(row => row.action === "organization.membership.admin_updated"));
  assert.ok(auditRows.rows.every(row => String(row.metadata?.reason || "").length >= 8));
});
