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


test("operation feedback explains loading, respects reduced motion, and locks pending actions", async () => {
  const [component, styles, tracker, feedback] = await Promise.all([
    source("../../web/components/operation-status.tsx"),
    source("../../web/app/globals.css"),
    source("../../web/app/track/page.tsx"),
    source("../../web/components/form-feedback.tsx"),
  ]);
  assert.match(component, /aria-busy=\{state === "loading" \? true : undefined\}/);
  assert.match(component, /title: string/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
  assert.match(styles, /button:disabled/);
  assert.match(tracker, /Checking for the latest updates/);
  assert.match(tracker, /Loading your application progress/);
  assert.match(feedback, /disabled=\{busy\}/);
});

test("completed public inquiries provide a clear next task", async () => {
  const [job, mentorship] = await Promise.all([
    source("../../web/app/apply/job/page.tsx"),
    source("../../web/app/apply/mentorship/page.tsx"),
  ]);
  for (const page of [job, mentorship]) {
    assert.match(page, /Start another inquiry/);
    assert.match(page, /aria-busy=\{submitting\}/);
    assert.match(page, /Sending your inquiry securely/);
    assert.match(page, /busy=\{submitting\}/);
  }
});


test("public inquiry retries reuse a stable key and cannot create a second record", async () => {
  const [service, server, migration, job, mentorship] = await Promise.all([
    source("../../src/platform/public-opportunity.js"),
    source("../../server.js"),
    source("../../db/migrations/20261023100000_public_inquiry_idempotency.sql"),
    source("../../web/app/apply/job/page.tsx"),
    source("../../web/app/apply/mentorship/page.tsx"),
  ]);
  assert.match(server, /X-Idempotency-Key/);
  assert.match(server, /req\.headers\["x-idempotency-key"\]/);
  assert.match(service, /idempotency_request_hash/);
  assert.match(service, /on conflict \(continuation_token_hash\) do nothing returning/);
  assert.match(service, /IDEMPOTENCY_KEY_CONFLICT/);
  assert.match(service, /replayed:true/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS idempotency_request_hash/);
  for (const page of [job, mentorship]) {
    assert.match(page, /createSubmissionKey/);
    assert.match(page, /X-Idempotency-Key/);
    assert.match(page, /const key=idempotencyKey\|\|createSubmissionKey\(\)/);
    assert.match(page, /setIdempotencyKey\(""\);setForm/);
  }
});

test("completed inquiry screens show current status and avoid reopening closed records", async () => {
  const [service, job, mentorship, details] = await Promise.all([
    source("../../src/platform/public-opportunity.js"),
    source("../../web/app/apply/job/page.tsx"),
    source("../../web/app/apply/mentorship/page.tsx"),
    source("../../web/app/apply/opportunity/page.tsx"),
  ]);
  assert.match(service, /function inquiryNextStep\(status\)/);
  assert.match(service, /inquiryNextStep\(inserted\.status\)/);
  for (const page of [job, mentorship]) {
    assert.match(page, /humanStatus\(result\.status\|\|"received"\)/);
    assert.match(page, /!\["converted","declined","closed"\]\.includes\(result\.status\)/);
    assert.match(page, /Start another inquiry/);
  }
  assert.match(details, /Current status: \$\{humanStatus\(r\.status\|\|data\.status\)\}/);
  assert.match(details, /if\(submitting\)return/);
});

test("shared loading states and report controls explain pending work without blocking unrelated tasks", async () => {
  const [dashboard, organizations, admin, reports, membership, status, styles] = await Promise.all([
    source("../../web/app/dashboard/page.tsx"),
    source("../../web/app/organizations/page.tsx"),
    source("../../web/app/admin/page.tsx"),
    source("../../web/app/admin/reports/page.tsx"),
    source("../../web/app/membership/workspace.tsx"),
    source("../../web/components/operation-status.tsx"),
    source("../../web/app/globals.css"),
  ]);
  assert.match(dashboard, /title="Loading your dashboard"/);
  assert.match(organizations, /Check latest organizations/);
  assert.match(admin, /Preparing the administrator workspace/);
  assert.match(reports, /setViewBusy/);
  assert.match(reports, /setReportBusy/);
  assert.match(reports, /disabled=\{viewBusy\|\|!viewName\.trim\(\)\|\|!current\}/);
  assert.match(reports, /disabled=\{reportBusy\}/);
  assert.match(membership, /Loading your saved applications/);
  assert.match(status, /aria-busy/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
});
