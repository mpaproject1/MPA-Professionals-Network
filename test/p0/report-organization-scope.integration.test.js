import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import * as membership from "../../src/membership/service.js";
import * as organizationJobs from "../../src/organization-jobs/service.js";
import { closePool } from "../../src/platform/db.js";
import { listReportCatalogue, runReport } from "../../src/platform/reports.js";

async function account(label) {
  const suffix = randomUUID();
  const digits = suffix.replace(/\D/g, "").slice(0, 8).padEnd(8, "7");
  const created = await membership.register({
    email: "report-scope-" + label + "-" + suffix + "@example.test",
    password: "ReportScopeP0Password!2026",
    firstName: "Report",
    lastName: "Scope" + label,
    phone: "09" + digits,
  }, "report-scope-" + label + "-" + suffix);
  return created.user.id;
}

test("recruiters and project managers cannot read another organization's recruitment report rows", async t => {
  if (!process.env.DATABASE_URL) {
    t.skip("requires the disposable PostgreSQL database configured by PR Quality");
    return;
  }

  const suffix = randomUUID().replace(/-/g, "");
  const ownerA = await account("owner-a");
  const ownerB = await account("owner-b");
  const recruiterA = await account("recruiter-a");
  const jobTeamRecruiterA = await account("job-team-recruiter-a");
  const projectManagerB = await account("project-manager-b");
  const unrelatedUser = await account("unrelated");

  const orgA = await organizationJobs.registerOrganization(ownerA, {
    legalName: "Report Scope Organization A " + suffix,
    displayName: "Report Scope A " + suffix,
  }, "report-scope-org-a-" + suffix);
  const orgB = await organizationJobs.registerOrganization(ownerB, {
    legalName: "Report Scope Organization B " + suffix,
    displayName: "Report Scope B " + suffix,
  }, "report-scope-org-b-" + suffix);

  await organizationJobs.addOrganizationUser(orgA.id, ownerA, {
    userId: recruiterA, roleCode: "recruiter",
  }, "report-scope-recruiter-" + suffix);
  await organizationJobs.addOrganizationUser(orgA.id, ownerA, {
    userId: jobTeamRecruiterA, roleCode: "read_only",
  }, "report-scope-job-team-member-" + suffix);
  await organizationJobs.addOrganizationUser(orgB.id, ownerB, {
    userId: projectManagerB, roleCode: "project_manager",
  }, "report-scope-project-manager-" + suffix);

  const jobA = await organizationJobs.createJob(orgA.id, ownerA, {
    title: "Scoped Recruiter Vacancy " + suffix,
    description: "Integration fixture for recruiter report isolation.",
  }, "report-scope-job-a-" + suffix);
  const jobB = await organizationJobs.createJob(orgB.id, ownerB, {
    title: "Scoped Project Vacancy " + suffix,
    description: "Integration fixture for project manager report isolation.",
  }, "report-scope-job-b-" + suffix);

  await organizationJobs.addJobTeamMember(jobA.id, ownerA, {
    userId: jobTeamRecruiterA, roleCode: "recruiter",
  }, "report-scope-job-team-recruiter-" + suffix);

  const unrelatedIdentity = { sub: unrelatedUser, roles: [], permissions: ["reports.view"] };
  const unrelatedCatalogue = await listReportCatalogue(unrelatedIdentity);
  assert.ok(!unrelatedCatalogue.some(report => report.id === "job-application-funnel"),
    "an account without an organization or job-team assignment must not discover the recruitment report");
  await assert.rejects(runReport(unrelatedIdentity, "job-application-funnel", { q: suffix }, "report-scope-run-unrelated-" + suffix), error => error?.code === "REPORT_FORBIDDEN");
  const recruiterIdentity = { sub: recruiterA, roles: [], permissions: [] };
  const recruiterCatalogue = await listReportCatalogue(recruiterIdentity);
  assert.ok(recruiterCatalogue.some(report => report.id === "job-application-funnel"),
    "an active organization recruiter must discover the scoped recruitment report");
  const recruiterReport = await runReport(recruiterIdentity, "job-application-funnel", { q: suffix }, "report-scope-run-recruiter-" + suffix);
  assert.ok(recruiterReport.rows.some(row => row.Job === jobA.title));
  assert.ok(!recruiterReport.rows.some(row => row.Job === jobB.title),
    "recruiter must not see another organization's vacancy");

  const jobTeamIdentity = { sub: jobTeamRecruiterA, roles: [], permissions: [] };
  const jobTeamReport = await runReport(jobTeamIdentity, "job-application-funnel", { q: suffix }, "report-scope-run-job-team-" + suffix);
  assert.ok(jobTeamReport.rows.some(row => row.Job === jobA.title));
  assert.ok(!jobTeamReport.rows.some(row => row.Job === jobB.title),
    "job-team recruiter must not see another organization's vacancy");

  const projectIdentity = { sub: projectManagerB, roles: [], permissions: [] };
  const projectCatalogue = await listReportCatalogue(projectIdentity);
  assert.ok(projectCatalogue.some(report => report.id === "job-application-funnel"),
    "an active organization project manager must discover the scoped recruitment report");
  const projectReport = await runReport(projectIdentity, "job-application-funnel", { q: suffix }, "report-scope-run-project-" + suffix);
  assert.ok(projectReport.rows.some(row => row.Job === jobB.title));
  assert.ok(!projectReport.rows.some(row => row.Job === jobA.title),
    "project manager must not see another organization's vacancy");
});

after(async () => { await closePool(); });
