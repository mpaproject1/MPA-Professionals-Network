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
