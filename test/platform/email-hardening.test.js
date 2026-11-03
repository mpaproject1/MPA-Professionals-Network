import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = relative => readFile(new URL(relative, import.meta.url), "utf8");

test("email hardening migration creates the logical-event unique key and provider event ledger", async () => {
  const sql = await read("../../db/migrations/20261103190000_email_delivery_hardening.sql");
  assert.match(sql, /uq_notification_outbox_email_event_key/);
  assert.match(sql, /create table if not exists email_delivery_event/i);
  assert.match(sql, /unique\(provider,provider_event_id\)/i);
  assert.match(sql, /create table if not exists email_recipient_suppression/i);
  assert.match(sql, /create table if not exists email_template_version/i);
});

test("workflow email enqueue is idempotent and checks recipient holds", async () => {
  const source = await read("../../src/platform/email-operations.js");
  assert.match(source, /emailWorkflowEventKey/);
  assert.match(source, /on conflict\(email_event_key\).*do nothing/i);
  assert.match(source, /email_recipient_suppression/);
  assert.match(source, /recipientMatchesAudience/);
});

test("delivery events require provider event IDs and persist an immutable event ledger", async () => {
  const source = await read("../../src/platform/email-operations.js");
  assert.match(source, /PROVIDER_EVENT_ID_REQUIRED/);
  assert.match(source, /insert into email_delivery_event/);
  assert.match(source, /on conflict\(provider,provider_event_id\) do nothing/);
  assert.match(source, /eventType==="bounced"\|\|eventType==="complained"/);
});

test("inbound email rejects missing provider IDs instead of creating random duplicate records", async () => {
  const source = await read("../../src/platform/email-operations.js");
  assert.match(source, /PROVIDER_MESSAGE_ID_REQUIRED/);
  assert.doesNotMatch(source, /clean\(input\.messageId\|\|input\.id,300\)\|\|randomUUID\(\)/);
});

test("system-managed templates cannot be edited and template revisions are retained", async () => {
  const source = await read("../../src/platform/email-operations.js");
  assert.match(source, /TEMPLATE_LOCKED/);
  assert.match(source, /insert into email_template_version/);
  assert.match(source, /version_number/);
});

test("provider-accepted, failed, inbox and recipient-hold changes are audited", async () => {
  const source = await read("../../src/platform/email-operations.js");
  assert.match(source, /email\.message\.provider_accepted/);
  assert.match(source, /email\.message\.delivery_attempt_failed/);
  assert.match(source, /email\.inbox\./);
  assert.match(source, /email\.recipient_hold\.released/);
});

test("recipient-hold management is exposed only through authenticated system-admin routes", async () => {
  const source = await read("../../server.js");
  assert.match(source, /api\/v1\/admin\/email\/recipient-holds/);
  assert.match(source, /anyRole\(identity,\["system_admin"\]\)/);
});
