import assert from "node:assert/strict";
import test, { after } from "node:test";
import { closePool, getPool, withTransaction } from "../../src/platform/db.js";
import { consumeHumanChallenge, issueHumanChallenge, verifyHumanChallenge } from "../../src/platform/security-controls.js";

const databaseAvailable = Boolean(process.env.DATABASE_URL);

function answerFor(question) {
  const match = String(question).match(/(\d+)\s*([+−])\s*(\d+)/);
  assert.ok(match, `Unexpected human challenge question: ${question}`);
  const left = Number(match[1]);
  const right = Number(match[3]);
  return match[2] === "+" ? left + right : left - right;
}

async function withChallenge(work) {
  const challenge = await issueHumanChallenge();
  try {
    return await work(challenge);
  } finally {
    await getPool().query("delete from security_human_challenge where id=$1", [challenge.id]);
  }
}

after(async () => {
  if (databaseAvailable) await closePool();
});

test("database-backed challenge issuance returns a five-minute registration challenge", { skip: !databaseAvailable }, async () => {
  await withChallenge(async challenge => {
    assert.ok(challenge.id);
    assert.match(challenge.question, /^Confirm you are human:/);
    assert.ok(new Date(challenge.expiresAt).getTime() > Date.now());
    assert.ok(new Date(challenge.expiresAt).getTime() <= Date.now() + 5 * 60_000 + 5000);
  });
});

test("database-backed challenge accepts the correct answer and issues a single-use token", { skip: !databaseAvailable }, async () => {
  await withChallenge(async challenge => {
    const proof = await verifyHumanChallenge(challenge.id, String(answerFor(challenge.question)));
    assert.equal(typeof proof.token, "string");
    assert.equal(proof.expiresInSeconds, 300);
    await withTransaction(db => consumeHumanChallenge(db, proof.token));
    await assert.rejects(
      withTransaction(db => consumeHumanChallenge(db, proof.token)),
      error => error.code === "CHALLENGE_INVALID"
    );
  });
});

test("database-backed challenge rejects an incorrect answer and enforces ten attempts", { skip: !databaseAvailable }, async () => {
  await withChallenge(async challenge => {
    const wrongAnswer = String(answerFor(challenge.question) + 1);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await assert.rejects(
        verifyHumanChallenge(challenge.id, wrongAnswer),
        error => error.code === "CHALLENGE_INCORRECT"
      );
    }
    await assert.rejects(
      verifyHumanChallenge(challenge.id, wrongAnswer),
      error => error.code === "CHALLENGE_ATTEMPTS_EXCEEDED"
    );
  });
});

test("database-backed expired challenges cannot issue a proof token", { skip: !databaseAvailable }, async () => {
  await withChallenge(async challenge => {
    await getPool().query("update security_human_challenge set expires_at=now()-interval '1 second' where id=$1", [challenge.id]);
    await assert.rejects(
      verifyHumanChallenge(challenge.id, String(answerFor(challenge.question))),
      error => error.code === "CHALLENGE_INVALID"
    );
  });
});

test("registration proof consumption rejects a missing token", { skip: !databaseAvailable }, async () => {
  await assert.rejects(
    withTransaction(db => consumeHumanChallenge(db, null)),
    error => error.code === "CHALLENGE_REQUIRED"
  );
});
