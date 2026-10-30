import assert from "node:assert/strict";
import test from "node:test";
import { resolveNetworkPlusAccess } from "../../src/platform/network-plus-access.js";

const ORGANIZATION_ROLES = ["owner", "administrator", "project_manager"];

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

test("Network-Plus access accepts a current active member using server-owned date bounds", async () => {
  const { db, calls } = databaseWith(true, false);
  const result = await resolveNetworkPlusAccess(db, "member-1");
  assert.equal(result.eligible, true);
  assert.deepEqual(result.access, { member: true, organization: false });
  assert.match(calls[0].sql, /status='active'.*start_date<=current_date.*end_date is null or end_date>=current_date/);
  assert.deepEqual(calls[0].params, ["member-1"]);
});

test("Network-Plus access accepts only active owner, administrator or project-manager membership in a verified organization", async () => {
  const { db, calls } = databaseWith(false, true);
  const result = await resolveNetworkPlusAccess(db, "org-user-1");
  assert.equal(result.eligible, true);
  assert.deepEqual(result.access, { member: false, organization: true });
  assert.match(calls[1].sql, /join organization o on o.id=om.organization_id/);
  assert.match(calls[1].sql, /om.status='active'/);
  assert.match(calls[1].sql, /o.verification_status='verified'/);
  assert.deepEqual(calls[1].params, ["org-user-1", ORGANIZATION_ROLES]);
});

test("expired members, inactive organization assignments, unverified organizations and unrelated roles are denied", async () => {
  const { db, calls } = databaseWith(false, false);
  const result = await resolveNetworkPlusAccess(db, "inactive-user");
  assert.equal(result.eligible, false);
  assert.deepEqual(result.access, { member: false, organization: false });
  assert.match(calls[0].sql, /end_date>=current_date/);
  assert.deepEqual(calls[1].params[1], ORGANIZATION_ROLES);
  assert.match(result.nextAction, /current active MPA membership/);
});

test("multiple eligible contexts are represented as booleans without exposing organization identifiers", async () => {
  const { db } = databaseWith(true, true);
  const result = await resolveNetworkPlusAccess(db, "dual-context-user");
  assert.equal(result.eligible, true);
  assert.deepEqual(result.access, { member: true, organization: true });
  assert.deepEqual(Object.keys(result).sort(), ["access", "eligible", "nextAction"]);
  assert.doesNotMatch(JSON.stringify(result), /organizationId|organization_id|org-user/);
});

test("Network-Plus access does not trust a missing or client-supplied identity", async () => {
  const { db, calls } = databaseWith(false, false);
  await assert.rejects(
    resolveNetworkPlusAccess(db, null),
    error => error.statusCode === 401 && error.code === "UNAUTHENTICATED",
  );
  assert.equal(calls.length, 0);
});
