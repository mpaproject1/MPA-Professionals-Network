import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import * as membership from "../../src/membership/service.js";
import * as organizationJobs from "../../src/organization-jobs/service.js";
import { getPool } from "../../src/platform/db.js";
import { runImpactReport } from "../../src/platform/serve-community-impact-reports.js";
import * as organizationOffers from "../../src/services-mentorship/organization-offers.js";
import * as servicesMentorship from "../../src/services-mentorship/service.js";
import * as supportCases from "../../src/services-mentorship/support-cases.js";

async function account(label) {
  const suffix = randomUUID();
  const digits = [...suffix.replaceAll("-", "")].map((character) => String(Number.parseInt(character, 16) % 10)).join("").slice(0, 8);
  const created = await membership.register({
    email: "support-case-" + label + "-" + suffix + "@example.test",
    password: "SupportCaseAccessTestPassword!2026",
    firstName: "Support",
    lastName: "Case" + suffix.slice(0, 8),
    phone: "07" + digits,
  }, "support-case-" + label + "-" + suffix);
  return created.user;
}

async function contact(userId) {
  const db = getPool();
  return (await db.query("select u.email,p.phone from app_user u join person p on p.user_id=u.id where u.id=$1", [userId])).rows[0];
}

async function assignRole(userId, roleCode) {
  const db = getPool();
  const role = (await db.query("select id from app_role where role_code=$1", [roleCode])).rows[0];
  assert.ok(role, "Expected role " + roleCode + " to exist after migrations");
  await db.query("insert into app_user_role(user_id,role_id) values($1,$2) on conflict do nothing", [userId, role.id]);
}

