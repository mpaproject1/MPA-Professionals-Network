import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { decryptVerificationToken, encryptVerificationToken } from "../../src/platform/email-verification-crypto.js";
import { verifyResendWebhookSignature } from "../../src/platform/email-operations.js";

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
  assert.match(source, /email\.message\.enqueue_template_missing/);
  assert.match(source, /template_code!==\"admin.manual\"/);
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

test("verification delivery encryption round-trips tokens and rejects tampering", () => {
  const prior = process.env.EMAIL_VERIFICATION_ENCRYPTION_KEY;
  process.env.EMAIL_VERIFICATION_ENCRYPTION_KEY = "test-only-verification-encryption-key-32-bytes";
  try {
    const token = "opaque-single-use-verification-token-value";
    const encrypted = encryptVerificationToken(token);
    assert.notEqual(encrypted.encryptedToken, Buffer.from(token).toString("base64url"));
    assert.equal(decryptVerificationToken({
      encrypted_token: encrypted.encryptedToken,
      encryption_iv: encrypted.encryptionIv,
      encryption_tag: encrypted.encryptionTag
    }), token);
    assert.throws(() => decryptVerificationToken({
      encrypted_token: encrypted.encryptedToken.slice(0, -2) + "AA",
      encryption_iv: encrypted.encryptionIv,
      encryption_tag: encrypted.encryptionTag
    }));
  } finally {
    if (prior === undefined) delete process.env.EMAIL_VERIFICATION_ENCRYPTION_KEY;
    else process.env.EMAIL_VERIFICATION_ENCRYPTION_KEY = prior;
  }
});

test("verification delivery is durably encrypted, retried through shared transport and provider-event correlated", async () => {
  const migration = await read("../../db/migrations/20261103210000_email_verification_delivery_recovery.sql");
  assert.match(migration, /create table if not exists email_verification_delivery/i);
  assert.match(migration, /encrypted_token/);
  assert.match(migration, /verification_delivery_id/);
  const verification = await read("../../src/platform/email-verification.js");
  assert.match(verification, /insert into email_verification_delivery/);
  assert.match(verification, /dispatchPendingVerificationEmails/);
  assert.match(verification, /for update of d skip locked/i);
  assert.match(verification, /decryptVerificationToken/);
  assert.match(verification, /email\.verification\.delivery_failed/);
  assert.match(verification, /email\.verification\.provider_accepted/);
  assert.match(verification, /sendEmailMessage/);
  assert.match(verification, /attempts<8/);
  const operations = await read("../../src/platform/email-operations.js");
  assert.match(operations, /export async function sendEmailMessage/);
  assert.match(operations, /retryVerificationDelivery/);
  assert.match(operations, /verification_delivery_id/);
  assert.match(operations, /email\.verification\.provider_delivery_event/);
});

test("Resend webhook signature validation binds raw bytes, timestamp and message ID", () => {
  const raw = Buffer.from(JSON.stringify({ type: "email.delivered", data: { email_id: "provider-message-1" } }));
  const signingKey = Buffer.from("test-resend-webhook-signing-key-32-bytes");
  const secret = "whsec_" + signingKey.toString("base64");
  const headers = { "svix-id": "evt_test_1", "svix-timestamp": String(Math.floor(Date.now() / 1000)) };
  const signature = createHmac("sha256", signingKey)
    .update(headers["svix-id"] + "." + headers["svix-timestamp"] + ".")
    .update(raw).digest("base64");
  headers["svix-signature"] = "v1," + signature;
  assert.equal(verifyResendWebhookSignature(raw, headers, secret), true);
  assert.equal(verifyResendWebhookSignature(Buffer.from(raw.toString() + " "), headers, secret), false);
  assert.equal(verifyResendWebhookSignature(raw, { ...headers, "svix-timestamp": "1" }, secret), false);
  assert.equal(verifyResendWebhookSignature(raw, headers, "wrong-secret"), false);
});

test("all audited workflow producers have explicit template audience migrations", async () => {
  const sql = await read("../../db/migrations/20261103220000_email_workflow_template_complete.sql");
  for (const code of [
    "professional.workflow_update", "employer.candidate_update",
    "employer.offer_approval_required", "employer.interview_scheduled",
    "employer.interview_response", "mentor.mentorship_update",
    "organization.membership_added", "organization.membership_updated"
  ]) assert.ok(sql.includes(code), "missing template seed: " + code);
  assert.match(sql, /set audience=e\.audience/);
  const checker = await read("../../scripts/check-email-migration-compatibility.js");
  assert.match(checker, /20261103220000_email_workflow_template_complete\.sql/);
  assert.match(checker, /invalidWorkflowAudiences/);
});

test("retry classification distinguishes transient provider failures from permanent failures", async () => {
  const { classifyEmailDeliveryError, emailRetryDelaySeconds } = await import("../../src/platform/email-retry-policy.js");
  assert.equal(classifyEmailDeliveryError({ code: "RESEND_HTTP_429" }).retryable, true);
  assert.equal(classifyEmailDeliveryError({ code: "RESEND_HTTP_503" }).retryable, true);
  assert.equal(classifyEmailDeliveryError({ code: "RESEND_HTTP_400" }).retryable, false);
  assert.equal(classifyEmailDeliveryError({ code: "VERIFICATION_TEMPLATE_POLICY_VIOLATION" }).retryable, false);
  assert.ok(emailRetryDelaySeconds(4) > emailRetryDelaySeconds(2));
  assert.ok(emailRetryDelaySeconds(100) <= 3600);
});
