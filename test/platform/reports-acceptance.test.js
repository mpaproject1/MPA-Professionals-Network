import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { getPool } from "../../src/platform/db.js";
import { exportReport, runReport } from "../../src/platform/reports.js";

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

    const xlsx = await exportReport(identity, "audit-activity", {
      from: today, to: today, status: "success", q: marker
    }, "xlsx", xlsxRequestId);
    assert.equal(xlsx.contentType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    assert.match(xlsx.filename, /\.xlsx$/);
    assert.equal(xlsx.buffer.subarray(0, 2).toString("ascii"), "PK");

    await assert.rejects(
      runReport(identity, "audit-activity", { from: today, to: "2000-01-01" }, randomUUID()),
      error => error.code === "INVALID_DATE_RANGE"
    );

    const audit = await db.query(
      "select action,metadata from audit_log where request_id = any($1::text[]) order by action",
      [[runRequestId, pdfRequestId, xlsxRequestId]]
    );
    assert.ok(audit.rows.some(row => row.action === "report.generated"));
    assert.equal(audit.rows.filter(row => row.action === "report.exported").length, 2);
  } finally {
    await db.query(
      "delete from audit_log where request_id = any($1::text[])",
      [[seedRequestId, runRequestId, pdfRequestId, xlsxRequestId]]
    );
  }
});
