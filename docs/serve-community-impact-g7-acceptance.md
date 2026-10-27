# Serve-Community G7 — final combined acceptance gate

**Stack base:** combined mentorship candidate at `feat/mentorship-operational-workflows` (destination PR #4, source PR #23).
**Purpose:** acceptance record for source PR #21, stacked after source PRs #5, #17, #20 and #23.
**Status:** Draft gate. This checklist is not proof that acceptance passed. Record links and results from checks run on this exact combined head before merging.

## Required evidence — all must pass

### 1. Database compatibility and rollback
- Run the repository migration-compatibility script only against a verified disposable PostgreSQL database.
- Verify legacy-schema upgrade and the complete G2–G6 migration sequence, including constraints, foreign keys, indexes, lifecycle events and completion history.
- Verify rollback-only checks leave the disposable database unchanged. Never use production/live data.

### 2. Backend authorization, privacy, idempotency and concurrency
- Run the complete backend suite, including Serve-Community G2–G6 and mentorship regressions.
- Confirm active-member/verified-professional requirements for individual providers; verified-organization and authorized organization-role checks for organization providers.
- Deny unauthorized access to private requests, participant updates, governance reports and protected exports.
- Exercise idempotent retries and concurrent duplicate submissions for listings, interest, pledges, service requests, announcements, updates and outcome decisions.
- Confirm no uncertain response causes a duplicate record or a false success.

### 3. Listing, agreement, delivery and outcomes
- Verify draft, pending review, published/active, paused, fulfilled and archived states, including optional/no-expiry listings.
- Keep interest and pledges distinct from agreements, active delivery and verified outcomes.
- Require both parties to accept the same persisted terms version before delivery.
- Keep provider completion submission separate from requester acceptance. Verify accept/revision/dispute decisions, actor/timestamp history, fresh evidence after revision/dispute, and dispute-resolution safeguards.
- Keep payment verification separate from completion; paid work requires finance-verified payment evidence, while pro-bono/free work is exempt from paid-payment submission.
- Verify manual/ongoing programs remain open and configured fulfilment thresholds count only eligible requester-accepted engagements.

### 4. Announcements, participant updates and feedback
- Public/member audiences and moderation states are enforced server-side; unpublished announcements remain hidden.
- Only listing owners/authorized organization managers may submit; authorized moderators publish/reject.
- Participant updates and feedback are readable/writable only by authorized request participants.
- Server validation rejects contact details, external contact links and sensitive participant information.
- Notifications link to the exact listing/request. Queued or sent email is not reported as delivered without trusted provider delivery evidence.

### 5. Privacy-safe reports and exports
- Verify owner/organization-manager and governance-reviewer authorization separately.
- Suppress groups smaller than five; exclude participant identity/contact details, free-text outcome descriptions, pledge descriptions and actor identifiers.
- PDF/XLSX exports enforce the same authorization and suppression, use private/no-store response headers, and create audit records.
- Test unauthorized, empty, small-group and export-failure cases with fixtures.

### 6. Mentorship integration from source PR #15
- Explicit opt-in before minimized, contact-redacted interest appears in an eligible mentor pool.
- Interest does not create a match; matching staff propose a mentor and both participants consent.
- Meeting/location details remain withheld until both participants accept the first-session proposal; block session outcomes before confirmation.
- Mentor-circle participation is opt-in and exposes aggregate counts only.
- Feedback is participant-entered and validated; confidential reports exclude contact-address fields and are restricted to the authorized review queue.
- Email states distinguish queued, sent, delivered and read; only trusted provider delivery events establish delivered status.

### 7. Build, browser, accessibility and theme checks
- Run the complete pre-deployment workflow on this exact combined head: backend tests, disposable PostgreSQL compatibility/rollback, Biome, TypeScript and production build.
- Run browser acceptance for desktop, tablet and mobile across listing lifecycle, policy configuration, announcements, service request/agreement, delivery evidence, outcome decisions, feedback, reports/exports and notification links.
- Verify keyboard navigation, accessible errors/statuses, reduced motion, responsive layout and light/dark contrast.
- Record skipped tests and explain why; do not describe skipped role journeys as passed. No production database or deployment.

## Required review and merge sequence

1. Source PR #5 baseline → destination PR #1, based on `main`.
2. Source PR #17 G0–G5 → destination PR #2, based on PR #1's branch.
3. Source PR #20 G6 → destination PR #3, based on PR #2's G5 branch.
4. Source PR #23 combined mentorship integration → destination PR #4, based on PR #3's G6 branch.
5. Source PR #21 G7 acceptance gate → this PR, based on destination PR #4's combined mentorship branch.

Keep all PRs draft until the exact intended tree is reviewed and all required checks have passed. Merge each increment only after its own review and validation, in the sequence above. Do not merge the stale standalone G7 branch or duplicate mentorship PR independently. Do not merge to `main` before the entire stack has passed the agreed acceptance gate.

No production database operation, production-data test or deployment is authorized by this checklist.

## Evidence record (complete before approval)

For each required check above, record:
- Exact workflow run URL and tested commit SHA.
- Result: PASS, FAIL or BLOCKED (never mark an unexecuted/skipped check as PASS).
- Test command or named acceptance suite and concise result summary.
- For database checks, confirmation that the database was disposable and isolated from production.
- For browser checks, device/viewport, role used, scenario, result and any unresolved issue.
- For any exception, the reason, risk owner and explicit disposition.

Final decision: **NOT ACCEPTED until every required check has a recorded passing result on the exact combined PR #9 head.**
