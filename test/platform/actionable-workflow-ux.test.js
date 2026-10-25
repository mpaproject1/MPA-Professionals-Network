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

test("admin overview, support and security loaders stay stable and distinguish unavailable data", async () => {
  const [admin, support, security] = await Promise.all([
    source("../../web/app/admin/page.tsx"),
    source("../../web/app/admin/support/page.tsx"),
    source("../../web/app/admin/security/page.tsx"),
  ]);
  assert.ok(admin.includes("const load = useCallback(async () => {"));
  assert.ok(admin.includes("}, [token, userQuery, userStatus]);"));
  assert.ok(admin.includes("}, [hydrated, token, load]);"));
  assert.ok(admin.includes('sectionErrors.includes("users") ? "Unavailable"'));
  assert.ok(admin.includes('sectionErrors.includes("opportunity inquiries") ? "Unavailable"'));
  assert.ok(admin.includes('onClick={() => void load()} disabled={loading}'));
  assert.ok(admin.includes('role="alert"'));
  assert.ok(support.includes("const refresh=useCallback(async()=>"));
  assert.ok(support.includes("},[token,status]);"));
  assert.ok(support.includes("useEffect(()=>{void refresh();},[refresh]);"));
  assert.ok(security.includes("const load=useCallback(async()=>"));
  assert.ok(security.includes("},[token]);"));
  assert.ok(security.includes("Checking passkey status…"));
});

