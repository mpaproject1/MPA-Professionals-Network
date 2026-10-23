import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import * as membership from "../../src/membership/service.js";
import * as organizationJobs from "../../src/organization-jobs/service.js";
import * as supportBot from "../../src/platform/support-bot.js";
import { closePool, getPool } from "../../src/platform/db.js";

async function account(suffix) {
  const digits = suffix.replace(/[^0-9]/g, "").slice(0, 8).padEnd(8, "7");
  const result = await membership.register({
    email: `role-boundary-${suffix}@example.test`,
    password: "RoleBoundaryP1Password!2026",
    firstName: "Boundary",
    lastName: `Test${suffix.slice(0, 8)}`,
    phone: `09${digits}`,
  }, `role-boundary-${suffix}`);
  return result.user.id;
}

async function assignRole(userId, roleCode) {
  const db = getPool();
  const role = (await db.query("select id from app_role where role_code=$1", [roleCode])).rows[0];
  assert.ok(role, `Expected role ${roleCode} to exist`);
  await db.query("insert into app_user_role(user_id,role_id) values($1,$2) on conflict do nothing", [userId, role.id]);
}

function hasStatus(status) {
  return (error) => error?.statusCode === status;
}

test("organization full detail and roster are scoped to the correct organization and owner/admin", async () => {
  const suffix = randomUUID().replace(/-/g, "");
  const owner = await account(suffix + "a");
  const recruiter = await account(suffix + "b");
  const outsider = await account(suffix + "c");
  const org = await organizationJobs.registerOrganization(owner, {
    legalName: `Boundary Organization ${suffix}`,
    displayName: `Boundary Org ${suffix.slice(0, 8)}`,
  }, `org-boundary-${suffix}`);

  await organizationJobs.addOrganizationUser(org.id, owner, { userId: recruiter, roleCode: "recruiter" }, `org-recruiter-${suffix}`);
  const recruiterView = await organizationJobs.getOrganization(org.id, recruiter);
  assert.deepEqual(recruiterView.users, [], "recruiters must not receive the organization roster in the detail response");
  await assert.rejects(organizationJobs.listOrganizationUsers(org.id, recruiter), hasStatus(403));
  await assert.rejects(organizationJobs.getOrganization(org.id, outsider), hasStatus(403));
  assert.ok((await organizationJobs.listOrganizationUsers(org.id, owner)).some((row) => row.user_id === recruiter));

  await assert.rejects(
    organizationJobs.addOrganizationUser(org.id, owner, { userId: outsider, roleCode: "owner" }, `org-owner-role-${suffix}`),
    hasStatus(400),
  );
  await assert.rejects(
    organizationJobs.updateOrganizationUser(org.id, owner, owner, { roleCode: "administrator" }, `org-owner-change-${suffix}`),
    hasStatus(403),
  );
});

test("support queue hides another colleague's assigned conversation and contact details without consent", async () => {
  const suffix = randomUUID().replace(/-/g, "");
  const staffA = await account(suffix + "d");
  const staffB = await account(suffix + "e");
  await assignRole(staffA, "supporting_staff");
  await assignRole(staffB, "supporting_staff");
  const db = getPool();

  async function conversation({ assignedTo = null, consent = false, contactEmail }) {
    const ref = `MPA-SUP-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
    return (await db.query(`
      insert into support_conversation(public_reference,visitor_key_hash,contact_name,contact_email,contact_phone,preferred_contact,consent_to_contact,page_path,last_question,assigned_to)
      values($1,$2,'Private Contact',$3,'0912345678','email',$4,'/support','Please help with my account',$5)
      returning id,public_reference
    `, [ref, randomUUID(), contactEmail, consent, assignedTo])).rows[0];
  }

  const unassigned = await conversation({ consent: false, contactEmail: `no-consent-${suffix}@example.test` });
  const own = await conversation({ assignedTo: staffA, consent: true, contactEmail: `own-${suffix}@example.test` });
  const colleague = await conversation({ assignedTo: staffB, consent: true, contactEmail: `colleague-${suffix}@example.test` });

  const queue = await supportBot.adminListConversations({ actorId: staffA, limit: 100 });
  const byId = new Map(queue.map((row) => [row.id, row]));
  assert.ok(byId.has(unassigned.id), "unassigned inquiries should be available to the support queue");
  assert.ok(byId.has(own.id), "staff should see their own assigned inquiry");
  assert.ok(!byId.has(colleague.id), "staff must not see another colleague's assigned inquiry");
  assert.equal(byId.get(unassigned.id).contactEmail, null, "contact details must be hidden without follow-up consent");
  assert.equal(byId.get(unassigned.id).contactPhone, null, "phone must be hidden without follow-up consent");

  const claimed = await supportBot.adminUpdateConversation(staffA, unassigned.id, { status: "in_progress" }, `support-claim-${suffix}`);
  assert.equal(claimed.assignedTo, staffA, "starting work on an unassigned inquiry should claim it for the current staff member");
  await assert.rejects(
    supportBot.adminReplyToConversation(staffA, colleague.id, { message: "I will review this request." }, `support-cross-reply-${suffix}`),
    hasStatus(403),
  );
});

after(async () => { await closePool(); });
