import assert from "node:assert/strict";
import test from "node:test";
import {
  assertFinancePaymentQueueAccess,
  assertMembershipActivationAccess,
  assertMembershipReviewAccess,
  assertMembershipReviewQueueAccess,
  assertPaymentReversalAccess,
  assertPaymentVerificationAccess,
} from "../../src/platform/workspace-authorization.js";

const forbidden = error => error?.statusCode === 403 && error?.code === "FORBIDDEN";

test("finance officer can verify and reverse payments without membership decision authority", () => {
  const finance = { sub: "finance-user", roles: ["finance_officer"], permissions: [] };
  assert.equal(assertFinancePaymentQueueAccess(finance), finance);
  assert.equal(assertPaymentVerificationAccess(finance), finance);
  assert.equal(assertPaymentReversalAccess(finance), finance);
  assert.throws(() => assertMembershipReviewAccess(finance), forbidden);
  assert.throws(() => assertMembershipActivationAccess(finance), forbidden);
  assert.throws(() => assertMembershipReviewQueueAccess(finance), forbidden);
});

test("membership reviewer can review and activate without finance payment authority", () => {
  const reviewer = { sub: "membership-reviewer", roles: ["membership_reviewer"], permissions: [] };
  assert.equal(assertMembershipReviewAccess(reviewer), reviewer);
  assert.equal(assertMembershipActivationAccess(reviewer), reviewer);
  assert.equal(assertMembershipReviewQueueAccess(reviewer), reviewer);
  assert.throws(() => assertFinancePaymentQueueAccess(reviewer), forbidden);
  assert.throws(() => assertPaymentVerificationAccess(reviewer), forbidden);
  assert.throws(() => assertPaymentReversalAccess(reviewer), forbidden);
});

test("direct permissions grant only their named membership or finance capability", () => {
  const reviewOnly = { sub: "review-only", roles: [], permissions: ["membership.review"] };
  assert.equal(assertMembershipReviewAccess(reviewOnly), reviewOnly);
  assert.equal(assertMembershipReviewQueueAccess(reviewOnly), reviewOnly);
  assert.throws(() => assertMembershipActivationAccess(reviewOnly), forbidden);
  assert.throws(() => assertPaymentVerificationAccess(reviewOnly), forbidden);

  const activateOnly = { sub: "activate-only", roles: [], permissions: ["membership.activate"] };
  assert.equal(assertMembershipActivationAccess(activateOnly), activateOnly);
  assert.throws(() => assertMembershipReviewAccess(activateOnly), forbidden);

  const paymentOnly = { sub: "payment-only", roles: [], permissions: ["finance.payment.verify"] };
  assert.equal(assertFinancePaymentQueueAccess(paymentOnly), paymentOnly);
  assert.equal(assertPaymentVerificationAccess(paymentOnly), paymentOnly);
  assert.throws(() => assertPaymentReversalAccess(paymentOnly), forbidden);
  assert.throws(() => assertMembershipReviewAccess(paymentOnly), forbidden);
});

test("legacy finance.manage remains payment-only and never grants membership decisions", () => {
  const legacyFinance = { sub: "legacy-finance", roles: [], permissions: ["finance.manage"] };
  assert.equal(assertPaymentVerificationAccess(legacyFinance), legacyFinance);
  assert.equal(assertPaymentReversalAccess(legacyFinance), legacyFinance);
  assert.throws(() => assertMembershipReviewAccess(legacyFinance), forbidden);
  assert.throws(() => assertMembershipActivationAccess(legacyFinance), forbidden);
});


test("finance.view grants read-only queue access without payment mutation authority", () => {
  const readOnlyFinance = { sub: "finance-read-only", roles: [], permissions: ["finance.view"] };
  assert.equal(assertFinancePaymentQueueAccess(readOnlyFinance), readOnlyFinance);
  assert.throws(() => assertPaymentVerificationAccess(readOnlyFinance), forbidden);
  assert.throws(() => assertPaymentReversalAccess(readOnlyFinance), forbidden);
});
