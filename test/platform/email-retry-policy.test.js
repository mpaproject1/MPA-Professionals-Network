import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { classifyEmailDeliveryError, emailIdempotencyKey, emailRetryDelaySeconds } from "../../src/platform/email-retry-policy.js";

test("retries only transient HTTP delivery responses", () => {
  assert.equal(classifyEmailDeliveryError({ code: "RESEND_HTTP_408" }).retryable, true);
  assert.equal(classifyEmailDeliveryError({ code: "RESEND_HTTP_429" }).retryable, true);
  assert.equal(classifyEmailDeliveryError({ code: "DELIVERY_HTTP_503" }).retryable, true);
  assert.equal(classifyEmailDeliveryError({ code: "RESEND_HTTP_400" }).retryable, false);
  assert.equal(classifyEmailDeliveryError({ code: "RESEND_HTTP_401" }).retryable, false);
  assert.equal(classifyEmailDeliveryError({ code: "RESEND_HTTP_599" }).retryable, true);
});

test("configuration and unknown business failures fail fast", () => {
  assert.equal(classifyEmailDeliveryError({ code: "EMAIL_DELIVERY_NOT_CONFIGURED" }).retryable, false);
  assert.equal(classifyEmailDeliveryError({ code: "VALIDATION_ERROR" }).retryable, false);
  assert.equal(classifyEmailDeliveryError(new Error("unexpected business error")).retryable, false);
});

test("retries explicit network and timeout failures", () => {
  assert.equal(classifyEmailDeliveryError({ code: "DELIVERY_FAILED", cause: { code: "ECONNRESET" } }).retryable, true);
  assert.equal(classifyEmailDeliveryError({ name: "TimeoutError", message: "request timed out" }).retryable, true);
});

test("the same outbox id yields the same provider idempotency key across retries", () => {
  const first = emailIdempotencyKey("outbox-123");
  const second = emailIdempotencyKey("outbox-123");
  assert.equal(first, "mpa-email-outbox-123");
  assert.equal(second, first);
  assert.equal(emailIdempotencyKey(""), null);
  assert.ok(emailIdempotencyKey("x".repeat(150)).length <= 130);
});

test("outbox dispatch sends the stable key to both supported delivery providers", async () => {
  const source = await readFile(new URL("../../src/platform/email-operations.js", import.meta.url), "utf8");
  assert.ok(source.includes("idempotencyKey:row.id"));
  assert.ok(source.includes('"Idempotency-Key":stableIdempotencyKey'));
  assert.ok(source.includes("idempotencyKey:stableIdempotencyKey||undefined"));
});

test("retry delays grow exponentially and cap at one hour", () => {
  assert.equal(emailRetryDelaySeconds(1), 60);
  assert.equal(emailRetryDelaySeconds(2), 120);
  assert.equal(emailRetryDelaySeconds(7), 3600);
  assert.equal(emailRetryDelaySeconds(12), 3600);
});
