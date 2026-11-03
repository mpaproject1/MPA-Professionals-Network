import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";

const databaseUrl = process.env.EMAIL_TEST_DATABASE_URL || "";
const expectedDatabase = process.env.EMAIL_TEST_DATABASE_NAME || "";
let databaseName = "";
let enabled = false;
try {
  const parsed = new URL(databaseUrl);
  databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  enabled = Boolean(databaseUrl && expectedDatabase && databaseName === expectedDatabase && /test|disposable|ci/i.test(databaseName));
} catch {}
const skipReason = "Set EMAIL_TEST_DATABASE_URL and EMAIL_TEST_DATABASE_NAME to the same explicitly disposable database name containing test, disposable or ci.";
let db, getPoolRef, closePool, receiveDeliveryWebhook, receiveInboundEmail, dispatchEmailOutbox;
let prefix;
const outboxIds = [];
const eventIds = [];
const inboxIds = [];
const recipients = [];
const templateCodes = [];
const captureRecipients = [];
let originalFetch;

before(async () => {
  if (!enabled) return;
  process.env.DATABASE_URL = databaseUrl;
  process.env.NODE_ENV = "test";
  process.env.PUBLIC_APP_URL = "https://email-test.invalid";
  process.env.RESEND_API_KEY = "re_test_only_not_a_real_key";
  process.env.EMAIL_FROM = "qa@example.test";
  process.env.EMAIL_DELIVERY_EVENT_WEBHOOK_SECRET = "integration-test-delivery-secret";
  process.env.EMAIL_INBOUND_WEBHOOK_SECRET = "integration-test-inbound-secret";
  prefix = "email-it-" + randomUUID();
  ({ getPool: getPoolRef, closePool } = await import("../../src/platform/db.js"));
  db = getPoolRef();
  ({ receiveDeliveryWebhook, receiveInboundEmail, dispatchEmailOutbox } = await import("../../src/platform/email-operations.js"));
  const required = ["notification_outbox", "email_delivery_event", "email_recipient_suppression", "email_inbox_message", "email_notification_template", "test_delivery_capture"];
  const missing = (await db.query("select name from unnest($1::text[]) as required(name) where not exists(select 1 from information_schema.tables t where t.table_schema='public' and t.table_name=required.name)", [required])).rows.map(row => row.name);
  assert.deepEqual(missing, [], "Apply the repository migrations to the disposable integration database before running email integration tests.");
  originalFetch = globalThis.fetch;
});

after(async () => {
  if (!enabled || !db) return;
  if (originalFetch) globalThis.fetch = originalFetch;
  try {
    if (eventIds.length) await db.query("delete from email_delivery_event where provider_event_id=any($1::text[])", [eventIds]);
    if (outboxIds.length) await db.query("delete from notification_outbox where id=any($1::uuid[])", [outboxIds]);
    if (inboxIds.length) await db.query("delete from email_inbox_message where id=any($1::uuid[])", [inboxIds]);
    if (recipients.length) await db.query("delete from email_recipient_suppression where email_normalized=any($1::text[])", [recipients]);
    if (templateCodes.length) await db.query("delete from email_notification_template where template_code=any($1::text[])", [templateCodes]);
    if (captureRecipients.length) await db.query("delete from test_delivery_capture where recipient=any($1::text[])", [captureRecipients]);
    await db.query("delete from audit_log where metadata->>'providerEventId'=any($1::text[])", [eventIds]);
  } finally {
    await closePool();
  }
});

async function makeOutbox({ recipient = `${prefix}@example.test`, providerMessageId = null, templateCode = null, status = "pending" } = {}) {
  recipients.push(recipient.toLowerCase());
  const code = templateCode || `${prefix}.workflow`;
  if (!templateCodes.includes(code)) {
    templateCodes.push(code);
    await db.query(
      "insert into email_notification_template(template_code,display_name,audience,subject_template,text_template,html_template,enabled) values($1,$1,'all','Test {{status}}','Integration test {{status}}','<p>Integration test {{status}}</p>',true)",
      [code]
    );
  }
  const row = (await db.query(
    "insert into notification_outbox(channel,recipient,template_code,payload,status,delivery_status,provider_message_id,next_attempt_at,updated_at) values('email',$1,$2,$3,$4,$5,$6,now(),now()) returning id",
    [recipient, code, { status: "integration" }, status, status === "sent" ? "sent" : "queued", providerMessageId]
  )).rows[0];
  outboxIds.push(row.id);
  return row.id;
}

async function sendEvent({ providerMessageId, providerEventId, eventType }) {
  eventIds.push(providerEventId);
  return receiveDeliveryWebhook({
    provider: "email-integration-test",
    providerMessageId,
    eventId: providerEventId,
    eventType
  }, process.env.EMAIL_DELIVERY_EVENT_WEBHOOK_SECRET);
}

