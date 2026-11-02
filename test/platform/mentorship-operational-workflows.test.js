import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("mentorship operational workflows require explicit sharing and preserve participant privacy", async () => {
  const [migration, operations, service, server, page, email, reportPage, admin, adminEmail, interestPage, learningMigration, learningUi, progressModule] = await Promise.all([
    source("../../db/migrations/20261025100000_mentorship_operational_workflows.sql"),
    source("../../src/services-mentorship/operations.js"),
    source("../../src/services-mentorship/service.js"),
    source("../../server.js"),
    source("../../web/app/mentorship/page.tsx"),
    source("../../src/platform/email-operations.js"),
    source("../../web/app/admin/mentorship-reports/page.tsx"),
    source("../../web/app/admin/page.tsx"),
    source("../../web/app/admin/email/page.tsx"),
    source("../../web/app/admin/mentorship-interest/page.tsx"),
    source("../../db/migrations/20261102140000_mentorship_learning_activities.sql"),
    source("../../web/components/mentorship-learning-activities.tsx"),
    source("../../src/platform/member-progress.js"),
  ]);

  assert.match(migration, /share_with_eligible_mentors boolean NOT NULL DEFAULT false/);
  assert.match(migration, /mentorship_match_interest/);
  assert.match(migration, /mentorship_circle_membership/);
  assert.match(migration, /mentorship_participant_report/);
  assert.match(learningMigration, /create table if not exists mentorship_learning_activity/);
  assert.match(learningMigration, /create table if not exists mentorship_learning_submission/);
  assert.match(learningMigration, /create table if not exists mentorship_learning_review/);
  assert.match(learningMigration, /unique\(activity_id, submitted_by, version\)/);
  assert.match(service, /listMentorshipLearningActivities/);
  assert.match(service, /createMentorshipLearningActivity/);
  assert.match(service, /submitMentorshipLearningActivity/);
  assert.match(service, /reviewMentorshipLearningSubmission/);\n  assert.match(service, /listMyMentorshipLearningProgress/);\n  assert.match(service, /createInAppNotification\(db,m\.mentee_user_id/);\n  assert.match(service, /createInAppNotification\(db,activity\.mentor_user_id/);
  assert.match(service, /SUBMISSION_AWAITING_REVIEW/);
  assert.match(service, /STALE_SUBMISSION/);
  assert.match(service, /Only the assigned mentor can create learning activities/);
  assert.match(service, /Only the assigned mentee can submit this activity/);
  assert.match(server, /api\/v1\/mentorship-learning-submissions\//);
  assert.match(server, /api\/v1\/mentorship-activities\//);
  assert.match(page, /MentorshipLearningActivities/);
  assert.match(learningUi, /Create a learning activity/);
  assert.match(learningUi, /Submit new version/);
  assert.match(learningUi, /Request improvement/);
  assert.match(learningUi, /Accept work/);
  assert.match(progressModule, /mentorshipLearningActivities/);
  assert.match(progressModule, /mentorship_session/);

  assert.match(migration, /delivery_status IN \('unknown','queued','sent','delivered','failed','cancelled'\)/);

  const poolStart = operations.indexOf("export async function listMentorshipInterestPool");
  const poolEnd = operations.indexOf("export async function registerMentorshipInterest");
  const pool = operations.slice(poolStart, poolEnd);
  assert.match(pool, /share_with_eligible_mentors=true/);
  assert.match(operations, /MENTOR_NOT_ELIGIBLE/);
  assert.match(operations, /Only an active, approved, verified mentor with current membership can use this workflow/);
  assert.match(operations, /PROFESSIONAL_VERIFICATION_REQUIRED/);
  assert.doesNotMatch(pool, /contact_email|contact_phone|u\.email|p\.email/);
  assert.match(operations, /Only a participant can submit a report/);
  assert.match(operations, /Authorized Support Desk access is required/);
  assert.match(operations, /setMentorshipRequestSharing/);
  assert.match(operations, /listMentorshipInterestReviewQueue/);
  assert.match(operations, /active_relationship_count/);
  assert.match(operations, /MENTOR_CAPACITY_FULL/);
  assert.match(operations, /proposeMentorshipInterestMatch/);
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
    'api/v1/admin/mentorship-interest',
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
  assert.match(page, /circle_joined_by_me/);

  assert.match(email, /EMAIL_DELIVERY_EVENT_WEBHOOK_SECRET/);
  assert.match(email, /deliveryStatus=eventType/);
  assert.match(email, /does not prove the recipient read the message/i);
  assert.match(reportPage, /api\/v1\/admin\/mentorship-reports/);
  assert.match(reportPage, /no contact address is collected/i);
  assert.match(admin, /\/admin\/mentorship-reports/);
  assert.match(adminEmail, /delivery_status/);
  assert.match(interestPage, /Propose this mentor/);
  assert.match(interestPage, /no contact addresses/i);
  assert.match(page, /Notification evidence/);
});

test("mentorship rescheduling preserves the confirmed appointment until the other participant accepts", async () => {
  const [migration, operations, service, server, page] = await Promise.all([
    source("../../db/migrations/20261030100000_mentorship_session_change_proposals.sql"),
    source("../../src/services-mentorship/operations.js"),
    source("../../src/services-mentorship/service.js"),
    source("../../server.js"),
    source("../../web/app/mentorship/page.tsx"),
  ]);
  assert.match(migration, /ux_mentorship_session_one_pending_change/);
  assert.match(migration, /previous_start_at timestamptz NOT NULL/);
  assert.match(migration, /proposed_start_at timestamptz NOT NULL/);
  assert.match(operations, /Only a mentorship participant can propose a schedule change/);
  assert.match(operations, /PROPOSER_CANNOT_CONFIRM/);
  assert.match(operations, /The existing confirmed appointment remains unchanged until the other participant accepts/);
  assert.match(operations, /update mentorship_session set scheduled_start_at=\$1,scheduled_end_at=\$2/);
  assert.match(operations, /STALE_SCHEDULE_PROPOSAL/);
  assert.match(service, /change_proposal_id/);
  assert.match(server, /proposeMentorshipSessionChange/);
  assert.match(server, /respondToMentorshipSessionChange/);
  assert.match(page, /Propose a different session time/);
  assert.match(page, /Confirm new time/);
  assert.match(page, /Keep original time/);
  assert.match(page, /Withdraw schedule change/);
  assert.match(service, /previous_start_at change_previous_start_at/);
  assert.match(service, /responded_at change_responded_at/);
  assert.match(page, /targetDate:goalDueDates/);
  assert.match(page, /Target date/);
  assert.match(page, /Schedule-change history/);
});
