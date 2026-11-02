import test from "node:test";
import assert from "node:assert/strict";
import { buildMemberProgress } from "../../src/platform/member-progress.js";

test("member progress combines member-owned records across domains and prioritizes member actions", () => {
  const result = buildMemberProgress({
    applications: { status: "fulfilled", value: { items: [
      { id: "job-1", type: "job", title: "Analyst", status: "submitted", created_at: "2026-10-01" },
      { id: "member-1", type: "membership", title: "Basic", status: "correction_required", created_at: "2026-10-02" },
    ] } },
    serviceRequests: { status: "fulfilled", value: [{ id: "service-1", service_title: "Legal review", status: "accepted", created_at: "2026-10-03" }] },
    mentorshipRequests: { status: "fulfilled", value: [{ id: "mentor-1", goals: "Leadership development", status: "matching", created_at: "2026-10-04" }] },
    mentorshipMatches: { status: "fulfilled", value: [] },
    mentorships: { status: "fulfilled", value: [] },
    organizationMentorshipRequests: { status: "fulfilled", value: [] },
    verificationCases: { status: "fulfilled", value: { items: [{ id: "verify-1", status: "correction_required", created_at: "2026-10-05", private_reviewer_note: "must not leak" }] } },
    referenceRequests: { status: "fulfilled", value: [] },
    communityImpactClaims: { status: "fulfilled", value: { items: [{ id: "claim-1", status: "submitted", created_at: "2026-10-06", evidence: [{ secret: true }] }] } },
    talentInquiries: { status: "fulfilled", value: [] },
    networkPlusRequests: { status: "fulfilled", value: { items: [] } },
    initiativeParticipations: { status: "fulfilled", value: { items: [] } },
    memberInitiatives: { status: "fulfilled", value: [] },
    referrals: { status: "fulfilled", value: { items: [] } },
    candidateReferrals: { status: "fulfilled", value: { items: [] } },
  });
  assert.equal(result.counts.total, 6);
  assert.equal(result.items[0].responsibility, "member_action");
  assert.equal(result.items.find(item => item.domain === "job").category, "Jobs");
  assert.equal(result.items.find(item => item.domain === "membership").category, "Membership");
  assert.equal(JSON.stringify(result).includes("must not leak"), false);
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("member progress isolates failed sources and never treats them as empty successful data", () => {
  const result = buildMemberProgress({
    applications: { status: "fulfilled", value: { items: [{ id: "job-1", type: "job", status: "submitted" }] } },
    serviceRequests: { status: "rejected", reason: new Error("database unavailable") },
  });
  assert.equal(result.items.length, 1);
  assert.equal(result.errors.some(error => error.source === "serviceRequests"), true);
  assert.equal(result.availableSources.includes("serviceRequests"), false);
});

test("member progress filters responsibility views and paginates without changing source records", () => {
  const sources = {
    applications: { status: "fulfilled", value: { items: [
      { id: "1", type: "membership", status: "correction_required", updated_at: "2026-10-01" },
      { id: "2", type: "job", status: "submitted", updated_at: "2026-10-02" },
      { id: "3", type: "job", status: "hired", updated_at: "2026-10-03" },
    ] } },
  };
  const attention = buildMemberProgress(sources, { view: "attention" });
  assert.equal(attention.items.length, 1);
  assert.equal(attention.items[0].recordId, "1");
  const page = buildMemberProgress(sources, { limit: 1, offset: 1 });
  assert.equal(page.items.length, 1);
  assert.equal(page.hasMore, true);
});

test("member progress includes recognition nominations and awarded achievements", () => {
  const result = buildMemberProgress({
    recognitionNominations: { status: "fulfilled", value: { nominations: [{ id: "nom-1", status: "submitted", program_title: "Community service", created_at: "2026-10-01" }] } },
    recognitionAwards: { status: "fulfilled", value: { awards: [{ id: "award-1", title: "Service recognition", awarded_at: "2026-10-02" }] } },
  });
  assert.equal(result.items.length, 2);
  assert.equal(result.items.find(item => item.domain === "recognition_award").responsibility, "completed");
  assert.equal(result.items.every(item => item.category === "Recognition"), true);
});

test("an accepted mentorship proposal is not presented as an active relationship", () => {
  const result = buildMemberProgress({
    mentorshipMatches: { status: "fulfilled", value: [{ id: "match-1", status: "accepted", mentee_consent_status: "pending", match_role: "mentor" }] },
    mentorshipRequests: { status: "fulfilled", value: [{ id: "request-1", status: "matching" }] },
    mentorships: { status: "fulfilled", value: [] },
  });
  assert.equal(result.items.find(item => item.domain === "mentorship_match").responsibility, "external_response");
  assert.equal(result.items.find(item => item.domain === "mentorship_request").responsibility, "mpa_action");
  assert.equal(result.counts.inProgress, 0);
});

test("mentorship session proposals distinguish who must respond and preserve confirmed dates", () => {
  const result = buildMemberProgress({
    mentorshipSessions: { status: "fulfilled", value: [
      { id: "session-1", status: "scheduled", coordination_status: "proposed", proposed_by: "other-user", viewer_user_id: "member-1", scheduled_start_at: "2026-11-10T09:00:00Z" },
      { id: "session-2", status: "scheduled", coordination_status: "proposed", proposed_by: "member-1", viewer_user_id: "member-1", scheduled_start_at: "2026-11-11T09:00:00Z" },
      { id: "session-3", status: "scheduled", coordination_status: "accepted", scheduled_start_at: "2026-11-12T09:00:00Z" },
    ] },
  });
  assert.equal(result.items.find(item => item.recordId === "session-1").responsibility, "member_action");
  assert.equal(result.items.find(item => item.recordId === "session-2").responsibility, "external_response");
  assert.equal(result.items.find(item => item.recordId === "session-3").responsibility, "in_progress");
  assert.equal(result.items.find(item => item.recordId === "session-3").scheduledAt, "2026-11-12T09:00:00.000Z");
});

test("mentorship learning activities assign responsibility from submission and review state", () => {
  const result = buildMemberProgress({
    mentorshipLearningActivities: { status: "fulfilled", value: [
      { id: "activity-1", title: "Leadership reflection", status: "published", viewer_user_id: "mentee", mentee_user_id: "mentee", mentor_user_id: "mentor", due_at: "2026-11-10", created_at: "2026-11-01" },
      { id: "activity-2", title: "Strategy brief", status: "published", viewer_user_id: "mentee", mentee_user_id: "mentee", mentor_user_id: "mentor", submission_status: "changes_requested", due_at: "2026-11-11" },
      { id: "activity-3", title: "Portfolio review", status: "published", viewer_user_id: "mentor", mentee_user_id: "mentee", mentor_user_id: "mentor", submission_status: "submitted" },
      { id: "activity-4", title: "Career plan", status: "published", viewer_user_id: "mentee", mentee_user_id: "mentee", mentor_user_id: "mentor", submission_status: "accepted" },
    ] },
  });
  assert.equal(result.items.find(item => item.recordId === "activity-1").responsibility, "member_action");
  assert.equal(result.items.find(item => item.recordId === "activity-2").responsibility, "member_action");
  assert.equal(result.items.find(item => item.recordId === "activity-3").responsibility, "member_action");
  assert.equal(result.items.find(item => item.recordId === "activity-4").responsibility, "completed");
  assert.equal(result.items.find(item => item.recordId === "activity-1").dueAt, "2026-11-10T00:00:00.000Z");
});
