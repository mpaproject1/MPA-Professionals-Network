import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("human challenge database constraint supports the documented ten-attempt limit", () => {
  const migration = read("../../db/migrations/20261031100000_human_challenge_ten_attempt_limit.sql");
  const policy = read("../../src/platform/security-controls.js");
  const initial = read("../../db/migrations/20261015130000_authentication_security_controls.sql");
  assert.match(initial, /failed_attempts integer not null default 0 check \(failed_attempts between 0 and 5\)/);
  assert.match(migration, /drop constraint if exists security_human_challenge_failed_attempts_check/);
  assert.match(migration, /add constraint security_human_challenge_failed_attempts_check check \(failed_attempts between 0 and 10\)/);
  assert.match(policy, /failed_attempts >= 10/);
  assert.match(policy, /least\(failed_attempts\+1,10\)/);
});
