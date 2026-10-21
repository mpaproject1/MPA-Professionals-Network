import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("first-visit install nudge is delayed and remembered without forcing installation", async () => {
  const shell = await read("../../web/components/shell.tsx");
  assert.match(shell, /mpa-install-prompt-seen-v1/);
  assert.match(shell, /setTimeout\([\s\S]*?10000\)/);
  assert.match(shell, /CheckCircle2/);
  assert.match(shell, /showInstallNudge/);
  assert.match(shell, /Not now/);
  assert.match(shell, /Install help/);
  assert.doesNotMatch(shell, /prompt\(\);\s*[^}]*setInstalled\(true\)/);
});

test("public organization directory and profile API routes are disabled", async () => {
  const server = await read("../../server.js");
  const page = await read("../../web/app/organizations/directory/page.tsx");
  const profilePage = await read("../../web/app/organizations/directory/[id]/page.tsx");
  assert.doesNotMatch(server, /api\/v1\/public\/organizations/);
  assert.doesNotMatch(server, /getPublicOrganizationProfile\(parts\[4\]\)/);
  assert.doesNotMatch(server, /api\/v1\/public\/opportunity-sharing-organizations/);
  assert.match(page, /redirect\("\/services"\)/);
  assert.match(profilePage, /redirect\("\/services"\)/);
});

test("discovery clients request bounded pages while retaining existing visibility-aware APIs", async () => {
  const network = await read("../../web/app/network/page.tsx");
  const jobs = await read("../../web/app/jobs/page.tsx");
  const services = await read("../../web/app/services/page.tsx");
  const mentorship = await read("../../web/app/mentorship/page.tsx");
  for (const source of [network, jobs, services, mentorship]) {
    assert.match(source, /DiscoveryPagination/);
    assert.match(source, /limit/);
    assert.match(source, /offset/);
  }
  assert.match(network, /\/api\/v1\/talent/);
  assert.match(jobs, /\/api\/v1\/jobs/);
  assert.match(services, /\/api\/v1\/services/);
  assert.match(mentorship, /\/api\/v1\/mentors/);
});
