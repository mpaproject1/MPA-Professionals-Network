import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = relative => readFile(new URL(relative, import.meta.url), "utf8");

test("email hardening migration creates the logical-event unique key and provider event ledger", async () => {
  const sql = await read("../../db/migrations/20261103190000_email_delivery_hardening.sql");
  assert.match(sql, /uq_notification_outbox_email_event_key/);
  assert.match(sql, /add column if not exists delivery_status/);
  assert.match(sql, /email_verification_token_delivery_status_check/);
  assert.match(sql, /\('pending','sent','failed','captured'\)/);
  assert.match(sql, /add column if not exists delivered_at/);
  assert.match(sql, /add column if not exists delivery_event_at/);
  assert.match(sql, /add column if not exists delivery_event_type/);
  assert.match(sql, /create table if not exists email_delivery_event/i);
  assert.match(sql, /unique\(provider,provider_event_id\)/i);
  assert.match(sql, /create table if not exists email_recipient_suppression/i);
  assert.match(sql, /create table if not exists email_template_version/i);
  const coverage = await read("../../db/migrations/20261103200000_email_workflow_template_coverage.sql");
  assert.match(coverage, /organization\.review_queue_item.*reviewer/s);
  assert.match(coverage, /organization\.review_update.*organization_representative/s);
  assert.match(coverage, /on conflict\(template_code\) do nothing/i);
  assert.match(coverage, /insert into email_template_version/i);
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

test("Test Lab capture applies the same recipient and template safeguards without external delivery", async () => {
  const source = await read("../../src/platform/email-operations.js");
  const dispatch = source.slice(source.indexOf("export async function dispatchEmailOutbox"));
  const captureStart = dispatch.indexOf('if(process.env.TEST_DELIVERY_MODE==="capture"');
  const captureEnd = dispatch.indexOf("if(!providerConfig().ready)", captureStart);
  const capture = dispatch.slice(captureStart, captureEnd);
  assert.match(capture, /for update of o skip locked/i);
  assert.match(capture, /recipientMatchesAudience/);
  assert.match(capture, /email_recipient_suppression/);
  assert.match(capture, /delivery_status='captured'/);
  assert.doesNotMatch(capture, /fetch\(/);
});

test("the migration rollback check is included in the repository compatibility script", async () => {
  const packageJson = JSON.parse(await read("../../package.json"));
  assert.match(packageJson.scripts["check:migrations:rollback"], /check-email-migration-compatibility\.js/);
  const checker = await read("../../scripts/check-email-migration-compatibility.js");
  assert.match(checker, /MIGRATION_CHECK_EXPECTED_DATABASE/);
  assert.match(checker, /MIGRATION_CHECK_ALLOW_ROLLBACK/);
  assert.match(checker, /rollback/);
});

test("template history is read-only and restores as a new audited version", async () => {
  const source = await read("../../src/platform/email-operations.js");
  assert.match(source, /listEmailTemplateVersions/);
  assert.match(source, /restoreEmailTemplateVersion/);
  assert.match(source, /email\.template\.version_restored/);
  assert.match(source, /restoredVersion:number,newVersion:nextVersion/);
  const routes = await read("../../server.js");
  assert.match(routes, /parts\[6\]==="versions"/);
  assert.match(routes, /parts\[8\]==="restore"/);
});

test("complaint holds cannot be manually released and retry requires a cleared hold", async () => {
  const source = await read("../../src/platform/email-operations.js");
  assert.match(source, /COMPLAINT_HOLD_LOCKED/);
  assert.match(source, /RECIPIENT_HOLD_ACTIVE/);
  assert.match(source, /delivery_status in \('failed','bounced'\)/);
});

test("verification email and retry paths honor active recipient holds", async () => {
  const verification = await read("../../src/platform/email-verification.js");
  assert.match(verification, /email_recipient_suppression/);
  assert.match(verification, /RECIPIENT_SUPPRESSED/);
  const operations = await read("../../src/platform/email-operations.js");
  assert.match(operations, /verification recipient is on an outbound email hold/);
});

test("transactional workflow email remains separate from optional email preference", async () => {
  const source = await read("../../src/platform/email-operations.js");
  assert.match(source, /optional=false/);
  assert.match(source, /optional&&!user\.email_enabled/);
});

test("provider callbacks arriving before outbox persistence are reconciled on later dispatch", async () => {
  const source = await read("../../src/platform/email-operations.js");
  assert.match(source, /reconcilePendingEmailDeliveryEvents/);
  assert.match(source, /processed_at is null/);
  assert.match(source, /email\.delivery_event\.reconciled/);
});

test("provider webhook accepts Resend payload field names and acknowledges non-delivery events", async () => {
  const source = await read("../../src/platform/email-operations.js");
  assert.match(source, /input\.data\?\.email_id/);
  assert.match(source, /input\.id,300/);
  assert.match(source, /rawEventType\.startsWith\("email\."/);
  assert.match(source, /delivery_delayed/);
});
