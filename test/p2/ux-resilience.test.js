import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("private demand draft persistence is opt-in, tab-scoped, expiring and cleared after success", async () => {
  const source = await read("../../web/app/service-demand/page.tsx");
  assert.match(source, /mpa-service-demand-draft-v1/);
  assert.match(source, /keepDraft/);
  assert.match(source, /expiresAt>Date\.now\(\)/);
  assert.match(source, /24\*60\*60\*1000/);
  assert.match(source, /setKeepDraft\(false\)/);
  assert.match(source, /created\.tracking_reference\|\|created\.id/);
  assert.match(source, /do not enable this on a shared device/);
});

test("membership payment retry reuses a persisted idempotency key and official application reference", async () => {
  const page = await read("../../web/app/membership/workspace.tsx");
  const service = await read("../../src/membership/service.js");
  assert.match(page, /mpa-membership-payment-key:/);
  assert.match(page, /idempotencyKey/);
  assert.match(page, /created\.tracking_reference/);
  assert.match(service, /idempotencyKey is required/);
  assert.match(service, /where pt\.idempotency_key=\$1/);
});

test("service request duplicate feedback uses the existing backend deduplication result", async () => {
  const page = await read("../../web/app/services/page.tsx");
  const service = await read("../../src/services-mentorship/service.js");
  assert.match(page, /claimAction\(lock\)/);
  assert.match(page, /created\.idempotent/);
  assert.match(page, /reference=\{noticeReference\|\|undefined\}/);
  assert.match(service, /if\(duplicate\) return \{\.\.\.duplicate,idempotent:true/);
});

test("role journey browser suite uses real routes and is deferred until final-stage credentials are configured", async () => {
  const suite = await read("../../e2e/p2-role-journeys.spec.js");
  assert.match(suite, /MPA_E2E_ROLE_JOURNEYS === "1"/);
  assert.match(suite, /page\.goto\(path\)/);
  assert.match(suite, /api\/v1\/review\/membership\/applications/);
  assert.doesNotMatch(suite, /page\.route\(/);
});
