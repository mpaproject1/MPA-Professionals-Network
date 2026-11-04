import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { emailAudienceMatches } from "../../src/platform/email-event-idempotency.js";

test("email template inventory resolves both branches of conditional producers", () => {
  const result = spawnSync(process.execPath, ["scripts/check-email-workflow-template-inventory.js"], {
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /professional\.workflow_update/);
  assert.match(result.stdout, /employer\.interview_response/);
  assert.match(result.stdout, /employer\.candidate_update/);
});

test("support_manager audience admits administrators and explicit support managers only", () => {
  assert.equal(emailAudienceMatches("support_manager", { isAdmin: true }), true);
  assert.equal(emailAudienceMatches("support_manager", { isSupportManager: true }), true);
  assert.equal(emailAudienceMatches("support_manager", { isSupportManager: false }), false);
  assert.equal(emailAudienceMatches("support_manager", { accountType: "professional" }), false);
});

test("support escalation recipient lookup and migration share the support-manager policy", async () => {
  const operations = await readFile("src/platform/email-operations.js", "utf8");
  const migration = await readFile("db/migrations/20261103230000_support_escalation_email_template.sql", "utf8");
  assert.match(operations, /is_support_manager/);
  assert.match(operations, /support\.inquiries\.manage/);
  assert.match(migration, /'support\.inquiry_escalated'/);
  assert.match(migration, /'support_manager'/);
});
