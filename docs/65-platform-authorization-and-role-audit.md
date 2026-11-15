# MPA Platform Authorization and Role Audit

**Repository:** `mpaproject1/MPA-Professionals-Network`  
**Branch reviewed:** `feat/workstream-3-progress-members-workspace` (PR #18)  
**Review date:** 2026-11-15  
**Review type:** Static source, migration, route, frontend, and test review  
**Changes made by this audit:** Authorization source and documentation updates on the review branch. No live role assignments, permission records, database migrations, production configuration, or deployment were changed.

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

### 3.2 Authorization helper centralization

The source-level Phase 2 implementation now routes the dispatcher helpers in `server.js`, `requireRole` in `src/platform/auth.js`, and workspace gates in `src/platform/workspace-authorization.js` through `src/platform/authorization-policy.js`. Phase 3 also moved the JavaScript permission gates in report authorization, membership payment-method administration, and platform organization-membership administration to the same evaluator.

Some service-level checks intentionally remain SQL-backed. They evaluate current role assignments, direct permission rows, reviewer assignment and resource ownership in the same database query as the protected operation. Those checks are not equivalent to a global capability check and must not be replaced with a broad role/permission shortcut. Their permission-code literals are now included in the targeted source inventory regression test.

### 3.3 Direct permissions and effective capabilities

The database remains authoritative for which direct permission rows are assigned to an account. The source-level canonical catalogue in `src/platform/authorization-policy.js` now describes known permission codes, their area, sensitivity, system-only status, source classification and assignability. Narrow role bundles are evaluated alongside direct grants to produce effective capabilities for the authenticated account.

The catalogue is parity-tested against the three reviewed permission-seed migrations. Additional permission codes observed in existing service SQL but not found in those migrations are explicitly marked `legacy-runtime`; they are not represented as migration-verified. Unknown permission codes fail closed in direct-grant validation and are omitted from the effective-capabilities projection. This source catalogue does not replace the live `app_permission` table or prove production assignment inventory.

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


---

## 12. Expanded repository inventory — branch snapshot 2026-11-15

**Scope and evidence discipline**

This addendum is based on the complete Git tree returned for `feat/workstream-3-progress-members-workspace` (789 tracked blobs; 161 files under `db/migrations/`) and targeted source inspection. It distinguishes source-level facts from live database state. No production database, deployed server, or live `app_user_role` / `app_user_permission` assignments were queried. Therefore, seeded role codes are verified in migration source, while actual production assignment counts and migration execution state are **Not verified**.

Status labels used below:

- **Verified** — directly supported by checked-in source or an existing test.
- **Defect** — a demonstrated inconsistency in source policy or enforcement.
- **Unreconciled** — referenced or defined but not fully reconciled with all other namespaces, migration history, or effective service behavior.
- **Not verified** — requires runtime, deployed environment, or production database evidence.

The complete dispatch-level route matrix is in [docs/66-platform-authorization-route-matrix.md](./66-platform-authorization-route-matrix.md). It contains 642 route branches from `server.js`, with HTTP method, route predicate, visible dispatch gate, handler and source line.

### 12.1 Migration role-code inventory

**Verified seeded into `app_role` by migrations inspected:**

| Role code | Seed source | Domain / interpretation | Proposed classification |
|---|---|---|---|
| `system_admin` | `002_platform_foundation.sql` | Highest platform security/governance authority | Canonical platform |
| `reviewer` | `002_platform_foundation.sql` | Generic review role; reused across workflows | Legacy / too broad; replace with workflow-specific role or capability |
| `finance_officer` | `002_platform_foundation.sql` | Finance operations | Canonical platform specialist |
| `member` | `002_platform_foundation.sql` | Person/member identity marker; not proof of current membership entitlement | Canonical identity marker only |
| `supporting_staff` | `006_vetting_and_trust_framework.sql` | Staff-assisted support within scope | Canonical platform support specialist, but scope must be explicit |
| `verification_reviewer` | `006_vetting_and_trust_framework.sql` | Verification case review | Canonical workflow specialist; assignment required |
| `ethics_reviewer` | `006_vetting_and_trust_framework.sql` | Ethics case review | Canonical workflow specialist; assignment and conflict checks required |
| `appeal_reviewer` | `006_vetting_and_trust_framework.sql` | Independent verification appeals | Canonical workflow specialist; must not be original decision-maker |
| `admin` | `017_production_security_and_sessions.sql` | Platform operational administrator | Canonical platform operational role; must remain distinct from system security authority |
| `organization_admin` | `017_production_security_and_sessions.sql` | Organization administrator label, but seeded globally | Legacy/misplaced global role; organization authority belongs in `organization_membership` |
| `recruiter` | `017_production_security_and_sessions.sql` | Recruiting role, but seeded globally | Legacy/misplaced; organization/job scoped |
| `project_manager` | `017_production_security_and_sessions.sql` | Project/organization operations, but seeded globally | Legacy/misplaced; project/org scoped |
| `read_only` | `017_production_security_and_sessions.sql` | Read-only organizational visibility, but seeded globally | Legacy/misplaced; organization scoped |
| `mentor` | `017_production_security_and_sessions.sql` | Approved mentor label, but seeded globally | Legacy/misplaced; derive from verified professional profile and mentorship relationship |
| `organization_representative` | `20261015180000_account_type.sql` | Organization-representative account classification | Context/account type, not platform authority |
| `business_verification_reviewer` | `20261031110000_network_plus_business_discovery.sql` | Business verification | Canonical platform specialist; case assignment and submitter-conflict checks required |
| `business_moderator` | `20261031110000_network_plus_business_discovery.sql` | Network-Plus business/service moderation | Canonical platform specialist; creator/self-review conflict checks required |
| `network_plus_support` | `20261031120000_network_plus_request_collaboration.sql` | Read-only support for a specific support case | Canonical specialist marker only; explicit `network_plus_request_support_grant` and expiry remain mandatory |
| `serve_community_reviewer` | `20261031130000_serve_community_initiatives.sql` | Serve-Community initiative and legacy classification review | Canonical platform specialist; independent review required |

No later migration in the 161-file migration directory was found to add another `app_role` seed. The 161 migration filenames were scanned for role/permission definitions and references; role seeds are concentrated in the files above.

### 12.2 Other role namespaces — keep separate from platform roles

| Namespace | Codes found in schema/source | Scope | Rule |
|---|---|---|---|
| Organization membership (`009_phase3_organizations_jobs.sql`) | `owner`, `administrator`, `recruiter`, `project_manager`, `event_manager`, `finance`, `read_only` | One `organization_id` and active `organization_membership` row | Never copy these into global `app_user_role`; evaluate requested organization on every call |
| Job team (`013_comprehensive_job_portal.sql`) | `hiring_manager`, `recruiter`, `interviewer`, `approver`, `observer` | One `job_id` + user + active team membership | No cross-job or global authority |
| Job application participant | `candidate`, `interviewer`, `observer` | One application/job workflow | Not platform roles; enforce applicant/assigned-team relationship |
| Account type | `professional`, `organization_representative` | Account/person classification | Not an authorization grant; use capabilities and scoped relationships |
| Network-Plus business ownership/access | `primary_owner`, `co_owner`; capabilities `business.manage_listing`, `business.respond_requests`, `business.accept_terms` | One business ID | Business owner and delegated access are separate from platform roles and organization membership |
| Network-Plus request participants | `requester`, `recipient_representative`, `additional_participant` | One request ID and consent state | Private request access requires participant relationship/consent or an explicit time-bounded support grant |
| Community Impact contributor taxonomy | `lead`, `co_lead`, `contributor`, `mentor`, `reviewer_organizer`, `partner_organization`, `other` | Contribution classification | Descriptive contribution roles, not login roles |

### 12.3 Runtime role references not reconciled to migration seeds

| Code | Evidence | Classification | Required treatment |
|---|---|---|---|
| `super_admin` | `src/platform/user-admin.js` privileged-role set; legacy docs | Unreconciled / legacy alias | Determine whether any DB assignments exist; map or retire via audited migration |
| `platform_admin` | `src/platform/user-admin.js`, `server.js`, admin UI | Unreconciled / conflicting alias | Decide whether it aliases `admin`; remove competing admin checks after migration |
| `membership_reviewer` | `src/platform/user-admin.js`, `workspace-authorization.js`, tests | Unreconciled | Tests and gates expect it, but no seed was found in the migration inventory |
| `professional` | `identity-policy.js`, `web/lib/identity-capabilities.ts`, account_type default | Context/capability, not a verified app_role seed | Replace global-role test with account-type/professional-profile capability check |
| `organization_owner` | Demo guide metadata in `014_demo_cases_and_ui_guides.sql` | Documentation/demo-only | Canonical organization role is `owner` in `organization_membership` |
| `field_worker`, `inspector`, `executive`, `organization_lead` | Demo guide metadata | Documentation/demo-only | Do not seed or grant without a defined scoped resource model |

**Verified:** The migration seeds do not include `super_admin`, `platform_admin`, or `membership_reviewer`; runtime code nevertheless treats them as privileged or valid authorization labels.  
**Not verified:** Whether any of these codes exist in the deployed `app_role` table or have assigned users.

### 12.4 Admin-assignable role path — UI versus backend

**UI path**

- `web/app/admin/accounts/page.tsx` derives its display gate from token roles `system_admin`, `admin`, or `platform_admin`.
- `web/app/admin/users-table.tsx` displays only API roles where `assignable=true`; privileged roles are additionally restricted to a current `system_admin`.
- `src/platform/user-admin.js:listRoles()` loads every row from `app_role`. It sets `assignable=false` only for codes in `NON_PLATFORM_ROLES`; otherwise it defaults to assignable unless the role is privileged and actor is not `system_admin`.

**Backend mutation path**

- `src/platform/user-admin.js:updateUser()` checks the requested role exists in `app_role`, protects privileged roles, protects privileged targets, blocks self-role changes, requires an audit reason, preserves last-`system_admin` protection, revokes sessions and records the change.
- It does **not** apply `NON_PLATFORM_ROLES` or the `assignable` result from `listRoles()`.

<badge color="danger">Defect — UI/backend policy mismatch</badge>

A role hidden as non-assignable in the UI can still be submitted directly to the mutation endpoint if it exists in `app_role`. The backend does not enforce the UI classification. This applies to `organization_admin`, `recruiter`, `project_manager`, `read_only`, and `mentor`. Additionally, unclassified future role rows default to platform-assignable in `listRoles()`. The correction belongs in `src/platform/user-admin.js`, with negative API tests; UI filtering alone is insufficient.

The UI's `platform_admin` display gate also differs from the backend's `admin()` rule, which accepts `system_admin`, `admin`, or the required direct permission. A `platform_admin` role alone is not enough unless it also carries that permission. This is a second UI/backend access mismatch.

### 12.5 Direct permission catalogue and assignment rules

**Base catalogue in `024_per_user_permission_matrix.sql` (26 codes):**

`dashboard.view`, `members.view`, `members.manage`, `finance.view`, `finance.manage`, `organizations.view`, `organizations.manage`, `organizations.review`, `jobs.view`, `jobs.manage`, `applications.view`, `applications.manage`, `services.view`, `services.manage`, `mentorship.view`, `mentorship.manage`, `verification.view`, `verification.manage`, `reviews.view`, `reports.view`, `users.view`, `users.manage`, `permissions.manage`, `settings.manage`, `files.view_private`, `notifications.manage`.

**Additional migration-seeded capabilities:**

| Migration | Added permission codes |
|---|---|
| `20261014170000_p2_reporting_and_member_import.sql` | `reports.sensitive`, `members.import` |
| `20261030190000_membership_finance_permission_separation.sql` | `membership.review`, `membership.activate`, `finance.payment.verify`, `finance.payment.reverse` (also updates `finance.view`) |
| `20261030200000_general_finance_receipts_and_vouchers.sql` | `finance.payment.record`, `finance.voucher.issue` |
| `20261030210000_phase3_ethics_volunteer_role_scopes.sql` | `verification.appeal.review`, `ethics.case.intake`, `ethics.case.review`, `ethics.case.assign` |
| `20261031110000_network_plus_business_discovery.sql` | `business.verify`, `business.moderate` |
| `20261031130000_serve_community_initiatives.sql` | `serve_community.initiatives.moderate`, `serve_community.legacy.classify` |
| `20261031140000_serve_community_offline_completed_projects.sql` | `serve_community.projects.manage`, `serve_community.projects.approve` |
| `20261031150000_community_impact_detection.sql` | `community_impact.detection.manage` |
| `20261031170000_community_impact_retention_policy.sql` | `community_impact.retention.manage`, `community_impact.retention.approve` |
| `20261031180000_community_impact_manual_claims.sql` | `community_impact.claim.review`, `community_impact.claim.assign`, `community_impact.claim.appeal_review` |
| `20261101090000_community_impact_governance_completion.sql` | `community_impact.identity.review`, `community_impact.offline_attribution.review`, `community_impact.detection_policy.manage`, `community_impact.detection_policy.approve`, `community_impact.claim.assess`, `community_impact.claim.second_review`, `community_impact.retention.evaluate` |
| `20261101110000_community_impact_unified_score.sql` | `community_impact.score.policy.manage`, `community_impact.score.policy.approve`, `community_impact.score.recalculate`, `community_impact.score.reverse`, `community_impact.score.view_all` |
| `20261101240000_community_impact_recognition_and_engagement.sql` | `community_impact.recognition.manage`, `community_impact.recognition.review`, `community_impact.recognition.view_all` |
| `20261102150000_membership_geography_and_fee_obligations.sql` | `members.geography.manage`, `finance.payment.adjust`, `finance.payment.import` (also updates `finance.payment.record`) |

The migration-defined catalogue is not equivalent to the complete set of permission strings used by route gates.

<badge color="danger">Defect — route permissions missing from catalogue</badge>

The following route-gate permission codes were found in `server.js` / `workspace-authorization.js` but were not found in the migration-seeded `app_permission` catalogue scanned:

- `audit.view`
- `jobs.review`
- `support.inquiries.manage`
- `support.inquiries.view`
- `support.knowledge.manage`

A direct grant for a code absent from `app_permission` is rejected by `updateUserPermissions()` as `INVALID_PERMISSION`. Unless these are granted through a role-only path, the direct-permission alternatives are not assignable through the current catalogue. Add or remove these codes intentionally and test each gate; do not assume a string literal is a provisioned permission.

**Verified direct-grant rules in `src/platform/user-admin.js:updateUserPermissions()`:**

1. Only a current `system_admin` can list or mutate the direct permission catalogue.
2. The actor cannot change their own direct permissions.
3. An audit reason is mandatory.
4. Input must be an array, deduplicated, with a maximum of 100 codes.
5. Every code must exist in `app_permission`; unknown codes are rejected.
6. Any `system_only=true` permission is rejected for direct assignment.
7. An `ethics_reviewer` cannot receive `verification.manage` or `verification.appeal.review`.
8. Existing direct grants are replaced as a set; new grants record `assigned_by`.
9. All target sessions are revoked and an audit event is written.

**Schema limitation:** `app_user_permission` stores user, permission code, assigner and timestamp, but no context, tenant/resource ID, scope, expiry, or grant purpose. Direct grants are therefore global user capabilities at schema level. Service-level scope checks must remain mandatory; scoped delegations should use dedicated assignment tables, not global direct grants.

### 12.6 Role-to-permission mapping comparison

There is no canonical role-permission relation table or single role-policy registry in the inspected source. The following helper mappings are different:

| Role | `src/platform/auth.js` | `server.js` | Status |
|---|---|---|---|
| `verification_reviewer` | `verification.manage` | `verification.manage` | Consistent fallback |
| `ethics_reviewer` | `verification.manage` | No mapping | Conflicting/overbroad; ethics must not inherit general verification |
| `appeal_reviewer` | `verification.manage` | `verification.appeal.review` | **Defect:** same role has different effective fallback |
| `organization_admin` | `organizations.manage` | No mapping | Legacy global alias; organization membership must be authoritative |
| `recruiter` | `jobs.manage` | No mapping | Legacy global alias; job/organization assignment must be authoritative |
| `project_manager` | `jobs.manage` | No mapping | Legacy global alias; project/job assignment must be authoritative |
| `mentor` | `mentorship.manage` | No mapping | Legacy global alias; verified professional/mentor relationship must be authoritative |
| `supporting_staff` | `reviews.view` | `reviews.view` | Consistent fallback, but scope still required |
| `admin` | `users.manage` | `users.manage` | Consistent fallback |
| `platform_admin` | No mapping | `users.manage` | Conflicting alias |
| `system_admin` | Explicit role checks | Explicit role checks | Role authority, not a direct permission alias |

`requireRole()` and server `anyRole()` treat a role as satisfied either by that role code or by the helper's mapped direct permission. This is not a full role bundle; most route access is a mixture of explicit roles, direct permission arrays and service-specific checks.

**Defect:** `appeal_reviewer` must map only to `verification.appeal.review` in every shared helper. `ethics_reviewer` must not map to `verification.manage`. The canonical correction should consolidate the mappings and make each sensitive reviewer permission require case assignment and conflict checks.

### 12.7 Verified route-level policy helpers and access matrix

The checked-in route matrix is the exhaustive dispatch-level inventory. The following shared helper policies are explicitly verified:

| Helper | Role alternatives | Direct permission alternatives | Effective caution |
|---|---|---|---|
| `assertMembershipReviewAccess` | `reviewer`, `membership_reviewer`, `system_admin` | `membership.review` | Role/permission OR; `membership_reviewer` has no migration seed |
| `assertMembershipActivationAccess` | Same | `membership.activate` | Activation remains separate from finance verification |
| `assertMembershipReviewQueueAccess` | Same | `membership.review`, **`members.view`** | **Defect:** generic directory read grants queue access |
| `assertFinancePaymentQueueAccess` | `finance_officer`, `system_admin` | `finance.view`, `finance.payment.verify`, `finance.payment.reverse`, `finance.manage` | Queue read and action capabilities are conflated; action routes must still check exact action |
| `assertPaymentVerificationAccess` | `finance_officer` | `finance.payment.verify`, `finance.manage` | Dedicated verification |
| `assertPaymentReversalAccess` | `finance_officer` | `finance.payment.reverse`, `finance.manage` | Dedicated reversal |

The finance/membership separation tests in `test/p0/workspace-authorization.test.js` verify that finance officers cannot review/activate membership, membership reviewers cannot verify/reverse payments, and direct permissions are action-specific. Preserve those tests.

Additional route gates use OR semantics:
- `anyRoleOrPermission` accepts any one listed role **or** any one listed direct permission.
- Some membership-card GET and POST operations accept `members.view` or `members.manage`; the POST batch and print routes therefore accept a read permission for a stateful/export/print action. This is a **Defect** requiring a card-specific print/batch capability.
- `server.js` has several role aliases that do not match `auth.js`; see §12.6.

### 12.8 Organization, project, job and personal-data scope baseline

| Resource/context | Source evidence | Verified boundary | Remaining gap |
|---|---|---|---|
| Organization membership | `009_phase3_organizations_jobs.sql`; `src/platform/identity-policy.js:70-77` | Active membership is queried by exact organization ID + user ID; allowed role list is organization-scoped | Inspect every organization service handler and verify every read/export/write path passes the exact requested organization ID |
| Professional identity | `src/platform/identity-policy.js:12-62`; `web/lib/identity-capabilities.ts` | Professional identity and current active membership are separate checks | The helper still tests `professional` as a role although migration models `account_type='professional'`; reconcile the source of truth |
| Job team | `013_comprehensive_job_portal.sql` | `job_team_member` has job ID, user ID, scoped role code and active state | Full service-by-service enforcement trace is not complete |
| Job application | `013_comprehensive_job_portal.sql`; `src/organization-jobs/service.js` | Candidate/interviewer/observer roles are workflow-specific | Verify candidate ownership, employer organization, assigned team, attachments and offer actions for each endpoint |
| Network-Plus business | `20261031110000_network_plus_business_discovery.sql` | Business ownership and access are stored by business ID; capability codes are separate from organization roles | Verify all list/update/evidence/moderation routes enforce business ownership/delegation and reviewer conflicts |
| Network-Plus request | `20261031120000_network_plus_request_collaboration.sql` | Request participant consent and time-bounded support grants exist | Verify every private request and workspace route checks participant consent or active support grant |
| Community Impact | `20261031180000_community_impact_manual_claims.sql` and later governance migrations | Claim assignments, reviewer decisions and conflict declarations are modelled | Verify each queue/decision endpoint enforces assigned reviewer and second-review independence |
| Private files | `src/platform/private-file-storage.js`; `files.view_private` | Dedicated private-file policy and purpose-aware access functions exist | Trace all file reads through `readAuthorizedPrivateFile`; ensure no route returns raw storage paths or bypasses purpose scope |
| Personal/member records | `/api/v1/me/*` handlers and domain services; dispatcher principal at current `server.js:375` | Post-boundary handlers inherit the authenticated request principal | Service-level self-ownership, resource scope and relationship checks still require route-to-query verification |

**Not verified:** No live cross-tenant API test or production data inspection was performed in this audit update. Existing scope tests provide evidence for selected cases only; they do not prove every route.

### 12.9 Route dispatch inventory findings

The route matrix at `docs/66-platform-authorization-route-matrix.md` contains 642 API branches. Static inspection of `server.js` found:

| Static observation | Count | Status |
|---|---:|---|
| API route branches inventoried | 642 | Verified source inventory |
| Branches with local `auth(req)` | 275 | Authentication visible; service authorization still must be traced |
| Branches using optional identity | 8 | Phase 1: anonymous requests remain public; any supplied bearer token now requires a current active session via `auth(req)` |
| Branches flagged by the original branch-local identity scan | 319 | **Reclassified in Phase 0:** all inherit the dispatcher-wide authenticated principal established at `server.js:375`; zero confirmed missing-principal defects in this candidate set |

Phase 0 inspected the enclosing dispatcher scope rather than treating every route branch as an isolated block. `server.js:375` unconditionally executes `const identity=await auth(req);` inside the request handler's enclosing `try` block. The 319 candidates occur after that statement and before the matching dispatcher `catch`, so they inherit the same authenticated `identity` binding. The former branch-local heuristic therefore produced false positives: **319/319 are dispatcher-authenticated; zero are confirmed missing-principal defects.** Public, optional-viewer and signed webhook routes are dispatched before this authentication boundary. Do not add redundant `auth(req)` calls or move the boundary without a separate route-contract review. This is a source-level lexical validation; request-level smoke tests were not run in this documentation update.

### 12.10 Prioritized defects and correction files

| Priority | Finding | Evidence | Correction files | Regression required |
|---|---|---|---|---|
| P0 | Original branch-local identity scan over-reported missing principals | `server.js:375` establishes the shared principal in the enclosing dispatcher `try`; all 319 candidates are after this binding | `docs/65` and `docs/66` classification records; representative request-level tests remain follow-up | No missing-principal defect confirmed by lexical inspection; runtime 401/valid-session smoke tests still required before release |
| P0 | Optional-viewer routes trusted signed JWT claims without checking the active server-side session | Former `optionalIdentity()` called `verifyToken()` only; it did not require `sid`, check revocation/expiry/account status, or reload current permissions. This could preserve personalized/member visibility after session revocation. | `server.js`; `e2e/security-auth.spec.js` | No bearer remains anonymous/public; malformed, expired and revoked supplied bearer tokens return 401; valid session resolves current identity |
| P0 | Authentication helper mislabeled infrastructure failures as invalid credentials | Previous catch converted every non-403 error—including missing auth configuration and database failures—into 401 `UNAUTHENTICATED` | `server.js`; authentication E2E regression | Missing JWT configuration returns 503; transient auth-database dependency failures return 503; invalid token/session returns 401; policy restrictions preserve 403; unexpected failures are not disguised as 401 |
| P1 | UI role assignability is not enforced by mutation API | `user-admin.js:listRoles()` applies `NON_PLATFORM_ROLES`; `updateUser()` only checks role existence/privilege | `src/platform/user-admin.js`; user-admin tests | Direct PATCH cannot grant organization/job/profile roles globally; unknown/unclassified role fails closed |
| P1 | Unclassified role rows default to platform-assignable | `listRoles()` uses `!nonPlatform` default | `src/platform/user-admin.js` | New unclassified role hidden and mutation rejected until explicit policy classification |
| P1 | `appeal_reviewer` mapping differs between auth helpers | `src/platform/auth.js:7` versus `server.js` ROLE_PERMISSION | `src/platform/auth.js`, `server.js`, shared policy tests | Same role has one narrow capability across all route helpers; no general verification access |
| P1 | `ethics_reviewer` inherits `verification.manage` through auth helper | `src/platform/auth.js:7`; ethics permission separation exists in migration 302100 | `src/platform/auth.js`; role policy tests | Ethics reviewer cannot access general verification or appeals |
| P1 | Membership queue accepts `members.view` | `workspace-authorization.js:18-20` | `src/platform/workspace-authorization.js`; tests | Directory viewer denied review queue; dedicated queue capability/role succeeds |
| P1 | Membership card batch/print POST routes accept read permission | `server.js` membership-card batch/print gates | `server.js`, membership-card service/tests, permission migration | `members.view` denied; explicit card batch/print capability required and audited |
| P1 | Route permission codes absent from catalogue | `server.js` uses `audit.view`, `jobs.review`, `support.inquiries.manage`, `support.inquiries.view`, `support.knowledge.manage`; no corresponding migration seeds found | Permission migrations; route/helper code; permission catalogue tests | Every route permission resolves to exactly one catalogue code or is removed; direct grant API validates |
| P1 | UI recognizes `platform_admin` but backend admin helper does not consistently | `web/app/admin/accounts/page.tsx` vs `user-admin.js:8,103-105` | `web/app/admin/accounts/page.tsx`, `src/platform/user-admin.js` | Admin list/catalog access is consistent; no UI-only authority |
| P2 | Global direct grants lack scope, expiry and purpose | `024_per_user_permission_matrix.sql` schema | Permission schema/service and scoped delegation tables | Direct grants cannot bypass tenant/resource checks; expiry/revocation tested |
| P2 | Global `organization_admin`, `recruiter`, `project_manager`, `read_only`, `mentor` role seeds overlap with scoped roles | `017_production_security_and_sessions.sql`; `identity-policy.js` | Migration plan; user-admin; organization/job/mentorship services | No platform role leakage; old assignments reconciled before removal |
| P2 | `professional` is tested as role while migration uses account_type | `identity-policy.js:12,22-32`; `20261015180000_account_type.sql` | `identity-policy.js`, `web/lib/identity-capabilities.ts`, account-context API | Account type/profile capability governs professional workspace, not unseeded role |
| P2 | Generic `reviewer` remains overloaded | `002_platform_foundation.sql`; membership/job routes and tests | `server.js`, shared policy, reviewer assignment services | Explicit workflow role/capability required for each queue |
| P2 | Live role/permission assignments and migration execution state unknown | No production DB query in this audit | Read-only production inventory script/runbook; reconciliation report | Counts, unknown assignments, and migration ledger verified before any data migration |

### 12.11 Canonical role and context matrix — proposed target

This is the recommended canonical authority model, not a claim that all rows are implemented today.

| Canonical actor/context | Authority source | Permitted scope | Must not imply |
|---|---|---|---|
| Platform system administrator | `system_admin` | Platform security, user governance, system-only actions; audited | Organization ownership; unrestricted access to private records without purpose |
| Platform operational administrator | `admin` + explicit capability | Platform operational modules only | System bootstrap/security authority unless separately granted |
| Finance officer | `finance_officer` + action-specific finance capabilities | Finance queues and payment records | Membership review/activation; organization finance unless a separate org relationship exists |
| Membership reviewer | Dedicated membership reviewer assignment/capability; retire generic aliases | Assigned membership queue and review action | Payment verification/reversal or self-approval |
| Verification reviewer | `verification_reviewer` + assigned case | Assigned verification cases/evidence | Appeals, ethics, other cases, or global private-file access |
| Appeal reviewer | `appeal_reviewer` + independent appeal assignment | Assigned appeal only | Original case decision or general verification authority |
| Ethics reviewer | `ethics_reviewer` + assigned ethics case/panel | Assigned ethics case only | Verification authority; subject/conflicted case |
| Business verifier/moderator | Specialist platform role + assigned business/listing case | Assigned Network-Plus review object | Business ownership or access to unrelated organizations |
| Serve-Community reviewer | `serve_community_reviewer` + review assignment/capability | Assigned initiative/classification | General membership/finance administration |
| Network-Plus support | `network_plus_support` + active case support grant | Read-only specified request until grant expiry | Global private request access or mutation rights |
| Member/personal context | Authenticated person + member record/entitlement where required | Own membership and member-only services | Platform or organization administration |
| Professional context | Account type/profile verification and own professional profile | Own profile and explicitly shared professional data | Employer organization access or active membership entitlement |
| Organization context | Active `organization_membership` for selected organization ID + role | That organization only | Another organization or platform authority |
| Job/project context | Active team/project assignment tied to resource ID | Assigned job/project | Global recruiter/project manager role |

### 12.12 Audit completion boundary

**Verified:** 161 migration files inventoried; role seed locations and major role namespaces identified; base and additive permission seeds extracted; admin UI and mutation paths compared; shared role helpers compared; route dispatch inventory generated; concrete source-level mismatches recorded.

**Defect:** The source contains role assignment policy mismatches, divergent helper mappings, a too-broad membership review queue gate, membership-card read/write gate overlap, route permission strings missing from the permission catalogue, and route branches that were initially flagged for lacking a branch-local identity binding; Phase 0 confirmed that all 319 inherit the dispatcher-wide binding at `server.js:375`, so this is not a confirmed missing-principal defect.

**Unreconciled:** Runtime role aliases, generic reviewer usage, global scoped-role seeds, service-level policy for every route, and complete project/job/personal-data ownership checks.

**Not verified:** Live production role assignments, direct permission assignments, applied migration ledger, request-level runtime smoke tests for representative routes, and production cross-tenant isolation.

Accordingly, this addendum substantially expands the source inventory and supplies the dispatch-level route matrix, but it does **not** mark the entire effective authorization audit complete. The remaining service-level scope trace and read-only production reconciliation are explicitly open; no production changes or permission broadening are authorized by this document.


---

## 13. Phase-by-phase implementation priority and release gates

**Purpose:** Convert the findings in this audit into an ordered, evidence-led implementation programme. This is the implementation order for the MPA authorization baseline. It is intentionally sequenced to prevent a broad role refactor from hiding route failures, weakening existing separation-of-duties rules, or migrating legacy assignments before their real usage is known.

**Status at this document revision:** Phases 0 and 1 have dated evidence notes below. Phase 0 is complete at source-classification level. Phase 1 implementation is updated but its runtime test/CI exit gate remains pending. Later phases remain planned unless explicitly updated with commit and test evidence.

### 13.1 Priority principles

1. **Do not broaden access to make an error disappear.** A 403, 401, 404, or failed workspace load must be fixed at the correct principal, capability, relationship, or scope boundary.
2. **Prove the route finding before mass edits.** The static `identity` scan is a high-priority signal, not proof that every flagged route is reachable or broken. Reproduce representative branches and classify all flagged rows before changing shared request handling.
3. **Preserve existing separation of duties.** Finance verification/reversal, membership review/activation, verification, ethics and appeals remain distinct actions.
4. **Fail closed for unknown authority.** An unclassified role, permission or context must not silently become a platform role or capability.
5. **Scope is mandatory.** A role or permission answers what action may be attempted; the service must still prove which organization, job, project, case, business, member or file the actor may access.
6. **Reconcile data before retiring codes.** Do not drop aliases, roles, or grants until read-only inventory of deployed role rows, user assignments, direct grants and migration state has been reviewed.
7. **Keep the change set reviewable.** Each phase has a narrow objective, explicit regression tests and a release gate. Do not combine a schema migration, broad authorization rewrite and UI redesign in one release.

### 13.2 Ordered implementation phases

| Phase | Priority | Objective | Main audit findings addressed | Primary correction files / areas | Exit gate |
|---|---|---|---|---|---|
| **0 — Evidence validation and route triage** | **P0 / first** | Validate the 642-branch dispatch inventory and classify all 319 original identity-binding candidates against the enclosing lexical scope and authentication boundary. | 319 original candidates; shared dispatcher principal at `server.js:375`; no confirmed missing-principal defect in this set. | `server.js`; route matrix `docs/66-platform-authorization-route-matrix.md`; request identity helper. | All 319 candidates have a source-backed disposition; public/optional/webhook routes remain before the authentication boundary; docs/65 and docs/66 corrected. Runtime smoke tests are recorded as a separate follow-up gate because they were not executed in this documentation-only phase. |
| **1 — Request principal and endpoint authentication integrity** | **P0 / immediate after triage** | Enforce one current-session principal contract for protected and optional-viewer routes; preserve anonymous public access; distinguish credential failures from authentication-service failures. | Optional-viewer JWT-only trust; revoked/expired bearer tokens on public personalized routes; authentication catch converting infrastructure failures to 401. | `server.js`; `e2e/security-auth.spec.js`; route matrix `docs/66-platform-authorization-route-matrix.md`. | Missing/invalid/expired/revoked session behavior is covered; any supplied bearer is checked against the active DB session; anonymous public and signed callback routes remain available; config/dependency failures are not reported as bad credentials; E2E and CI tests pass. |
| **2 — Canonical role catalogue and fail-closed role assignment** | **P1 / next** | Define a machine-readable, reviewed classification for every platform role code: domain, canonical/legacy state, assignability, assigning authority, privilege tier, scope model and replacement path. Enforce it in both role listing and mutation. | UI/backend assignability mismatch; unknown roles default assignable; global organization/job/mentor role overlap; `platform_admin`, `super_admin`, `membership_reviewer` and generic `reviewer` aliases. | `src/platform/user-admin.js`; shared role policy module; `web/app/admin/accounts/page.tsx`; `web/app/admin/users-table.tsx`; user-admin tests. | Every role returned by API has an explicit classification; unknown/unclassified codes are not assignable; mutation rejects non-platform/scoped roles even when called directly; only approved actors can assign privileged roles; UI and API agree; existing self-change, last-system-admin, audit-reason and session-revocation protections still pass. |
| **3 — Single role-to-capability policy and permission catalogue reconciliation** | **P1** | Establish one authoritative role-to-capability registry and reconcile every route/helper permission string against `app_permission`. Remove divergent fallback maps and make action permissions explicit. | `appeal_reviewer` mismatch; `ethics_reviewer` over-broad fallback; missing `audit.view`, `jobs.review`, support-inquiry and knowledge permissions; mixed OR semantics; generic `members.view` queue access. | `src/platform/auth.js`; `server.js`; `src/platform/workspace-authorization.js`; permission migrations; shared policy tests. | Every permission literal used in a gate is either present in the catalogue with documented meaning or removed; each role has one effective capability mapping; ethics and appeal permissions are narrow; general directory read cannot grant review-queue access; direct-grant API rejects unknown and system-only permissions; all gate semantics are tested. |
| **4 — Action-specific write, export and sensitive-data gates** | **P1** | Separate read from mutation, bulk, print, export, approve, reverse and private-data actions. Add narrowly named capabilities where required and keep workflow decisions independent. | Membership-card batch/print accepts read permission; finance queue/action conflation risk; generic reviewer access; private-file purpose requirements. | `server.js`; `src/platform/workspace-authorization.js`; membership-card service; finance services; `src/platform/private-file-storage.js`; migrations and tests. | Read-only permissions cannot invoke write/batch/print/export/decision endpoints; payment verification and reversal remain separate; membership review and activation remain separate; private file access checks actor, purpose, relationship and resource; every sensitive action emits required audit evidence. |
| **5 — Tenant and resource-scope enforcement** | **P1 / security-critical** | Trace each route into service/repository code and enforce exact resource relationship checks. Treat selected context as a selector, never as an authority grant. | Organization, job, project, application, business, request, case, personal/member and file scope gaps in §12.8; direct grants are global at schema level. | `src/platform/identity-policy.js`; `src/platform/workspace-authorization.js`; organization/job/project services; Network-Plus services; mentorship and verification services; community-impact services; private-file storage; API tests. | For each route, matrix records principal, action, resource, tenant/resource scope, relationship/assignment, state/consent and expected status. Cross-organization and cross-resource access is denied; user can access own personal records only; candidate sees own application; reviewer sees only assigned case; support grant is resource-specific, read-only and expires; context switching does not union permissions. |
| **6 — Legacy, duplicate and unknown role/grant data reconciliation** | **P2 / only after source policy is stable** | Produce a read-only production inventory of role rows, user-role assignments, direct grants, unknown codes, duplicates, migration ledger and inactive users. Approve a mapping for every live legacy assignment before any data migration. | Unseeded runtime aliases; globally seeded organization/job roles; `membership_reviewer` seed gap; unknown production role/permission rows not verified. | Read-only inventory SQL/runbook; migration scripts; role catalogue; audit logging; admin reconciliation report. | Every deployed code is classified; every assigned legacy role has an approved replacement or explicit retirement; duplicate grants are deduplicated safely; no user loses required access silently; migration is reversible or has a tested recovery plan; migration ledger is confirmed. This phase requires explicit deployment/database authorization. |
| **7 — End-to-end regression, observability and controlled rollout** | **P1 / release gate** | Validate the whole policy across UI, API, services, database scope and lifecycle events. Roll out in a controlled environment before production. | All previous phases; session revocation, role changes, context changes, expired organization membership, reviewer reassignment and permission revocation. | Authorization test suites; Playwright/API integration tests; audit logs; monitoring/alerting; release checklist. | Positive and negative tests cover every protected route family and all scopes; no access broadening; no redirect/retry loops; 401/403/404 behavior is stable; role/grant revocation takes effect promptly; existing tests and full build pass; staged rollout and rollback plan approved. |

### 13.3 Detailed sequencing decisions

#### Phase 0 — source-level classification of the 319 candidates (completed 2026-11-15)

The original scan was branch-local. It did not account for the unconditional dispatcher-level statement `const identity=await auth(req);` at `server.js:375`. That statement is inside the request handler's enclosing `try` scope and precedes all 319 candidate branches. Therefore all 319 have an authenticated principal in scope. The previous 296 `DEFECT CANDIDATE` matrix labels were false positives for missing-principal defects; 23 additional candidates had explicit route helper gates but were counted by the same branch-local scan.

- **Disposition:** 319/319 inherit the dispatcher principal; 0 confirmed missing-principal defects; 0 public/token/webhook exceptions among these candidates.
- **Public-route boundary:** the public, optional-viewer and signed callback routes are dispatched before line 463. Preserve this ordering.
- **No code correction is justified by this finding.** Do not add duplicate local `auth(req)` calls or move the shared authentication boundary based only on the former heuristic.
- **Remaining runtime evidence:** representative no-token, invalid-token, expired-session and valid-session requests have not been executed in this documentation-only update. Record those results before treating endpoint authentication behavior as runtime-tested.
- **Still separate:** every route must be assessed for its action capability and service-level tenant/resource/relationship checks; dispatcher authentication does not prove those controls.


#### Phase 1 — request principal and endpoint authentication integrity (implementation updated 2026-11-15)

**Implemented changes**

1. Split signed-token verification from database-backed session validation in `server.js`. Invalid/expired JWTs and tokens without a session ID return 401; the active session must be unrevoked, unexpired, attached to an active user, and match the token subject. Email verification, administrator passkey enforcement, restricted recovery sessions and password-reset route restrictions remain enforced.
2. Continue to reload current role codes and direct permissions from PostgreSQL for each authenticated request; token role claims are not trusted as current authority.
3. Preserve meaningful failure classes: missing JWT configuration returns 503; transient database connectivity/capacity failures during authentication return 503 `AUTH_SERVICE_UNAVAILABLE`; invalid credentials/sessions return 401; email/password policy restrictions retain 403; unexpected internal failures are no longer converted to 401.
4. Convert `optionalIdentity()` to asynchronous full session authentication. The public job, opportunity, service/mentor announcement/story/listing and mentor-profile routes remain anonymous when no bearer is supplied. If a bearer is supplied, it must represent a current active session. The public support-bot route also no longer swallows authentication failures and silently downgrades an invalid supplied bearer to a guest.
5. Add Playwright coverage in `e2e/security-auth.spec.js` for anonymous public job discovery (200), a valid current session (200), malformed bearer rejection (401), invalid bearer rejection on the public support-bot route (401), expired session rejection (401) and revoked session rejection (401).

**Implementation commits:** server authentication changes `5b1d5c0bc883a125b39d91821ba28f708362d1c8`, `b71fb241fc247136bcdfa01b5c4458fbb69dd919`, `193fc3f98c7f88e124cdb3e73642008214d977f1`; E2E test changes `9a3282fbf9a5e4f1a78fcb3087c84cd51aa051e3`, `ffcd111b004af6a5f9076b5cb037a0082c0cd4b8`, `4797197994e72f43a9a5b4eb07ae6a93016cfcd1`.

**Validation boundary:** source inspection confirms all optional-viewer call sites await the full authenticator. The new Playwright tests and existing security suites were not executed in this session; no CI run was triggered. Phase 1 is therefore recorded as **implementation updated — runtime validation pending**, not as passed. To close the phase, run the targeted security E2E suite and the repository's required PR Quality workflow on the exact current branch head, verify valid-session success as well as the negative cases, and record the results. Do not weaken or skip existing tests.

---
#### Phase 2 — catalogue contract

Each platform role must have these explicit fields in the canonical policy registry (or equivalent typed structure):

| Field | Required meaning |
|---|---|
| `code` | Stable unique role code |
| `domain` | `platform`, `organization`, `job`, `project`, `case`, `business`, `mentorship`, or identity/context domain |
| `status` | `canonical`, `legacy`, `deprecated`, or `blocked` |
| `assignable` | Explicit boolean; absence means false |
| `assignableBy` | Exact authority required to assign |
| `privilegeTier` | Defined tier; no implicit escalation |
| `scopeType` | `platform`, `organization`, `job`, `project`, `case`, `business`, `request`, or `self` |
| `capabilities` | Explicit action capabilities; no implicit broad permission inheritance |
| `replacementCode` | Required for deprecated/legacy roles |
| `migrationPlan` | Required before retiring an assigned role |

Organization/job/project/team assignments remain in their scoped tables. They must not be made assignable through the global platform role mutation API.

#### Phase 3 — permission catalogue contract

Build a mechanical parity test that extracts or enumerates all permission literals used by:
- role fallback helpers;
- `anyRoleOrPermission` and related route gates;
- `assertAccess` and workspace authorization helpers;
- service-level `hasPermission` checks;
- frontend capability checks where they correspond to backend capabilities.

For each code, document description, read/write/action class, system-only status, assignability, and whether it is valid as a global direct grant. Scoped capabilities must not be represented as global direct grants unless a service enforces the exact resource relationship independently.

#### Phase 5 — scope verification order

Perform service-level tracing in this order, because each domain contains sensitive or multi-tenant data:

1. Organization membership and organization administration.
2. Job and application ownership, recruiter/team assignment, candidate self-access and attachments.
3. Project and initiative ownership, contributor assignment, approval and second-review boundaries.
4. Membership, verification, ethics and appeals case assignment and conflict-of-interest checks.
5. Network-Plus business ownership/delegation and private request participant consent/support grants.
6. Professional profile and mentorship relationship/session/submission scope.
7. Personal data, private files, exports and audit records.

Do not declare a domain complete until every route in its family has a route-to-service-to-query trace and negative cross-scope tests.

### 13.4 Cross-phase non-regression requirements

The following controls are mandatory in every phase and must not be weakened to make tests pass:

- Finance officer cannot review or activate membership.
- Membership reviewer cannot verify or reverse payments.
- Payment verification and payment reversal remain distinct capabilities.
- Direct `membership.review` does not imply `membership.activate`.
- `finance.view` remains read-only.
- `finance.manage` legacy behavior must not silently expand beyond its currently tested payment-only meaning.
- `system_admin` role alone does not bypass payment separation-of-duties controls.
- No actor can change their own privileged roles or direct permissions.
- Last `system_admin` protection remains.
- Privileged assignment restrictions, audit reasons, audit events and session revocation remain.
- Organization roles never confer platform authority or access to another organization.
- Professional profile/account type never confers organization authority or membership entitlement by itself.
- Membership expiry removes member-only benefits, not unrelated personal or professional identity.
- Revoked/expired organization membership, job assignment, case assignment or support grant stops authorizing subsequent requests.
- Context switching replaces effective context; it never unions authority from multiple contexts.

### 13.5 Phase status tracker

Status is tracked individually below. Do not mark a phase **Complete** without a dated evidence note, commit reference and passing results for its required tests.

| Phase | Status | Completion evidence required |
|---|---|---|
| 0 — Evidence validation and route triage | Complete — source classification | 319/319 classified as inheriting `server.js:375` dispatcher authentication; 0 confirmed missing-principal defects; docs/65 and docs/66 updated. Request-level smoke tests were not run and remain a runtime validation gate. |
| 1 — Request principal and endpoint authentication integrity | Implemented — runtime validation pending | `server.js` authentication commits `5b1d5c0`, `b71fb24`, `193fc3f`; E2E tests `9a3282f`, `ffcd111`; Playwright and CI not run in this session; see Phase 1 evidence note |
| 2 — Canonical role catalogue and fail-closed role assignment | Implemented at source level — validation pending | `src/platform/authorization-policy.js`; backend role-mutation guard; role catalogue API; unknown/scoped-role negative tests added but not executed |
| 3 — Single role-to-capability policy and permission catalogue | Implemented at source level — runtime validation and live inventory pending | Canonical direct-permission registry; migration parity test; legacy runtime-code classification; shared evaluator adopted by report, payment-configuration and organization-admin JS gates; DB-backed service permission literals covered by static inventory test |
| 4 — Action-specific write/export/sensitive-data gates | Implemented at source level — validation pending | Dedicated card-print and directory-export capabilities; separate finance record/verify/reverse/voucher permissions; private evidence role separation; regression tests added but not executed |
| 5 — Tenant and resource-scope enforcement | Planned | Complete route-to-service-to-query matrix; cross-tenant/resource negative tests |
| 6 — Legacy and production grant reconciliation | Planned | Read-only production inventory; approved mapping; migration/rollback evidence |
| 7 — End-to-end regression and controlled rollout | Planned | Full test/build report; staged validation; approved rollback and rollout evidence |

### 13.6 Phase 2 source-level implementation evidence (2026-11-15)

**Implemented on** `feat/workstream-3-progress-members-workspace`:

1. Added `src/platform/authorization-policy.js` as the shared platform role metadata registry and evaluator. It returns explicit role domain, status, scope type, active/assignable flags, privilege tier, capabilities, assigner policy, replacement code and migration-plan fields. Unclassified codes are blocked and non-assignable by default.
2. Centralized the existing narrow role-to-permission compatibility bundles. The `appeal_reviewer` bundle is appeal-only; the former inconsistent `src/platform/auth.js` mapping no longer grants it general `verification.manage`. The ethics reviewer receives no general verification alias.
3. Enforced the canonical metadata in `src/platform/user-admin.js` before a role is granted through the platform account mutation API. Organization-, job-, project-, profile- and self-scoped roles are not assignable through that global endpoint. Existing unclassified/scoped grants may still be removed as cleanup; privileged-role removal remains system-admin restricted.
4. Reworked `listRoles` to return the same canonical metadata used by the mutation guard, so the admin UI's role choices are a projection of server policy rather than a separate source of truth.
5. Replaced duplicate role/permission evaluation in `server.js`, `src/platform/auth.js` and `src/platform/workspace-authorization.js` with the shared evaluator.
6. Added authenticated `GET /api/v1/me/capabilities`, which returns current database-loaded roles, direct permissions and derived capabilities. `/admin/accounts` now resolves this endpoint before rendering account-management controls instead of treating JWT role claims as the current authorization decision.
7. Added `test/platform/authorization-policy.test.js` for appeal-role parity, unknown-role fail-closed behavior, scoped-role assignment denial, privileged assignment, and effective-capability boundaries.

**Source commits:** policy registry `10d285ca3077f8b13cc668ea61f7af864b4cb444`; shared auth helper `4ed2d79e92ccdd9c0767f7cbba7a29e238cb0e62`; workspace evaluator `d5ce34567f3d36f6a9a3e35b00c7182315fba3cc`; role administration `0e65e1058f81c0192a0eeb18981425420c08fc5f`; server routes `720f788c208464e170e9437d3beaf86189d29388`; admin UI `58c2f018345e2077d0cdbf40d030d3910263861a`; policy tests `0a99f08b875b3974299303d471d986de0b05cd01`; route matrix `f8730f8935708ab1dd4f18799e1d44f3dd5bf3a9`.

**Validation boundary:** The new tests were added but not run. No frontend build, backend suite, Playwright run or CI workflow was triggered. The source registry is not yet reconciled against every live `app_role` row; unknown codes deliberately remain blocked from new global assignment until reviewed. The direct permission assignments remain database-backed in `app_permission` and `app_user_permission`; Phase 3 now adds a source-level permission registry and targeted migration/service-literal parity tests while preserving database-backed resource checks. No migration, live role assignment, production database query, or deployment was performed. Phase 2 is therefore **implemented at source level — validation and inventory reconciliation pending**, not runtime-verified.

### 13.7 Phase 3 source-level implementation evidence (2026-11-15)

**Implemented on** `feat/workstream-3-progress-members-workspace`:

1. Extended `src/platform/authorization-policy.js` with the canonical `PERMISSIONS` constants and `PERMISSION_CATALOG`. The catalogue records area, label, description, read/write/review action class, sensitivity, system-only status, source classification, explicit global-direct-grant boundary and assignability.
2. Registered every permission code seeded by the reviewed authorization migrations: `024_per_user_permission_matrix.sql`, `20261030190000_membership_finance_permission_separation.sql`, and `20261030210000_phase3_ethics_volunteer_role_scopes.sql`.
3. Classified existing permission codes found in service authorization SQL but not in those three seed files—`jobs.review`, `reports.sensitive`, `support.manage`, `support.queue.manage`, and `support.inquiries.manage`—as `legacy-runtime`. This avoids pretending their seed origin or production presence has been proven.
4. Added `permissionMetadata`, `isKnownPermission`, and `assertKnownPermissionCodes`. Unknown direct permission codes fail closed. `effectiveCapabilities` now excludes any unclassified direct grant rather than projecting it into frontend capabilities.
5. Extended role bundles only where the existing code already establishes equivalent authority: `membership_reviewer`/`reviewer` receive membership review, activation and member-view capabilities; `finance_officer` receives finance view, payment verification and reversal capabilities. No finance capability is granted to membership reviewers, and no membership decision capability is granted to finance officers.
6. Updated `src/platform/user-admin.js` to validate requested direct grants against the canonical catalogue and expose policy metadata alongside the database-backed permission catalogue. The existing system-admin-only restriction, database `system_only` check, audit reason, session revocation and audit event remain.
7. Replaced independent JavaScript permission checks in `src/platform/reports.js`, `src/membership/payment-method-policy.js`, and `src/organization-jobs/service.js` with the shared evaluator. Existing SQL-backed authorization in verification, organization review, support and membership services remains database-authoritative so assignment, ownership, reviewer and tenant constraints are not weakened or moved into a broad global capability.
8. Added regression tests for exact migration-to-catalogue parity, unknown permission rejection, exclusion of unknown direct grants, service SQL permission-code inventory, and membership/finance role separation.

**Source commits:** permission catalogue `6c30988156be266a472563a3bfaef6fd8c85f5fb`; shared service evaluator adoption `f4d714ef6e92950a40c94b3b010f1515a7bae073`, `2750f6c4f4121962790dc46569d3356ba38ada2b`, `8c16829eab674eb8e4a08949833df8d40f68c7b4`, `a65d683bf2fdcf9ceadc873c4f0a1d54b43d14fa`; migration parity tests `26bf74428ba2f06e4a7101755b15cf48eb2ee5e4`; unknown-grant fail-closed behavior `22369aa0ae42531128d648e883c200bbf2f2cd20`; capability tests `4005f2e46d8f6748697eec1f3e56e5d4061ae7d8`, `0835fa86b72209711355201e6f8af37c550f040e`, `69eefa4c413904ee44c7609c53a383cbcb1829f6`; admin permission metadata `9e9a567a737081200b8c7a04632a5c0f630a480d`; service SQL inventory test `8d304fe4c29544ade1d0724db51cef600a3ea8fa`; final unknown-permission evaluator guard `b2e7da9f64e4789c165f4857ec289a3924225033`; corresponding negative test `4c97ef4e220b0721c09f6c3e2430e393b52918eb`; test matcher correction `6b8c1633d91f8a33f7c9a886b6e2772f2475e452`; permission action-class and grant-scope catalogue `79878eaf187c6aa5e707df72dd76d4f465e16a5a`; metadata completeness regression test `3b2735c77c6903c95080d26fe911db7d6eece630`; role-derived capability evaluation `87512b2a501453f4c9be8f825ced7d973e7e3230`; role-derived gate regression test `733225d742bac8a275d5453475ec1bba1d684507`.

**Validation boundary:** Source-level edits and static GitHub file checks were performed. Tests were added but not executed; no backend suite, frontend build, Playwright run or CI workflow was triggered. The permission catalogue was reconciled against the three identified permission-seed migrations and a targeted set of service SQL files, not every migration in the repository or the live production `app_permission` table. The five `legacy-runtime` codes require historical migration and live-database reconciliation. SQL-backed service checks intentionally remain in place and must be exercised by integration tests. Phase 3 is therefore **implemented at source-code level — runtime validation and complete database inventory pending**, not runtime-verified.

**Completion rule:** The authorization baseline is not complete when the documentation or role list is complete. It is complete only when every protected endpoint has a verified principal, action capability and resource-scope policy; every assignable role and direct grant is classified; live legacy assignments have been reconciled; and the full positive/negative regression suite passes without weakening existing controls.


### 13.8 Phase 4 source-level implementation evidence (2026-11-15)

**Implemented on** `feat/workstream-3-progress-members-workspace`:

1. Added explicit policy-defined capabilities for `members.export`, `members.export.contacts`, `accounts.export`, `accounts.export.contacts`, `accounts.export.organizations`, and `membership.cards.print`. They are classified as `policy-defined`, not migration-seeded. Contact exports are separate from ordinary directory exports. The system administrator role receives the full export and print bundle; operational administrator roles receive standard exports only. Ordinary member-view and finance roles do not inherit export or card-print authority.
2. Changed member and account directory export authorization to require the dedicated `members.export` or `accounts.export` capability. The previous broad access paths through `members.view`, `users.view`, membership reviewer status, or finance officer status no longer authorize an export. Email and phone fields require the separate contact-export capability; organization relationship names require `accounts.export.organizations`. Existing row limits, field allowlists, format validation, snapshot checks and export audit logging remain.
3. Changed the membership-card batch-generation and print-request POST routes to require `membership.cards.print` (or the system administrator role). Read-only `members.view` and generic `members.manage` no longer authorize these POST actions. The GET card/eligibility routes remain read operations and retain their existing view gates.
4. Removed `members.view` from membership review queue access. The queue now requires the narrow `membership.review` capability or an existing membership-review role.
5. Tightened finance receipt authorization. `finance.payment.record`, `finance.payment.verify`, `finance.payment.reverse`, `finance.voucher.issue`, and `finance.view` are evaluated as distinct capabilities. The finance payment queue requires `finance.view` or the finance-officer bundle; `system_admin` and `finance.manage` alone do not grant queue access. The finance-officer bundle carries its action capabilities. The legacy `finance.manage` direct grant is retained only as a compatibility path for recording manual payments; it does not satisfy payment verification, reversal, queue viewing, or voucher issuance. Platform `admin` and `system_admin` role names alone no longer bypass finance receipt action or queue gates.
6. Removed finance-officer, finance-view and generic member-view grants as a route into membership-application evidence. Membership evidence and membership-card profile photos now require membership-review authority. Private finance evidence requires an explicit finance capability rather than a generic platform-admin role. Successful private-file read audit metadata now records the file's declared purpose.
7. Added regression coverage for read-vs-export, contact-export separation, card-print gating, membership queue access, finance verification/reversal separation, and private-file source policy. These tests have been added but not executed.

**Source commits:** policy-defined export/card capabilities `6e2c04350736b0d7110e12564c33ea2c2602bcc9`, classification correction `ca316c26cc533047253d8f9cf9dddb72112c8238`, and finance action catalogue `ca22a162cacf90af856c3bd3cc0ce1e41a58c864` plus formatting correction `ba29b8613ffd8ba794f1fbbc79e9595d8b34007d`, organization-export permission `739f42ff4d765910d66a6212284c9572cd6a7e77`, and controlled print delegation `55061bd799833581fb1e15d7126fd843cef4953e`; membership queue and finance decision gate separation `5796d2ea11657e5bfedb2463f5397f3b0d0bade9`; finance queue read gate `6641745fcd9ed12ecacde9ed8195b15a4d2ec7fe`; directory export authorization `e1f70daa25c0692278144e5ffcd0e621d8cb4865` and organization-relationship field gate `6c9df8f35a08f8281a7cf7d1f7cf1f7c83f43fd6`; membership evidence policy and audit purpose `8126c6059868ca32af0b188ff690d5199569138c`, `c0a13fc92813945e830c349bb168ec1a0ea1aec0`, and finance evidence role/scope correction `419688cb83e21c36032a70fa9a63e2eabad71e8b`; membership-card POST route gates `b452754dc11e27567e38a91ec8528c092d207099`; finance action catalogue `ca22a162cacf90af856c3bd3cc0ce1e41a58c864`; finance receipt service gates `9f59e8357bd1341dabdb6c3e52b6490d15f39dd8`; Phase 4 regression tests `1222d2178a646e32f8b0ea2444e9d3dc1e0d5f97`, `b29df73f5c101ec1bd6099a3a22985070ba8c570`, `74effabdf672696b8b42f2558972fe6a198d4e70`, final matcher/source assertions `6e65577db89b4f7a5922429d1ec1ed155a0077b4`, organization-export permission regression `85d6533e53cfabea0cb9e7683f4316bb8ac3be1b`, print-delegation regression `11f780a56437f955642d8821441825c2908ed3ff`, finance queue read-gate regression `565a35927af453e6d56286b831769a46eb0b6dde`, and system-admin organization-export capability regression `f9b5e5e5ca9163e392bcfa0934b12371485499e5`.

**Validation boundary:** Changes are source-level only. Tests were added but not run. No backend test suite, frontend build, Playwright run, CI workflow, production database query, migration, role/grant update or deployment was performed. The `finance.payment.record` and `finance.voucher.issue` entries are marked `legacy-runtime`; their production seed provenance and current assignments remain unverified. The action-specific gates protect the inspected routes/services but do not complete the full route-to-service-to-query review of all platform write/export/sensitive-data endpoints. Phase 4 is **implemented at source level — runtime validation and wider endpoint inventory pending**, not runtime-verified.
