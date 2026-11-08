import assert from "node:assert/strict";
import test from "node:test";

import { getMembershipCardStatus } from "../src/membership/card.js";

const now = new Date("2026-11-07T09:00:00.000Z");
const baseMembership = {
  status: "active",
  source: "online",
  legacy_payment_verified: true,
};

test("membership card accepts PostgreSQL DATE values parsed as JavaScript Date objects", () => {
  assert.equal(
    getMembershipCardStatus({
      ...baseMembership,
      start_date: new Date("2026-11-06T00:00:00.000Z"),
      end_date: new Date("2027-11-05T00:00:00.000Z"),
    }, now),
    "active",
  );
});

test("membership card accepts YYYY-MM-DD date strings", () => {
  assert.equal(
    getMembershipCardStatus({
      ...baseMembership,
      start_date: "2026-11-06",
      end_date: "2027-11-05",
    }, now),
    "active",
  );
});

test("membership card treats the start and end dates as inclusive", () => {
  assert.equal(
    getMembershipCardStatus({
      ...baseMembership,
      start_date: new Date("2026-11-07T00:00:00.000Z"),
      end_date: new Date("2026-11-07T00:00:00.000Z"),
    }, now),
    "active",
  );
});

test("membership card remains expired when the end date is before today", () => {
  assert.equal(
    getMembershipCardStatus({
      ...baseMembership,
      start_date: new Date("2026-11-06T00:00:00.000Z"),
      end_date: new Date("2026-11-06T00:00:00.000Z"),
    }, now),
    "expired",
  );
});

test("membership card rejects missing or invalid start dates", () => {
  assert.equal(getMembershipCardStatus({ ...baseMembership, start_date: null, end_date: "2027-11-05" }, now), "expired");
  assert.equal(getMembershipCardStatus({ ...baseMembership, start_date: "not-a-date", end_date: "2027-11-05" }, now), "expired");
});
