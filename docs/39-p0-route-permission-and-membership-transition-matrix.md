# P0 Route, Permission, and Membership Transition Matrix

**Branch:** `ux/p0-navigation-and-org-privacy`  
**Purpose:** Source-level baseline for Phase 3 role workspaces. This is not runtime or CI certification. CI is intentionally deferred until Phase 3 is complete, per project direction.

## Decisions and constraints

- Keep PR #5 open and in draft. Do not merge or deploy based on an older CI result.
- Do not force the 67-item reference sitemap onto the product. Retain the existing navigation where it better supports the user's task.
- Public pages are out of scope for redesign in Phase 3 unless a privacy/security defect requires a narrow correction.
- Permissions must be enforced by API/service logic. Hiding a menu item is not authorization.
- No production database, deployment, or migration was run as part of this audit.

## Changes made on this branch

1. `src/organization-jobs/service.js:getOrganization`
   - Full organization records now require an authenticated viewer with an active membership in that specific organization.
   - Public visibility is no longer sufficient to return `organization.*` fields and the membership roster.
   - Only owner/administrator roles receive the active membership roster. Other active organization members receive an empty `users` list.
   - Public profiles remain available through the separate, limited `getPublicOrganizationProfile` projection.

2. `src/verification/service.js:listCases` and `server.js`
   - The authenticated viewer identity is passed to the case-list service.
   - Ordinary reviewers are constrained to cases assigned to them; a caller-supplied `reviewerId` cannot broaden their queue.
   - A system administrator or an account with the explicit `verification.manage` permission can use the broader review queue.
   - Member self-service case listing is preserved and scoped to the member's own cases.

3. `src/verification/service.js:getCase`
   - Reviewer case details now require assignment unless the viewer is a system administrator or has explicit `verification.manage` permission.
   - The subject can still view their own case using the existing member-safe projection.

These changes are source edits only. They still require regression tests and browser/API acceptance after Phase 3; no CI run is being requested now.

## Workspace route and permission matrix

This matrix records important routes found in `server.js` and the corresponding service-level controls. It is a targeted P0 matrix, not an assertion that every endpoint in the repository has been exhaustively tested.

| Workspace | Representative direct API routes | Server-side gate / resource scope | P0 assessment |
|---|---|---|---|
| Organization / recruiter | `GET /api/v1/organizations`; `GET /api/v1/organizations/:id`; `POST /api/v1/organizations`; `POST /api/v1/organizations/:id/users`; `GET /api/v1/jobs/:id/applications`; `GET /api/v1/jobs/:id/candidates`; `PATCH /api/v1/jobs/:id`; `POST /api/v1/jobs/:id/publish` | Organization detail requires active membership in that exact organization. Organization write operations use organization-role checks; job/application operations must continue to enforce the owning organization in the service. | Detail disclosure addressed in source. Verify each job/applicant mutation and cross-organization negative case during Phase 3 acceptance. |
| Reviewer | `GET /api/v1/review/verification/cases`; `GET /api/v1/verification/cases/:id`; `POST /api/v1/verification/cases/:id/assign`; `POST /api/v1/verification/cases/:id/transition`; `POST /api/v1/verification/cases/:id/decision`; `GET /api/v1/review/organizations`; `POST /api/v1/review/organizations` | Reviewer routes check reviewer roles. Verification list/detail are now assignment-scoped for ordinary reviewers; assignment/transition already use assignment checks. Organization review service checks reviewer permission and conflict of interest. | Verification read-scope gap addressed in source. Verify reviewer cannot read another reviewer's private evidence and cannot decide own/related cases. |
| Support Desk | `GET /api/v1/support/job-seeker-demands/organizations`; `POST /api/v1/support/job-seeker-demands/:id/share`; `GET /api/v1/organizations/:id/job-seeker-demands`; opportunity inquiry routes | Demand-sharing service requires Support Desk access, current applicant consent, named-employer audience, selected fields within consent, and an active authorized organization membership to view shared demand. | Key service checks present. Verify Support Desk queue assignment, escalation, audit trail, and no access to unconsented fields through alternate routes. |
| Finance | `POST /api/v1/payments/:id/verify`; `POST /api/v1/payments/:id/reverse`; `GET /api/v1/review/membership/applications`; `POST /api/v1/membership/applications/:id/activate` | Payment verification requires finance/manage or allowed reviewer/admin role; reversal requires finance officer/system admin or finance.manage. Application/payment/activation state checks are in the membership service. | Lifecycle guards exist. The `reviewer` role can also verify payment and finance can review applications/activate memberships; confirm this separation-of-duties policy with the product owner before tightening it. |
| Administrator | `GET /api/v1/admin/membership/products`; `POST/PATCH /api/v1/admin/membership/products`; `GET/PATCH /api/v1/admin/membership-card-settings`; administrative reference-portfolio routes | Sensitive membership product changes require system admin or `members.manage`; card settings have role/permission checks. Other administrative endpoints must be individually reviewed in their service functions; authentication alone is not sufficient proof of authorization. | Core gates visible. Continue route-by-route checks for every admin action and ensure each consequential change records actor, timestamp, reason, and before/after history. |

