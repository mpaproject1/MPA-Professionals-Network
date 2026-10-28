# Workstream 1 — Guided Membership Application and Payment

**Implementation branch:** `main`  
**Source baseline:** Workstream 0 audit and plan in `docs/24-post-pr13-membership-and-ux-gap-implementation-plan.md`  
**Scope:** Sequential application UX, server-backed state restoration, application/payment idempotency, configured payment-method enforcement, private evidence policy, and regression coverage.

## Implementation record

### Guided application experience

- `web/app/membership/workspace.tsx` now guides applicants through four keyboard-operable modal stages: account/profile identity, plan/terms, professional details, and submission result.
- The plan stage displays current fee and breakdown, currency, term/renewal policy, benefits, eligibility requirements, and configured required evidence types.
- The terms acknowledgement has a visibly bordered, padded panel and a large checkbox with explicit required language. The server rejects application and renewal submissions without the explicit acknowledgement, records `terms_acknowledged_at`, and stores a SHA-256 digest bound to the saved fee/validity/eligibility snapshot. The same acknowledgement is part of the idempotency payload contract.
- The result stage is shown only after the API returns a saved application ID and canonical status. The submission reference is taken from the server response.
- Application creation requires a session-stored idempotency key bound to the submitted payload. On an uncertain response, the page reloads and re-queries the server-backed application list; if an active application exists, it closes the form and presents that existing record rather than offering another submission.
- The page restores existing in-progress applications and shows an eight-stage progress summary. Rejected applications display the permitted rejection explanation and do not reuse the rejected record as a new submission.

### Payment and evidence contract

- `web/app/membership/payment/page.tsx` is the single applicant-facing payment submission path; the disconnected embedded payment form was removed from the application list.
- The payment screen displays the saved membership-fee purpose, saved currency and exact fee amount. The selected method must be enabled and match the application's currency before its instructions are displayed.
- Manual methods can be configured to require private receipt/document evidence. The UI validates file type and size, calculates SHA-256, uses the existing private upload service, uploads and checksum-confirms the file, then sends the confirmed file object ID with the payment request.
- The service requires an enabled configured payment method; direct API callers cannot bypass the method-specific evidence requirement by omitting a method code.
- Application and renewal endpoints reject missing terms acknowledgement; renewal requests pass the same idempotency key through to the application service.
- Hosted Chapa checkout is server-verified and never requires a receipt upload. Chapa cannot be submitted through the manual-payment endpoint.
- Manual payment submissions include explicit membership-fee purpose and currency. Server validation enforces the saved fee amount/currency, method currency, bank/Telebirr references and bank sender details. A checksum-confirmed upload is cached for a retry of the same selected file so a transient payment API failure does not require uploading it again.
- Payment submission retries reuse an application/method-scoped idempotency key. The service checks for an existing matching transaction before checking the application's current state or reapplying upload requirements, so retries return the original payment after a timeout or later status transition. Reusing the key with a different payload is rejected.

### Schema and service changes

Migration `db/migrations/20261028110000_guided_membership_application_payment.sql` is additive:

- Adds nullable `submission_idempotency_key` and `submission_payload_sha256` to `membership_application`.
- Adds `terms_acknowledged_at` and `terms_snapshot_sha256` to persist the applicant acknowledgement and bind it to the saved fee/validity/eligibility snapshot.
- Application and renewal creation require an idempotency key; new submissions without one are rejected rather than relying only on a UI duplicate guard.
- Adds a partial unique index scoped by account and non-null application submission key.
- Adds `requires_evidence` to `membership_payment_method`, defaulting to required for manual methods; hosted Chapa records are explicitly set not to require an upload.
- Does not delete, rewrite, or reclassify existing applications or payments.

`src/membership/service.js` implements application replay/conflict behavior, configured payment-method requirements, applicant-safe payment status fields, timestamps, reconciliation status and reversal outcome. The member-facing review-history payload is limited to rejected/correction-required explanations. Internal reconciliation notes remain available only through the authorized review workflow.

Existing payment-policy behavior is preserved: payment verification while the application is under review does not approve it; a later review approval can recognize a verified payment; activation remains a separate authorized server-side operation. Rejection after payment retains the payment and triggers the existing finance reconciliation notification path.

## Regression coverage added or extended

- `test/membership/phase1.test.js`: missing application idempotency key and missing terms acknowledgement are rejected; acknowledgement timestamp/hash are persisted; same-key application retry returns the original record even after activation; changed-payload key reuse is rejected; duplicate active applications are rejected; missing payment method and required-evidence bypasses are rejected; payment key conflict is rejected; payment retry returns the same transaction after payment success, application approval, and application rejection; early payment verification does not advance the application; correction/review/approval/activation remain separate; rejection after verified payment retains the succeeded transaction and reconciliation record.
- `test/p0/membership-early-payment.test.js`: manual evidence requirement follows configuration, while hosted checkout never requires an uploaded receipt; existing canonical status-transition and required-evidence tests remain.
- `test/platform/private-file-storage.test.js`: covers retrying with a valid private evidence payload after invalid upload validation, in addition to existing content-type/signature/size and cross-scope privacy checks.

## Acceptance and verification boundary

The source and schema implementation is committed on `main`. The required full CI, database migration/rollback compatibility check, and browser/keyboard/mobile acceptance are intentionally **not run in this intermediate workstream**, consistent with the repository's policy to run the full suite only at final Workstream 9 acceptance. This document records implementation, not a claim that runtime acceptance has passed.

Before final acceptance, Workstream 9 must run the complete required CI/test suite against the exact final commit and verify:

- forward migration and rollback compatibility on disposable PostgreSQL;
- successful and invalid application submissions, same-key replay, changed-payload conflict and duplicate active application;
- private upload validation failure/retry, confirmed evidence attachment to the correct payment transaction, and cross-account access denial;
- configured manual evidence required/optional behavior and hosted checkout without receipt upload;
- pending, correction, rejection, early payment verification, approval, activation, and rejected-after-payment reconciliation;
- browser reload/status restoration and keyboard/mobile layout without losing progress.
