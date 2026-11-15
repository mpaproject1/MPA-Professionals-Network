# MPA Platform Authorization and Role Audit

**Repository:** `mpaproject1/MPA-Professionals-Network`  
**Branch reviewed:** `feat/workstream-3-progress-members-workspace` (PR #18)  
**Review date:** 2026-11-15  
**Review type:** Static source, migration, route, frontend, and test review  
**Change made by this audit:** Documentation only. No authorization code, role assignments, permission records, migrations, or deployment configuration were changed.

## 1. Executive conclusion

The concern about overlapping roles and permissions is valid. The repository has useful security controls, but authorization policy is distributed across several independent mechanisms:

1. Database platform roles in `app_role` and assignments in `app_user_role`.
2. Direct per-user permissions in `app_user_permission`.
3. Role-to-permission aliases hard-coded separately in `src/platform/auth.js` and `server.js`.
4. Route-specific role/permission checks in the HTTP dispatcher.
5. Service-level resource, organization, reviewer-assignment, membership, and participant checks.
6. An admin UI role catalogue that calculates whether roles are assignable.

The most important defect is that the admin UI's role assignability metadata is not enforced by the backend role-mutation endpoint. There are also read-only permissions accepted by routes that perform more than reading, and a membership review queue that accepts the broad `members.view` capability. These are concrete authorization-policy inconsistencies, not merely naming concerns.

**Recommendation:** Do not solve individual 403 responses by adding broad roles or permissions. First establish one canonical role/permission policy, enforce it server-side, and preserve resource-level scope and separation-of-duties checks. Migrate in stages with explicit compatibility tests.

## 2. Review scope and limitations

Reviewed source includes:

- `server.js`: authentication middleware, route-level authorization helpers, and representative admin, membership, finance, verification, support, and review routes.
- `src/platform/auth.js`: token verification, role helper, role-to-permission aliases, and current-role replacement.
- `src/platform/workspace-authorization.js`: membership and finance queue/action gates.
- `src/platform/user-admin.js`: role listing, role changes, direct-permission changes, privileged-role handling, session revocation, and audit logging.
- `src/platform/identity-policy.js`: professional identity and organization resource boundaries.
- `web/app/admin/accounts/page.tsx` and `web/app/admin/users-table.tsx`: account-management UI gates and role/permission controls.
- Role and permission migrations including `002_platform_foundation.sql`, `006_vetting_and_trust_framework.sql`, `017_production_security_and_sessions.sql`, `024_per_user_permission_matrix.sql`, `20261030190000_membership_finance_permission_separation.sql`, and `20261030210000_phase3_ethics_volunteer_role_scopes.sql`.
- Authorization tests including `test/p0/workspace-authorization.test.js`, `test/p0/role-workspace-authorization.test.js`, and `test/p0/role-workspace-boundaries.integration.test.js`.

This is a repository-source audit, not a live production database audit. The current contents of production `app_role`, `app_user_role`, and `app_user_permission` have not been queried. Therefore, a role mentioned in source but not found in the seed migrations listed below is classified as **unreconciled**, not proven absent from production. This review did not execute the test suite or perform live endpoint penetration testing.

## 3. How authorization currently works

### 3.1 Authentication and identity construction

The `auth(req)` middleware in `server.js` validates the signed token, requires a session ID, verifies that the session is active and not revoked, checks account status and email verification, then loads current roles from `app_user_role` and direct permissions from `app_user_permission`.

This is a positive control: the server explicitly replaces token role claims with current database roles, so stale role claims are not intended to remain authoritative. The middleware also enforces recovery-session restrictions, administrator passkey requirements, and one-time credential setup restrictions.

### 3.2 Multiple authorization helper implementations

There are at least three related implementations:

- `src/platform/auth.js` exports `requireRole` and defines its own `ROLE_PERMISSION` map.
- `server.js` defines `anyRole`, `anyRoleOrPermission`, and a second `ROLE_PERMISSION` map.
- `src/platform/workspace-authorization.js` defines `assertAccess` and domain-specific wrappers.

All of these use variations of role OR permission semantics. A permission can therefore substitute for a role in some checks, and the exact substitution depends on which helper a route uses.

### 3.3 Direct permissions are separate from role bundles

Migration `024_per_user_permission_matrix.sql` creates `app_permission` and `app_user_permission`. It does not establish a central role-to-permission mapping table. Instead, the permission catalog is supplemented by hard-coded role aliases in application code and direct user grants in the database.

This means the effective access policy is not represented in one authoritative catalogue.

## 4. Findings

### F-01 — Role assignability is a UI hint, not a backend enforcement rule

**Severity: High**

**Evidence:**
- `src/platform/user-admin.js`: `listRoles()` marks roles as `assignable`, `privileged`, and `scope` using the hard-coded `PRIVILEGED_ROLES` and `NON_PLATFORM_ROLES` collections.
- The same file's `updateUser()` checks that the requested role exists and blocks codes in `PRIVILEGED_ROLES` for non-system administrators. It does not reject roles classified in `NON_PLATFORM_ROLES`, and it does not enforce the `assignable` result from `listRoles()`.
- `web/app/admin/users-table.tsx` filters the visible role choices using `roleCatalog.filter(r => r.assignable ...)`.

**Impact:** A caller who can invoke the account update API directly is not bound by the UI's `assignable` filter. If a role exists in `app_role` but is classified as organization-, project-, or profile-scoped in `NON_PLATFORM_ROLES`, the backend role update path does not itself enforce that boundary. This can create platform-role assignments that the interface intentionally hides.

**Required correction:** Enforce role scope and assignability inside the backend mutation transaction. The UI must be a presentation of the same policy, never the enforcement point.

### F-02 — Unknown/unclassified role codes default to platform-assignable

**Severity: High**

**Evidence:** `listRoles()` sets `scope: nonPlatform?.scope || "platform"` and `assignable: !nonPlatform && (!privileged || actorRoles.includes(SYSTEM_ROLE))`.

**Impact:** A role code not listed in either hard-coded set is treated as a platform role and, unless separately listed as privileged, appears assignable to an ordinary account administrator. This is an unsafe default-allow classification. It also makes new role seeds dangerous: adding a role to a migration without updating the hard-coded classification can silently make it assignable.

**Required correction:** Default unknown role codes to inactive/unassignable and fail closed. Every role must have explicit metadata and an approved authority/scope classification before it can be assigned.

### F-03 — Read-only `members.view` is accepted by membership review queue access

**Severity: High**

**Evidence:**
- `src/platform/workspace-authorization.js`: `assertMembershipReviewQueueAccess()` accepts the roles `reviewer`, `membership_reviewer`, `system_admin` OR either `membership.review` or `members.view`.
- Migration `024_per_user_permission_matrix.sql` describes `members.view` as viewing the member directory and membership records permitted by data scope.
- The review/decision helpers separately use `membership.review` and `membership.activate`.

**Impact:** A direct `members.view` grant can pass the membership review queue gate even though it is described as a viewing permission for directory/records, not as authority to access submitted applications and review work. This blurs the boundary between directory visibility and confidential application processing.

**Required correction:** Define a dedicated queue-view capability (for example `membership.review.queue.view`) or use the narrow review capability for queue access. Keep application review and membership activation as separate action permissions.

### F-04 — Read-only `members.view` is accepted on membership-card batch/print POST routes

**Severity: High**

**Evidence:** In `server.js`, the `GET /api/v1/admin/membership-cards/eligible` route and the `POST /api/v1/admin/membership-cards/batch` and `POST /api/v1/admin/membership-cards/print` routes use `anyRoleOrPermission(identity, ["system_admin","reviewer"], ["members.view","members.manage"])`.

**Impact:** The same read-oriented `members.view` permission that is defined for member-directory visibility can satisfy authorization for POST operations that generate/batch/print membership cards. That is a capability/action mismatch. The exact downstream effect should be checked against the card service, but the route-level gate is already broader than the permission description.

**Required correction:** Separate card preview/read access from card generation/printing. Require a specific operational capability for batch generation and print, and test that `members.view` alone is denied on every mutating route.

### F-05 — Role-to-permission aliases diverge between authentication helpers

**Severity: High**

**Evidence:**
- `src/platform/auth.js` maps `appeal_reviewer` to `verification.manage`.
- `server.js` maps `appeal_reviewer` to `verification.appeal.review`.
- The same files also carry separate maps for other aliases such as `verification_reviewer`, `supporting_staff`, `admin`, and `platform_admin`.

**Impact:** The same identity may pass or fail a permission-based role check depending on whether a route uses `requireRole` from `auth.js` or `anyRole/anyRoleOrPermission` from `server.js`. In the appeal-reviewer example, the helper-level role alias can grant general verification-management semantics in one path but appeal-specific semantics in another. This undermines predictable least privilege and can defeat the intended separation between original verification and independent appeal review.

**Required correction:** Replace duplicate maps with one canonical authorization policy function and test all routes that consume each role.

### F-06 — Role and permission catalogues are not one authoritative source

**Severity: High**

**Evidence:**
- Role definitions are seeded in multiple migrations.
- Role classification and role-to-permission aliases are separately hard-coded in `user-admin.js`, `auth.js`, and `server.js`.
- Migration `024_per_user_permission_matrix.sql` creates the direct-permission catalogue and direct grants, but no role-to-permission association is created in that migration.

**Impact:** Adding or renaming a role requires coordinated edits across migrations, backend maps, UI assumptions, and tests. Missing one location can create unknown-role assignability, inconsistent route access, or confusing admin screens. The same permission name can also be interpreted differently by different helper functions.

**Required correction:** Introduce a canonical role catalogue with explicit scope, lifecycle, assignability, privilege, and assigner policy; introduce role-to-permission bundles in data or a single immutable code catalogue. Do not allow independent maps to drift.

### F-07 — Role seeds, code references, and test fixtures are not demonstrably reconciled

**Severity: Medium–High**

**Evidence:**
- `002_platform_foundation.sql` seeds `system_admin`, `reviewer`, `finance_officer`, and `member`.
- `006_vetting_and_trust_framework.sql` seeds `supporting_staff`, `verification_reviewer`, `ethics_reviewer`, and `appeal_reviewer`.
- `017_production_security_and_sessions.sql` seeds `admin`, `organization_admin`, `recruiter`, `project_manager`, `read_only`, and `mentor`.
- The code and tests also reference role codes including `membership_reviewer`, `platform_admin`, `super_admin`, `business_verification_reviewer`, `business_moderator`, `serve_community_reviewer`, `network_plus_support`, and `organization_representative`.

**Impact:** The codebase has a larger role vocabulary than the base role seed migrations above. Some of these may be seeded in later migrations or provisioned by other workflows; this audit does not assert they are absent from the live database. Without a complete migration-to-production reconciliation, administrators cannot know which codes are canonical, legacy, deprecated, or valid only in a particular scope.

**Required correction:** Produce a migration-derived role inventory and compare it to the live database before changing assignments. Mark each code canonical, alias, deprecated, scoped, or invalid. Do not delete or rename live roles until all assignments and code references are reconciled.

### F-08 — Platform roles and organization-scoped roles share a role namespace

**Severity: Medium–High**

**Evidence:**
- `app_role` includes platform role records such as `admin` and `reviewer`, as well as `organization_admin`, `recruiter`, `project_manager`, `read_only`, and `mentor`.
- `src/platform/user-admin.js` attempts to mark some of these as non-platform roles.
- `src/platform/identity-policy.js` separately defines organization resource roles and checks active `organization_membership` for a specific organization.
- Organization/job service code and tests also enforce membership/assignment scope.

**Impact:** A shared namespace makes it easy for developers or administrators to mistake an organization/job role for a global platform role. The service-level organization check is an important safeguard and must remain authoritative; platform role presence must never substitute for membership in the specific organization or assignment to a specific resource.

**Required correction:** Make authority domain and scope explicit in role metadata. Prefer organization membership roles for organization permissions and job/project assignment roles for resource permissions. Do not use platform role assignment as a substitute.

### F-09 — Service-level and route-level permissions can be interpreted differently

**Severity: Medium–High**

**Evidence:** `server.js` performs route-level checks using `anyRoleOrPermission`, while domain modules also implement their own resource and role checks. For example, `identity-policy.js` checks the active membership row for the requested organization, and verification services check reviewer assignment and elevated verification authority. Existing role-workspace tests explicitly assert these boundaries.

**Impact:** Layered checks are necessary, but if their definitions differ, an API route can appear to grant access while the service later rejects it—or a broad route check can expose data before a narrower check is reached. This is a likely source of inconsistent 403s and makes debugging difficult.

**Required correction:** Keep service-level object/scope checks, but make the route-level capability check and service-level resource policy consume the same identity/policy contract. Every route must have an explicit action capability and every service must independently enforce resource scope.

### F-10 — Frontend administrator gating does not mirror the complete backend capability policy

**Severity: Medium**

**Evidence:**
- `web/app/admin/accounts/page.tsx` derives `isPlatformAdmin` from token role claims `system_admin`, `admin`, and `platform_admin`, then conditionally loads account and role APIs.
- Backend `auth(req)` refreshes current database roles on each authenticated request.
- `src/platform/user-admin.js` has additional permission-aware backend rules and system-admin-only direct-permission controls.

**Impact:** The frontend may hide or show controls based on a simplified token-role check while the backend accepts a broader or different permission path. Since the backend remains authoritative this is not, by itself, proof of an access bypass, but it can create misleading UI states and apparent authorization failures.

**Required correction:** Return effective capabilities from an authenticated server endpoint and use them for UI visibility. Continue enforcing all permissions on the server; never trust frontend capability flags.

## 5. Existing controls to preserve

The audit found important safeguards that should not be weakened during remediation:

- Current database roles replace stale JWT role claims during request authentication.
- Sessions are revoked after role/status changes and direct permission changes.
- The last `system_admin` role cannot be removed through the inspected user-admin path.
- Administrators cannot change their own roles or direct permissions.
- Role/status and direct-permission changes require audit reasons and are written to audit logs.
- Direct per-user permissions are limited to known catalogue codes; system-only permissions are blocked from ordinary direct assignment.
- The user-admin path contains ethics-reviewer separation checks against general verification and appeal permissions/roles.
- Organization access checks require an active membership for the requested organization.
- Verification case access is assignment-aware, and tests cover reviewer boundaries.
- Finance and membership decision tests explicitly protect separation of duties: finance officers must not review/activate membership applications, and membership reviewers must not verify/reverse payments.
- Support inquiry tests protect assignment scope and consent-based contact detail visibility.

These controls are part of the security baseline. Do not remove them as a shortcut to make a workspace load.

## 6. Recommended target authorization model

Adopt a permission-first model with explicit scope:

### 6.1 One canonical role catalogue

Every role must define at least:

- `role_code` (stable identifier)
- `display_name`
- `authority_domain` (platform, organization, job, project, case, profile)
- `scope_type` (global, organization, resource, assigned_case, self)
- `assignable` and `active`
- `privileged`
- `assignable_by` (which actor capability or role may assign it)
- `deprecated_at` / replacement role, where applicable

Unknown roles must be denied by default. A role with organization or resource scope must not be assignable through the platform account-role endpoint.

### 6.2 One canonical permission catalogue and role bundle mapping

Use one canonical permission catalogue and an explicit role-to-permission mapping (for example, `app_role_permission`). Keep direct per-user grants only for exceptional, narrowly scoped delegation. Direct grants should have a reason, assigning actor, created time, expiry/review date where appropriate, and full audit history.

A role should represent a coherent job function; a permission should represent one action. Avoid permissions such as `members.view` being reused as a proxy for application review, card printing, or other privileged actions.

### 6.3 Separate capability from resource scope

Authorization should follow this sequence:

1. Authenticate an active session and load current roles and direct grants.
2. Resolve the required action capability from one policy source.
3. Resolve the resource scope (organization membership, job/project assignment, reviewer assignment, case participation, ownership, consent, etc.).
4. Apply separation-of-duties and conflict-of-interest checks.
5. Execute the operation and write the required audit event.

A role or direct permission must not bypass steps 3 or 4.

### 6.4 Distinguish read, queue, and decision actions

At minimum, use separate capabilities for:
- member directory visibility;
- membership application queue visibility;
- membership application review;
- membership activation;
- payment queue visibility;
- payment verification;
- payment reversal;
- membership-card preview/read;
- membership-card batch generation/printing.

Keep finance, membership decision, verification, ethics, and appeals independent unless a documented governance policy explicitly authorizes a combination.

## 7. Staged remediation plan

### Stage 0 — Freeze policy drift and inventory actual state

1. Do not grant additional broad roles to resolve current 403 errors.
2. Export all role codes and descriptions from live `app_role`.
3. Export all active user-role assignments, direct permission grants, and their assigning actors.
4. Compare live records with every role seed and role reference in migrations/source.
5. Identify unknown, duplicate, unused, deprecated, cross-domain, and privileged assignments.
6. Produce a reviewed role-to-workspace/action matrix and have the platform owner approve it.

**Gate:** No production role or permission mutation until the inventory is reconciled and approved.

### Stage 1 — Close concrete authorization inconsistencies

1. Enforce `assignable`, scope, and assigner policy in the backend `updateUser()` transaction, not only in the UI.
2. Change role classification to fail closed for unrecognized codes.
3. Replace `members.view` as a membership review queue permission with a narrow queue-view capability.
4. Remove `members.view` from card batch/print POST route authorization; add an explicit card-generation/print capability.
5. Unify `ROLE_PERMISSION` and all role/permission helper semantics.
6. Confirm the intended permission for appeal reviewers and ensure they cannot acquire general verification-management access through a helper alias.

**Gate:** Add regression tests for every finding before merging these code changes.

### Stage 2 — Centralize authorization policy

1. Implement the canonical role and permission catalogue.
2. Add role-to-permission bundles and explicit scope metadata.
3. Introduce a shared policy evaluator used by routes and services.
4. Add an effective-capabilities response for the frontend.
5. Keep service-level object authorization and separation-of-duties checks mandatory.

**Gate:** Existing authorization tests and new route matrix tests pass without weakening existing assertions.

### Stage 3 — Reconcile and migrate data safely

1. Generate a dry-run mapping from every live role code to its canonical replacement.
2. Identify users who would gain or lose capabilities under the proposed mapping.
3. Require approval for privileged and cross-domain changes.
4. Apply a backward-compatible migration that preserves existing assignments until the new policy is verified.
5. Revoke sessions where effective access changes.
6. Keep a rollback mapping and audit record for each converted assignment.

**Gate:** Verify counts and effective capabilities before and after migration; no unexplained role assignment is discarded.

### Stage 4 — Continuous authorization assurance

Add a table-driven authorization matrix covering:

- role × endpoint × HTTP method;
- direct permission × endpoint × HTTP method;
- role + direct permission combinations;
- organization and job cross-tenant attempts;
- assigned versus unassigned reviewer access;
- ethics/verification/appeal conflict-of-interest cases;
- membership review versus activation;
- finance view versus verify versus reverse;
- read-only access against every POST/PATCH/PUT/DELETE route;
- role revocation and session revocation;
- unknown and deprecated role codes;
- frontend visibility versus backend enforcement.

Tests must assert both allowed and denied cases. Do not solve a failing test by deleting it, reducing its assertions, or broadening the permission.

## 8. Immediate regression cases required

Before changing implementation, add or confirm tests for these exact cases:

| Actor capability | Operation | Expected |
|---|---|---|
| `members.view` only | Open membership review queue | Deny |
| `members.view` only | Batch/print membership cards | Deny |
| `membership.review` | Review application | Allow |
| `membership.review` only | Activate membership | Deny |
| `membership.activate` only | Review application | Deny |
| `finance.view` only | Verify/reverse payment | Deny |
| `finance.payment.verify` | Reverse payment | Deny |
| `finance_officer` | Review/activate membership | Deny |
| `membership_reviewer` | Verify/reverse payment | Deny |
| Non-system account admin | Assign a non-platform scoped role | Deny |
| Non-system account admin | Assign unknown/unclassified role | Deny |
| `appeal_reviewer` | General verification management | Deny unless explicitly and separately authorized |
| Organization role in org A | Manage org B | Deny |
| Unassigned reviewer | Read/modify another reviewer's case | Deny |

## 9. What this audit does not authorize

This document does not authorize:
- changing a user's live roles or direct permissions;
- deleting or renaming role records;
- adding a broad permission to bypass a 403;
- modifying database migrations or applying them to production;
- changing authentication/passkey requirements;
- changing organization, job, case, or membership resource boundaries;
- deploying code.

The next implementation should be a separate, test-led change set, starting with Stage 1. The live database inventory and an approved access matrix are prerequisites to any production role reconciliation.

## 10. Source references

- `server.js` — authentication middleware and route-level helpers; membership, finance, verification, support, and admin route gates.
- `src/platform/auth.js` — `requireRole`, role alias map, current-role helper.
- `src/platform/workspace-authorization.js` — `assertAccess`, membership and finance access gates.
- `src/platform/user-admin.js` — `PRIVILEGED_ROLES`, `NON_PLATFORM_ROLES`, `listRoles`, `updateUser`, `updateUserPermissions`.
- `src/platform/identity-policy.js` — professional identity and organization-scoped authorization.
- `web/app/admin/accounts/page.tsx` — frontend account-administration gate.
- `web/app/admin/users-table.tsx` — role choices and direct-permission UI.
- `db/migrations/002_platform_foundation.sql` — initial platform role seeds.
- `db/migrations/006_vetting_and_trust_framework.sql` — supporting, verification, ethics, and appeal role seeds.
- `db/migrations/017_production_security_and_sessions.sql` — admin and organization-related role seeds.
- `db/migrations/024_per_user_permission_matrix.sql` — permission and direct-grant schema.
- `db/migrations/20261030190000_membership_finance_permission_separation.sql` — distinct membership and finance capabilities.
- `db/migrations/20261030210000_phase3_ethics_volunteer_role_scopes.sql` — independent appeal and ethics permissions.
- `test/p0/workspace-authorization.test.js` — membership/finance separation tests.
- `test/p0/role-workspace-authorization.test.js` and `test/p0/role-workspace-boundaries.integration.test.js` — resource-scope and reviewer-boundary tests.

---

**Audit status:** Findings recorded. Implementation and live database reconciliation remain separate approval-gated work.


## 11. Foundational requirement — account and authority boundaries

This section is a platform-wide architecture requirement. It applies to authentication, account onboarding, workspace navigation, account administration, API authorization, data ownership, and future modules. It is not a UI-only account-switching feature.

### 11.1 Do not model these four concepts as interchangeable account types

MPA must distinguish four authority domains:

1. **Platform administration** — authority delegated by MPA to operate the association's platform. Examples include system security administration, membership review, finance operations, verification, support, and platform configuration. These are platform-scoped roles/capabilities assigned to a person. They do not make that person the owner or administrator of an organization.
2. **Organization account** — the legal or operational organization record. The organization is an entity, not a human login. People access its workspace only through an active `organization_membership` row for that exact organization, with an allowed organization role. Organization verification status and organization membership status are separate checks.
3. **Professional identity/workspace** — a person's professional profile and personal career/networking capabilities. It belongs to the person. It does not grant access to an employer's organization workspace, another person's private profile, or platform administration.
4. **Member identity and membership entitlement** — the person's association identity and membership lifecycle. A login/person identity is not proof of current paid/active membership. Membership eligibility must be derived from the membership record and its current status/date/fee rules, not from a role label alone.

**Critical modelling decision:** A person should normally have one authenticated human identity (`app_user`) and may have several separately authorized contexts: personal/member, professional, one or more organizations, and (only if separately appointed) platform operations. Do not create duplicate human logins merely because a person wears multiple hats. Conversely, do not merge these contexts into one broad union of roles. The active workspace/context is a navigation and policy input, never an authorization grant by itself.

The existing code already points toward this separation: `identity-policy.js` distinguishes professional identity roles from organization resource roles and checks active organization membership against a requested organization ID; migration `009_phase3_organizations_jobs.sql` stores organization roles in `organization_membership`, not merely in the person's global role list. Preserve and complete this model.

### 11.2 Canonical account/context matrix

| Context | Identity/resource owner | Authority source | Scope | Must never imply |
|---|---|---|---|---|
| Platform operations | MPA platform | Explicit platform role bundle and narrowly scoped direct grants | Platform modules/actions; sensitive operations may be further assigned/case-scoped | Ownership/admin rights in any organization; access to every private user record without purpose and data policy |
| Organization workspace | Organization entity | Active `organization_membership` for the requested organization + role + action capability | One organization ID; job/team/resource scope may narrow it further | Platform admin, another organization, personal member entitlement, or unrestricted access to all employees/applicants |
| Professional workspace | Person | Professional profile capability/record and action permissions | Own professional identity and explicitly shared/public information | Organization administration, platform administration, active association membership |
| Member workspace | Person | Authenticated person identity; membership record for member-only entitlements | Own membership, own applications/requests, and explicitly authorized member services | Platform administration, organization authority, another member's private data, or professional credentials not separately established |

The system must additionally support public/guest access as a distinct unauthenticated policy, not as a weak member account.

### 11.3 The authorization decision contract

Every protected request must resolve all of the following explicitly:

- **Principal:** the authenticated human `app_user` ID and active, non-revoked session.
- **Context:** personal/member, professional, platform, or a specific organization context. Context selection cannot add permissions.
- **Action:** the exact capability required (for example, `organizations.jobs.create`, `membership.application.review`, `finance.payment.verify`).
- **Resource:** the target object and its owner/tenant (organization ID, job ID, application ID, case ID, member ID, file ID).
- **Scope:** self, organization, assigned resource/case, platform queue, or another explicitly defined scope.
- **Relationship/state:** active organization membership, current membership entitlement, ownership, reviewer assignment, participant relationship, consent, verification status, and resource lifecycle as applicable.
- **Separation-of-duties:** no conflicting reviewer/approver/subject relationship or prohibited combination.
- **Outcome:** allow or deny, with a stable reason code and audit event for sensitive actions.

A role name alone must never authorize access to an object. A direct permission alone must never bypass tenant/resource scope, status, consent, or separation-of-duties checks.

### 11.4 Required workspace entry and switching behavior

1. Authenticate once as the person; keep the stable principal ID and session.
2. Resolve the contexts the person is actually entitled to use from current database relationships and assignments.
3. Show only those workspaces in navigation. Do not infer a context from a role label or a stale token claim.
4. When a person chooses an organization, carry its organization ID as the requested context, then verify active membership and capability server-side on every request.
5. Switching from Organization A to Organization B must replace the selected context, not accumulate A's and B's permissions.
6. Returning to the personal/member workspace must drop organization context. Platform operations remains a separately authorized context and must not inherit whichever organization was last selected.
7. A removed, suspended, expired, or revoked relationship must immediately stop authorizing requests, even if an old browser tab remains open.
8. A deep link to an unauthorized workspace or resource must return a consistent 403/404 policy response and a clear next step; it must not redirect repeatedly between workspaces or retry the same forbidden request.
9. The frontend may hide inaccessible navigation, but backend APIs remain authoritative. Never use UI visibility as a security boundary.
10. Provide one canonical `/api/v1/me/contexts` (or equivalent) response for current context availability and effective capabilities. Do not duplicate context-resolution logic in each page.

### 11.5 Role and relationship placement rules

- Platform roles belong to platform authorization assignments, not organization membership rows.
- Organization roles belong to `organization_membership` and must always be evaluated with the requested `organization_id`.
- Job/project/team roles belong to the relevant resource membership/assignment relation, not the global `app_user_role` namespace.
- Professional identity is a personal capability/profile relation. Do not treat the generic `member` role as proof of an active membership subscription.
- Membership status and membership plan are domain records/entitlements, not administrator roles.
- Direct per-user grants are exceptional platform or explicitly scoped delegations; they must not be a shortcut around organization/resource relationships.
- A person can hold multiple contexts, but each permission must be evaluated only in its authority domain and target scope.
- Organization owner is a relationship to one organization. It is not a global account superuser and should not be freely assignable or transferrable without the organization ownership-transfer workflow.
- Organization verification is a status of the organization entity. A user who submitted or owns an organization does not thereby gain verifier authority.

### 11.6 Account lifecycle and edge cases

The implementation must define and test these transitions:

- New person registers: a personal identity exists; professional profile and association membership entitlements are not silently assumed.
- Person becomes a member: membership application/approval/payment lifecycle changes the membership record; it does not grant platform or organization roles.
- Person creates a professional profile: personal professional capability is activated; no employer access is created.
- Person creates an organization: an organization entity is created and the creator receives only the explicitly approved initial organization relationship; organization verification remains pending until approved.
- Person joins an organization: an invitation/approval creates an active membership for that organization only.
- Person joins multiple organizations: each membership is independent and can have a different role/status.
- Person loses organization access: only that organization's relationship is revoked; their personal/member identity and other organization memberships remain intact.
- Person's membership expires: member-only benefits are removed according to policy; their login, professional profile, and legitimate organization work do not disappear solely because membership expired.
- Platform staff appointment ends: platform role/grants are revoked and sessions refreshed/revoked as required; personal and organization relationships remain unless independently changed.
- Account suspended/disabled: global authentication is blocked according to account-security policy; this is distinct from suspending one organization membership or one professional capability.
- A user has conflicting assignments (for example, is both subject and reviewer): explicit conflict-of-interest rules deny the prohibited action even if the role otherwise permits it.

### 11.7 Stable error and navigation contract

Use consistent machine-readable errors so the frontend can distinguish:
- unauthenticated/expired session (`401`);
- authenticated but missing action capability (`403`);
- missing or inaccessible tenant/resource (use the platform's consistent non-disclosing `404` policy where appropriate);
- inactive organization membership (`403` with a specific organization-membership reason);
- missing/expired member entitlement (`403` with a membership-required reason);
- invalid or unavailable workspace context (a stable context error, not a redirect loop).

Do not automatically bounce a user between `/members`, `/profile`, `/organizations`, and `/admin` based only on a failed request. Show a single clear explanation and a route to a context the user is actually allowed to enter. Avoid automatic retry/refresh loops for authorization failures.

### 11.8 Acceptance criteria before implementation is considered complete

- A member with no organization membership cannot enter any organization workspace by guessing an organization ID.
- An organization administrator in Organization A cannot read, export, update, invite users to, or administer Organization B.
- Organization roles never grant platform-admin endpoints.
- Platform reviewers/admins do not automatically gain organization owner/admin rights.
- A professional profile does not grant access to employer-only recruitment or organization records.
- Membership expiry removes member-only entitlements without deleting the person's login, professional profile, or unrelated organization access.
- Removing one organization membership does not remove another organization's membership.
- A person with several legitimate contexts can switch between them without logging out or merging permissions.
- Switching context cannot retain permissions from the previous context.
- Direct API calls, not just frontend navigation, are tested for every boundary.
- Old tabs/sessions cannot continue using revoked role or relationship assignments.
- No unauthorized route creates a redirect/retry loop.
- Existing case assignment, participant, consent, finance/membership separation, and ethics conflict controls continue to pass.

### 11.9 Implementation sequence for this requirement

1. **Inventory:** map every workspace route, API endpoint, owning entity, context, action capability, and scope. Identify pages that currently infer account type from global roles.
2. **Policy contract:** approve the context matrix and define canonical context/capability/error response shapes.
3. **Backend enforcement:** centralize context resolution and authorization evaluation; preserve service-level checks and fail closed for missing context/resource ownership.
4. **API/UI integration:** expose available contexts and capabilities from the server; make workspace navigation a reflection of that response; remove competing client-side role inference.
5. **Lifecycle reconciliation:** migrate only after dry-run comparison of current role assignments, organization memberships, professional identity records, and membership entitlements.
6. **Regression:** run a full route × method × context × scope matrix, including deep links, cross-organization IDs, expired membership, revoked assignments, multi-context users, and browser back/old-tab behavior.

**Architecture status:** This account-boundary requirement is approved as a foundational design requirement. The current code contains partial foundations, but the audit does not claim that all listed behaviors are implemented. Implementation must be a separate, test-led change set with no broadening of access as a workaround.
