# Network-Plus Phase 2 — Progress history and continuation handoff

**Repository:** `mpaproject1/MPA-Professionals-Network`  
**Branch:** `feat/workstream-3-progress-members-workspace`  
**Pull request:** #18 — keep the existing PR draft; do not merge or deploy  
**Date recorded:** 2026-11-03  
**Primary Phase 2 specification:** [docs/73-network-plus-phase-2-connection-consent-handoff.md](73-network-plus-phase-2-connection-consent-handoff.md)  
**Parent product plan:** [docs/70-network-plus-economic-opportunity-and-business-growth-transformation.md](70-network-plus-economic-opportunity-and-business-growth-transformation.md)

## 1. Current assessment

Phase 2 has substantial source implementation, but it is **not verified complete** and must not be marked done yet.

Implemented source areas include:
- additive migration for contact-consent, meeting handoff and related request records;
- service-layer methods and authenticated API routes for clarification, field-specific contact consent, contact handoff, meeting proposals/responses and request notifications;
- one-time private recipient answer for `question` requests;
- request workspace controls and opportunity-detail connection actions;
- four-step guided wizard for the four lightweight connection intents;
- browser-local IANA timezone handling for meeting date/time entry and display;
- recipient-authority revalidation before contact/meeting handoff;
- source-level and Playwright regression test additions.

The authoritative feature contract remains in document 73. This handoff records the continuation point; it does not replace that specification.

## 2. Work history recorded in this continuation

### Existing Phase 2 implementation (before this continuation)
- Reused the canonical `network_plus_request` and `network_plus_request_participant` foundation; no second request entity was introduced.
- Added four lightweight intents: `interest`, `question`, `quote_request`, `meeting_request`.
- Kept product/service profiles discovery-only and excluded lightweight intents from collaboration-workspace eligibility.
- Added recipient accept/decline and structured clarification.
- Added field-by-field bilateral contact consent, encrypted contact-value storage and a dedicated handoff read endpoint.
- Added a simple meeting proposal / response / counterproposal / confirmation lifecycle.
- Added Network-Plus notification category and request deep links.
- Added listing-scoped opportunity actions and request workspace UI.

### Additional work recorded in this continuation
1. **One-time question answer**
   - Added nullable `recipient_response`, `recipient_response_by`, and `recipient_response_at` fields to the canonical request row in the Phase 2 migration.
   - Added `answerNetworkPlusQuestion` and authenticated `POST /api/v1/network-plus/requests/:id/answer`.
   - Only the recipient representative can answer a submitted/reviewing `question` request; the response is one-time, 3–2,000 characters, private to the two primary sides, audited and not a chat thread.
   - Added request-detail projection, request workspace UI, integration/source regression assertions, a Playwright case and specification updates.
2. **Guided request wizard**
   - Lightweight connection intents now use four focused steps: choose action, describe request, choose recipient, review/save.
   - The listing context is retained/preselected, including a fallback option if the listing is not in the current service search results.
   - Added progress semantics for assistive technology. The draft remains private and is not submitted until the explicit submit action.
3. **Meeting timezone correctness**
   - Meeting form defaults to the browser's IANA timezone.
   - Local date/time is converted using the selected timezone rather than being interpreted as the browser's implicit timezone.
   - Proposed, counter-proposed and confirmed times are displayed in the corresponding stored timezone.
4. **Handoff authority revalidation**
   - Added `assertRecipientRepresentative` to revalidate the current business capability, verified organization administrator/owner status, or active individual member access.
   - Both sides' eligibility is checked again when contact/meeting handoff is requested, rather than relying only on the participant row captured at request creation.
5. **Regression updates**
   - Added checks for the four lightweight intent/workspace boundary, question answer service/route/UI, wizard steps and timezone helper.
   - Added integration assertions for one-time question response and a Playwright case for recipient answer.
   - Updated the listing-scoped quotation wizard Playwright flow to traverse all four steps.

### Last directly inspected implementation snapshot

- `9a978d52c93fcaed7c29d0e0e5490ede28052cf7` remains the last code commit from the original handoff.
- Source-level corrections and regression additions were subsequently committed to PR #18, with the Phase 2 audit recorded in document 73.
- The documentation snapshot at the start of this addendum was `0bc7390d124448c7ef3ab5ee46e9b86898d6de02`; it records the source state through `b8b92cbda9b57680e3b2481314561a2c995cccf7`.
- Always fetch PR #18 metadata again before editing; documentation commits may have advanced the branch since this snapshot.

