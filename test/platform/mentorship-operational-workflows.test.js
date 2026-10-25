import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("mentorship operational workflows require explicit sharing and preserve participant privacy", async () => {
  const [migration, operations, service, server, page, email, reportPage, admin] = await Promise.all([
    source("../../db/migrations/20261025100000_mentorship_operational_workflows.sql"),
    source("../../src/services-mentorship/operations.js"),
    source("../../src/services-mentorship/service.js"),
    source("../../server.js"),
    source("../../web/app/mentorship/page.tsx"),
    source("../../src/platform/email-operations.js"),
    source("../../web/app/admin/mentorship-reports/page.tsx"),
    source("../../web/app/admin/page.tsx"),
  ]);

  assert.match(migration, /share_with_eligible_mentors boolean NOT NULL DEFAULT false/);
  assert.match(migration, /mentorship_match_interest/);
  assert.match(migration, /mentorship_circle_membership/);
  assert.match(migration, /mentorship_participant_report/);
  assert.match(migration, /delivery_status IN \('unknown','queued','sent','delivered','failed','cancelled'\)/);

  const poolStart = operations.indexOf("export async function listMentorshipInterestPool");
  const poolEnd = operations.indexOf("export async function registerMentorshipInterest");
  const pool = operations.slice(poolStart, poolEnd);
  assert.match(pool, /share_with_eligible_mentors=true/);
  assert.match(pool, /MENTOR_NOT_ELIGIBLE/);
  assert.doesNotMatch(pool, /contact_email|contact_phone|u\.email|p\.email/);
  assert.match(operations, /Only a participant can submit a report/);
  assert.match(operations, /Authorized Support Desk access is required/);
  assert.match(operations, /setMentorshipRequestSharing/);
  assert.match(operations, /joined_count/);
  assert.match(operations, /not participant identities/i);

  assert.match(service, /shareWithEligibleMentors=input\.shareWithEligibleMentors===true/);
  assert.match(service, /share_with_eligible_mentors/);
  assert.match(service, /coordination_status,proposed_by,proposal_note/);
  assert.match(service, /Both participants must confirm the session proposal/);
  assert.match(service, /PRIVATE_CONTACT_NOT_ALLOWED/);
  assert.match(service, /matchId:row\.id/);

  for (const route of [
    'api/v1/me/mentorship-interest',
    'api/v1/me/mentorship-reports',
    'api/v1/mentorship/requests/',
    'api/v1/me/mentorship-operations',
    'api/v1/admin/mentorship-reports',
    'api/v1/email/delivery-webhook',
    'api/v1/mentorship/sessions/',
  ]) assert.ok(server.includes(route), "missing route " + route);
  assert.match(server, /respondToSessionProposal/);
  assert.match(server, /createMentorshipParticipantReport/);
  assert.match(server, /registerMentorshipInterest/);

  assert.match(page, /shareRequestWithMentors/);
  assert.match(page, /Stop sharing summary/);
  assert.match(page, /Consented mentorship interests/);
  assert.match(page, /Mentorship operations/);
  assert.match(page, /Confirm session/);
  assert.match(page, /Submit confidential report/);
  assert.match(page, /Check my report history/);
  assert.match(page, /feedbackRatings/);
  assert.doesNotMatch(page, /rating:5,comments:"Submitted through the mentorship workspace\."/);
  assert.match(page, /circle_joined_count/);

  assert.match(email, /EMAIL_DELIVERY_EVENT_WEBHOOK_SECRET/);
  assert.match(email, /deliveryStatus=eventType/);
  assert.match(email, /does not prove the recipient read the message/i);
  assert.match(reportPage, /api\/v1\/admin\/mentorship-reports/);
  assert.match(reportPage, /no contact address is collected/i);
  assert.match(admin, /\/admin\/mentorship-reports/);
});
