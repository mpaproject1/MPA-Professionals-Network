import { policyError } from "./identity-policy.js";

const NETWORK_PLUS_ORGANIZATION_ROLES = Object.freeze([
  "owner",
  "administrator",
  "project_manager",
]);

/**
 * Resolve Network-Plus entry access from current database state.
 *
 * Entry access is intentionally separate from permission to mutate a
 * particular organization, business, listing or request. Every such action
 * must continue to use its resource-scoped authorization policy.
 */
export async function resolveNetworkPlusAccess(db, userId) {
  if (!userId) {
    throw policyError(401, "Sign in to access Network-Plus.", "UNAUTHENTICATED");
  }

  const [memberResult, organizationResult] = await Promise.all([
    db.query(
      "select exists(select 1 from membership_record where user_id=$1 and status='active' and start_date<=current_date and (end_date is null or end_date>=current_date)) as eligible",
      [userId],
    ),
    db.query(
      "select exists(select 1 from organization_membership om join organization o on o.id=om.organization_id where om.user_id=$1 and om.status='active' and om.role_code=any($2::text[]) and o.verification_status='verified') as eligible",
      [userId, NETWORK_PLUS_ORGANIZATION_ROLES],
    ),
  ]);

  const member = memberResult.rows?.[0]?.eligible === true;
  const organization = organizationResult.rows?.[0]?.eligible === true;
  const eligible = member || organization;

  return {
    eligible,
    access: { member, organization },
    nextAction: eligible
      ? "Choose Verified Member Discovery or Business Discovery."
      : "A current active MPA membership or active owner, administrator or project-manager access to a verified MPA organization is required.",
  };
}
