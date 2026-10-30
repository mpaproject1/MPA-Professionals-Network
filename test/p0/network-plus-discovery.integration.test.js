import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import * as membership from "../../src/membership/service.js";
import * as organizationJobs from "../../src/organization-jobs/service.js";
import { closePool, getPool } from "../../src/platform/db.js";
import { resolveNetworkPlusAccess } from "../../src/platform/network-plus-access.js";
import * as talent from "../../src/talent/service.js";
import * as verification from "../../src/verification/service.js";

function accountInput(label, accountType = "professional") {
  const suffix = randomUUID();
  const digits = suffix.replace(/\\D/g, "").slice(0, 8).padEnd(8, "7");
  return {
    email: `network-plus-${label}-${suffix}@example.test`,
    password: "NetworkPlusPrivacyPassword!2026",
    firstName: "Network",
    lastName: `Plus${label}`,
    phone: `09${digits}`,
    accountType,
  };
}

async function register(label, accountType = "professional") {
  return membership.register(accountInput(label, accountType), `network-plus-register-${label}-${randomUUID()}`);
}

async function setMembership(userId, endDate = "current_date+365") {
  const db = getPool();
  const product = (await db.query("select id from membership_product where product_code='BASIC'")).rows[0];
  assert.ok(product, "BASIC membership product must exist for the discovery fixture");
  const number = `MPA-NP-${randomUUID().slice(0, 12).toUpperCase()}`;
  await db.query(
    `insert into membership_record(user_id,membership_product_id,membership_number,status,start_date,end_date,source)
     values($1,$2,$3,'active',current_date,${endDate},'online')`,
    [userId, product.id, number],
  );
}

async function createVerifiedProfessional(label, visibility, showContact = false) {
  const db = getPool();
  const account = await register(label);
  await setMembership(account.user.id);
  const requestId = `network-plus-profile-${randomUUID()}`;
  await talent.updateProfessionalProfile(account.user.id, {
    professionalTitle: `Verified ${label} professional`,
    visibility,
    directorySummary: `Approved directory summary for ${label}.`,
  }, requestId);
  await talent.updateVisibility(account.user.id, {
    directoryVisible: true,
    showIdentityBadge: true,
    showProfessionalBadge: true,
    showExperienceBadge: false,
    showLocation: false,
    showExperience: false,
    showContact,
  }, requestId);
  const program = (await db.query("select program_code from verification_program where active=true order by program_code limit 1")).rows[0];
  assert.ok(program, "An active professional verification program must exist");
  const verificationCase = await verification.createCase(account.user.id, program.program_code, account.user.id, `network-plus-case-${randomUUID()}`);
  if (verificationCase.status === "consent_pending") {
    await verification.giveConsent(verificationCase.id, account.user.id, "network-plus-test-v1", `network-plus-consent-${randomUUID()}`);
  }
  const claim = await verification.addClaim(
    verificationCase.id,
    "SERVICE_CAPABILITY",
    { capability: `Verified ${label} capability` },
    account.user.id,
    `network-plus-claim-${randomUUID()}`,
  );
  await db.query("update verification_claim set status='verified',verified_at=now(),updated_at=now() where id=$1", [claim.id]);
  return account;
}