test("dashboard and tracker use the shared human-readable status vocabulary", async () => {
  const [dashboard, tracker, labels] = await Promise.all([
    source("../../web/app/dashboard/page.tsx"),
    source("../../web/app/track/page.tsx"),
    source("../../web/lib/status-labels.ts"),
  ]);
  assert.match(dashboard, /import\s*\{\s*humanStatus\s*\}\s*from "\.\.\/\.\.\/lib\/status-labels"/);
  assert.match(tracker, /import\s*\{\s*humanStatus\s*\}\s*from "\.\.\/\.\.\/lib\/status-labels"/);
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
    assert.match(page, /aria-busy=\{submitting(?:\|\|submissionUncertain)?\}/);
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
    assert.match(page, /disabled=\{submitting\|\|submissionUncertain\}/);
    assert.match(page, /Check submission again/);
    assert.match(page, /setIdempotencyKey\(""\);setSubmissionUncertain\(false\);setForm/);
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
  assert.match(details, /Current inquiry status: \$\{humanStatus\(r\.status\|\|data\.status\)\}/);
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


test("service and mentorship request retries use database-backed idempotency", async () => {
  const [service, demand, server, demandMigration, mentorshipMigration, serviceMigration, servicesPage, demandPage, mentorshipPage] = await Promise.all([
    source("../../src/services-mentorship/service.js"),
    source("../../src/services-mentorship/demand.js"),
    source("../../server.js"),
    source("../../db/migrations/20261023101000_marketplace_demand_idempotency.sql"),
    source("../../db/migrations/20261023102000_mentorship_request_idempotency.sql"),
    source("../../db/migrations/20261023103000_service_request_idempotency.sql"),
    source("../../web/app/services/page.tsx"),
    source("../../web/app/service-demand/page.tsx"),
    source("../../web/app/mentorship/page.tsx"),
  ]);
  assert.ok(server.includes('marketplaceDemand.createDemand(identity.sub,await body(req),requestId,req.headers["x-idempotency-key"])'));
  assert.ok(server.includes('servicesMentorship.createMentorshipRequest(identity.sub,await body(req),requestId,req.headers["x-idempotency-key"])'));
  assert.ok(server.includes('servicesMentorship.requestService(parts[3],identity.sub,await body(req),requestId,req.headers["x-idempotency-key"])'));
  assert.ok(demand.includes("createDemand(userId,input,requestId,idempotencyKey=null)"));
  assert.ok(service.includes("createMentorshipRequest(menteeId,input,requestId,idempotencyKey=null)"));
  assert.ok(service.includes("requestService(listingId,requesterId,input,requestId,idempotencyKey=null)"));
  for (const migration of [demandMigration, mentorshipMigration, serviceMigration]) {
    assert.ok(migration.includes("request_idempotency_hash"));
    assert.ok(migration.includes("request_fingerprint"));
  }
  for (const page of [servicesPage, demandPage, mentorshipPage]) {
    assert.ok(page.includes("X-Idempotency-Key"));
    assert.ok(page.includes("submissionUncertain"));
    assert.ok(page.includes("Check submission again"));
  }
});

test("recruitment and verification isolate pending actions and report recorded status", async () => {
  const [recruitment, verification, jobs, services] = await Promise.all([
    source("../../web/app/recruitment/page.tsx"),
    source("../../web/app/verification/page.tsx"),
    source("../../web/app/jobs/page.tsx"),
    source("../../web/app/services/page.tsx"),
  ]);
  assert.ok(recruitment.includes("busyActions"));
  assert.ok(recruitment.includes("humanStatus(updated.status||status)"));
  assert.ok(verification.includes("busyActions"));
  assert.ok(verification.includes("Loading verification cases and review queues"));
  assert.ok(jobs.includes("Formal application status:"));
  assert.ok(jobs.includes("This application is no longer a draft"));
  assert.ok(services.includes("Service request reference"));
  assert.ok(services.includes("transitioningIds"));
});


test("service listing and no-vacancy job-interest forms recover uncertain creates safely", async () => {
  const [service, server, migration, servicesPage, interestPage] = await Promise.all([
    source("../../src/services-mentorship/service.js"),
    source("../../server.js"),
    source("../../db/migrations/20261023104000_service_listing_idempotency.sql"),
    source("../../web/app/services/page.tsx"),
    source("../../web/app/jobs/interest/page.tsx"),
  ]);
  assert.ok(service.includes("createServiceListing(userId,input,requestId,idempotencyKey=null)"));
  assert.ok(server.includes('servicesMentorship.createServiceListing(identity.sub,await body(req),requestId,req.headers["x-idempotency-key"])'));
  assert.ok(migration.includes("ux_service_listing_idempotency_hash"));
  assert.ok(servicesPage.includes("providerSaveUncertain"));
  assert.ok(servicesPage.includes("X-Idempotency-Key"));
  assert.ok(interestPage.includes("X-Idempotency-Key"));
  assert.ok(interestPage.includes("Start another request"));
  assert.ok(interestPage.includes("submissionUncertain"));
});


test("professional directory inquiries use server-backed idempotency and clear recovery feedback", async () => {
  const [service, server, migration, page] = await Promise.all([
    source("../../src/talent/service.js"),
    source("../../server.js"),
    source("../../db/migrations/20261023105000_talent_inquiry_idempotency.sql"),
    source("../../web/app/network/page.tsx"),
  ]);
  assert.ok(service.includes("createTalentInquiry(requesterId,input,requestId,idempotencyKey=null)"));
  assert.ok(server.includes('talent.createTalentInquiry(identity.sub,await body(req),requestId,req.headers["x-idempotency-key"])'));
  assert.ok(migration.includes("ux_talent_inquiry_idempotency_hash"));
  assert.ok(page.includes('headers:{"X-Idempotency-Key":key}'));
  assert.ok(page.includes("submissionUncertain"));
  assert.ok(page.includes("Check submission again"));
  assert.ok(page.includes("Inquiry status:"));
});


test("admin queues use authoritative report counts and moderation/support lists implement search and pagination", async () => {
  const [admin, moderation, supportPage, supportService, server] = await Promise.all([
    source("../../web/app/admin/page.tsx"),
    source("../../web/app/admin/marketplace/page.tsx"),
    source("../../web/app/admin/support/page.tsx"),
    source("../../src/platform/support-bot.js"),
    source("../../server.js"),
  ]);
  assert.ok(admin.includes("/api/v1/admin/reports/support-demand-response/run"));
  assert.ok(admin.includes('report.id === "support-demand-response"'));
  assert.ok(admin.includes("will not substitute zero or a partial page count"));
  assert.ok(admin.includes("Unreviewed work items"));
  assert.ok(moderation.includes("const visibleDemands=useMemo"));
  assert.ok(moderation.includes("const visibleListings=useMemo"));
  assert.ok(moderation.includes("const listingStatuses=useMemo"));
  assert.ok(moderation.includes("Moderation status<select"));
  assert.ok(moderation.includes("paginatedDemands.map"));
  assert.ok(moderation.includes("paginatedListings.map"));
  assert.ok(moderation.includes("Showing {visibleDemands.length"));
  assert.ok(moderation.includes("Showing {visibleListings.length"));
  assert.ok(supportPage.includes("offset=${inquiryPage*25}"));
  assert.ok(supportPage.includes("q=${encodeURIComponent(inquirySearch.trim())}"));
  assert.ok(supportPage.includes("hasMoreInquiries"));
  assert.ok(supportPage.includes("sequence!==refreshSequence.current"), "stale inbox searches must not overwrite newer results");
  assert.equal(supportPage.split('finally{setActionBusy("");}').length - 1, 4, "status, workflow, transfer and escalation actions must always release their pending state");
  assert.ok(supportService.includes("limit $4 offset $6"));
  assert.ok(supportService.includes("const search=String(filters.q||\"\")"));
  assert.ok(supportService.includes("case when c.consent_to_contact then coalesce(c.contact_name"));
  assert.ok(server.includes('offset:q.get("offset")||"0",q:q.get("q")||""'));
});

test("member catalogue stays read-only while organization membership uses dedicated audited mutations", async () => {
  const [members, organizations, server, reports, reportTest] = await Promise.all([
    source("../../web/app/admin/members/catalog/page.tsx"),
    source("../../web/app/admin/organizations/page.tsx"),
    source("../../server.js"),
    source("../../src/platform/reports.js"),
    source("../../test/platform/reports-acceptance.test.js"),
  ]);
  assert.ok(members.includes("This directory is read-only"));
  assert.ok(members.includes('href="/admin/membership"'), "membership decisions and payment review stay in their supported workflow");
  assert.ok(!members.includes("method:"));
  assert.ok(organizations.includes("Organization membership updated and audit reason recorded"));
  assert.ok(organizations.includes('method:"POST"'));
  assert.ok(organizations.includes('method:"PATCH"'));
  assert.ok(server.includes('p==="api/v1/admin/members/catalog"'));
  assert.ok(server.includes('p==="api/v1/admin/organizations"'));
  assert.ok(server.includes('p.startsWith("api/v1/organizations/") && parts[4]==="users"'), "existing organization-member mutations are organization-scoped, not platform-admin endpoints");
  assert.ok(reports.includes('id:"support-demand-response"'));
  assert.ok(reports.includes('id:"audit-activity"'));
  assert.ok(reports.includes("'report.exported'"));
  assert.ok(reportTest.includes("the unique marker should match only the seeded audit event"));
  assert.ok(reportTest.includes("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
});


test("organization membership administration uses explicit authority, reasoned audited actions and owner protection", async () => {
  const [page, service, server] = await Promise.all([
    source("../../web/app/admin/organizations/page.tsx"),
    source("../../src/organization-jobs/service.js"),
    source("../../server.js"),
  ]);
  assert.ok(page.includes('"/api/v1/admin/organizations/"+encodeURIComponent(org.id)+"/members/"'));
  assert.ok(page.includes("window.confirm"));
  assert.ok(page.includes("Audit reason (required)"));
  assert.ok(page.includes("Add member with audit trail"));
  assert.ok(page.includes("Save membership change"));
  assert.ok(service.includes("function assertOrganizationAdminMutation"));
  assert.ok(service.includes("requireAdminMembershipReason"));
  assert.ok(service.includes("organization.membership.admin_added"));
  assert.ok(service.includes("organization.membership.admin_updated"));
  assert.ok(service.includes("OWNER_PROTECTED"));
  assert.ok(server.includes("organizationJobs.adminAddOrganizationUser"));
  assert.ok(server.includes("organizationJobs.adminUpdateOrganizationUser"));
});

test("reference-data publication is reasoned and confirmed, with searchable paginated working-copy items", async () => {
  const page = await source("../../web/app/admin/reference-portfolio/page.tsx");
  assert.ok(page.includes("const visibleItems=useMemo"));
  assert.ok(page.includes("const paginatedItems=useMemo"));
  assert.ok(page.includes("Showing {visibleItems.length"));
  assert.ok(page.includes("Publication reason (required)"));
  assert.ok(page.includes("window.confirm"));
  assert.ok(page.includes("body:JSON.stringify({reason})"));
  assert.ok(page.includes("Publication confirmed by the server"));
});
