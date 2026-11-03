import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("workflow email enqueue checks template enablement and audience before outbox insert", async () => {
  const source = await read("../../src/platform/email-operations.js");
  const start = source.indexOf("export async function queueEmailNotification");
  const end = source.indexOf("export async function queueWorkflowEmail", start);
  assert.ok(start >= 0 && end > start);
  const enqueue = source.slice(start, end);
  assert.ok(enqueue.includes("select enabled,audience from email_notification_template"));
  assert.ok(enqueue.includes("template?.enabled===false"));
  assert.ok(enqueue.includes("recipientMatchesAudience(db,user.email,template.audience)"));
  assert.ok(enqueue.indexOf("recipientMatchesAudience") < enqueue.indexOf("insert into notification_outbox"));
  assert.ok(enqueue.includes("email.message.enqueue_audience_rejected"));
});

test("provider event receipt is atomic across event ledger, outbox, suppression and audit", async () => {
  const source = await read("../../src/platform/email-operations.js");
  const start = source.indexOf("export async function receiveDeliveryWebhook");
  const end = source.indexOf("// Server worker entry point", start);
  assert.ok(start >= 0 && end > start);
  const handler = source.slice(start, end);
  assert.ok(handler.includes("return withTransaction(async tx=>"));
  assert.ok(handler.includes("insert into email_delivery_event"));
  assert.ok(handler.includes("update notification_outbox"));
  assert.ok(handler.includes("insert into email_recipient_suppression"));
  assert.ok(handler.includes("email.delivery_event.received"));
  assert.ok(handler.includes("update email_delivery_event set outbox_id=$1,processed_at=now()"));
  assert.ok(!handler.includes("getPool().query"));
});
