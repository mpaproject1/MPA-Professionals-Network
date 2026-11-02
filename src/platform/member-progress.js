const SOURCE_DEFINITIONS = [
  ["applications", "Applications", "/track", "application"],
  ["serviceRequests", "Services", "/services", "service"],
  ["mentorshipRequests", "Mentorship", "/mentorship", "mentorship_request"],
  ["mentorshipMatches", "Mentorship", "/mentorship", "mentorship_match"],
  ["mentorships", "Mentorship", "/mentorship", "mentorship_relationship"],
  ["mentorshipSessions", "Mentorship", "/mentorship", "mentorship_session"],
  ["mentorshipLearningActivities", "Mentorship", "/mentorship", "mentorship_activity"],
  ["organizationMentorshipRequests", "Mentorship", "/mentorship", "organization_mentorship"],
  ["verificationCases", "Verification", "/verification", "verification"],
  ["referenceRequests", "Verification", "/verification", "reference_request"],
  ["communityImpactClaims", "Record claims", "/community-impact/claims", "record_claim"],
  ["talentInquiries", "Networking", "/network", "networking"],
  ["networkPlusRequests", "Collaboration", "/network-plus/requests", "collaboration"],
  ["initiativeParticipations", "Initiatives", "/serve-community", "initiative"],
  ["memberInitiatives", "Initiatives", "/serve-community/manage", "initiative"],
  ["referrals", "Referrals", "/referrals", "referral"],
  ["candidateReferrals", "Referrals", "/referrals/outcomes", "employment_referral"],
  ["recognitionNominations", "Recognition", "/community-impact/recognition", "recognition_nomination"],
  ["recognitionAwards", "Recognition", "/community-impact/recognition", "recognition_award"],
];

const ARRAY_KEYS = ["items", "rows", "records", "applications", "cases", "requests", "participations", "claims", "referrals", "matches", "mentorships", "inquiries", "initiatives"];
const MEMBER_ACTION = new Set(["draft", "correction_required", "changes_requested", "action_required", "awaiting_member", "pending_member", "needs_response", "needs_acceptance", "proposed", "payment_pending", "payment_required", "awaiting_confirmation"]);
const CLOSED = new Set(["rejected", "declined", "withdrawn", "cancelled", "canceled", "expired", "closed"]);
const COMPLETED = new Set(["completed", "complete", "verified", "approved", "activated", "hired", "fulfilled", "delivered", "awarded"]);
const ACTIVE = new Set(["active", "accepted", "in_progress", "in progress", "matched", "enrolled", "ongoing", "scheduled"]);
const EXTERNAL_WAIT = new Set(["awaiting_response", "waiting_for_response", "awaiting_provider", "pending_provider", "pending_mentor", "pending_organization", "waiting_for_employer", "awaiting_employer", "awaiting_another_party"]);

