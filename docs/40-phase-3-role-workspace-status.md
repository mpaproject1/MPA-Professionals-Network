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
- Both organization-detail roster data and the separate roster endpoint are limited to owner/administrator.
- Direct assignment of the owner role through ordinary add/update-member actions is blocked; ownership transfer requires a dedicated workflow.
- Public organization discovery continues through the separate limited public-profile projection.
- Existing organization/job services are intended to enforce organization scope on job, candidate, applicant, and team actions; this still needs negative cross-organization API tests.

**Not yet addressed / needs verification**
- A complete UX pass over the existing recruiter journey: clear task dashboard, job/requisition status, applicants awaiting action, interview/outcome follow-up, empty/error/retry states, and accessible responsive navigation.
- Verify every candidate, application, team, job, and requisition route against a different organization's resource ID.
- Confirm recruiter permissions do not expose member-only private profile fields or employer-consent-restricted job-seeker details.
- Add integration tests proving the owner/admin roster difference and cross-organization denial.

### 2. Reviewer

**Addressed in source**
- Review queue scope derives from the authenticated viewer, not a caller-supplied reviewer ID.
- Case detail and claim/evidence actions check assigned-reviewer scope.
- System administrators and users with explicit `verification.manage` permission are recognized by the service-level assignment helper.
- Review-case assignment has an explicit manager permission gate.
- The existing reviewer UI already includes reasoned decisions and displays decision history.

**Not yet addressed / needs verification**
- Runtime tests still need to prove assigned reviewer success, unassigned reviewer denial, reviewer-ID tampering, own-case conflict and manager access.
- Audit every remaining verification write and evidence-download route against the complete permission matrix.
- Complete browser/API acceptance for assignment changes, race conditions, private evidence and appeal independence.

### 3. Support Desk

**Addressed in source**
- Inquiry queue queries now require an authenticated support identity and return only unassigned or self-assigned work unless the user has broader queue authority.
- Status-change and reply actions check assignment, and assignment checks are performed under a row lock inside a transaction.
- Starting work on an unassigned inquiry assigns it to the current staff member.
- Status changes and replies record status/assignment context in audit metadata.
- Contact name, email, phone and preferred contact method are suppressed from support queue results when the person has not consented to follow-up.
- Existing demand-sharing checks cover consent, named-employer audience, allowed fields and organization membership.

**Not yet addressed / needs verification**
- Confirm the new queue behavior against the existing admin/support UI and database schema using runtime tests.
- **Manager-controlled transfer/reassignment is now implemented in source:** only users with broader queue-management authority may transfer, the target must be an active eligible support colleague, a handoff reason is required, the row is locked in a transaction, and the transfer is audited.
- A source-structure regression test was added for transfer authorization, recipient validation and audit metadata; it has not been run.
- Still incomplete: escalation policy, priority, waiting-on-member versus waiting-on-organization states, delivery/receipt confirmation for notifications, and negative runtime tests for another staff member's assignment, manager override, missing/revoked consent, wrong employer and private attachments.
- A full support ticket lifecycle is not yet proven; the existing support conversation workflow is not automatically equivalent to a complete ticketing system.

### 4. Finance

**Addressed in source / documented**
- Payment verification and reversal are separate operations.
- Activation requires an approved application and successful unreversed payment with matching saved fee terms.
- The finance route and membership lifecycle matrix identify amount/currency, reversal and reconciliation boundaries.

**Blocked pending policy confirmation / not yet addressed**
- The separation-of-duties policy is still unconfirmed: current route gates allow reviewers to verify payments and finance users to review/activate memberships. I have not silently changed this authority model.
- Finance-first queue UX for pending evidence, exceptions, duplicates, receipts, reversals and reconciliation remains incomplete.
- Runtime tests are needed for wrong amount/currency, unapproved application, duplicate verification/reversal, and isolation from unrelated membership records.

### 5. Administrator

**Addressed in source**
- Added a read-only audit history API, restricted to system administrators or an explicitly authorized `audit.view` permission.
- Added an Audit history tab to the existing administrator workspace for system administrators, with action, time, resource, actor, request ID and metadata.
- Key membership settings routes and review assignment have explicit permission gates.

**Not yet addressed / needs verification**
- Runtime-check the audit query against the actual schema and verify authorization for every user/role combination.
- Finish the route-by-route audit of all admin mutations, including roles/permissions, organization verification, membership products, reference data and card verification.
- Verify that all consequential changes capture sufficient before/after data and a reason where required; an audit viewer does not guarantee every mutation records complete history.
- Add forbidden direct-request tests for ordinary members, organization users, reviewers and finance users.

## Membership lifecycle status

| Transition | Current assessment | Remaining work |
|---|---|---|
| Submit application | Source-level guards and product-term snapshot exist | Test duplicate prevention, product-version snapshot, duration and renewal eligibility |
| Review / request correction / reject | Separate review state and audit are present | Verify reviewer scope, decision reasons, and permitted transitions with tests |
| Submit payment evidence | Separate from payment verification | Test ownership, allowed channels, duplicate evidence, and idempotency |
| Verify payment | Separate action with amount/currency and application-state checks | Test repeat/competing decisions, wrong amount/currency, reversal state, and role separation |
| Activate membership | Requires approval and verified unreversed payment | Test repeated activation, correct start/end dates, and no overlapping renewal |
| Expire membership | Added `expireDueMemberships()` and `npm run memberships:expire`; batch updates expired rows and writes an audit event | A scheduler/cron invocation is not configured or tested; runtime batch and downstream expiry behavior remain to verify |
| Reverse/refund | Separate reasoned reversal and associated membership suspension exist | Test duplicate reversal, audit, reconciliation, and isolation from unrelated membership records |

## Regression coverage added in this continuation

Added `test/p0/role-workspace-authorization.test.js` with source-structure regression checks and `test/p0/role-workspace-boundaries.integration.test.js` with database-backed scenarios for organization/recruiter scope, reviewer assignment, and Support Desk assignment/consent:
- organization detail requiring an authenticated active organization membership;
- reviewer list scope being derived from the authenticated viewer;
- reviewer case-detail assignment enforcement and explicit manager permission;
- manager-only review assignment;
- support inquiry queue and action scoping;
- separate payment verification and membership activation paths;
- auditable membership-expiry batch and command;
- applicant profile editing remaining available before membership while verification stays membership-gated.

These are **source-structure regression guards**. They do not prove runtime authorization, HTTP status codes, database isolation, or complete role UX. Database-backed service/API tests and browser acceptance are still required. CI remains deferred until Phase 3 is complete, as requested.

## Recommended implementation order

1. Add database-backed reviewer, organization and support-assignment tests; source-structure checks alone are insufficient.
2. Verify the existing Organization/Recruiter journey and test cross-organization resource IDs.
3. Finish reviewer route coverage, including remaining write actions and evidence downloads.
4. Verify Support Desk queue, escalation, consent and notification behavior in runtime tests.
5. Obtain the separation-of-duties decision before implementing the final Finance permission model and finance-first UI.
6. Finish the administrator mutation audit and validate the new audit view against the deployed schema in a safe test environment.
7. Verify the startup/hourly membership expiry worker and its failure/retry behavior; confirm all profile editing works for non-members and member-only verification remains gated.
8. Run CI and browser/API acceptance after Phase 3 is complete; review failures without removing tests or masking errors, and do not merge/deploy before review.
