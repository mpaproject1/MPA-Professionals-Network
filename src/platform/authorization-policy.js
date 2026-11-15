/**
 * Canonical platform authorization catalogue and evaluator.
 *
 * This module is the single source for platform role metadata, legacy role
 * bundles, and role/permission evaluation. It deliberately does not resolve
 * tenant, ownership, assignment, membership, consent, or conflict-of-interest
 * scope; domain services must continue to enforce those resource policies.
 */
export const SYSTEM_ADMIN_ROLE = "system_admin";

const PRIVILEGED_ROLE_CODES = new Set([
  "system_admin", "super_admin", "admin", "platform_admin", "reviewer",
  "membership_reviewer", "verification_reviewer", "business_verification_reviewer",
  "business_moderator", "serve_community_reviewer", "network_plus_support",
  "ethics_reviewer", "appeal_reviewer", "finance_officer",
]);

const ROLE_DEFINITIONS = {
  system_admin: { scope: "platform", privileged: true },
  super_admin: { scope: "platform", privileged: true },
  admin: { scope: "platform", privileged: true },
  platform_admin: { scope: "platform", privileged: true },
  reviewer: { scope: "platform", privileged: true },
  membership_reviewer: { scope: "platform", privileged: true },
  verification_reviewer: { scope: "platform", privileged: true },
  business_verification_reviewer: { scope: "platform", privileged: true },
  business_moderator: { scope: "platform", privileged: true },
  serve_community_reviewer: { scope: "platform", privileged: true },
  network_plus_support: { scope: "platform", privileged: true },
  ethics_reviewer: { scope: "platform", privileged: true },
  appeal_reviewer: { scope: "platform", privileged: true },
  finance_officer: { scope: "platform", privileged: true },
  supporting_staff: { scope: "platform" },
  organization_admin: { scope: "organization", assignable: false, assignmentNote: "Use an active organization membership instead." },
  recruiter: { scope: "organization_or_job", assignable: false, assignmentNote: "Use organization membership or job-team scope instead." },
  project_manager: { scope: "organization_or_project", assignable: false, assignmentNote: "Use organization membership or project assignment instead." },
  read_only: { scope: "organization", assignable: false, assignmentNote: "Use an organization membership role instead." },
  mentor: { scope: "profile", assignable: false, assignmentNote: "Mentor eligibility is based on a verified professional profile, not a platform role." },
  organization_representative: { scope: "organization", assignable: false, assignmentNote: "Use an organization membership instead." },
  member: { scope: "self", assignable: false, assignmentNote: "Personal/member identity is managed through the member lifecycle." },
  professional: { scope: "self", assignable: false, assignmentNote: "Professional identity is managed through the profile lifecycle." },
};

/**
 * Compatibility bundles are intentionally narrow and mirror the established
 * dispatcher semantics. In particular, appeal_reviewer is appeal-only and
 * ethics_reviewer receives no general verification-management alias.
 */
export const ROLE_PERMISSION_BUNDLES = Object.freeze({
  system_admin: Object.freeze(["users.manage"]),
  verification_reviewer: Object.freeze(["verification.manage"]),
  appeal_reviewer: Object.freeze(["verification.appeal.review"]),
  supporting_staff: Object.freeze(["reviews.view"]),
  platform_admin: Object.freeze(["users.manage"]),
  admin: Object.freeze(["users.manage"]),
});

export function roleMetadata(roleCode) {
  const definition = ROLE_DEFINITIONS[roleCode];
  if (!definition) {
    return {
      role_code: roleCode,
      domain: "unknown",
      status: "blocked",
      scope: "unknown",
      scopeType: "unknown",
      active: false,
      assignable: false,
      privileged: false,
      privilegeTier: "none",
      capabilities: [],
      assignableBy: [],
      replacementCode: null,
      migrationPlan: "Review all assignments and code references before enabling this role.",
      assignmentNote: "Unclassified role. It must be reviewed before it can be assigned through platform administration.",
    };
  }
  const privileged = definition.privileged === true || PRIVILEGED_ROLE_CODES.has(roleCode);
  const assignable = definition.assignable !== false && definition.scope === "platform";
  const domain = definition.scope === "platform" ? "platform"
    : definition.scope === "organization" || definition.scope === "organization_or_job" ? "organization"
    : definition.scope === "organization_or_project" ? "project"
    : definition.scope === "profile" || definition.scope === "self" ? "identity"
    : "resource";
  return {
    role_code: roleCode,
    domain,
    status: definition.status || "canonical",
    scope: definition.scope,
    scopeType: definition.scope,
    active: definition.active !== false,
    assignable: assignable && definition.active !== false,
    privileged,
    privilegeTier: privileged ? "privileged" : "standard",
    capabilities: [...(ROLE_PERMISSION_BUNDLES[roleCode] || [])],
    assignableBy: assignable ? (privileged ? [SYSTEM_ADMIN_ROLE] : ["users.manage"]) : [],
    replacementCode: definition.replacementCode || null,
    migrationPlan: definition.migrationPlan || null,
    assignmentNote: definition.assignmentNote || null,
  };
}

