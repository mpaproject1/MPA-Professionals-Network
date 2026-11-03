import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("members workspace is a server-state-driven progress journey, not a card catalogue", async () => {
  const page = await read("../../web/app/members/page.tsx");
  assert.match(page, /api<Me>\("\/api\/v1\/me"/);
  assert.match(page, /api<Application\[]>\("\/api\/v1\/membership\/applications\/me"/);
  assert.match(page, /api<MembershipHistory>\("\/api\/v1\/membership\/history"/);
  assert.match(page, /api<Tracking>\("\/api\/v1\/me\/progress\?limit=5/);
  assert.match(page, /Continue where you left off/);
  assert.match(page, /Membership progress/);
  assert.match(page, /aria-label="Membership progress steps"/);
  assert.match(page, /completion_percent/);
  assert.doesNotMatch(page, /localStorage.*progress|setProgress\(/);
});

test("membership journey does not conflate payment, review, and activation", async () => {
  const page = await read("../../web/app/members/page.tsx");
  assert.match(page, /payment and application approval remain separate decisions/);
  assert.match(page, /A submitted receipt is not proof of verification/);
  assert.match(page, /Payment status does not itself approve or activate membership/);
  assert.match(page, /has_active_membership === true/);
  assert.match(page, /rejectedApplication/);
  assert.match(page, /correctionApplication/);
  assert.match(page, /membershipExpired/);
  assert.match(page, /has_active_membership === true/);
});

test("members workspace preserves honest unavailable states and only exposes current-user data", async () => {
  const page = await read("../../web/app/members/page.tsx");
  assert.match(page, /Missing data is not treated as completed progress/);
  assert.match(page, /applicationDataUnavailable/);
  assert.match(page, /Confirm your membership status/);
  assert.match(page, /Recent activity could not be loaded/);
  assert.match(page, /Recent notifications could not be loaded/);
  assert.match(page, /api<Me>\("\/api\/v1\/me"/);
  assert.match(page, /api<Inbox>\("\/api\/v1\/notifications\?limit=5"/);
  assert.match(page, /role="alert"/);
  assert.match(page, /aria-label="Your workspace shortcuts"/);
  assert.match(page, /focus-visible:outline/);
  assert.match(page, /safeInternalHref/);
  assert.match(page, /requestSequence/);
});

test("legacy /member route redirects to the canonical /members workspace", async () => {
  const legacy = await read("../../web/app/member/page.tsx");
  assert.match(legacy, /redirect\("\/members"\)/);
});