test("MPA Support Desk can open only a specific service or mentorship case with audited full participant details", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("requires the disposable PostgreSQL database configured by PR Quality");
    return;
  }

  const db = getPool();
  const support = await account("staff");
  const outsider = await account("outsider");
  const requester = await account("requester");
  const provider = await account("provider");
  const mentee = await account("mentee");
  const mentor = await account("mentor");
  const organizationOwner = await account("organization-owner");
  const organizationRequester = await account("organization-requester");
  await assignRole(support.id, "supporting_staff");
  const requesterContact = await contact(requester.id);
  const providerContact = await contact(provider.id);
  const menteeContact = await contact(mentee.id);
  const mentorContact = await contact(mentor.id);
  const organizationOwnerContact = await contact(organizationOwner.id);
  const organizationRequesterContact = await contact(organizationRequester.id);

  const listing = (await db.query(
    "insert into service_listing(provider_user_id,title,description,service_category) values($1,$2,$3,$4) returning id",
    [provider.id, "Case-specific service", "A service used to verify restricted participant access.", "professional_advice"],
  )).rows[0];
  await db.query("update service_listing set status='published',moderation_status='approved',moderated_by=$2,moderated_at=now(),lifecycle_status='active' where id=$1", [listing.id, support.id]);
  const serviceRequest = (await db.query(
    "insert into service_request(service_listing_id,requester_user_id,provider_user_id,status,message,scope,agreed_price,agreed_currency,request_idempotency_hash,request_fingerprint) values($1,$2,$3,'requested',$4,$5,null,'ETB',md5(gen_random_uuid()::text),md5(gen_random_uuid()::text)) returning id",
    [listing.id, requester.id, provider.id, "Please review the agreed service scope.", "A scoped support test request."],
  )).rows[0];

  const mentorshipRequest = (await db.query(
    "insert into mentorship_request(mentee_user_id,goals,status) values($1,$2,'matching') returning id",
    [mentee.id, "Develop a structured leadership and professional growth plan."],
  )).rows[0];
  const mentorship = (await db.query(
    "insert into mentorship(request_id,mentor_user_id,mentee_user_id,goals,status) values($1,$2,$3,$4,'active') returning id",
    [mentorshipRequest.id, mentor.id, mentee.id, "Develop a structured leadership and professional growth plan."],
  )).rows[0];


  const organization = await organizationJobs.registerOrganization(
    organizationOwner.id,
    { legalName: "Support Case Organization " + randomUUID(), displayName: "Support Case Organization" },
    "support-case-org-create",
  );
  await db.query(
    "update organization set verification_status='verified',verified_at=now(),verified_by=$2,public_visible=true where id=$1",
    [organization.id, organizationOwner.id],
  );
  const offer = (await db.query(
    "insert into organization_mentorship_offer(organization_id,created_by,title,description,expertise,languages,delivery_mode,visibility,status,moderation_status,moderated_by,moderated_at) values($1,$2,$3,$4,'[]'::jsonb,'[]'::jsonb,'remote','members','published','approved',$5,now()) returning id",
    [organization.id, organizationOwner.id, "Support case programme", "An organization mentorship programme used to verify restricted participant access.", support.id],
  )).rows[0];
  const organizationRequest = (await db.query(
    "insert into organization_mentorship_request(offer_id,requester_user_id,message) values($1,$2,$3) returning id",
    [offer.id, organizationRequester.id, "Please help me join this organization mentorship programme."],
  )).rows[0];
  await assert.rejects(
    supportCases.listSupportCases(outsider.id, { type: "all" }),
    (cause) => cause.statusCode === 403 && cause.code === "FORBIDDEN",
    "a non-support account must not enumerate cases",
  );
  await assert.rejects(
    supportCases.openSupportCase(outsider.id, "service", serviceRequest.id, { reason: "Investigate this case" }, "support-case-denied"),
    (cause) => cause.statusCode === 403 && cause.code === "FORBIDDEN",
    "a provider or ordinary member must not open MPA-only participant details",
  );
  await assert.rejects(
    supportCases.openSupportCase(support.id, "service", serviceRequest.id, { reason: "short" }, "support-case-invalid-reason"),
    (cause) => cause.statusCode === 400 && cause.code === "ACCESS_REASON_REQUIRED",
    "support access must require a case-specific reason",
  );

  const index = await supportCases.listSupportCases(support.id, { type: "all", limit: 50 });
  assert.ok(index.items.some((item) => item.case_type === "service" && item.id === serviceRequest.id));
  assert.ok(index.items.some((item) => item.case_type === "mentorship" && item.id === mentorship.id));
  assert.ok(index.items.some((item) => item.case_type === "organization_mentorship" && item.id === organizationRequest.id));
  for (const item of index.items) {
    assert.equal("email" in item, false, "case index must not disclose participant email addresses");
    assert.equal("phone" in item, false, "case index must not disclose participant phone numbers");
  }

  const serviceDetails = await supportCases.openSupportCase(
    support.id,
    "service",
    serviceRequest.id,
    { reason: "Resolve the reported service-delivery concern." },
    "support-case-service-open",
  );
  assert.deepEqual(serviceDetails.participants.map((item) => item.role), ["requester", "provider"]);
  assert.ok(serviceDetails.participants.some((item) => item.email === requesterContact.email && item.person.phone === requesterContact.phone));
  assert.ok(serviceDetails.participants.some((item) => item.email === providerContact.email && item.person.phone === providerContact.phone));
  assert.equal(serviceDetails.caseRecord.request.id, serviceRequest.id);
  assert.equal(serviceDetails.participants.some((item) => item.userId === mentor.id || item.userId === mentee.id), false, "service case detail must not pull participants from another case");

  const mentorshipDetails = await supportCases.openSupportCase(
    support.id,
    "mentorship",
    mentorship.id,
    { reason: "Resolve a participant concern for this mentorship." },
    "support-case-mentorship-open",
  );
  assert.deepEqual(mentorshipDetails.participants.map((item) => item.role), ["mentor", "mentee"]);
  assert.ok(mentorshipDetails.participants.some((item) => item.email === mentorContact.email && item.person.phone === mentorContact.phone));
  assert.ok(mentorshipDetails.participants.some((item) => item.email === menteeContact.email && item.person.phone === menteeContact.phone));
  assert.equal(mentorshipDetails.caseRecord.relationship.id, mentorship.id);
  assert.equal(mentorshipDetails.participants.some((item) => item.userId === requester.id || item.userId === provider.id), false, "mentorship case detail must remain scoped to its own participants");

  const organizationDetails = await supportCases.openSupportCase(
    support.id,
    "organization_mentorship",
    organizationRequest.id,
    { reason: "Resolve this organization programme request." },
    "support-case-organization-mentorship-open",
  );
  assert.deepEqual(organizationDetails.participants.map((item) => item.role), ["requester", "organization_team_member"]);
  assert.ok(organizationDetails.participants.some((item) => item.email === organizationRequesterContact.email && item.person.phone === organizationRequesterContact.phone));
  assert.ok(organizationDetails.participants.some((item) => item.email === organizationOwnerContact.email && item.person.phone === organizationOwnerContact.phone));
  assert.equal(organizationDetails.caseRecord.request.id, organizationRequest.id);

  const organizationTeamRequests = await organizationOffers.listMyOrganizationMentorshipRequests(organizationOwner.id);
  const organizationTeamRequest = organizationTeamRequests.find((item) => item.id === organizationRequest.id);
  assert.ok(organizationTeamRequest, "organization team must retain the program request workflow");
  assert.equal("email" in organizationTeamRequest, false, "organization programme workflow must not expose requester email");
  assert.equal("phone" in organizationTeamRequest, false, "organization programme workflow must not expose requester phone");

  const providerRequests = await servicesMentorship.listMyServiceRequests(provider.id);
  const providerRequest = providerRequests.find((item) => item.id === serviceRequest.id);
  assert.ok(providerRequest, "provider must retain the service workflow record");
  assert.equal("email" in providerRequest, false, "provider workflow response must not contain requester email");
  assert.equal("phone" in providerRequest, false, "provider workflow response must not contain requester phone");

  const mentorRelationships = await servicesMentorship.listMyMentorships(mentor.id);
  const mentorRelationship = mentorRelationships.find((item) => item.id === mentorship.id);
  assert.ok(mentorRelationship, "mentor must retain the mentorship workspace record");
  assert.equal("email" in mentorRelationship, false, "mentor workspace response must not contain mentee email");
  assert.equal("phone" in mentorRelationship, false, "mentor workspace response must not contain mentee phone");

  const providerReport = await runImpactReport(
    { sub: provider.id, roles: [], permissions: [] },
    listing.id,
    {},
    "support-case-provider-report",
    "owner",
  );
  const serializedReport = JSON.stringify(providerReport);
  assert.equal(serializedReport.includes(requesterContact.email), false);
  assert.equal(serializedReport.includes(requesterContact.phone), false);
  assert.equal(serializedReport.includes(requester.id), false, "provider impact report must remain aggregate and identity-free");

  const auditRows = await db.query(
    "select action,resource_type,resource_id,metadata from audit_log where actor_user_id=$1 and request_id=any($2::text[]) order by occurred_at asc",
    [support.id, ["support-case-service-open", "support-case-mentorship-open", "support-case-organization-mentorship-open"]],
  );
  assert.equal(auditRows.rows.length, 3, "each case detail opening must create an audit record");
  assert.ok(auditRows.rows.every((row) => row.action === "support.case_detail_accessed"));
  assert.ok(auditRows.rows.some((row) => row.resource_type === "service_request" && row.resource_id === serviceRequest.id));
  assert.ok(auditRows.rows.some((row) => row.resource_type === "mentorship" && row.resource_id === mentorship.id));
  assert.ok(auditRows.rows.some((row) => row.resource_type === "organization_mentorship_request" && row.resource_id === organizationRequest.id));
});