/**
 * Canonical direct-permission catalogue.
 *
 * Codes seeded by migrations 024, 20261030190000 and 20261030210000 are
 * registered here. Additional codes observed in existing service SQL are
 * retained as legacy/runtime entries until their historical seed source and
 * live database presence are reconciled. Resource/tenant scope is never
 * implied by possession of a capability.
 */
export const PERMISSIONS = Object.freeze({
  DASHBOARD_VIEW: "dashboard.view",
  MEMBERS_VIEW: "members.view",
  MEMBERS_MANAGE: "members.manage",
  MEMBERSHIP_REVIEW: "membership.review",
  MEMBERSHIP_ACTIVATE: "membership.activate",
  FINANCE_VIEW: "finance.view",
  FINANCE_MANAGE: "finance.manage",
  FINANCE_PAYMENT_VERIFY: "finance.payment.verify",
  FINANCE_PAYMENT_REVERSE: "finance.payment.reverse",
  ORGANIZATIONS_VIEW: "organizations.view",
  ORGANIZATIONS_MANAGE: "organizations.manage",
  ORGANIZATIONS_REVIEW: "organizations.review",
  JOBS_VIEW: "jobs.view",
  JOBS_MANAGE: "jobs.manage",
  JOBS_REVIEW: "jobs.review",
  APPLICATIONS_VIEW: "applications.view",
  APPLICATIONS_MANAGE: "applications.manage",
  SERVICES_VIEW: "services.view",
  SERVICES_MANAGE: "services.manage",
  MENTORSHIP_VIEW: "mentorship.view",
  MENTORSHIP_MANAGE: "mentorship.manage",
  VERIFICATION_VIEW: "verification.view",
  VERIFICATION_MANAGE: "verification.manage",
  VERIFICATION_APPEAL_REVIEW: "verification.appeal.review",
  REVIEWS_VIEW: "reviews.view",
  REPORTS_VIEW: "reports.view",
  REPORTS_SENSITIVE: "reports.sensitive",
  USERS_VIEW: "users.view",
  USERS_MANAGE: "users.manage",
  PERMISSIONS_MANAGE: "permissions.manage",
  SETTINGS_MANAGE: "settings.manage",
  FILES_VIEW_PRIVATE: "files.view_private",
  NOTIFICATIONS_MANAGE: "notifications.manage",
  ETHICS_CASE_INTAKE: "ethics.case.intake",
  ETHICS_CASE_REVIEW: "ethics.case.review",
  ETHICS_CASE_ASSIGN: "ethics.case.assign",
  SUPPORT_MANAGE: "support.manage",
  SUPPORT_QUEUE_MANAGE: "support.queue.manage",
  SUPPORT_INQUIRIES_MANAGE: "support.inquiries.manage",
});

const SEEDED_PERMISSION_METADATA = {
  "dashboard.view": ["Dashboard", "View dashboard", false, false],
  "members.view": ["Membership", "View members", false, false],
  "members.manage": ["Membership", "Manage members", true, false],
  "membership.review": ["Membership", "Review membership applications", true, false],
  "membership.activate": ["Membership", "Activate approved memberships", true, false],
  "finance.view": ["Finance", "View finance", true, false],
  "finance.manage": ["Finance", "Manage finance", true, false],
  "finance.payment.verify": ["Finance", "Verify membership payments", true, false],
  "finance.payment.reverse": ["Finance", "Reverse membership payments", true, false],
  "organizations.view": ["Organizations", "View organizations", false, false],
  "organizations.manage": ["Organizations", "Manage organizations", true, false],
  "organizations.review": ["Organizations", "Review organization verification", true, false],
  "jobs.view": ["Recruitment", "View jobs and pipeline", true, false],
  "jobs.manage": ["Recruitment", "Manage jobs", true, false],
  "applications.view": ["Applications", "View applications", true, false],
  "applications.manage": ["Applications", "Manage applications", true, false],
  "services.view": ["Services", "View services", false, false],
  "services.manage": ["Services", "Manage services", true, false],
  "mentorship.view": ["Mentorship", "View mentorship", false, false],
  "mentorship.manage": ["Mentorship", "Manage mentorship", true, false],
  "verification.view": ["Verification", "View verification", true, false],
  "verification.manage": ["Verification", "Manage verification", true, false],
  "reviews.view": ["Review queues", "View review queues", true, false],
  "reports.view": ["Reports", "View reports", true, false],
  "users.view": ["User administration", "View users", true, false],
  "users.manage": ["User administration", "Manage users", true, false],
  "permissions.manage": ["User administration", "Manage user permissions", true, true],
  "settings.manage": ["Platform settings", "Manage settings", true, true],
  "files.view_private": ["Private files", "View private files", true, false],
  "notifications.manage": ["Notifications", "Manage notifications", false, false],
  "finance.payment.verify": ["Finance", "Verify membership payments", true, false],
  "finance.payment.reverse": ["Finance", "Reverse membership payments", true, false],
  "verification.appeal.review": ["Verification", "Review independent verification appeals", true, false],
  "ethics.case.intake": ["Ethics", "Submit a confidential ethics concern", true, false],
  "ethics.case.review": ["Ethics", "Review assigned ethics cases", true, false],
  "ethics.case.assign": ["Ethics", "Assign ethics reviewers", true, true],
};

