import assert from "node:assert/strict";
import test from "node:test";
import { membershipMonthEndSnapshotWindow } from "../../src/membership/service.js";

test("month-end stock capture uses the Addis Ababa civil month boundary", () => {
  const windowStart = membershipMonthEndSnapshotWindow(new Date("2026-11-30T20:55:00.000Z"));
  assert.deepEqual(windowStart, { snapshotDate: "2026-11-30", eligible: true });

  const tooEarly = membershipMonthEndSnapshotWindow(new Date("2026-11-30T20:54:00.000Z"));
  assert.deepEqual(tooEarly, { snapshotDate: "2026-11-30", eligible: false });

  const notMonthEnd = membershipMonthEndSnapshotWindow(new Date("2026-11-29T20:55:00.000Z"));
  assert.deepEqual(notMonthEnd, { snapshotDate: "2026-11-29", eligible: false });
});