## 3. Remaining work — Phase 2 is not yet closed

### A. Mandatory validation gates
- [ ] Confirm current PR #18 head SHA and inspect all commits since the last inspected code commit.
- [ ] Run focused Network-Plus source/unit tests, including `test/platform/network-plus-request-collaboration.test.js`.
- [ ] Run the Phase 2 integration test against a disposable PostgreSQL database with the required base schema and migrations applied in order.
- [ ] Execute `20261103140000_network_plus_phase2_connection_handoff.sql` against disposable PostgreSQL, verify constraints/indexes/triggers and test the documented rollback/compatibility path.
- [ ] Run full backend suite (`npm test` or the repository's current canonical equivalent).
- [ ] Run focused Playwright request journeys and then the full Playwright suite.
- [ ] Run Biome/lint, TypeScript and production web build.
- [ ] Trigger/inspect PR #18 GitHub Actions for the resulting head SHA; diagnose and fix all failures without weakening checks.
- [ ] Verify migration idempotency/replay and compatibility with existing Increment 4/5/6 data, especially old request rows and workspace trigger constraints.

### B. End-to-end security and behavior checks still needing runtime proof
- [ ] Prove requester-only and recipient-only visibility for the question answer; prove unrelated participants and support access cannot read it.
- [ ] Prove a recipient answer cannot be repeated, edited or used to implicitly accept a request; verify audit and notification behavior.
- [ ] Prove consent is bilateral independently for every contact field; decline/revoke must prevent further disclosure and clear that side's encrypted value.
- [ ] Verify encryption-key missing/wrong-key behavior, ciphertext-at-rest, key rotation/backup documentation and no plaintext leakage into list/detail, logs, audit metadata, notifications or support views.
- [ ] Verify contact/meeting routes re-check current authority for business and organization recipients and current access for individual requesters/recipients, including revoked roles, membership expiry and visibility changes.
- [ ] Verify additional participants/workspace invitees cannot see primary-party contact, clarification or meeting handoff data.
- [ ] Verify meeting proposal, accept, decline, one counterproposal, proposer confirmation, duplicate active proposal, expired/invalid dates, IANA timezone edge cases (DST gaps/folds), supported durations and contact/link rejection in place details.
- [ ] Verify notification preferences, in-app category, push delivery, privacy-safe body text and deep links with actual configured delivery infrastructure.
- [ ] Verify mobile, desktop, keyboard and screen-reader flows for the four-step wizard, consent and meeting controls.

### C. Code-review items to inspect before declaring done
- [ ] Review the full current diff for accidental text replacement or JSX/TypeScript issues in `web/app/network-plus/requests/page.tsx`; the wizard was introduced through targeted edits and needs a real compile plus browser run.
- [ ] Review the local-time-to-UTC conversion helper against timezone offsets and DST ambiguity. Decide and document how ambiguous repeated local times are handled; add deterministic tests.
- [ ] Confirm the new one-time answer fields are included in the actual production migration and rollback path, and that the integration fixture schema matches them.
- [ ] Confirm all route handlers have consistent rate limiting, request-id/idempotency behavior, error mapping and authorization.
- [ ] Inspect notification event names against the notification registry/category/preference and Web Push dispatch implementation.
- [ ] Check all eleven intents and legacy transition semantics against the canonical state machine. Do not add another request model or duplicate lifecycle.
- [ ] Confirm no request UI offers a collaboration workspace for `interest`, `question`, `quote_request`, or `meeting_request`; collaboration remains optional and only eligible for the existing intent set.
- [ ] Ensure question answer is a one-time request artefact, not a new messaging/chat system.
- [ ] Ensure quotation remains a request for quotation/contact, not an order, checkout, payment, fulfilment or commercial transaction feature.

## 4. CI and runtime verification status

At the time this handoff was written, a workflow-run lookup for the directly inspected commit `9a978d52c93fcaed7c29d0e0e5490ede28052cf7` returned no PR-triggered runs, and the combined commit-status lookup returned no status entries. This is **not evidence that CI passed**. No disposable PostgreSQL execution, full backend run, full Playwright run, production build or deployed encryption-key verification has been established in this handoff.

Keep PR #18 in draft until every mandatory gate above has actual recorded results.

## 5. Continuation order for the next chat

1. Re-fetch the current branch head and PR #18 metadata; inspect commits/diff since `9a978d52c93fcaed7c29d0e0e5490ede28052cf7`.
2. Inspect the migration runner, migration compatibility/rollback harness, integration test setup, package scripts and CI workflow definitions.
3. Run the focused source tests and compile/lint first; repair actual failures without relaxing rules.
4. Execute the Phase 2 migration and integration tests on a disposable PostgreSQL database. Fix schema, constraint, transaction, rollback and legacy-data failures.
5. Run Playwright focused journeys and correct UI/runtime issues, including timezone/DST and bilateral consent behavior.
6. Run the complete backend, Biome, TypeScript, production build and full Playwright gates.
7. Inspect Actions for the exact resulting PR head SHA and fix every failed job.
8. Update document 73 with exact verification evidence and only then mark Phase 2 complete. Do not start Phase 3 until the Phase 2 exit criteria are met.

## 6. Next-chat instruction (copy/paste)

Continue Network-Plus Phase 2 on the existing PR #18 branch `feat/workstream-3-progress-members-workspace` in `mpaproject1/MPA-Professionals-Network`. First inspect the current branch HEAD and all changes since commit `9a978d52c93fcaed7c29d0e0e5490ede28052cf7`. Read `docs/73-network-plus-phase-2-connection-consent-handoff.md` and this continuation record `docs/74-network-plus-phase2-progress-and-next-chat-handoff.md`. Do not assume Phase 2 is complete: finish the outstanding PostgreSQL migration/rollback, authorization/privacy, encryption, notification, timezone/DST, Playwright, backend, Biome, TypeScript, production-build and GitHub Actions validation gates. Fix all real failures without weakening checks, preserve the canonical request model, keep collaboration optional, do not introduce chat/commerce behavior, keep PR #18 draft, and record actual test/CI evidence in document 73 before proceeding to Phase 3.


## 7. Continuation update — 2026-11-03

### Current source work recorded

The following Phase 2 corrections are now in the branch and documented in document 73:

1. Fixed the migration compatibility script's missing comma, which was a JavaScript parse failure.
2. Revalidated the current recipient representative before structured clarification and one-time question answers; organization representatives must still be active verified owners/administrators.
3. Made request-detail `canReview` and `canAccept` flags reflect current recipient authority instead of stale participant rows.
4. Added an all-or-none database invariant for `recipient_response`, `recipient_response_by` and `recipient_response_at`, restricted to question intents.
5. Added Phase 2 columns and consent primary-key assertions to migration compatibility checks.
6. Added exact before/after rollback snapshots for Phase 2 tables, columns, constraints and indexes.
7. Bound AES-GCM contact ciphertext to request/recipient/field AAD and added authenticated versioned envelopes.
8. Added a transactionally safe contact-key rotation utility, explicit package command and source regression test.
9. Rejected nonexistent and repeated local meeting times around DST changes; added a browser regression scenario for both.
10. Included the Network-Plus request journey in the selected PR Quality browser acceptance list.

### Current verification boundary

- Source changes and regression tests have been committed.
- The migration compatibility runner has not been executed against disposable PostgreSQL.
- Backend, Playwright, Biome, TypeScript and production-build checks have not been executed in this continuation.
- No successful CI result or deployed encryption-key verification is claimed.
- No Phase 3 implementation has started. The Phase 3 contract in document 70 is My Requests and closure disposition, and remains gated on Phase 2 exit evidence.

### Next execution order

1. Fetch current PR #18 metadata and branch HEAD; keep the PR draft.
2. Inspect the final source diff and validate all changed JavaScript/SQL/TSX for consistency.
3. Run the focused Network-Plus tests and source checks.
4. Apply the full migration chain to a disposable PostgreSQL database; execute the Phase 2 migration replay/rollback compatibility harness and inspect the restored schema.
5. Run backend integration coverage for current representative authority, support/additional-participant privacy, consent/revocation, encryption authentication, notifications and meeting lifecycle.
6. Run focused and full Playwright coverage, including the DST gap/fold cases, mobile and keyboard navigation.
7. Run Biome, TypeScript and production build. Fix actual failures without weakening checks.
8. Inspect GitHub Actions for the exact final source head and record real results in document 73.
9. Only after Phase 2 is verified complete, implement Phase 3 from document 70: compact My Requests shelf, requester disposition In progress / Completed / Cancelled, required short closure remark, review reminders, reopen history, decline/withdrawal, and explicit separation of observed events from requester-reported outcomes. Preserve the canonical request model; do not add CRM/deal/transaction tracking, chat or mandatory collaboration.
