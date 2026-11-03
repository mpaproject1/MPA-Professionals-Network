import assert from "node:assert/strict";
import test from "node:test";
import {
  assertMembershipActivationAccess,
  assertMembershipReviewAccess,
  assertPaymentReversalAccess,
  assertPaymentVerificationAccess,
} from "../../src/platform/workspace-authorization.js";

const systemAdmin = { sub: "system-admin", roles: ["system_admin"], permissions: [] };
const financeOfficer = { sub: "finance-officer", roles: ["finance_officer"], permissions: [] };
const membershipReviewer = { sub: "membership-reviewer", roles: ["membership_reviewer"], permissions: [] };

test("system administrator activation authority does not grant Finance verification or reversal", () => {
  assert.doesNotThrow(() => assertMembershipActivationAccess(systemAdmin));
  assert.throws(() => assertPaymentVerificationAccess(systemAdmin), error => error.statusCode === 403 && error.code === "FORBIDDEN");
  assert.throws(() => assertPaymentReversalAccess(systemAdmin), error => error.statusCode === 403 && error.code === "FORBIDDEN");
});

test("Finance payment authority does not grant membership review or activation", () => {
  assert.throws(() => assertMembershipReviewAccess(financeOfficer), error => error.statusCode === 403 && error.code === "FORBIDDEN");
  assert.throws(() => assertMembershipActivationAccess(financeOfficer), error => error.statusCode === 403 && error.code === "FORBIDDEN");
  assert.doesNotThrow(() => assertPaymentVerificationAccess(financeOfficer));
  assert.doesNotThrow(() => assertPaymentReversalAccess(financeOfficer));
});

test("membership reviewer can review but cannot verify or reverse Finance payments", () => {
  assert.doesNotThrow(() => assertMembershipReviewAccess(membershipReviewer));
  assert.throws(() => assertPaymentVerificationAccess(membershipReviewer), error => error.statusCode === 403 && error.code === "FORBIDDEN");
  assert.throws(() => assertPaymentReversalAccess(membershipReviewer), error => error.statusCode === 403 && error.code === "FORBIDDEN");
});
