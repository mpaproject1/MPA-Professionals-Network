import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { inflateRawSync } from "node:zlib";
import * as membership from "../../src/membership/service.js";
import { getPool } from "../../src/platform/db.js";
import { exportReport, runReport } from "../../src/platform/reports.js";
import * as marketplaceDemand from "../../src/services-mentorship/demand.js";

async function createRequester() {
  const suffix = randomUUID();
  const digits = suffix.replace(/[^0-9]/g, "").slice(0, 8).padEnd(8, "7");
  const created = await membership.register({
    email: "report-demand-" + suffix + "@example.test",
    password: "ReportDemandP1Password!2026",
    firstName: "Report",
    lastName: "Fixture" + suffix.slice(0, 8),
    phone: "07" + digits,
  }, "report-demand-test-" + suffix);
  return created.user.id;
}

function readZipEntry(buffer, wanted) {
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString("utf8");
    const dataStart = nameStart + nameLength + extraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    if (name === wanted) return inflateRawSync(compressed).toString("utf8");
    offset = dataStart + compressedSize;
  }
  throw new Error("Missing XLSX entry: " + wanted);
}

test("administrative audit report applies date, outcome and search filters to known test data and exports both formats", async t => {
  if (!process.env.DATABASE_URL) {
    t.skip("requires the disposable PostgreSQL database configured by PR Quality");
    return;
  }
  const db = getPool();
  const marker = `report-acceptance-${randomUUID()}`;
  const seedRequestId = randomUUID();
  const runRequestId = randomUUID();
  const pdfRequestId = randomUUID();
  const xlsxRequestId = randomUUID();
  const csvRequestId = randomUUID();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Addis_Ababa" }).format(new Date());
  const identity = { sub: null, roles: ["system_admin"], permissions: [] };
  try {
    await db.query(
      "insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values(null,$1,'report-acceptance',null,$2,'success',$3::jsonb)",
      [marker, seedRequestId, JSON.stringify({ fixture: true })]
    );

    const result = await runReport(identity, "audit-activity", {
      from: today, to: today, status: "success", q: marker
    }, runRequestId);

    assert.equal(result.report.id, "audit-activity");
    assert.match(result.report.definition, /Operational audit events/);
    assert.equal(result.filters.from, today);
    assert.equal(result.filters.to, today);
    assert.equal(result.filters.status, "success");
    assert.equal(result.rows.length, 1, "the unique marker should match only the seeded audit event");
    assert.equal(result.rows[0].Action, marker);
    assert.equal(result.rows[0].Outcome, "success");

    const pdf = await exportReport(identity, "audit-activity", {
      from: today, to: today, status: "success", q: marker
    }, "pdf", pdfRequestId);
    assert.equal(pdf.contentType, "application/pdf");
    assert.match(pdf.filename, /\.pdf$/);
    assert.equal(pdf.buffer.subarray(0, 8).toString("ascii"), "%PDF-1.4");
    assert.ok(pdf.buffer.toString("ascii").includes(marker), "PDF export should contain the known matching row");

    const csv = await exportReport(identity, "audit-activity", {
      from: today, to: today, status: "success", q: marker
    }, "csv", csvRequestId);
    assert.equal(csv.contentType, "text/csv; charset=utf-8");
    assert.match(csv.filename, /\.csv$/);
    assert.equal(csv.buffer.subarray(0, 3).toString("utf8"), "\uFEFF");
    assert.ok(csv.buffer.toString("utf8").includes(marker), "CSV export should contain the known matching row");

    const xlsx = await exportReport(identity, "audit-activity", {
      from: today, to: today, status: "success", q: marker
    }, "xlsx", xlsxRequestId);
    assert.equal(xlsx.contentType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    assert.match(xlsx.filename, /\.xlsx$/);
    assert.equal(xlsx.buffer.subarray(0, 2).toString("ascii"), "PK");
    const worksheet = readZipEntry(xlsx.buffer, "xl/worksheets/sheet1.xml");
    assert.ok(worksheet.includes(marker), "XLSX export should contain the known matching row");
    assert.ok(worksheet.includes("success"), "XLSX export should preserve the filtered outcome");

    await assert.rejects(
      runReport(identity, "audit-activity", { from: today, to: "2000-01-01" }, randomUUID()),
      error => error.code === "INVALID_DATE_RANGE"
    );

    const audit = await db.query(
      "select action,metadata from audit_log where request_id::text = any($1::text[]) order by action",
      [[runRequestId, pdfRequestId, xlsxRequestId, csvRequestId]]
    );
    assert.ok(audit.rows.some(row => row.action === "report.generated"));
    assert.equal(audit.rows.filter(row => row.action === "report.exported").length, 3);

    const requesterId = await createRequester();
    const demandTitle = "report-support-demand-" + randomUUID();
    await marketplaceDemand.createDemand(requesterId, {
      demandType: "service",
      title: demandTitle,
      description: "A test fixture requesting monthly bookkeeping support.",
      category: "Finance",
      deliveryMode: "remote",
    }, randomUUID(), randomUUID());
    const queueReport = await runReport(identity, "support-demand-response", {
      from: today, to: today, status: "submitted", q: demandTitle
    }, randomUUID());
    assert.equal(queueReport.rows.length, 1, "the unique demand fixture should produce one matching queue group");
    assert.equal(queueReport.rows[0].Queue, "Marketplace demand");
    assert.equal(Number(queueReport.rows[0].Requests), 1);
    assert.equal(Number(queueReport.rows[0].Unreviewed), 1, "unreviewed count should come from the persisted review timestamp/status");
  } finally {
    await db.query(
      "delete from audit_log where request_id::text = any($1::text[])",
      [[seedRequestId, runRequestId, pdfRequestId, xlsxRequestId, csvRequestId]]
    );
  }
});

test("membership dashboard aggregates and monthly trend are available only through membership reporting authority", async t => {
  if (!process.env.DATABASE_URL) {
    t.skip("requires the disposable PostgreSQL database configured by PR Quality");
    return;
  }
  const requestIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const systemAdminReportRequestId=randomUUID(),systemAdminExportRequestId=randomUUID();
  requestIds.push(systemAdminReportRequestId,systemAdminExportRequestId);
  const reviewer = { sub: null, roles: ["membership_reviewer"], permissions: [] };
  const permissionOnly = { sub: null, roles: [], permissions: ["membership.review"] };
  const financeOnly = { sub: null, roles: ["finance_officer"], permissions: [] };
  const systemAdmin = { sub: null, roles: ["system_admin"], permissions: [] };
  try {
    const status = await runReport(reviewer, "membership-status", {}, requestIds[0]);
    assert.ok(Array.isArray(status.rows));
    assert.equal(status.report.id, "membership-status");
    const historicalStock = await runReport(reviewer, "membership-status", { from: "1900-01-01", to: "1900-01-02" }, randomUUID());
    assert.deepEqual(historicalStock.rows, status.rows, "current member stock must not be truncated by an application-period filter");

    const monthly = await runReport(permissionOnly, "membership-applications", {
      from: "2020-01-01", to: new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Addis_Ababa" }).format(new Date()), groupBy: "month"
    }, requestIds[1]);
    assert.ok(Array.isArray(monthly.rows));
    for (const row of monthly.rows) {
      assert.match(String(row.Month), /^\d{4}-\d{2}$/);
      assert.ok(Number.isFinite(Number(row.Applications)));
      assert.ok(Number.isFinite(Number(row.Submitted)));
      assert.ok(Number.isFinite(Number(row.Reviewed)));
      assert.ok(Number.isFinite(Number(row.Activated)));
    }

    const cohorts = await runReport(reviewer, "membership-application-cohorts", { from: "2020-01-01", to: new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Addis_Ababa" }).format(new Date()) }, randomUUID());
    assert.equal(cohorts.report.id, "membership-application-cohorts");
    for (const row of cohorts.rows) {
      assert.match(String(row["Cohort month"]), /^\d{4}-\d{2}$/);
      for (const key of ["Applications", "Mature 30-day cohort", "Activated within 30 days", "Mature 90-day cohort", "Activated within 90 days"]) assert.ok(Number.isFinite(Number(row[key])), key);
      assert.ok(Number(row["Activated within 30 days"]) <= Number(row["Mature 30-day cohort"]));
      assert.ok(Number(row["Activated within 90 days"]) <= Number(row["Mature 90-day cohort"]));
    }

    const aging = await runReport(reviewer, "membership-application-aging", { from: "2000-01-01", to: new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Addis_Ababa" }).format(new Date()), status: "submitted", q: "no-such-application-" + randomUUID() }, requestIds[2]);
    assert.equal(aging.filters.status, "submitted");
    assert.ok(Array.isArray(aging.rows));
    assert.equal(aging.rows.length, 0, "queue ageing should respect the shared date, lifecycle and search filters");
    for (const row of aging.rows) {
      assert.ok(Number.isFinite(Number(row.Applications)));
      assert.ok(Number.isFinite(Number(row["Median age days"])));
      assert.ok(Number.isFinite(Number(row["Oldest age days"])));
    }

    const renewals = await runReport(reviewer, "membership-renewal-pipeline", { q: "no-such-membership-" + randomUUID(), memberStatus: "active" }, requestIds[5]);
    assert.equal(renewals.filters.memberStatus, "active");
    assert.ok(Array.isArray(renewals.rows));
    assert.equal(renewals.rows.length, 0, "renewal search should not return unrelated membership records");
    for (const row of renewals.rows) {
      assert.ok(Number.isFinite(Number(row.Members)));
      assert.ok(["Overdue", "Due in 30 days", "Due in 31–60 days", "Due in 61–90 days"].includes(row["Renewal window"]));
    }

    const performance = await runReport(reviewer, "membership-reviewer-performance", {
      from: "2020-01-01", to: new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Addis_Ababa" }).format(new Date())
    }, requestIds[3]);
    assert.ok(Array.isArray(performance.rows));
    for (const row of performance.rows) {
      assert.ok(Number.isFinite(Number(row.Decisions)));
      assert.ok(Number.isFinite(Number(row.Approved)));
      assert.ok(Number.isFinite(Number(row.Rejected)));
    }

    await assert.rejects(
      runReport({ sub: null, roles: [], permissions: ["reports.view"] }, "membership-reviewer-performance", {}, requestIds[4]),
      error => error.code === "SENSITIVE_REPORT_FORBIDDEN"
    );

    await assert.rejects(
      runReport(financeOnly, "membership-status", {}, randomUUID()),
      error => error.code === "REPORT_FORBIDDEN"
    );

    const feeBalances=await runReport(financeOnly,"membership-fee-balance-by-currency",{from:"2000-01-01"},randomUUID());
    assert.equal(feeBalances.report.id,"membership-fee-balance-by-currency");
    for(const row of feeBalances.rows){
      assert.ok(["ETB","USD","EUR","GBP"].includes(String(row.Currency))||/^[A-Z]{3}$/.test(String(row.Currency)));
      for(const key of ["Obligations","Fee due","Verified cash","Approved non-cash","Outstanding"])assert.ok(Number.isFinite(Number(row[key])),key);
    }
    const feeAgeing=await runReport(financeOnly,"membership-fee-ageing",{from:"2000-01-01"},randomUUID());
    for(const row of feeAgeing.rows){
      assert.ok(["Not yet due","Due today","Overdue 1–30 days","Overdue 31–60 days","Overdue 61+ days","No due date"].includes(row["Age band"]));
      assert.ok(Number.isFinite(Number(row.Outstanding)));
    }
    const memberSettlement=await runReport(reviewer,"membership-fee-settlement-activity",{},randomUUID());
    assert.equal(memberSettlement.report.id,"membership-fee-settlement-activity");
    for(const row of memberSettlement.rows){
      assert.ok(Object.hasOwn(row,"Records"));
      assert.equal(Object.hasOwn(row,"Amount"),false,"membership roles must not receive fee amounts");
      assert.equal(Object.hasOwn(row,"Currency"),false,"membership roles must not receive Finance currency totals");
    }
    await assert.rejects(
      runReport(reviewer,"membership-fee-dispositions",{},randomUUID()),
      error=>error.code==="REPORT_FORBIDDEN"
    );
    const financeExport=await exportReport(financeOnly,"membership-fee-dispositions",{},"xlsx",randomUUID());
    assert.equal(financeExport.contentType,"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    assert.equal(financeExport.buffer.subarray(0,2).toString("ascii"),"PK");
    const systemAdminFeeReport=await runReport(systemAdmin,"membership-fee-balance-by-currency",{from:"2000-01-01"},systemAdminReportRequestId);
    assert.ok(Array.isArray(systemAdminFeeReport.rows),"system admin must be able to view Finance fee totals");
    const systemAdminExport=await exportReport(systemAdmin,"membership-fee-balance-by-currency",{},"xlsx",systemAdminExportRequestId);
    assert.equal(systemAdminExport.contentType,"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    assert.equal(systemAdminExport.buffer.subarray(0,2).toString("ascii"),"PK");
    const membershipExport=await exportReport(reviewer,"membership-fee-settlement-activity",{},"xlsx",randomUUID());
    assert.equal(membershipExport.contentType,"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const memberSheet=readZipEntry(membershipExport.buffer,"xl/worksheets/sheet1.xml");
    assert.equal(memberSheet.includes("Amount"),false);
    assert.equal(memberSheet.includes("Currency"),false);

  } finally {
    await getPool().query("delete from audit_log where request_id::text = any($1::text[])", [requestIds]);
  }
});
