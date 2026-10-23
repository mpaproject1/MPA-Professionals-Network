import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("dashboard routes application attention to the matching workspace", async () => {
  const page = await source("../../web/app/dashboard/page.tsx");
  assert.match(page, /function trackingHref\(type:string\)/);
  assert.match(page, /if\(type==="membership"\)return "\/membership"/);
  assert.match(page, /if\(type==="organization"\)return "\/organizations"/);
  assert.match(page, /if\(type==="job"\)return "\/track"/);
  assert.match(page, /href=\{trackingHref\(item\.type\)\}/);
});

test("dashboard and tracker use the shared human-readable status vocabulary", async () => {
  const [dashboard, tracker, labels] = await Promise.all([
    source("../../web/app/dashboard/page.tsx"),
    source("../../web/app/track/page.tsx"),
    source("../../web/lib/status-labels.ts"),
  ]);
  assert.match(dashboard, /import \{ humanStatus \} from "\.\.\/\.\.\/lib\/status-labels"/);
  assert.match(tracker, /import \{ humanStatus \} from "\.\.\/\.\.\/lib\/status-labels"/);
  assert.match(dashboard, /humanStatus\(item\.status\)/);
  assert.match(tracker, /humanStatus\(item\.status\)/);
  assert.match(labels, /Awaiting review/);
  assert.match(labels, /Changes requested/);
  assert.match(labels, /In progress/);
});

test("public job and mentorship inquiries keep entered values and offer safe retry feedback", async () => {
  const [job, mentorship] = await Promise.all([
    source("../../web/app/apply/job/page.tsx"),
    source("../../web/app/apply/mentorship/page.tsx"),
  ]);
  for (const page of [job, mentorship]) {
    assert.match(page, /const \[submitting,setSubmitting\]=useState\(false\)/);
    assert.match(page, /if\(submitting\)return/);
    assert.match(page, /onRetry=\{\(\)=>void submit\(\)\}/);
    assert.match(page, /reference=\{errorReference\|\|undefined\}/);
    assert.match(page, /Your entries have been kept on this page/);
  }
  assert.match(mentorship, /onRetry=\{\(\)=>void loadMentors\(\)\}/);
});

test("job application draft UX restores and updates an existing draft", async () => {
  const [page, service] = await Promise.all([
    source("../../web/app/jobs/page.tsx"),
    source("../../src/organization-jobs/service.js"),
  ]);
  assert.match(page, /\/api\/v1\/me\/job-applications/);
  assert.match(page, /saveFormalApplicationDraft/);
  assert.match(page, /Save draft changes/);
  assert.match(service, /existing\?\.status==="draft"[\s\S]*?update job_application set cover_letter/);
});
