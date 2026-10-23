import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import * as membership from "../../src/membership/service.js";
import * as organizationJobs from "../../src/organization-jobs/service.js";
import * as supportBot from "../../src/platform/support-bot.js";
import * as verification from "../../src/verification/service.js";
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

async function activeMember(suffix) {
  const userId = await account(suffix);
  const db = getPool();
  const product = (await db.query("select id from membership_product where product_code='BASIC'")).rows[0];
  assert.ok(product, "BASIC membership product must exist");
  await db.query("insert into membership_record(user_id,membership_product_id,membership_number,status,start_date,end_date,source) values($1,$2,$3,'active',current_date,current_date+365,'online')", [userId, product.id, `MPA-RBAC-${randomUUID().slice(0, 8).toUpperCase()}`]);
  return userId;
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

test("reviewer queue, case detail and write actions enforce assigned-case boundaries in the database", async () => {
  const suffix = randomUUID().replace(/-/g, "");
  const subjectA = await activeMember(suffix + "f");
  const subjectB = await activeMember(suffix + "g");
  const reviewerA = await account(suffix + "h");
  const reviewerB = await account(suffix + "i");
  const manager = await account(suffix + "j");
  const permissionManager = await account(suffix + "k");
  await assignRole(reviewerA, "verification_reviewer");
  await assignRole(reviewerB, "verification_reviewer");
  await assignRole(manager, "system_admin");
  await getPool().query("insert into app_user_permission(user_id,permission_code) values($1,'verification.manage') on conflict do nothing", [permissionManager]);

  const programs = await verification.listPrograms();
  assert.ok(programs.length, "At least one active verification program must exist");
  const caseA = await verification.createCase(subjectA, programs[0].program_code, subjectA, `case-a-${suffix}`);
  const caseB = await verification.createCase(subjectB, programs[0].program_code, subjectB, `case-b-${suffix}`);
  await verification.assignCase(caseA.id, reviewerA, manager, `assign-a-${suffix}`);
  await verification.assignCase(caseB.id, reviewerB, manager, `assign-b-${suffix}`);
  await assert.rejects(verification.assignCase(caseA.id, reviewerB, reviewerA, `unauthorized-assign-${suffix}`), hasStatus(403));
  const subjectC = await activeMember(suffix + "l");
  const caseC = await verification.createCase(subjectC, programs[0].program_code, subjectC, `case-c-${suffix}`);
  await verification.assignCase(caseC.id, reviewerA, permissionManager, `assign-permission-manager-${suffix}`);

  const queue = await verification.listCases({ viewerId: reviewerA, reviewerId: reviewerB, limit: 100 });
  const queueIds = queue.items.map((item) => item.id);
  assert.ok(queueIds.includes(caseA.id), "reviewer should receive their assigned case");
  assert.ok(!queueIds.includes(caseB.id), "caller-supplied reviewerId must not expose another reviewer's case");

  const assigned = await verification.getCase(caseA.id, reviewerA);
  assert.equal(assigned.id, caseA.id);
  await assert.rejects(verification.getCase(caseB.id, reviewerA), hasStatus(403));
  await assert.rejects(verification.addClaim(caseB.id, "NOT_A_REAL_CLAIM", { name: "Unauthorized claim" }, reviewerA, `claim-cross-${suffix}`), hasStatus(403));
  await assert.rejects(verification.addEvidence(caseB.id, { evidenceType: "supporting_document" }, reviewerA, `evidence-cross-${suffix}`), hasStatus(403));
  await assert.rejects(verification.getCase(caseA.id), hasStatus(403), "case reads without a viewer identity must fail closed");
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
