# Phase 3 Role-Workspace Status — Addressed vs Remaining

**Branch:** `ux/p0-navigation-and-org-privacy`  
**PR:** [#5](https://github.com/jtestcoder/MPA-Professionals-Network/pull/5) — keep open and draft.  
**Validation boundary:** source edits and regression guard tests added; no CI, production deployment, or production database changes have been run. The tests in this file are not a substitute for runtime/API integration tests.

## UX and scope decisions

- Keep the current public pages and navigation unless a narrow privacy/security fix is necessary.
- Use the existing sitemap where it already supports the task better. The 67-item reference is guidance, not a required route count.
- Build role workspaces around the user's next action, assigned queue, resource scope, decision history, and clear status—not around technical modules.
- Server-side service/API authorization is mandatory; hiding a navigation item alone is not a security boundary.
- **Applicant profile rule:** any applicant, including a non-member, may create and update their own professional profile. Membership-only revision claims or benefits remain unavailable until the membership conditions are satisfied. This supersedes the older rule that blocked non-member profile editing.

## Role-by-role status

### 1. Organization / recruiter

**Addressed in source**
- Full organization detail no longer relies on `public_visible`; the viewer must have an active allowed role in that exact organization.
- The full membership roster is limited to owner/administrator; other authorized organization members receive no roster.
- Public organization discovery continues through the separate limited public-profile projection.
- Existing organization/job services are intended to enforce organization scope on job, candidate, applicant, and team actions; this still needs negative cross-organization API tests.

**Not yet addressed / needs verification**
- A complete UX pass over the existing recruiter journey: clear task dashboard, job/requisition status, applicants awaiting action, interview/outcome follow-up, empty/error/retry states, and accessible responsive navigation.
- Verify every candidate, application, team, job, and requisition route against a different organization's resource ID.
- Confirm recruiter permissions do not expose member-only private profile fields or employer-consent-restricted job-seeker details.
- Add integration tests proving the owner/admin roster difference and cross-organization denial.

### 2. Reviewer

**Addressed in source**
- Review queue filtering is derived from the authenticated viewer; a caller-provided `reviewerId` cannot broaden an ordinary reviewer's queue.
- Case detail is limited to the assigned reviewer unless system administrator or explicit `verification.manage` authority applies.
- Case assignment is restricted to system administrators or explicit `verification.manage` permission.
- Direct claim/evidence routes now pass the authenticated viewer into case access checks.
- Claim creation, evidence creation, and claim-status changes now enforce assigned-reviewer scope in the service layer as well as the route layer.

**Not yet addressed / needs verification**
- Add database-backed tests for assigned reviewer success, unassigned reviewer denial, reviewer-ID tampering, own-case conflict, and manager access.
- Review all verification write actions (transition, decision, checklist, appeal, references, evidence downloads) as one complete authorization matrix; do not assume the routes are safe because list/detail are scoped.
- Improve reviewer UX: assigned-only queue, filters and actionable empty states, conflict-of-interest warnings, reasoned decisions, prior-decision history, and clear next steps.
- Verify that a reviewer cannot see another reviewer's private evidence through any alternate endpoint.

### 3. Support Desk

**Addressed in source / documented**
- Existing demand-sharing service has checks for Support Desk access, active applicant consent, named-employer audience, allowed fields, and authorized organization membership before shared demand is visible.
- The P0 matrix records the required privacy and authorization checks.

**Not yet addressed / needs verification**
- Verify assigned-ticket queues, ownership/transfer, escalation, resolution outcomes, status history, and notifications are complete and persisted.
- Verify all alternate routes preserve consent and employer scoping, including attachment/evidence access.
- Improve task UX for ticket priority, waiting-on-member vs waiting-on-organization, escalation, and retryable failures.
- Add negative API tests for missing/revoked consent, wrong employer, extra fields, and unassigned tickets.

### 4. Finance

**Addressed in source / documented**
- Payment verification and reversal are separate service actions with distinct role/permission checks.
- Membership activation requires the approval/payment conditions in the service; reversal records a reason and affects the associated membership.
- The P0 matrix documents the transition sequence and acceptance scenarios.

**Not yet addressed / needs verification**
- Product owner must confirm separation of duties: current routes allow reviewers to verify payments and finance users to review/activate memberships. Do not silently change this policy without confirmation.
- Build/verify a finance-first queue for pending evidence, exceptions, duplicate submissions, reversals, reconciliation, receipts and audit history.
- Add integration tests for wrong amount/currency, unapproved application, pending/reversed payment, duplicate verification/reversal, and unrelated-membership protection.
- A dedicated expiry worker or auditable lazy-expiry process remains undecided. Date-based access may expire while persisted `status='expired'` remains stale.

### 5. Administrator

**Addressed in source / documented**
- Key membership product and membership-card settings routes have role/permission gates.
- Review-case assignment has an explicit manager gate.
- The matrix identifies administrative route families and requires actor, timestamp, reason, and before/after history for consequential changes.

**Not yet addressed / needs verification**
- Finish route-by-route review of every admin mutation, including role/permission changes, organization verification requirements, membership products/settings, reference data, and card verification.
- Confirm every consequential admin action is auditable and scoped; authentication alone is not sufficient.
- Ensure admin UI distinguishes safe viewing from consequential actions and shows confirmation, reason capture, result, and audit history.
- Add forbidden direct-request tests for ordinary members, organization users, reviewers, and finance users.

## Membership lifecycle status

| Transition | Current assessment | Remaining work |
|---|---|---|
| Submit application | Source-level guards and product-term snapshot exist | Test duplicate prevention, product-version snapshot, duration and renewal eligibility |
| Review / request correction / reject | Separate review state and audit are present | Verify reviewer scope, decision reasons, and permitted transitions with tests |
| Submit payment evidence | Separate from payment verification | Test ownership, allowed channels, duplicate evidence, and idempotency |
| Verify payment | Separate action with amount/currency and application-state checks | Test repeat/competing decisions, wrong amount/currency, reversal state, and role separation |
| Activate membership | Requires approval and verified unreversed payment | Test repeated activation, correct start/end dates, and no overlapping renewal |
| Expire membership | Date-based capability checks stop treating the membership as active | Persisted expiry status may remain stale; expiry worker/lazy-expiry design is open |
| Reverse/refund | Separate reasoned reversal and associated membership suspension exist | Test duplicate reversal, audit, reconciliation, and isolation from unrelated membership records |

## Regression coverage added in this continuation

Added `test/p0/role-workspace-authorization.test.js` with structural regression checks for:
- organization detail requiring an authenticated active organization membership;
- reviewer list scope being derived from the authenticated viewer;
- reviewer case-detail assignment enforcement;
- manager-only review assignment;
- separate payment verification and membership activation paths.

These are **source-structure regression guards**. They do not prove runtime authorization, HTTP status codes, database isolation, or complete role UX. Database-backed service/API tests and browser acceptance are still required. CI remains deferred until Phase 3 is complete, as requested.

## Recommended implementation order

1. Finish reviewer and organization authorization regression coverage before expanding workspace UI.
2. Complete Organization/Recruiter workspace and its cross-organization negative tests.
3. Complete Reviewer workspace and assigned-case decision history.
4. Complete Support Desk queue, consent visibility, and escalation.
5. Complete Finance exception/reconciliation queue after separation-of-duties policy is confirmed.
6. Complete Administrator action/audit matrix.
7. Resolve membership expiry persistence and separation-of-duties decisions.
8. Run the full CI and browser/API acceptance suite only after Phase 3 is complete; review results before any merge or deployment.