test("PostgreSQL provider-event ledger deduplicates concurrent/replayed event IDs", { skip: !enabled && skipReason }, async () => {
  const messageId = prefix + "-dedupe";
  const outboxId = await makeOutbox({ providerMessageId: messageId });
  const eventId = prefix + "-event-dedupe";
  const first = await sendEvent({ providerMessageId: messageId, providerEventId: eventId, eventType: "delivered" });
  const replay = await sendEvent({ providerMessageId: messageId, providerEventId: eventId, eventType: "delivered" });
  assert.equal(first.matched, true);
  assert.equal(replay.duplicate, true);
  const ledger = await db.query("select count(*)::int count from email_delivery_event where provider_event_id=$1", [eventId]);
  assert.equal(ledger.rows[0].count, 1);
  const outbox = await db.query("select delivery_status from notification_outbox where id=$1", [outboxId]);
  assert.equal(outbox.rows[0].delivery_status, "delivered");
});

test("provider event persistence failure rolls back ledger, delivery transition and suppression", { skip: !enabled && skipReason }, async () => {
  const messageId = prefix + "-rollback";
  const recipient = `${prefix}-rollback@example.test`;
  const outboxId = await makeOutbox({ recipient, providerMessageId: messageId });
  const eventId = prefix + "-event-rollback";
  const suffix = randomUUID().replace(/-/g, "");
  const fn = `email_it_fail_audit_${suffix}`;
  const trigger = `email_it_fail_audit_trigger_${suffix}`;
  await db.query(`create function public."${fn}"() returns trigger language plpgsql as $$ begin if new.action='email.delivery_event.received' then raise exception 'integration audit persistence failure'; end if; return new; end $$`);
  await db.query(`create trigger "${trigger}" before insert on public.audit_log for each row execute function public."${fn}"()`);
  try {
    await assert.rejects(sendEvent({ providerMessageId: messageId, providerEventId: eventId, eventType: "bounced" }), /integration audit persistence failure/);
    const ledger = await db.query("select count(*)::int count from email_delivery_event where provider_event_id=$1", [eventId]);
    const outbox = await db.query("select delivery_status from notification_outbox where id=$1", [outboxId]);
    const hold = await db.query("select count(*)::int count from email_recipient_suppression where email_normalized=$1 and cleared_at is null", [recipient]);
    assert.equal(ledger.rows[0].count, 0, "event insert must roll back with the failed audit write");
    assert.equal(outbox.rows[0].delivery_status, "queued", "outbox transition must roll back with the failed audit write");
    assert.equal(hold.rows[0].count, 0, "recipient suppression must roll back with the failed audit write");
  } finally {
    await db.query(`drop trigger if exists "${trigger}" on public.audit_log`);
    await db.query(`drop function if exists public."${fn}"()`);
  }
});

test("bounce then complaint replay is monotonic and complaint suppression cannot be downgraded", { skip: !enabled && skipReason }, async () => {
  const messageId = prefix + "-replay";
  const recipient = `${prefix}-replay@example.test`;
  const outboxId = await makeOutbox({ recipient, providerMessageId: messageId });
  await sendEvent({ providerMessageId: messageId, providerEventId: prefix + "-bounce", eventType: "bounced" });
  await sendEvent({ providerMessageId: messageId, providerEventId: prefix + "-complaint", eventType: "complained" });
  await sendEvent({ providerMessageId: messageId, providerEventId: prefix + "-late-bounce", eventType: "bounced" });
  const hold = await db.query("select reason from email_recipient_suppression where email_normalized=$1 and cleared_at is null", [recipient]);
  const outbox = await db.query("select delivery_status from notification_outbox where id=$1", [outboxId]);
  assert.equal(hold.rows[0]?.reason, "complaint");
  assert.equal(outbox.rows[0].delivery_status, "complained");
});

test("unmatched provider event is retained and reconciled after provider message ID becomes known", { skip: !enabled && skipReason }, async () => {
  const messageId = prefix + "-late-correlation";
  const eventId = prefix + "-event-late-correlation";
  const received = await sendEvent({ providerMessageId: messageId, providerEventId: eventId, eventType: "delivered" });
  assert.equal(received.matched, false);
  const pending = await db.query("select processed_at,outbox_id from email_delivery_event where provider_event_id=$1", [eventId]);
  assert.equal(pending.rows[0].processed_at, null);
  assert.equal(pending.rows[0].outbox_id, null);
  const outboxId = await makeOutbox({ providerMessageId: messageId, status: "sent" });
  // The shared CI workflow defaults to Test Lab capture. This test must exercise
  // the real event-reconciliation branch, not the capture-and-return branch.
  const previousDeliveryMode = process.env.TEST_DELIVERY_MODE;
  const previousTestLabEnabled = process.env.TEST_LAB_ENABLED;
  delete process.env.TEST_DELIVERY_MODE;
  process.env.TEST_LAB_ENABLED = "false";
  try {
    await dispatchEmailOutbox(null, { system: true, limit: 1 });
  } finally {
    if (previousDeliveryMode === undefined) delete process.env.TEST_DELIVERY_MODE;
    else process.env.TEST_DELIVERY_MODE = previousDeliveryMode;
    if (previousTestLabEnabled === undefined) delete process.env.TEST_LAB_ENABLED;
    else process.env.TEST_LAB_ENABLED = previousTestLabEnabled;
  }
  const reconciled = await db.query("select processed_at,outbox_id from email_delivery_event where provider_event_id=$1", [eventId]);
  const outbox = await db.query("select delivery_status from notification_outbox where id=$1", [outboxId]);
  assert.ok(reconciled.rows[0].processed_at);
  assert.equal(reconciled.rows[0].outbox_id, outboxId);
  assert.equal(outbox.rows[0].delivery_status, "delivered");
});

