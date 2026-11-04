import { createHash } from "node:crypto";

/**
 * Build a stable key for one logical workflow notification.
 * eventVersion is included when supplied so later legitimate transitions of the
 * same resource can produce a new email. Replays of the same transition collapse.
 */
export function emailWorkflowEventKey({
  userId,
  templateCode,
  resourceType = "workflow",
  resourceId = null,
  eventCode = null,
  eventVersion = null
} = {}) {
  const parts = [userId, templateCode, resourceType, resourceId || "", eventCode || "", eventVersion || ""]
    .map(value => String(value ?? "").trim());
  if (!parts[0] || !parts[1]) return null;
  return "wf:" + createHash("sha256").update(parts.join("\u001f")).digest("hex");
}

export function normalizeEmailAddress(value) {
  return String(value ?? "").trim().toLowerCase();
}

/** Return true only when the recipient's persisted identity satisfies a template audience. */
export function emailAudienceMatches(audience, identity = {}) {
  if (!audience || audience === "all") return true;
  if (audience === "professional") return identity.accountType === "professional";
  if (audience === "organization_representative") return identity.accountType === "organization_representative";
  if (audience === "employer") return identity.accountType === "organization_representative" && identity.isEmployer === true;
  if (audience === "reviewer") return identity.isReviewer === true;
  if (audience === "administrator") return identity.isAdmin === true;
  if (audience === "support_manager") return identity.isSupportManager === true;
  if (audience === "mentor") return identity.isMentor === true;
  return false;
}
