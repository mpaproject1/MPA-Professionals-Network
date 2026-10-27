# Serve-Community Impact Workflows — G0 Baseline and Branch Safety

**Gate:** G0 — baseline and branch safety  
**Recorded:** 2026-10-25  
**Repository:** `jtestcoder/MPA-Professionals-Network`

## Immutable baseline

- **PR #5:** [P0/P1 UX: role journeys, admin workspaces and private organization discovery](https://github.com/jtestcoder/MPA-Professionals-Network/pull/5)
- **Baseline branch:** `ux/p0-navigation-and-org-privacy`
- **Exact baseline HEAD SHA:** `35297546e80e7f3475d2d3d1fbaddfc171d432f9`
- **PR #5 state at inspection:** open, draft; base `main`; GitHub reported mergeable.
- **Baseline CI observation:** the commit-associated workflow query returned `PR Quality - pre-deployment checks`, completed with conclusion `success` (run ID `40188766109`). This records the returned workflow result; it is not a claim that all browser, database-backed, or manual acceptance is complete.
- **Dedicated increment branch:** `feat/serve-community-impact-workflows`
- **Branch creation source:** the exact baseline SHA above (not a moving branch name).
- **Intended draft PR target:** `ux/p0-navigation-and-org-privacy` (PR #5 head branch), not `main`.
- **Local working tree:** no local checkout/worktree was available through the connected GitHub operations; this record verifies the remote baseline and the new branch origin, not an unobserved local filesystem state.

## Files and contracts reviewed

- UI: `web/app/services/page.tsx`, `web/app/services/[id]/page.tsx`, `web/app/service-demand/page.tsx`, `web/app/serve-community/page.tsx`, `web/app/serve-community/layout.tsx`, and `web/components/shell.tsx`.
- API routing: `server.js` routes for service listings, current-user listings/requests, request status, completion acceptance, payment, milestones, delivery submission/review, and feedback.
- Service domain: `src/services-mentorship/service.js` and `src/services-mentorship/demand.js`.
- Existing migrations: `db/migrations/20261023103000_service_request_idempotency.sql` and `db/migrations/20261023104000_service_listing_idempotency.sql`.
- Regression coverage: `test/p1/complete-user-journeys.test.js`, `test/p0/marketplace-demand.test.js`, and `test/services-mentorship/phase4.test.js`.

## Existing protections to preserve

- Server-side identity, role, membership, provider/requester, organization-scope, moderation and transition checks.
- Stable idempotency keys and payload fingerprints for service request/listing creation; duplicate-key replay and changed-payload conflict behavior.
- Provider acceptance/decline, delivery evidence, requester delivery review, separate provider completion and requester completion acceptance.
- Paid-service finance verification before completion; audit/event history and persisted feedback.
- Private demand intake and moderated public topics; consent and access boundaries.
- No private-message workflow is to be introduced by this increment.

## PR #15 overlap review

- PR #15 is open/draft, branch `feat/mentorship-operational-workflows`, based on `ux/p0-navigation-and-org-privacy`, at inspected HEAD `c9eaf70f0f3e1b589a6671b9aec006c8187edb98`.
- It overlaps in `src/services-mentorship/service.js`, `server.js`, and `test/p1/complete-user-journeys.test.js`.
- The inspected PR #15 patch to `src/services-mentorship/service.js` adds mentorship-specific circle fields/counts and the explicit `shareWithEligibleMentors` consent field/fan-out behavior. Those are mentorship concerns, not service-listing lifecycle changes.
- The service domain file on PR #5 and PR #15 differs substantially; neither version may be copied wholesale over the other. Any later changes to shared files must be reconciled against the PR #15 patch and its migrations/tests, preserving both feature sets and their authorization/audit rules.
- PR #15 migration `20261025100000_mentorship_operational_workflows.sql` is separate from the two existing service idempotency migrations.

## Baseline findings — gaps, not masked as complete

1. The current service listing UI has request creation and delivery workflow controls, but the reviewed service UI does not expose the existing `submitServiceFeedback` backend operation as a feedback form.
2. The reviewed UI does not yet expose the planned public structured announcement feed.
3. Service request creation currently sends a message/description-style request rather than a complete mutually accepted structured agreement covering scope, price/currency, milestones and due dates.
4. Delivery submission is present in the UI; its retry/concurrency/idempotency guarantees must be verified before extending it.
5. Existing counts must not be presented as impact metrics unless derived from persisted, authorization-filtered records with explicitly defined states. Interest, pledge, accepted agreement, active delivery, verified outcome and listing fulfilment must remain distinct.
6. The existing tests cover important backend journeys and invariants, but do not by themselves prove the full responsive browser journeys or all report privacy boundaries.

## G0 scope and safety

This commit records the baseline only. It intentionally changes no runtime code, API behavior, migration, authorization rule, workflow, or production data. The new branch begins at the exact PR #5 SHA. Subsequent implementation must stay scoped to Serve-Community impact/outcome workflows and reconcile shared files with PR #15 before changing them. No production deployment or production database operation is authorized by this gate.
