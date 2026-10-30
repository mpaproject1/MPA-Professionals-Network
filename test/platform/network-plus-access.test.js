import assert from "node:assert/strict";
import test from "node:test";
import { resolveNetworkPlusAccess } from "../../src/platform/network-plus-access.js";

function databaseWith(memberEligible, organizationEligible) {
  const calls = [];
  return {
    calls,
    db: {
      async query(sql, params) {
        calls.push({ sql, params });
        return {
          rows: [{ eligible: sql.includes("membership_record") ? memberEligible : organizationEligible }],
        };
      },
    },
  };
}

test("Network-Plus access accepts a current active member", async () => {
  const { db, calls } = databaseWith(true, false);
  const result = await resolveNetworkPlusAccess(db, "member-1");
  assert.equal(result.eligible, true);
  assert.deepEqual(result.access, { member: true, organization: false });
  assert.match(calls[0].sql, /status='active'.*start_date<=current_date/);
});

test("Network-Plus access accepts an active authorized member of a verified organization", async () => {
  const { db, calls } = databaseWith(false, true);
  const result = await resolveNetworkPlusAccess(db, "org-user-1");
  assert.equal(result.eligible, true);
  assert.deepEqual(result.access, { member: false, organization: true });
  assert.match(calls[1].sql, /om.status='active'/);
  assert.match(calls[1].sql, /verification_status='verified'/);
  assert.deepEqual(calls[1].params[1], ["owner", "administrator", "project_manager"]);
});

test("Network-Plus access rejects expired members and users without a verified organization context", async () => {
  const { db } = databaseWith(false, false);
  const result = await resolveNetworkPlusAccess(db, "inactive-user");
  assert.equal(result.eligible, false);
  assert.match(result.nextAction, /current active MPA membership/);
});

test("Network-Plus access does not accept a missing identity", async () => {
  const { db, calls } = databaseWith(false, false);
  await assert.rejects(
    resolveNetworkPlusAccess(db, null),
    (error) => error.statusCode === 401 && error.code === "UNAUTHENTICATED",
  );
  assert.equal(calls.length, 0);
});