test("member discovery enforces public, member-only, private, expired-member and organization-context visibility", async t => {
  if (!process.env.DATABASE_URL) {
    t.skip("requires the disposable PostgreSQL database configured by PR Quality");
    return;
  }

  const db = getPool();
  const suffix = randomUUID().replace(/-/g, "");
  const publicProfessional = await createVerifiedProfessional(`public-${suffix}`, "public");
  const memberProfessional = await createVerifiedProfessional(`members-${suffix}`, "members");
  const privateProfessional = await createVerifiedProfessional(`private-${suffix}`, "private");
  const activeViewer = await register(`active-viewer-${suffix}`);
  await setMembership(activeViewer.user.id);
  const expiredViewer = await register(`expired-viewer-${suffix}`);
  await setMembership(expiredViewer.user.id, "current_date-1");

  const organizationViewer = await register(`organization-viewer-${suffix}`, "organization");
  const organization = await organizationJobs.registerOrganization(organizationViewer.user.id, {
    legalName: `Network Plus Context Organization ${suffix}`,
    displayName: `Network Plus Context ${suffix}`,
  }, `network-plus-context-org-${suffix}`);
  await db.query(
    "update organization set verification_status='verified',verified_at=now(),public_visible=true where id=$1",
    [organization.id],
  );
  await organizationJobs.updateNetworkPlusVisibility(
    organization.id,
    organizationViewer.user.id,
    { visible: true, reason: "Opt in for organization-context discovery test" },
    `network-plus-context-visibility-${suffix}`,
  );

  const publicResults = await talent.searchTalent(null, { q: suffix });
  const activeResults = await talent.searchTalent(activeViewer.user.id, { q: suffix });
  const expiredResults = await talent.searchTalent(expiredViewer.user.id, { q: suffix });
  const organizationResults = await talent.searchTalent(organizationViewer.user.id, { q: suffix });
  const ids = rows => rows.items.map(row => row.user_id);

  assert.ok(ids(publicResults).includes(publicProfessional.user.id), "anonymous viewers may see opted-in public profiles");
  assert.ok(!ids(publicResults).includes(memberProfessional.user.id), "anonymous viewers cannot see member-only profiles");
  assert.ok(!ids(publicResults).includes(privateProfessional.user.id), "anonymous viewers cannot see private profiles");
  assert.ok(ids(activeResults).includes(memberProfessional.user.id), "current members may see member-only profiles");
  assert.ok(!ids(activeResults).includes(privateProfessional.user.id), "current members cannot see private profiles");
  assert.ok(!ids(expiredResults).includes(memberProfessional.user.id), "expired members lose member-only discovery");
  assert.ok(ids(expiredResults).includes(publicProfessional.user.id), "expired members retain only explicitly public profiles");
  assert.ok(!ids(organizationResults).includes(memberProfessional.user.id), "organization entry eligibility does not silently broaden member-only profile visibility");
  assert.ok(ids(organizationResults).includes(publicProfessional.user.id), "organization-context viewers may see explicitly public profiles");

  const memberDetail = await talent.getTalent(memberProfessional.user.id, activeViewer.user.id);
  assert.equal(memberDetail.phone, null, "profile viewing does not release contact details");
  assert.ok(memberDetail.verifiedClaims.some(claim => claim.claim_code === "service_capability"), "verified claim provenance is retained as its approved claim-code snapshot");
  assert.equal("evidence" in memberDetail, false, "private verification evidence is never part of a discovery profile");
  assert.equal("reviewer_note" in memberDetail, false, "private reviewer notes are never part of a discovery profile");
  await assert.rejects(
    talent.getTalent(memberProfessional.user.id, organizationViewer.user.id),
    error => error.code === "NOT_FOUND",
    "an organization account without active personal membership cannot read member-only profiles",
  );
  await assert.rejects(
    talent.getTalent(privateProfessional.user.id, activeViewer.user.id),
    error => error.code === "NOT_FOUND",
  );

  const idempotencyKey = randomUUID() + randomUUID();
  const inquiryInput = {
    professionalUserId: publicProfessional.user.id,
    subject: "Professional collaboration inquiry",
    message: "Please let me know whether you are open to discussing this opportunity.",
  };
  const inquiry = await talent.createTalentInquiry(activeViewer.user.id, inquiryInput, `network-plus-inquiry-${suffix}`, idempotencyKey);
  const replay = await talent.createTalentInquiry(activeViewer.user.id, inquiryInput, `network-plus-inquiry-replay-${suffix}`, idempotencyKey);
  assert.equal(replay.id, inquiry.id);
  assert.equal(replay.replayed, true, "same-key retries replay the original inquiry");
  await assert.rejects(
    talent.createTalentInquiry(activeViewer.user.id, { ...inquiryInput, message: "Changed payload" }, `network-plus-inquiry-conflict-${suffix}`, idempotencyKey),
    error => error.code === "IDEMPOTENCY_KEY_CONFLICT",
  );
  assert.deepEqual(await talent.listTalentInquiries(expiredViewer.user.id), [], "unrelated viewers cannot list another participant's inquiry");
  await assert.rejects(
    talent.respondToTalentInquiry(inquiry.id, activeViewer.user.id, { status: "accepted", releaseContact: true }, `network-plus-inquiry-wrong-participant-${suffix}`),
    error => error.code === "FORBIDDEN",
  );
  await assert.rejects(
    talent.respondToTalentInquiry(inquiry.id, publicProfessional.user.id, { status: "accepted", releaseContact: true }, `network-plus-inquiry-no-consent-${suffix}`),
    error => error.code === "CONTACT_RELEASE_DISABLED",
    "acceptance cannot release contact while the professional has disabled contact sharing",
  );
  await talent.updateVisibility(publicProfessional.user.id, { directoryVisible: true, showContact: true }, `network-plus-contact-opt-in-${suffix}`);
  await talent.respondToTalentInquiry(inquiry.id, publicProfessional.user.id, { status: "accepted", releaseContact: true }, `network-plus-inquiry-consented-${suffix}`);
  const requesterInquiries = await talent.listTalentInquiries(activeViewer.user.id);
  assert.equal(requesterInquiries.find(row => row.id === inquiry.id)?.professional_email, publicProfessional.user.email,
    "contact is released to inquiry participants only after explicit acceptance and contact opt-in");
  assert.deepEqual(await talent.listTalentInquiries(expiredViewer.user.id), [], "contact-bearing inquiry data remains participant-scoped");
});

