# Phase 3 — Unified role workspaces

## Objective
Create one simple entry point for each account's assigned work while preserving existing workflows, role catalogue, organization membership scopes, reviewer assignments and permission checks. Consolidate navigation and task discovery; do not duplicate business records, queues, reports or decision engines.

## Role and scope contract

| Role / capability | Authority type | Assignment rule | Primary work |
|---|---|---|---|
| Member | Account capability | Derived from account and membership state | Guided profile, membership, verification, requests and outcomes |
| Membership Reviewer | Platform role / permission | Privileged role granted by system administrator; membership decisions require membership review permission | Membership applications, corrections and decisions |
| Verification Reviewer | Platform role | System administrator only | Assigned professional evidence and verification decisions |
| Appeal Reviewer | Platform role | System administrator only; independent from original decision maker | Verification appeal queue and independent outcome |
| Ethics Reviewer | Platform role | System administrator only | Authorized ethical/professional conduct cases only |
| Finance Officer | Platform role | System administrator only | Payment verification, manual receipts, vouchers, reconciliation and finance reports |
| Support Staff | Platform role | Assignable only within the permission catalogue | Staff-assisted completion, support cases and authorized handoffs |
| Organization Representative | Platform role | Assignable platform role | Create/track organization applications and open authorized organization workspaces |
| Organization Administrator | Organization membership | Active scoped organization membership; not a global platform role | Organization member administration and scoped operations |
| Recruiter / Hiring Manager | Organization/job-team scope | Active organization membership or job-team assignment | Assigned vacancies, candidate pipeline and hiring decisions |
| Project Manager | Organization/project scope | Active organization membership or project assignment | Assigned project delivery, tasks, milestones and reports |
| Read Only | Organization membership | Scoped organization membership | Read-only access to records within that organization |
| Mentor | Profile capability | Verified professional profile and mentorship eligibility; not a platform role | Mentor profile, offers, requests, sessions and outcomes |
| Reviewer (generic) | Platform role / permission | System administrator for privileged reviewer grants | Explicitly assigned review queues; no catch-all access |
| Platform Administrator | Platform role | System administrator only | Operational platform administration without system bootstrap ownership |
| System Administrator | Platform role | System administrator only | Platform foundation, privileged role assignment, permissions and security |

## Existing controls that must remain
- Authentication reloads current roles from the database; JWT role claims are not authorization.
- System administrator is the sole authority for privileged platform role and direct permission assignment. Self role/permission changes remain blocked and changes are audited.
- organization_admin, recruiter, project_manager, read_only and mentor are non-platform capabilities; do not reintroduce them as global roles.
- Organization membership and job/project assignments remain scoped. Platform roles must not grant access to every organization's records.
- Membership review, payment verification and membership activation remain separate decisions and permissions.
- Finance recording, finance verification and voucher issuance remain separate operations.
- Member self-service and staff-assisted completion retain ownership checks, audit history and attribution.
- Reports use server-authorized definitions and scoped data. Workspace overview must not infer queue counts.

## Unified entry point
The new /workspaces page reads /api/v1/me and /api/v1/organizations, presents the signed-in account's platform roles and organization relationships, and links to existing member, mentorship, membership-review, verification-review, appeal, organization-representative, finance, support and platform-administration workflows. It does not copy queue rows, create business data or replace API authorization. Existing queues and progress remain authoritative in their owning workflows. It deliberately does not expose recruiter, project-manager or read-only actions through the current /jobs or /organizations screens because those routes have not yet been verified as role-scoped workspaces.

## Known gaps that must not be masked
- The current verification implementation still treats ethics reviewers as eligible for the general professional-verification queue and case decisions. The dedicated ethics/professional-conduct case model and independent queue are not present in the inspected service. Do not interpret the new workspace directory as resolving this boundary; implement a separate authorized ethics-case workflow before enabling Ethics Reviewer operational access.
- The existing role-specific queue pages do not yet provide a unified, verified task-count/progress contract for every role. Counts must not be fabricated or copied into the overview until authoritative endpoint and report definitions are reconciled.
- Job-team and project assignment records and their administration have not yet been fully reconciled against the database migrations and services. The current /jobs route is a job portal, and the current /organizations page includes organization registration, evidence and inquiry workflows; neither has yet been proven to provide the complete recruiter, project-manager, organization-administrator or read-only scoped workspace. Those role cards are intentionally not exposed until the underlying scope and route authorization are verified.
- Mentor is a profile-based eligibility capability, not a platform role. The overview links to the existing mentorship workflow, which remains responsible for enforcing verified-profile eligibility.

## Remaining implementation sequence
1. Reconcile every role and permission against migrations, services, route middleware and actual scoped assignment tables.
2. Define read/create/update/decide/export boundaries and sensitivity for each role.
3. Consolidate entry/navigation and remove duplicate entry points only after route/redirect tests prove no workflow is orphaned.
4. Build task queues from authoritative endpoints with persisted status, assignee, due/age and next permitted action.
5. Add role-specific progress from persisted workflow states and timestamps, not client guesses.
6. Add server-scoped reports and audited exports for each role.
7. Complete organization/job/project assignment management with expiry/revocation, audit reasons, conflict checks and authorization freshness.
8. Add responsive accessible E2E tests for every role, cross-scope denial, direct URL access and empty/error/loading states.

## Validation and release gates
Run migration compatibility against disposable PostgreSQL; test each route/API directly as each role; verify cross-organization/job/project isolation and reviewer independence; reconcile queue counts to authoritative reports; run TypeScript, Biome, backend PostgreSQL tests, Next build and Playwright. Keep PR #18 draft and do not merge, migrate production or deploy until all checks pass.

## Delivery boundary
Delivered: role-aware workspace entry page, authenticated navigation link, current identity/organization summary, safe links to existing workflows, privileged-role assignment restrictions for platform_admin and membership_reviewer, and source-contract regression tests. Not delivered: complete role-specific queues, scoped recruiter/project-manager/organization-administrator/read-only workspaces, dedicated ethics case handling, consolidated progress, scoped role reports or assignment lifecycle management. Keep PR #18 draft until those gaps are implemented and the complete CI/browser/database validation suite passes.
