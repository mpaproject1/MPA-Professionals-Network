import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import * as membership from "../../src/membership/service.js";
import { getPool } from "../../src/platform/db.js";
import { runReport } from "../../src/platform/reports.js";

test("Test Lab membership applications are excluded from management funnel, cohort and ageing reports", async t => {
  if (!process.env.DATABASE_URL) {
    t.skip("requires the disposable PostgreSQL database configured by PR Quality");
    return;
  }
  const db = getPool();
  const suffix = randomUUID();
  const digits = suffix.replace(/\\D/g, "").slice(0, 8).padEnd(8, "7");
  const created = await membership.register({
    email: "test-lab-report-" + suffix + "@example.test",
    password: "TestLabReportFixture!2026",
    firstName: "Synthetic",
    lastName: "Report Fixture",
    phone: "09" + digits,
  }, "test-lab-report-fixture-" + suffix);
  const userId = created.user.id;
  const product = (await db.query("select id,price,currency from membership_product where product_code='BASIC' and active=true limit 1")).rows[0];
  assert.ok(product, "the BASIC membership product must exist in the disposable test database");
  const portfolioId = randomUUID();
  let applicationId = null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Addis_Ababa" }).format(new Date());
  const reviewer = { sub: userId, roles: ["system_admin"], permissions: [] };
  try {
    const beforeApplications = await runReport(reviewer, "membership-applications", { from: "2020-01-01", to: today, status: "submitted" }, randomUUID());
    const beforeCohorts = await runReport(reviewer, "membership-application-cohorts", { from: "2020-01-01", to: today, status: "submitted" }, randomUUID());
    const beforeAging = await runReport(reviewer, "membership-application-aging", { from: "2020-01-01", to: today, status: "submitted" }, randomUUID());

    const application = (await db.query(
      "insert into membership_application(user_id,application_type,membership_product_id,status,submitted_at,data_snapshot,fee_snapshot) values($1,'new',$2,'submitted',now(),$3,$4) returning id",
      [userId, product.id, { synthetic: true, testPortfolioId: portfolioId, persona: "Test Lab reporting exclusion" }, { productCode: "BASIC", amount: Number(product.price), currency: product.currency }]
    )).rows[0];
    applicationId = application.id;

    const afterApplications = await runReport(reviewer, "membership-applications", { from: "2020-01-01", to: today, status: "submitted" }, randomUUID());
    const afterCohorts = await runReport(reviewer, "membership-application-cohorts", { from: "2020-01-01", to: today, status: "submitted" }, randomUUID());
    const afterAging = await runReport(reviewer, "membership-application-aging", { from: "2020-01-01", to: today, status: "submitted" }, randomUUID());

    assert.deepEqual(afterApplications.rows, beforeApplications.rows, "synthetic Test Lab applications must not affect application KPIs");
    assert.deepEqual(afterCohorts.rows, beforeCohorts.rows, "synthetic Test Lab applications must not affect cohort denominators or conversion");
    assert.deepEqual(afterAging.rows, beforeAging.rows, "synthetic Test Lab applications must not affect reviewer queue ageing");
  } finally {
    if (applicationId) await db.query("delete from membership_application where id=$1", [applicationId]);
    await db.query("delete from audit_log where actor_user_id=$1", [userId]);
  }
});