test("actual provider failure is retried and a later accepted attempt is persisted", { skip: !enabled && skipReason }, async () => {
  const outboxId = await makeOutbox();
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) return { ok: false, status: 503, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ id: prefix + "-provider-accepted" }) };
  };
  const first = await dispatchEmailOutbox(null, { system: true, onlyId: outboxId, limit: 1 });
  assert.equal(first.results[0].status, "pending");
  await db.query("update notification_outbox set next_attempt_at=now() where id=$1", [outboxId]);
  const second = await dispatchEmailOutbox(null, { system: true, onlyId: outboxId, limit: 1 });
  assert.equal(second.results[0].status, "sent");
  assert.equal(calls, 2);
  const row = await db.query("select status,delivery_status,attempts,provider_message_id from notification_outbox where id=$1", [outboxId]);
  assert.equal(row.rows[0].status, "sent");
  assert.equal(row.rows[0].delivery_status, "sent");
  assert.equal(row.rows[0].attempts, 2);
  assert.equal(row.rows[0].provider_message_id, prefix + "-provider-accepted");
});

test("active recipient suppression blocks real provider delivery", { skip: !enabled && skipReason }, async () => {
  const recipient = `${prefix}-suppressed@example.test`;
  const outboxId = await makeOutbox({ recipient });
  await db.query("insert into email_recipient_suppression(email_normalized,reason,source) values($1,'hard_bounce','integration-test')", [recipient]);
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error("provider must not be called for suppressed recipient"); };
  const result = await dispatchEmailOutbox(null, { system: true, onlyId: outboxId, limit: 1 });
  assert.equal(result.results[0].status, "suppressed");
  assert.equal(calls, 0);
  const row = await db.query("select delivery_status from notification_outbox where id=$1", [outboxId]);
  assert.equal(row.rows[0].delivery_status, "suppressed");
});

test("inbound provider message ID is idempotent under duplicate webhook delivery", { skip: !enabled && skipReason }, async () => {
  const messageId = prefix + "-inbound";
  const payload = { messageId, from: `${prefix}-sender@example.test`, to: ["support@example.test"], subject: "Integration inbound", text: "test body" };
  const first = await receiveInboundEmail(payload, process.env.EMAIL_INBOUND_WEBHOOK_SECRET);
  const replay = await receiveInboundEmail(payload, process.env.EMAIL_INBOUND_WEBHOOK_SECRET);
  assert.ok(first.id);
  assert.equal(replay.duplicate, true);
  inboxIds.push(first.id);
  const rows = await db.query("select count(*)::int count from email_inbox_message where provider_message_id=$1", [messageId]);
  assert.equal(rows.rows[0].count, 1);
});

test("Test Lab capture persists a capture and makes no external provider request", { skip: !enabled && skipReason }, async () => {
  const recipient = `${prefix}-capture@example.test`;
  const outboxId = await makeOutbox({ recipient });
  captureRecipients.push(recipient);
  process.env.TEST_LAB_ENABLED = "true";
  process.env.TEST_DELIVERY_MODE = "capture";
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error("Test Lab must not contact a provider"); };
  try {
    const result = await dispatchEmailOutbox(null, { system: true, onlyId: outboxId, limit: 1 });
    assert.equal(result.results[0].status, "captured");
    assert.equal(calls, 0);
    const row = await db.query("select status,delivery_status from notification_outbox where id=$1", [outboxId]);
    assert.equal(row.rows[0].status, "sent");
    assert.equal(row.rows[0].delivery_status, "captured");
    const capture = await db.query("select count(*)::int count from test_delivery_capture where recipient=$1 and event_code=$2", [recipient, `${prefix}.workflow`]);
    assert.equal(capture.rows[0].count, 1);
  } finally {
    delete process.env.TEST_LAB_ENABLED;
    delete process.env.TEST_DELIVERY_MODE;
  }
});