function rowsOf(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of ARRAY_KEYS) if (Array.isArray(value[key])) return value[key];
  return [];
}
function first(record, keys) {
  for (const key of keys) if (record?.[key] !== undefined && record?.[key] !== null && record[key] !== "") return record[key];
  return null;
}
function asDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function normalizedStatus(record, domain) {
  if (domain === "mentorship_session" && record.coordination_status === "proposed") {
    return record.proposed_by === record.viewer_user_id ? "awaiting_response" : "awaiting_member";
  }
  if (domain === "mentorship_activity") {
    if (record.submission_status === "accepted") return "completed";
    if (record.submission_status === "submitted") return record.viewer_user_id === record.mentor_user_id ? "awaiting_member" : "awaiting_response";
    if (record.submission_status === "changes_requested") return record.viewer_user_id === record.mentee_user_id ? "awaiting_member" : "awaiting_response";
    return record.viewer_user_id === record.mentee_user_id ? "awaiting_member" : "awaiting_response";
  }
  return String(first(record, ["status", "state", "application_status", "verification_status", "consent_status"]) || "unknown")
    .toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
}
function responsibility(status, domain, record) {
  if (domain === "job" && status === "interview") return "member_action";
  if (domain === "job" && status === "offer") return record.offer_approval_status === "pending" ? "mpa_action" : "member_action";
  if (domain === "job" && status === "accepted") return "external_response";
  if (domain === "mentorship_match") {
    if (["proposed", "matched"].includes(status)) return "member_action";
    if (status === "accepted") return "external_response";
  }
  if (domain === "mentorship_request" && ["requested", "submitted", "matching", "matched"].includes(status)) {
    return status === "matched" ? "member_action" : "mpa_action";
  }
  if (domain === "organization_mentorship" && ["submitted", "pending", "requested"].includes(status)) return "external_response";
  if (domain === "mentorship_session" && status === "scheduled" && record.coordination_status === "accepted") return "in_progress";
  if (MEMBER_ACTION.has(status)) return "member_action";
  if (EXTERNAL_WAIT.has(status)) return "external_response";
  if (CLOSED.has(status)) return "closed";
  if (COMPLETED.has(status)) return "completed";
  if (ACTIVE.has(status)) return "in_progress";
  if (status === "unknown") return "unknown";
  if (["submitted", "pending", "requested", "matching", "in_review", "under_review", "screening", "shortlisted", "awaiting_review", "proposed_to_mentor"].includes(status)) return "mpa_action";
  return "external_response";
}
function safeId(value) {
  return value === null || value === undefined ? null : String(value);
}
function mapRecord(record, definition) {
  if (!record || typeof record !== "object") return null;
  const [source, baseCategory, href, baseDomain] = definition;
  const domain = source === "applications" ? String(record.type || baseDomain) : baseDomain;
  const category = source === "applications"
    ? ({ membership: "Membership", job: "Jobs", organization: "Organizations" }[domain] || baseCategory)
    : baseCategory;
  const status = source === "recognitionAwards" ? "awarded" : normalizedStatus(record, domain);
  const id = safeId(first(record, ["id", "request_id", "case_id", "application_id", "claim_id", "attribution_id"]));
  if (!id) return null;
  const title = domain === "mentorship_session"
    ? String(first(record, ["agenda"]) || "Mentorship session")
    : String(first(record, ["title", "service_title", "job_title", "program_title", "program_name", "project_title", "subject", "goals", "name"]) || category + " request");
  const createdAt = asDate(first(record, ["submitted_at", "submittedAt", "created_at", "createdAt", "requested_at", "proposed_at"]));
  const scheduledAt = asDate(first(record, ["scheduled_start_at", "scheduledAt"]));
  const dueAt = asDate(first(record, ["due_at", "dueAt", "deadline_at"]));
  const updatedAt = asDate(first(record, ["last_activity_at", "lastActivityAt", "updated_at", "updatedAt", "reviewed_at", "responded_at", "submitted_at"])) || createdAt;
  const statusLabel = String(first(record, ["statusLabel", "status_label", "decision_label"]) || status.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase()));
  const state = responsibility(status, domain, record);
  const trackingReference = first(record, ["tracking_reference", "trackingReference", "reference", "display_reference"]);
  const historyRows = first(record, ["status_history", "events", "timeline", "history"]);
  const history = Array.isArray(historyRows)
    ? historyRows.map(event => ({
      status: String(first(event, ["toStatus", "to_status", "status", "event_type", "eventType"]) || "Update"),
      at: asDate(first(event, ["createdAt", "created_at", "occurred_at", "timestamp"])),
    })).filter(event => event.at).slice(-20)
    : [];
  const defaultNextAction = {
    member_action: "Your response is needed",
    mpa_action: "Waiting for MPA review",
    external_response: "Waiting for another participant",
    in_progress: "Engagement in progress",
    completed: "Completed",
    closed: "Closed",
    unknown: "Current status unavailable",
  }[state];
  const nextAction = domain === "mentorship_session" && state === "in_progress"
    ? "Attend your confirmed session"
    : domain === "mentorship_activity" && state === "member_action"
      ? (record.submission_status === "changes_requested" ? "Improve and resubmit your work" : "Complete the assigned activity")
      : domain === "mentorship_activity" && state === "external_response"
        ? "Waiting for the other participant to review or submit work"
        : defaultNextAction;
  return {
    id: domain + ":" + id,
    domain,
    recordId: id,
    source,
    category,
    type: domain,
    title,
    description: String(first(record, ["summary", "description", "service_category", "category", "agenda", "instructions"]) || ""),
    status,
    statusLabel,
    responsibility: state,
    nextAction,
    createdAt,
    submittedAt: createdAt,
    scheduledAt,
    dueAt,
    updatedAt,
    trackingReference: trackingReference ? String(trackingReference) : null,
    href,
    historyAvailable: history.length > 0,
    history,
  };
}
function priority(item) {
  const rank = { member_action: 0, mpa_action: 1, external_response: 2, in_progress: 3, unknown: 4, completed: 5, closed: 6 };
  return rank[item.responsibility] ?? 4;
}

