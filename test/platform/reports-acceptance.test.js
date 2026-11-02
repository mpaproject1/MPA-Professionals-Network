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
  const today = new Date().toISOString().slice(0, 10);
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
  const requestIds = [randomUUID(), randomUUID(), randomUUID()];
  const reviewer = { sub: null, roles: ["membership_reviewer"], permissions: [] };
  const permissionOnly = { sub: null, roles: [], permissions: ["membership.review"] };
  const financeOnly = { sub: null, roles: ["finance_officer"], permissions: [] };
  try {
    const status = await runReport(reviewer, "membership-status", {}, requestIds[0]);
    assert.ok(Array.isArray(status.rows));
    assert.equal(status.report.id, "membership-status");

    const monthly = await runReport(permissionOnly, "membership-applications", {
      from: "2020-01-01", to: new Date().toISOString().slice(0, 10), groupBy: "month"
    }, requestIds[1]);
    assert.ok(Array.isArray(monthly.rows));
    for (const row of monthly.rows) {
      assert.match(String(row.Month), /^\d{4}-\d{2}$/);
      assert.ok(Number.isFinite(Number(row.Applications)));
      assert.ok(Number.isFinite(Number(row.Submitted)));
      assert.ok(Number.isFinite(Number(row.Reviewed)));
      assert.ok(Number.isFinite(Number(row.Activated)));
    }

    const performance = await runReport(reviewer, "membership-reviewer-performance", {
      from: "2020-01-01", to: new Date().toISOString().slice(0, 10)
    }, requestIds[2]);
    assert.ok(Array.isArray(performance.rows));
    for (const row of performance.rows) {
      assert.ok(Number.isFinite(Number(row.Decisions)));
      assert.ok(Number.isFinite(Number(row.Approved)));
      assert.ok(Number.isFinite(Number(row.Rejected)));
    }

    await assert.rejects(
      runReport(financeOnly, "membership-status", {}, randomUUID()),
      error => error.code === "REPORT_FORBIDDEN"
    );
  } finally {
    await getPool().query("delete from audit_log where request_id::text = any($1::text[])", [requestIds]);
  }
});
