function assertAccess(identity, allowedRoles, allowedPermissions, message) {
  const roles = Array.isArray(identity?.roles) ? identity.roles : [];
  const permissions = Array.isArray(identity?.permissions) ? identity.permissions : [];
  if (allowedRoles.some(role => roles.includes(role)) || allowedPermissions.some(permission => permissions.includes(permission))) return identity;
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
  return assertAccess(identity, MEMBERSHIP_DECISION_ROLES, ["membership.review", "members.view"], "Membership review queue permission required.");
}

export function assertFinancePaymentQueueAccess(identity) {
  return assertAccess(identity, ["finance_officer", "system_admin"], ["finance.view", "finance.payment.verify", "finance.payment.reverse", "finance.manage"], "Finance payment queue permission required.");
}

export function assertPaymentVerificationAccess(identity) {
  return assertAccess(identity, ["finance_officer"], ["finance.payment.verify", "finance.manage"], "Finance payment verification permission required.");
}

export function assertPaymentReversalAccess(identity) {
  return assertAccess(identity, ["finance_officer"], ["finance.payment.reverse", "finance.manage"], "Finance payment reversal permission required.");
}
