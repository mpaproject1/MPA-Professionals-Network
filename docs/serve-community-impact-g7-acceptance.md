# Serve-Community G7 — final pre-deployment acceptance gate

**Branch:** `feat/serve-community-g7-acceptance`  
**Stack:** G0–G6 on PR #5's current head through PR #17  
**Status:** Acceptance plan recorded; no G7 pass is claimed until every required check is executed on the exact combined head.

## Required execution evidence

### 1. Database compatibility and rollback
- Run `scripts/check-new-migration-compatibility.js` only against an explicitly verified disposable PostgreSQL database.
- Verify legacy-schema upgrade, the repository migration sequence, and rollback-only compatibility for G2, G3, G4 and G6.
- Confirm every new constraint, foreign key, index, lifecycle event and completion-history table exists with the expected types and allowed values.
- Confirm rollback leaves the disposable database unchanged; never point this command or tests at production/live data.

### 2. Backend authorization, privacy and concurrency
- Run all backend test files, including Serve-Community G2–G6 tests and the mentorship-specific regression suite from PR #15.
- Verify individual providers require the existing active-member/professional capability; organization providers require verified organization status and an authorized active organization role.
- Verify non-owners, unrelated participants, non-members and unauthorized reviewers cannot access private requests, participant updates, governance reports or protected exports.
- Exercise idempotent retries and concurrent duplicate submissions for listing creation, interest, pledges, service requests, operational updates, announcements and outcome decisions.
- Verify no mutation is silently invalidated, duplicated or reported as successful after an uncertain response.

### 3. Listing and engagement lifecycle
- Exercise draft, pending review, active, paused, expired, fulfilled and archived states, including listings with no expiry.
- Confirm interest and pledges are not counted as requests, agreements, active deliveries or completed outcomes.
- Confirm both parties accept the same persisted terms version before delivery begins.
- Confirm provider completion submission is not requester acceptance; requester decisions cover accepted, revision requested and disputed with actor, timestamp and append-only history.
- Confirm revision/dispute resolution requires the appropriate new evidence, and payment verification remains separate from completion.
- Verify free/pro-bono work does not require paid-payment submission; paid work requires finance-verified amount and currency.
- Verify manual ongoing programs remain open, and configured fulfilment thresholds count only requester-accepted engagements.

### 4. Announcements, participant updates and feedback
- Anonymous/public and active-member announcement visibility follows the stored audience; unpublished announcements remain hidden.
- Only listing owners/authorized organization managers can submit, and authorized moderators can publish/reject.
- Participant-only operational updates and feedback are readable/writable only by authorized request participants.
- Contact details, external contact links and sensitive participant data are rejected by server validation.
- Notifications link to the exact listing or request. Queued/sent email is never described as delivered without trusted provider delivery evidence.

### 5. Privacy-safe reports and exports
- Verify owner/organization-manager authorization and governance reviewer authorization separately.
- Verify groups smaller than five are suppressed; no participant identity, contact detail, free-text outcome, pledge description or actor identifier leaks into report output.
- PDF/XLSX exports enforce the same authorization/suppression as the report view, use private/no-store response headers, and write an audit record.
- Test unauthorized, empty, small-group and export-failure cases with real fixtures.

### 6. PR #15 mentorship-specific acceptance
- Explicit mentee opt-in is required before minimized request summaries appear in the eligible mentor pool.
- Interest does not create a match; matching staff propose a mentor and both participants' consent remains authoritative.
- First-session meeting/location details remain withheld from the other participant until both accept.
- Session completion/no-show outcomes are blocked before confirmation.
- Mentor-circle participation is opt-in and only aggregate counts are exposed.
- Feedback is participant-entered and server-validated; confidential reports exclude contact-address fields and are limited to the authorized review queue.
- Email state distinguishes queued, sent, delivered and read; only trusted delivery events establish delivery.

### 7. Web quality and browser acceptance
- Run Biome lint, TypeScript, the production Next.js build, all backend tests and the repository's complete pre-deployment workflow on the exact final head.
- Run browser acceptance for desktop, tablet and mobile, including listing creation/editing, policy configuration, announcements, service request agreement, delivery evidence, accept/revision/dispute decisions, feedback, report views/exports and notification deep links.
- Verify keyboard navigation, accessible status/error feedback, reduced motion, responsive layouts and light/dark theme contrast.
- Inspect failed/empty/retry states and confirm no private fields or unauthorized actions appear.

## Merge sequence

1. Reconcile the G6 source with G5 and complete the G0–G6 implementation on the stacked feature branch.
2. Execute every G7 check on the exact G0–G7 feature head and record the workflow/test evidence.
3. Merge the stacked G7 → G6 → G5 increments through their reviewable PRs into `feat/serve-community-impact-workflows`, then merge PR #17 into `ux/p0-navigation-and-org-privacy` only after review and all required checks pass.
4. After PR #17 lands on `ux/p0-navigation-and-org-privacy`, reconcile the overlapping PR #15 changes in `server.js`, `src/services-mentorship/service.js`, and any affected UI/configuration files. Preserve both the Serve-Community lifecycle/outcome work and the mentorship operations; do not replace either whole file with an older branch version.
5. Complete PR #15's mentorship-specific validation separately on the reconciled revision, including its migration, authorization, consent, session-confirmation, confidential-report and trusted email-delivery behavior. Merge PR #15 only after those checks pass.
6. Finish PR #5's remaining Phase 2 requirements and run the complete pre-deployment CI/acceptance process on the combined PR #5 head.
7. Merge PR #5 into `main` only after required checks and reviews pass.

No production database operation, deployment, or production-data test is part of this gate.
