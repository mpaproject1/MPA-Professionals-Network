import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../../src/platform/config.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("human verification defaults on in production and off in development", () => {
  assert.equal(loadConfig({ NODE_ENV: "production", JWT_SECRET: "x".repeat(32) }).humanChallengeRequired, true);
  assert.equal(loadConfig({ NODE_ENV: "development" }).humanChallengeRequired, false);
});

test("explicit true and false values override the environment default", () => {
  assert.equal(loadConfig({ NODE_ENV: "development", HUMAN_CHALLENGE_REQUIRED: "true" }).humanChallengeRequired, true);
  assert.equal(loadConfig({ NODE_ENV: "production", JWT_SECRET: "x".repeat(32), HUMAN_CHALLENGE_REQUIRED: "false" }).humanChallengeRequired, false);
  assert.throws(() => loadConfig({ NODE_ENV: "test", HUMAN_CHALLENGE_REQUIRED: "sometimes" }), /must be true or false/);
});

test("challenge verification permits ten wrong answers and rejects the next attempt", async () => {
  const source = await readFile(path.join(root, "src/platform/security-controls.js"), "utf8");
  assert.match(source, /row\.failed_attempts >= 10/);
  assert.match(source, /least\(failed_attempts\+1,10\)/);
  assert.match(source, /CHALLENGE_ATTEMPTS_EXCEEDED/);
  assert.match(source, /for update/i);
});

test("registration consumes a challenge only when the server-side policy requires it", async () => {
  const source = await readFile(path.join(root, "src/membership/service.js"), "utf8");
  assert.match(source, /const humanChallengeRequired=loadConfig\(\)\.humanChallengeRequired/);
  assert.match(source, /if\(humanChallengeRequired\) await consumeHumanChallenge\(db,input\.humanCheckToken\)/);
  assert.doesNotMatch(source, /if\(humanChallengeRequired \|\| input\.humanCheckToken\)/);
});

test("challenge issuance exposes the server-side policy and allows ten manual refreshes", async () => {
  const [server, envExample] = await Promise.all([
    readFile(path.join(root, "server.js"), "utf8"),
    readFile(path.join(root, ".env.example"), "utf8")
  ]);
  assert.match(server, /config\.humanChallengeRequired\?\{required:true,\.\.\.await issueHumanChallenge\(\)\}:\{required:false\}/);
  assert.match(server, /"human-challenge",20,60000/);
  assert.match(envExample, /^HUMAN_CHALLENGE_REQUIRED=true$/m);
  assert.match(envExample, /Set true to require.*set false to explicitly disable/s);
});

test("human-check tokens remain hashed, short-lived and single-use", async () => {
  const source = await readFile(path.join(root, "src/platform/security-controls.js"), "utf8");
  assert.match(source, /token_hash=\$1,verified_at=now\(\),expires_at=now\(\)\+interval '5 minutes'/);
  assert.match(source, /token_hash=\$1 and purpose='registration'.*consumed_at is null and expires_at>now\(\)/s);
  assert.match(source, /sha256\(rawToken\)/);
});