### Required negative authorization checks before Phase 3 sign-off

- Anonymous user requests full organization details: denied.
- Authenticated user with no active membership in organization A requests organization A's full details: denied, even if A is public-visible.
- Active member of organization A requests organization B's full details: denied.
- Recruiter in organization A requests applicants/candidates or mutates a job belonging to organization B: denied.
- Reviewer A lists the queue with `reviewerId=B`: results remain scoped to A unless A has explicit broad-review authority.
- Reviewer A directly requests a case assigned to reviewer B: denied unless A is a system administrator or has explicit `verification.manage`.
- Applicant requests another person's verification case, evidence, or application: denied.
- Support Desk attempts to share demand without active, named-employer consent or with fields/audience beyond consent: denied.
- Member calls payment verification/reversal or admin endpoints directly: denied.
- Unauthorized user calls admin product, membership settings, role, or reference-data mutation routes: denied.

## Membership lifecycle transition review

The service separates application review, payment verification, activation, and payment reversal. The following are the source-level expected states and current guards.

| Transition | Expected source state → next state | Current guard/effect observed | Status |
|---|---|---|---|
| Submit application | draft/new → submitted | Prevents duplicate active applications; snapshots the product/fee terms; checks plan duration and active membership/renewal eligibility. | Present |
| Review application | submitted/in_review → payment_pending (approved), correction_required, or rejected | Requires reviewable status; records review decision/note/checklist and audit event; approval records `approved_at`. | Present |
| Respond to correction | correction_required → submitted | Requires the applicant to own the application and an open correction request; records response and audit. | Present |
| Submit payment evidence | payment_pending → payment pending review | Manual payment is linked to the application; verification is a separate action. | Present; confirm payment submission constraints and idempotency in acceptance |
| Verify payment | pending payment + approved application → succeeded/paid, failed/payment_pending, or needs-correction/pending | Locks application/payment; requires approved application; checks amount/currency against saved fee snapshot; rejects already-reversed payment and invalid manual channel; records verification. | Present |
| Activate membership | paid application + successful unreversed payment → activated + membership record | Requires approval and payment confirmation; checks saved fee terms; uses saved duration; locks application/payment; checks current/previous membership and renewal start date. | Present |
| Expire membership | active record after end date → no longer eligible | Capability checks use start/end date bounds, so expired membership does not satisfy active-membership checks. A persisted `status='expired'` update is performed during activation processing, not by a dedicated expiry worker shown in the inspected paths. | **Follow-up gap:** access expires by date; persisted status may remain stale until another activation runs |
| Reverse/refund payment | succeeded payment → refunded + reversal record; active membership for that application → suspended | Requires reason, only allows successful payments, writes reversal and reconciliation state, suspends active records for that application, records audit and notifies member. Duplicate reversal returns the prior reversal. | Present; verify role separation and edge cases |
| Retry after reversal | reversed payment cannot be verified/activated again | Verification checks for a reversal; activation requires successful unreversed payment. | Present |

### Membership transition acceptance scenarios

1. Unapproved application cannot accept payment verification or activation.
2. Approved application with no verified payment cannot activate.
3. Wrong amount/currency cannot be verified or activated.
4. Rejected, pending, or reversed payment cannot activate membership.
5. A second verification decision against a payment already decided cannot overwrite the first decision.
6. A repeated activation is idempotent only when the existing membership record is still current; stale/missing records return a conflict for human review.
7. A renewal cannot overlap a still-current membership period; it must start after the prior end date when required.
8. After end date, the member no longer passes active-membership capability checks, even if the persisted status has not yet been updated to `expired`.
9. Reversing a verified payment creates one reversal record, marks reconciliation disputed, suspends the related active membership, and records the reason and actor.
10. Reversing one payment must not suspend an unrelated membership record or another application's membership.
11. Membership history and notifications preserve approval, payment, activation, expiration/effective access loss, and reversal as distinct events.

## Remaining follow-up items

- Add/adjust regression tests for organization-detail access and reviewer list/detail scoping. CI is intentionally deferred until Phase 3 is complete.
- Decide whether to add a dedicated expiry worker or a safe, auditable lazy-expiry service so persisted status agrees with date-based access checks.
- Confirm separation of duties: whether reviewers may verify finance evidence, whether finance may approve membership applications, and who may activate.
- Verify every API route with both allowed and forbidden direct requests; UI-only hiding is not accepted as evidence.
- Preserve public-page layout/navigation unless a narrowly scoped privacy correction requires change.
