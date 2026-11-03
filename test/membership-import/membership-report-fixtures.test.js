import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import * as membership from "../../src/membership/service.js";
import { captureMembershipMonthEndSnapshot } from "../../src/membership/service.js";
import { getPool } from "../../src/platform/db.js";
import { runReport } from "../../src/platform/reports.js";

test("Test Lab membership applications are excluded from management funnel, cohort and ageing reports", async t => {
  if (!process.env.DATABASE_URL) {
    t.skip("requires the disposable PostgreSQL database configured by PR Quality");
    return;
  }
  const db = getPool();
  const suffix = randomUUID();
  const digits = suffix.replace(/\D/g, "").slice(0, 8).padEnd(8, "7");
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
  let membershipRecordId = null;
  let paymentId = null;
  const snapshotDate = "2026-12-31";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Addis_Ababa" }).format(new Date());
  const reviewer = { sub: userId, roles: ["system_admin"], permissions: [] };
  try {
    const beforeApplications = await runReport(reviewer, "membership-applications", { from: "2020-01-01", to: today, status: "submitted" }, randomUUID());
    const beforeCohorts = await runReport(reviewer, "membership-application-cohorts", { from: "2020-01-01", to: today, status: "submitted" }, randomUUID());
    const beforeAging = await runReport(reviewer, "membership-application-aging", { from: "2020-01-01", to: today, status: "submitted" }, randomUUID());
    const beforeMemberStock = await runReport(reviewer, "membership-status", {}, randomUUID());
    const beforeDirectory = await runReport(reviewer, "member-directory", {}, randomUUID());
    const beforeCollections = await runReport(reviewer, "membership-collections", { from: "2020-01-01", to: today }, randomUUID());
    const beforeApprovedPayments = await runReport(reviewer, "approved-payments", { from: "2020-01-01", to: today }, randomUUID());
    const beforeFinanceSummary = await runReport(reviewer, "finance-summary", { from: "2020-01-01", to: today }, randomUUID());

    const application = (await db.query(
      "insert into membership_application(user_id,application_type,membership_product_id,status,tracking_reference,submitted_at,data_snapshot,fee_snapshot) values($1,'new',$2,'submitted',$3,now(),$4,$5) returning id",
      [userId, product.id, "TSTLAB-APP-" + suffix.replace(/-/g, "").slice(0, 12).toUpperCase(), { synthetic: true, testPortfolioId: portfolioId, persona: "Test Lab reporting exclusion" }, { productCode: "BASIC", amount: Number(product.price), currency: product.currency }]
    )).rows[0];
    applicationId = application.id;
    const membershipRecord = (await db.query(
      "insert into membership_record(user_id,membership_product_id,membership_number,status,start_date,end_date,source,application_id) values($1,$2,$3,'active',$4,$5,'online',$6) returning id",
      [userId, product.id, "TSTLAB-" + suffix.replace(/-/g, "").slice(0, 12).toUpperCase(), today, "2027-12-31", application.id]
    )).rows[0];
    membershipRecordId = membershipRecord.id;
    const payment = (await db.query(
      "insert into payment_transaction(provider,provider_transaction_id,idempotency_key,purpose,amount,currency,status,request_payload,response_payload) values('test-simulator',$1,$2,'test_lab_simulation',$3,$4,'succeeded',$5,$6) returning id",
      ["QA-" + suffix, "test-lab:" + portfolioId + ":verified-simulation", 1200, "ETB", { testPortfolioId: portfolioId, applicationId: application.id, simulated: true }, { captured: true, noExternalProvider: true }]
    )).rows[0];
    paymentId = payment.id;
    await db.query("insert into membership_application_payment(application_id,payment_transaction_id) values($1,$2)",[application.id,payment.id]);



    const afterApplications = await runReport(reviewer, "membership-applications", { from: "2020-01-01", to: today, status: "submitted" }, randomUUID());
    const afterCohorts = await runReport(reviewer, "membership-application-cohorts", { from: "2020-01-01", to: today, status: "submitted" }, randomUUID());
    const afterAging = await runReport(reviewer, "membership-application-aging", { from: "2020-01-01", to: today, status: "submitted" }, randomUUID());

    assert.deepEqual(afterApplications.rows, beforeApplications.rows, "synthetic Test Lab applications must not affect application KPIs");
    assert.deepEqual(afterCohorts.rows, beforeCohorts.rows, "synthetic Test Lab applications must not affect cohort denominators or conversion");
    assert.deepEqual(afterAging.rows, beforeAging.rows, "synthetic Test Lab applications must not affect reviewer queue ageing");
    const afterMemberStock = await runReport(reviewer, "membership-status", {}, randomUUID());
    const afterDirectory = await runReport(reviewer, "member-directory", {}, randomUUID());
    assert.deepEqual(afterMemberStock.rows, beforeMemberStock.rows, "membership records linked to Test Lab applications must not affect member stock");
    assert.deepEqual(afterDirectory.rows, beforeDirectory.rows, "membership records linked to Test Lab applications must not leak into production-like member exports");
    const afterCollections = await runReport(reviewer, "membership-collections", { from: "2020-01-01", to: today }, randomUUID());
    const afterApprovedPayments = await runReport(reviewer, "approved-payments", { from: "2020-01-01", to: today }, randomUUID());
    const afterFinanceSummary = await runReport(reviewer, "finance-summary", { from: "2020-01-01", to: today }, randomUUID());
    assert.deepEqual(afterCollections.rows, beforeCollections.rows, "simulated Test Lab payments must not inflate retained collections");
    assert.deepEqual(afterApprovedPayments.rows, beforeApprovedPayments.rows, "simulated Test Lab payments must not appear as approved payments");
    assert.deepEqual(afterFinanceSummary.rows, beforeFinanceSummary.rows, "simulated Test Lab payments must not affect Finance management summaries");


    const snapshot = await captureMembershipMonthEndSnapshot(new Date("2026-12-31T20:55:00.000Z"));
    assert.equal(snapshot.captured, true);
    const snapshotTotals = await db.query("select coalesce(sum(member_count),0)::int total from membership_month_end_snapshot where snapshot_date=$1",[snapshotDate]);
    const expectedRealStock = Number((await db.query("select count(*)::int count from membership_record mr where not exists(select 1 from membership_application test_app where test_app.id=mr.application_id and coalesce(test_app.data_snapshot->>'testPortfolioId','')<>'')")).rows[0].count);
    assert.equal(Number(snapshotTotals.rows[0].total), expectedRealStock, "month-end snapshots must exclude Test Lab membership records");

  } finally {
    if (paymentId && applicationId) await db.query("delete from membership_application_payment where application_id=$1 and payment_transaction_id=$2", [applicationId,paymentId]);
    if (paymentId) await db.query("delete from payment_transaction where id=$1", [paymentId]);
    if (membershipRecordId) await db.query("delete from membership_record where id=$1", [membershipRecordId]);
    if (applicationId) await db.query("delete from membership_application where id=$1", [applicationId]);
    await db.query("delete from membership_month_end_snapshot where snapshot_date=$1",[snapshotDate]);
    await db.query("delete from audit_log where actor_user_id=$1", [userId]);
  }
});
