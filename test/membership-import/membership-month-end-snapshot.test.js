import assert from "node:assert/strict";
import test from "node:test";
import { captureMembershipMonthEndSnapshot, membershipMonthEndSnapshotWindow } from "../../src/membership/service.js";
import { getPool } from "../../src/platform/db.js";

test("month-end stock capture uses the Addis Ababa civil month boundary", () => {
  const windowStart = membershipMonthEndSnapshotWindow(new Date("2026-11-30T20:55:00.000Z"));
  assert.deepEqual(windowStart, { snapshotDate: "2026-11-30", eligible: true });

  const tooEarly = membershipMonthEndSnapshotWindow(new Date("2026-11-30T20:54:00.000Z"));
  assert.deepEqual(tooEarly, { snapshotDate: "2026-11-30", eligible: false });

  const notMonthEnd = membershipMonthEndSnapshotWindow(new Date("2026-11-29T20:55:00.000Z"));
  assert.deepEqual(notMonthEnd, { snapshotDate: "2026-11-29", eligible: false });
});

test("month-end membership snapshot is persisted and safely refreshed", async t => {
  if (!process.env.DATABASE_URL) {
    t.skip("requires the disposable PostgreSQL database configured by PR Quality");
    return;
  }
  const db = getPool();
  const snapshotDate = "2026-11-30";
  try {
    const first = await captureMembershipMonthEndSnapshot(new Date("2026-11-30T20:55:00.000Z"));
    assert.equal(first.captured, true);
    assert.equal(first.snapshotDate, snapshotDate);
    const firstTotals = await db.query("select coalesce(sum(member_count),0)::int total,count(*)::int groups from membership_month_end_snapshot where snapshot_date=$1",[snapshotDate]);
    const currentCount = Number((await db.query("select count(*)::int count from membership_record")).rows[0].count);
    assert.equal(Number(firstTotals.rows[0].total), currentCount, "status groups must account for every membership record exactly once");

    const second = await captureMembershipMonthEndSnapshot(new Date("2026-11-30T20:56:00.000Z"));
    assert.equal(second.captured, true);
    const secondTotals = await db.query("select coalesce(sum(member_count),0)::int total,count(*)::int groups from membership_month_end_snapshot where snapshot_date=$1",[snapshotDate]);
    assert.equal(Number(secondTotals.rows[0].total), currentCount, "recapture must replace the prior snapshot rather than duplicate counts");
    assert.equal(Number(secondTotals.rows[0].groups), Number(firstTotals.rows[0].groups), "recapture must replace each status/plan group without duplicating groups");
  } finally {
    await db.query("delete from membership_month_end_snapshot where snapshot_date=$1",[snapshotDate]);
  }
});
