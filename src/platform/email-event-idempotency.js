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