const LEGACY_PERMISSION_METADATA = {
  "jobs.review": ["Recruitment", "Review vacancies", true, false],
  "reports.sensitive": ["Reports", "View sensitive reports", true, false],
  "support.manage": ["Support", "Manage support desk", true, false],
  "support.queue.manage": ["Support", "Manage support queues", true, false],
  "support.inquiries.manage": ["Support", "Manage support inquiries", true, false],
};

export const PERMISSION_CATALOG = Object.freeze(Object.fromEntries(
  Object.entries(PERMISSIONS).map(([, code]) => {
    const seeded = SEEDED_PERMISSION_METADATA[code];
    const legacy = LEGACY_PERMISSION_METADATA[code];
    const metadata = seeded || legacy || ["Unclassified", code, true, false];
    return [code, Object.freeze({
      code,
      area: metadata[0],
      label: metadata[1],
      sensitive: metadata[2],
      systemOnly: metadata[3],
      source: seeded ? "migration-seeded" : legacy ? "legacy-runtime" : "unclassified",
      assignable: seeded !== undefined && !metadata[3],
    })];
  }),
));

export function permissionMetadata(permissionCode) {
  return PERMISSION_CATALOG[permissionCode] || Object.freeze({
    code: permissionCode,
    area: "Unknown",
    label: "Unclassified permission",
    sensitive: true,
    systemOnly: true,
    source: "unknown",
    assignable: false,
  });
}

export function isKnownPermission(permissionCode) {
  return Object.prototype.hasOwnProperty.call(PERMISSION_CATALOG, permissionCode);
}

export function assertKnownPermissionCodes(permissionCodes) {
  const unknown = [...new Set((Array.isArray(permissionCodes) ? permissionCodes : [])
    .filter((code) => !isKnownPermission(code)))];
  if (unknown.length) {
    throw Object.assign(new Error("One or more permission codes are not in the authorization catalogue."), {
      statusCode: 400,
      code: "UNKNOWN_PERMISSION",
      details: { unknown },
    });
  }
  return true;
}

export function isPrivilegedRole(roleCode) {
  return roleMetadata(roleCode).privileged;
}

export function hasRole(identity, roleCode) {
  const roles = Array.isArray(identity?.roles) ? identity.roles : [];
  if (roles.includes(roleCode)) return true;
  const permissions = Array.isArray(identity?.permissions) ? identity.permissions : [];
  return (ROLE_PERMISSION_BUNDLES[roleCode] || []).some((permission) => permissions.includes(permission));
}

export function hasAnyRoleOrPermission(identity, allowedRoles = [], allowedPermissions = []) {
  const permissions = Array.isArray(identity?.permissions) ? identity.permissions : [];
  return allowedRoles.some((roleCode) => hasRole(identity, roleCode))
    || permissions.some((permission) => allowedPermissions.includes(permission));
}

export function effectiveCapabilities(identity) {
  const capabilities = new Set(Array.isArray(identity?.permissions) ? identity.permissions : []);
  for (const roleCode of Array.isArray(identity?.roles) ? identity.roles : []) {
    for (const permission of ROLE_PERMISSION_BUNDLES[roleCode] || []) capabilities.add(permission);
  }
  return [...capabilities].sort();
}

export function hasCapability(identity, permissionCode) {
  return effectiveCapabilities(identity).includes(permissionCode);
}

export function canAssignRole(actorIdentity, roleCode) {
  const metadata = roleMetadata(roleCode);
  if (!metadata.active || !metadata.assignable || metadata.scope !== "platform") return false;
  const actorRoles = Array.isArray(actorIdentity?.roles) ? actorIdentity.roles : [];
  if (metadata.privileged) return actorRoles.includes(SYSTEM_ADMIN_ROLE);
  return hasCapability(actorIdentity, "users.manage");
}
