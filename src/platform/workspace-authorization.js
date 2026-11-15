import { hasAnyRoleOrPermission } from "./authorization-policy.js";

function assertAccess(identity, allowedRoles, allowedPermissions, message) {
  if (hasAnyRoleOrPermission(identity, allowedRoles, allowedPermissions)) return identity;
  throw Object.assign(new Error(message || "Forbidden."), { statusCode: 403, code: "FORBIDDEN" });
}

const MEMBERSHIP_DECISION_ROLES = ["reviewer", "membership_reviewer", "system_admin"];

export function assertMembershipReviewAccess(identity) {
  return assertAccess(identity, MEMBERSHIP_DECISION_ROLES, ["membership.review"], "Membership review permission required.");
}

export function assertMembershipActivationAccess(identity) {
  return assertAccess(identity, MEMBERSHIP_DECISION_ROLES, ["membership.activate"], "Membership activation permission required.");
}

export function assertMembershipReviewQueueAccess(identity) {
  return assertAccess(identity, MEMBERSHIP_DECISION_ROLES, ["membership.review"], "Membership review queue permission required.");
}

export function assertFinancePaymentQueueAccess(identity) {
  // Queue visibility is a finance-domain capability. Platform administration
  // and the legacy generic finance.manage grant do not confer finance access.
  return assertAccess(
    identity,
    ["finance_officer"],
    ["finance.view", "finance.payment.verify"],
    "Finance payment queue permission required.",
  );
}

export function assertPaymentVerificationAccess(identity) {
  // finance.manage is retained as a legacy payment-only grant.
  return assertAccess(
    identity,
    ["finance_officer"],
    ["finance.payment.verify", "finance.manage"],
    "Finance payment verification permission required.",
  );
}

export function assertPaymentReversalAccess(identity) {
  // finance.manage is retained as a legacy payment-only grant.
  return assertAccess(
    identity,
    ["finance_officer"],
    ["finance.payment.reverse", "finance.manage"],
    "Finance payment reversal permission required.",
  );
}
