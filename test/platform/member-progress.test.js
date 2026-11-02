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
