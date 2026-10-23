import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const serverSource = await readFile(new URL("../../server.js", import.meta.url), "utf8");

test("API route declarations do not contain exact duplicate handlers", () => {
  const routes = serverSource.split("\n")
    .map(line => line.trim())
    .filter(line => line.startsWith("if(req.method===") && line.includes("return ok(res,"));
  const seen = new Map();
  const duplicates = [];
  for (const route of routes) {
    const normalized = route.replace(/\s+/g, " ");
    if (seen.has(normalized)) duplicates.push({ route: normalized, firstLine: seen.get(normalized) });
    else seen.set(normalized, serverSource.slice(0, serverSource.indexOf(route)).split("\n").length);
  }
  assert.deepEqual(duplicates, [], "duplicate route handlers can shadow intended request behavior");
});

test("idempotent create routes forward the client submission key to the service layer", () => {
  const requiredRoutes = [
    ["publicOpportunity.createPublicInquiry", "req.headers[\"x-idempotency-key\"]"],
    ["marketplaceDemand.createDemand", "req.headers[\"x-idempotency-key\"]"],
    ["servicesMentorship.createServiceListing", "req.headers[\"x-idempotency-key\"]"],
    ["servicesMentorship.requestService", "req.headers[\"x-idempotency-key\"]"],
    ["servicesMentorship.createMentorshipRequest", "req.headers[\"x-idempotency-key\"]"],
    ["talent.createTalentInquiry", "req.headers[\"x-idempotency-key\"]"]
  ];
  for (const [handler, keyHeader] of requiredRoutes) {
    const line = serverSource.split("\n").find(value => value.includes(handler));
    assert.ok(line, `missing route for ${handler}`);
    assert.ok(line.includes(keyHeader), `${handler} must receive the idempotency key`);
  }
});