test("organization discovery requires Network-Plus eligibility, explicit opt-in and verified canonical organization state", async t => {
  if (!process.env.DATABASE_URL) {
    t.skip("requires the disposable PostgreSQL database configured by PR Quality");
    return;
  }

  const db = getPool();
  const suffix = randomUUID().replace(/-/g, "");
  const owner = await register(`org-owner-${suffix}`, "organization");
  const org = await organizationJobs.registerOrganization(owner.user.id, {
    legalName: `Network Plus Visible Organization ${suffix}`,
    displayName: `Network Plus Visible ${suffix}`,
    description: "Approved organization discovery profile.",
    website: "https://example.test",
  }, `network-plus-visible-org-${suffix}`);
  const defaultVisibility = (await db.query("select network_plus_visible from organization where id=$1", [org.id])).rows[0];
  assert.equal(defaultVisibility.network_plus_visible, false, "existing organizations are hidden until an explicit opt-in");

  await db.query("update organization set verification_status='verified',verified_at=now(),public_visible=true where id=$1", [org.id]);
  await organizationJobs.updateNetworkPlusVisibility(
    org.id,
    owner.user.id,
    { visible: true, reason: "Organization opts in to verified discovery" },
    `network-plus-opt-in-${suffix}`,
  );

  const hidden = await organizationJobs.registerOrganization(owner.user.id, {
    legalName: `Network Plus Hidden Organization ${suffix}`,
    displayName: `Network Plus Hidden ${suffix}`,
  }, `network-plus-hidden-org-${suffix}`);
  await db.query("update organization set verification_status='verified',verified_at=now(),public_visible=true where id=$1", [hidden.id]);

  const activeMember = await register(`org-directory-member-${suffix}`);
  await setMembership(activeMember.user.id);
  const projectManager = await register(`org-directory-project-manager-${suffix}`, "organization");
  await db.query(
    "insert into organization_membership(organization_id,user_id,role_code,status,joined_at) values($1,$2,'project_manager','active',now())",
    [org.id, projectManager.user.id],
  );
  const recruiter = await register(`org-directory-recruiter-${suffix}`, "organization");
  await db.query(
    "insert into organization_membership(organization_id,user_id,role_code,status,joined_at) values($1,$2,'recruiter','active',now())",
    [org.id, recruiter.user.id],
  );
  const inactiveOrganizationUser = await register(`org-directory-inactive-${suffix}`, "organization");
  await db.query(
    "insert into organization_membership(organization_id,user_id,role_code,status,joined_at) values($1,$2,'owner','removed',now())",
    [org.id, inactiveOrganizationUser.user.id],
  );
  const expiredMember = await register(`org-directory-expired-${suffix}`);
  await setMembership(expiredMember.user.id, "current_date-1");
  const unverifiedOwner = await register(`org-directory-unverified-${suffix}`, "organization");
  await organizationJobs.registerOrganization(unverifiedOwner.user.id, {
    legalName: `Network Plus Unverified Organization ${suffix}`,
    displayName: `Network Plus Unverified ${suffix}`,
  }, `network-plus-unverified-org-${suffix}`);

  const memberDirectory = await organizationJobs.listNetworkPlusOrganizations(activeMember.user.id, { q: suffix });
  const ownerDirectory = await organizationJobs.listNetworkPlusOrganizations(owner.user.id, { q: suffix });
  const projectDirectory = await organizationJobs.listNetworkPlusOrganizations(projectManager.user.id, { q: suffix });
  assert.ok(memberDirectory.items.some(row => row.id === org.id));
  assert.ok(!memberDirectory.items.some(row => row.id === hidden.id), "public_visible alone does not opt an organization into Network-Plus");
  assert.ok(ownerDirectory.items.some(row => row.id === org.id));
  assert.ok(projectDirectory.items.some(row => row.id === org.id));

  const visible = memberDirectory.items.find(row => row.id === org.id);
  for (const privateField of ["legal_name", "email", "phone", "address_text", "verification_evidence", "users", "created_by"]) {
    assert.equal(privateField in visible, false, `directory projection must not expose ${privateField}`);
  }
  assert.deepEqual(Object.keys(visible).sort(), ["description", "display_name", "id", "location_label", "organization_type", "website"]);

  await assert.rejects(organizationJobs.listNetworkPlusOrganizations(null), error => error.code === "UNAUTHENTICATED");
  await assert.rejects(organizationJobs.listNetworkPlusOrganizations(expiredMember.user.id), error => error.code === "NETWORK_PLUS_FORBIDDEN");
  await assert.rejects(organizationJobs.listNetworkPlusOrganizations(unverifiedOwner.user.id), error => error.code === "NETWORK_PLUS_FORBIDDEN",
    "an owner of an unverified organization has no Network-Plus entry context");
  await assert.rejects(organizationJobs.listNetworkPlusOrganizations(recruiter.user.id), error => error.code === "NETWORK_PLUS_FORBIDDEN");
  await assert.rejects(organizationJobs.listNetworkPlusOrganizations(inactiveOrganizationUser.user.id), error => error.code === "NETWORK_PLUS_FORBIDDEN");
  await assert.equal((await resolveNetworkPlusAccess(db, projectManager.user.id)).eligible, true);

  await assert.rejects(
    organizationJobs.updateNetworkPlusVisibility(org.id, recruiter.user.id, { visible: false, reason: "Attempt to change visibility" }, `network-plus-recruiter-change-${suffix}`),
    error => error.code === "FORBIDDEN",
  );
  await organizationJobs.updateNetworkPlusVisibility(
    org.id,
    owner.user.id,
    { visible: false, reason: "Organization withdraws discovery opt in" },
    `network-plus-opt-out-${suffix}`,
  );
  const afterOptOut = await organizationJobs.listNetworkPlusOrganizations(activeMember.user.id, { q: suffix });
  assert.ok(!afterOptOut.items.some(row => row.id === org.id), "opt-out removes the organization from discovery immediately");
  const identityRows = await db.query(
    "select (select count(*)::int from organization where id=$1) organizations,(select count(*)::int from person where user_id=$2) people",
    [org.id, owner.user.id],
  );
  assert.equal(identityRows.rows[0].organizations, 1, "discovery reuses the canonical organization record");
  assert.equal(identityRows.rows[0].people, 1, "discovery does not create a second person identity");
});

after(async () => { await closePool(); });