/**
 * Builds a read-only, member-owned projection over existing domain records.
 * It never writes status, creates cases, or exposes source payloads/evidence.
 */
export function buildMemberProgress(sourceResults, { limit = 50, offset = 0, view = "all", category = "all" } = {}) {
  const errors = [];
  const availableSources = [];
  const items = [];
  for (const definition of SOURCE_DEFINITIONS) {
    const [key] = definition;
    const result = sourceResults?.[key];
    if (!result || result.status === "rejected") {
      errors.push({ source: key, category: definition[1], message: "This section could not be loaded. Other progress remains available." });
      continue;
    }
    availableSources.push(key);
    const sourceRows = key === "recognitionNominations"
      ? (result.value?.nominations || [])
      : key === "recognitionAwards"
        ? (result.value?.awards || [])
        : rowsOf(result.value);
    for (const record of sourceRows) {
      const item = mapRecord(record, definition);
      if (item) items.push(item);
    }
  }
  const unique = [...new Map(items.map(item => [item.id, item])).values()];
  const filtered = unique.filter(item => {
    if (category !== "all" && item.category.toLowerCase().replaceAll(" ", "_") !== String(category).toLowerCase()) return false;
    if (view === "attention") return item.responsibility === "member_action";
    if (view === "waiting") return ["mpa_action", "external_response"].includes(item.responsibility);
    if (view === "progress") return item.responsibility === "in_progress";
    if (view === "history") return ["completed", "closed"].includes(item.responsibility);
    return true;
  }).sort((a, b) => priority(a) - priority(b) || (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  const pageSize = Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 100);
  const pageOffset = Math.max(Number.parseInt(offset, 10) || 0, 0);
  const counts = {
    total: unique.length,
    needsAttention: unique.filter(item => item.responsibility === "member_action").length,
    waiting: unique.filter(item => ["mpa_action", "external_response"].includes(item.responsibility)).length,
    inProgress: unique.filter(item => item.responsibility === "in_progress").length,
    completed: unique.filter(item => ["completed", "closed"].includes(item.responsibility)).length,
    byCategory: Object.fromEntries([...new Set(SOURCE_DEFINITIONS.map(([, label]) => label))].map(label => [label, unique.filter(item => item.category === label).length])),
  };
  const page = filtered.slice(pageOffset, pageOffset + pageSize);
  const summary = {
    total: counts.total,
    active: counts.inProgress + counts.waiting,
    nextSteps: counts.needsAttention,
    jobApplications: unique.filter(item => item.domain === "job").length,
    memberships: unique.filter(item => item.domain === "membership").length,
    organizations: unique.filter(item => item.domain === "organization").length,
  };
  return {
    items: page,
    counts,
    summary,
    errors,
    availableSources,
    limit: pageSize,
    offset: pageOffset,
    hasMore: pageOffset + page.length < filtered.length,
    totalFiltered: filtered.length,
  };
}
