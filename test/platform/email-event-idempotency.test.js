import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { emailWorkflowEventKey, normalizeEmailAddress } from "../../src/platform/email-event-idempotency.js";

test("the same logical workflow transition has a stable idempotency key", () => {
  const input = { userId: "user-1", templateCode: "professional.workflow_update", resourceType: "job_application", resourceId: "application-1", eventCode: "job.application_submitted" };
  assert.equal(emailWorkflowEventKey(input), emailWorkflowEventKey({ ...input }));
});

test("different recipients, resources and event versions do not collide", () => {
  const base = { userId: "user-1", templateCode: "professional.workflow_update", resourceType: "job_application", resourceId: "application-1", eventCode: "job.application_update", eventVersion: "submitted" };
  const key = emailWorkflowEventKey(base);
  assert.notEqual(key, emailWorkflowEventKey({ ...base, userId: "user-2" }));
  assert.notEqual(key, emailWorkflowEventKey({ ...base, resourceId: "application-2" }));
  assert.notEqual(key, emailWorkflowEventKey({ ...base, eventVersion: "shortlisted" }));
  assert.match(key, /^wf:[a-f0-9]{64}$/);
});

test("missing identity inputs cannot create a shared empty key", () => {
  assert.equal(emailWorkflowEventKey({ templateCode: "notification" }), null);
  assert.equal(emailWorkflowEventKey({ userId: "user-1" }), null);
});

test("recipient normalization is case-insensitive and trims whitespace", () => {
  assert.equal(normalizeEmailAddress("  Member@Example.ORG "), "member@example.org");
});

test("verification delivery is guarded by Test Lab capture before any provider call", async () => {
  const source = await readFile(new URL("../../src/platform/email-verification.js", import.meta.url), "utf8");
  const capture = source.indexOf("if (captureMode && environment !== \"production\")");
  const resend = source.indexOf('fetch("https://api.resend.com/emails"');
  const webhook = source.indexOf("fetch(endpoint");
  assert.ok(capture >= 0);
  assert.ok(resend > capture);
  assert.ok(webhook > capture);
  assert.match(source, /TEST_DELIVERY_CAPTURE_REQUIRED/);
  assert.match(source, /Idempotency-Key/);
});

test("membership workflow mail uses the shared event-idempotent queue", async () => {
  const source = await readFile(new URL("../../src/membership/service.js", import.meta.url), "utf8");
  assert.match(source, /queueEmailNotification/);
  assert.doesNotMatch(source, /insert into notification_outbox\(channel,recipient,template_code,payload\)/i);
});
