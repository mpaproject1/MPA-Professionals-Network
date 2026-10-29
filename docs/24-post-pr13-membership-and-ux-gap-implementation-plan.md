# Post-PR #13 Membership and UX Gap Remediation Plan

**Status:** Active remediation plan; source implementation is tracked by workstream below  
**Target repository:** `Jcodestest/MPA-Professionals-Network`  
**Target branch for this plan:** `main`  
**Implementation status:** Workstream 1 source hardening is recorded. Workstream 2 payment-method configuration is integrated into `main` through PR #17. Workstream 3 progress-based `/members` workspace source implementation is in review on `feat/workstream-3-progress-members-workspace`. Final CI, migration/rollback and browser/accessibility acceptance remain deferred to the final workstream. Other workstreams remain subject to their own source review and acceptance evidence.  
**Scope:** Close the development-environment gaps observed after PR #13 was merged. This document records intended UX, workflows, security invariants, sequencing, source implementation and acceptance evidence. It distinguishes source changes from final acceptance and does not claim deployment or successful validation unless explicitly recorded.

## 1. Purpose and operating rules

The development-environment review indicates that some of the intended membership/payment workflows are not discoverable or complete in the merged UI, and several account, admin, navigation, and guidance flows are confusing or nonfunctional. Treat these as implementation gaps to verify against the current code, not as proof that a specific backend capability is absent.

The objective is to deliver a coherent, accessible, progress-based member journey and a reliable administration experience without weakening existing authorization, privacy, identity matching, membership review, payment verification, auditability, idempotency, or migration safety.

### Non-negotiable constraints

1. **Inspect before editing.** Trace each screen to its route, API, data contract, authorization policy, and tests. Reuse the current architecture; do not replace newer work wholesale or blindly copy source-PR files.
2. **No false success.** Every submit, payment, review, export, password action, and card-print action must show the server-confirmed result. Pending/loading/error states must be explicit.
3. **Application review, payment verification, and activation remain separate.** Payment evidence or a verified payment must never approve an application by itself. A receipt upload is not proof of payment.
4. **Private data stays private.** Private payment evidence, recovery email, temporary credentials, private requests, identity documents, and continuation tokens must not leak into public pages, logs, URLs, analytics, exports, or unauthorized staff views.
5. **Preserve history.** Keep existing IDs and audit records in storage; add readable presentation references rather than replacing backend identifiers. Never silently overwrite imported membership status, dates, or historical payments.
6. **No weakening to make tests pass.** Preserve permission checks, ownership and consent checks, CSRF/session controls where applicable, idempotency, replay protection, migration compatibility, and server-side validation.
7. **No production or payment activation from this plan.** No deployment, live provider enablement, credential changes, or destructive database operation is authorized by this document.
8. **One reviewed implementation sequence.** Work should be split into small, reviewable increments on the agreed existing integration workflow; do not create parallel or duplicate implementation branches without explicit approval. Run CI against the exact final commit before acceptance.

## 2. Workstream overview and order

| Order | Workstream | Main outcome | Priority |
|---|---|---|---|
| 0 | Baseline and contract audit | Route/API/permission matrix and reproducible gap list | P0 |
| 1 | Membership application and payment journey | Sequential progress flow, evidence upload, truthful status and retry protection | P0 |
| 2 | Bank/manual payment configuration | Discoverable finance configuration and safe account-detail display | P0 |
| 3 | Membership workspace and guide tour | Progress-based `/members` experience and current guided tour | P1 |
| 4 | Signed-in navigation and landing page | `My-Workspace`, clean navigation, redesigned home page | P1 |
| 5 | Admin account identity and account governance | Readable account references and working governance destination | P1 |
| 6 | User management security operations | Reset/revoke access, one-time credentials, recovery-email workflow | P0 |
| 7 | Member cards and directory data | Reliable single/bulk print, authorized member detail and selective exports | P1 |
| 8 | Jobs interest authorization and tracking | Members-only route, human-readable request reference | P0 |
| 9 | Cross-cutting quality and release gate | Security, regression, accessibility, export, migration and browser evidence | P0 |

P0 workstreams should be validated before the broader visual polish is declared accepted. Workstreams may share components, but the sequence should not hide a blocked security or membership workflow behind a UI-only improvement.

## 3. Workstream 0 — Baseline and contract audit

Before changing code, map the current implementation and reproduce each reported issue on the merged development commit.

### Inspect

- `/members`, `/members/catalog`, `/membership`, `/membership/payment`, `/jobs/interest`, the home page, signed-in navigation and screen-tour entry points.
- `/admin/accounts`, `/admin/account`, the account-governance action, user-management actions, payment-method configuration, membership card routes and export endpoints.
- The account/profile, membership application, payment, bank/manual payment, legacy import, member card, job-interest and reporting API routes and underlying service/schema.
- Existing docs including [Membership migration and payment workflow](23-membership-migration-and-payment-workflow.md).
- Existing roles and permissions, profile visibility rules, account/member status mapping, import reconciliation, audit events, idempotency conventions, file-upload service and export controls.

### Required output

Create or update an implementation checklist in the relevant PR description with, for every reported gap: current behavior, expected behavior, owning route/component/API/schema, authorization rule, test file(s), and evidence. Distinguish a missing backend capability from a UI integration or response-mapping defect. Do not add a migration until schema inspection demonstrates that one is necessary.

## 4. Workstream 1 — Guided membership application and payment

### UX objective

Replace a card-heavy, disconnected flow with one sequential journey. The user should always know what is complete, what is required next, what has been submitted, and whether they should wait or take action.

Use a stepper/progress header and one focused panel per stage, with a persistent summary on desktop and a compact summary on mobile:

1. **Account and profile** — show the signed-in identity and any required missing profile fields.
2. **Choose membership** — display available product, fee, currency, validity period, eligibility and required documents in plain language.
3. **Review terms** — make the acknowledgement control visibly bordered, thick enough to be discoverable, aligned with its label, keyboard-operable, and clearly required. Use explicit text such as “I have reviewed the plan fee, validity and eligibility terms.” Do not use a near-invisible outline.
4. **Submit application** — validate the full form, prevent duplicate submissions, and show a confirmation state only after the server confirms creation.
5. **Payment instructions** — show the configured payment method and the relevant bank/account instructions or provider checkout action.
6. **Submit payment evidence** — allow amount, currency, payment purpose, reference number, payment channel, and receipt/document/photo where the selected method requires it. Use the existing private upload service, checksum/attachment confirmation, file type/size validation, progress, retry and clear error states.
7. **Review status** — show application review and payment status separately, with timestamps and a clear next action.
8. **Completion** — show activation/membership validity only after the backend confirms activation.

Do not require payment evidence for a genuinely online provider transaction unless the policy explicitly calls for it. For manual bank transfer, Telebirr, cash/in-person or other configured manual methods, show the fields required for that method. Never show one method's instructions as though another method was selected.

### Status and duplicate-submission behavior

- After application submission, replace the form with a persistent status/result view on the same route or last step. Show the application reference, submission time, current server status and next action.
- On revisiting `/membership`, load the user's existing in-progress or submitted application and its latest status. Do not present a fresh application form when a matching active application already exists.
- Use a deliberate “Start a new application/renewal” action only when policy and server state permit it. Explain why a new application is or is not allowed.
- Distinguish application states (for example: draft, submitted, in review, correction required, approved/payment pending, paid, rejected, withdrawn) from payment states (pending, submitted for verification, verified/succeeded, rejected, failed, cancelled, refunded/reversed). Use the canonical enums in the API rather than inventing UI-only states.
- A rejected application must display the rejection outcome and any permitted explanation. Do not invite another false submission on the same page; explain whether correction, appeal or a new application is allowed.
- Submission retries must be idempotent. A network timeout must cause the UI to refresh/query the existing server record before offering a retry.
- Payment verification while an application is under review must not change the application to approved. A later authorized approval may move the application forward when payment is already verified. Activation remains a separate server-side gate.
- If an application is rejected after payment has been received or verified, retain the payment and expose it to authorized reconciliation/refund handling. Never erase or silently reclassify the payment.

### Acceptance criteria

- A user can complete the journey using keyboard and mobile viewport without losing progress.
- Evidence uploads attach to the correct payment record and are not publicly accessible.
- Reloading or revisiting the page restores server-backed status, not a blank form or invented success.
- Double-click, refresh, network retry and repeated API requests do not create duplicate applications/payments.
- Automated regression proves payment evidence and payment verification cannot approve or activate an application; approval and activation each require their own valid server-side gate.
- Tests cover success, validation failure, upload failure/retry, pending status, rejection, correction request, early payment verification, duplicate submission and rejected-after-payment reconciliation.

## 5. Workstream 2 — Bank and manual payment configuration

The existing workflow specification says authorized membership/finance administrators configure manual methods in the payment workspace and that bank/account details, currency, instructions and optional HTTPS QR image URL are stored in configuration rather than hardcoded. Verify this contract against the current merged implementation before designing a new schema.

### Admin experience

- Add a clearly named, permission-protected **Membership → Payment methods** or **Finance → Payment methods** destination, linked from the relevant admin workspace.
- Provide a list of configured methods with enabled/disabled status, display name, method type, supported currency, required evidence fields and last-updated information.
- Provide an add/edit flow for bank name, account holder/name, account number or approved account identifier, branch/reference instructions where applicable, supported currency, payment instructions, optional QR image URL, and enabled state. Telebirr/cash/other manual methods should show only the fields applicable to that method.
- Show a safe preview of what a member will see before saving. Warn when a method is incomplete or disabled.
- Restrict viewing and changing account details to explicitly authorized finance/admin roles. Record actor, timestamp, changed fields and outcome in the audit trail; do not put secrets or full sensitive account details in general logs.
- Members see only active methods and the details needed to pay. Never expose configuration or management controls to public visitors.
- Do not place provider secret keys in this form. Chapa secrets remain API environment configuration as described in the workflow document.

### Acceptance criteria

- A permitted admin can create, edit, enable/disable and preview a method; an unauthorized user receives a server-side denial.
- The selected method's instructions appear in the member journey and match its required evidence fields.
- Existing payment records retain the method/details that applied at the time of payment, or an explicit audited snapshot; editing current configuration must not silently rewrite historical transactions.
- Tests cover permissions, validation, disabled methods, currency consistency, audit history and safe handling of account details.

### Source implementation record — Workstream 2

- The existing `membership_payment_method` table and `/api/v1/admin/membership/payment-methods` endpoints are reused; no duplicate configuration table is introduced.
- Added `/admin/membership/payment-methods`, linked from Admin overview and the signed-in payment workspace. The client and server enforce system-admin, finance-officer, `members.manage`, or `finance.manage` access. Server-side checks remain authoritative.
- The member-facing configured-method endpoint now requires an authenticated session and returns only enabled, complete methods. Account details and management controls are not available to unauthenticated public visitors.
- Server validation is method-aware: enabled bank transfer requires bank, account holder, account identifier and instructions; enabled Telebirr requires account holder, account/merchant number and instructions; enabled cash/other manual methods require instructions. QR image URLs must use HTTPS. Chapa secret keys remain API environment configuration.
- Added a method-specific form, enabled/disabled and incomplete warnings, required-evidence display, last-updated timestamp, and a member-facing preview. Type-specific controls hide irrelevant bank/account fields.
- Successful configuration changes record actor, timestamp, success outcome and changed field names in the existing audit log. Account values and provider secrets are excluded from audit metadata.
- Added an additive `payment_method_snapshot` JSONB field on payment transactions. It backfills only snapshots already stored in the request payload and captures new manual and hosted-checkout configuration at payment creation. It never reconstructs old details from mutable current configuration.
- Added regression tests for explicit access policy, method-specific validation, disabled/incomplete methods, HTTPS QR URLs, Chapa evidence separation, provider-secret exclusion and redacted audit metadata.

**Verification boundary:** source and regression test files are committed on the Workstream 2 feature branch. Full CI, database migration/rollback execution and browser acceptance remain deferred to the final workstream as requested.

## 6. Workstream 3 — Progress-based `/members` workspace

### UX direction

Move away from a grid of equally weighted cards. Design the page like a guided challenge/progress journey: one primary “Continue where you left off” action, a visible progress indicator, and ordered steps that unlock or become actionable based on real account state.

Suggested information hierarchy:

1. **Welcome and current state** — member/non-member status, membership status, profile completion or application progress, and one primary next action.
2. **Your progress** — a stepper/timeline such as Profile → Membership application → Payment (if required) → Review → Active membership. The server remains the source of truth; do not award progress for opening a page.
3. **Continue** — one prominent next task with a short explanation and expected input/time if known.
4. **Your workspace shortcuts** — secondary, compact links for profile, membership card, learning/CPD, jobs, mentorship and Serve-Community, visible only when relevant and permitted.
5. **Recent activity/status** — concise application, payment, request and review events that the current user is authorized to see.
6. **Help** — context-specific guidance and a route to the current screen tour.

Avoid showing the same call-to-action or explanatory paragraph in multiple sections. Use clear empty states with a next step rather than empty cards. Keep the visual system consistent with the existing MPA brand, contrast, spacing and responsive components.

### Acceptance criteria

- The page has one visually dominant next action and a meaningful progress sequence rather than a flat card catalogue.
- Progress/status is driven by server data and permission checks.
- New, incomplete, pending, active, rejected and expired membership states each have a relevant next action and no misleading progress.
- Mobile, tablet, desktop, keyboard focus and screen-reader labels are tested.

### Source implementation record — Workstream 3 (in review)

- Added canonical `/members` workspace and changed the signed-in “My workspace” navigation destination to `/members`; legacy `/member` redirects to the canonical route so old bookmarks remain usable.
- The page loads the signed-in account, current-user application tracking, membership applications, and notifications from authenticated current-user endpoints. Failed sections are reported and missing data is never counted as completed progress.
- Replaced the equal-weight shortcut catalogue with one dominant “Continue where you left off” action, a five-stage profile/application/payment-if-required/review/active-membership sequence, compact permission-relevant shortcuts, recent status/activity, and contextual help. Completion is based on server-reported profile completion and membership/application/payment states, not page views or client-side counters.
- Handles incomplete/no-application, correction-required, pending review/payment, rejected, active and server-reported expired membership states with distinct guidance. Rejection is not presented as permission to resubmit. Payment status is not treated as application approval or activation; only the server-confirmed active-membership flag completes the activation stage.
- Adds source regression checks for route canonicalization, server-backed progress, unavailable data, accessibility semantics and separation of payment/review/activation.

**Verification boundary:** implementation and regression test sources are committed on `feat/workstream-3-progress-members-workspace`. CI, actual mobile/tablet/desktop browser checks, keyboard/screen-reader acceptance, and confirmation of each real API status shape remain pending; do not mark Workstream 3 accepted or merge it until those checks pass. No production deployment is authorized.


## 7. Workstream 4 — Updated screen tour and contextual help

- Audit every tour step against the current rendered UI, route names, labels and actions. Remove obsolete selectors and references to old UI.
- Tour steps must point to stable semantic selectors or component identifiers, not fragile layout positions.
- Use a short, skippable sequence with Back, Next, Skip and Finish controls; show progress (for example, “2 of 5”) and preserve a sensible restart option.
- On narrow screens or when a target is not visible, scroll to it safely or show an accessible explanatory step instead of an empty overlay.
- Do not block form submission or hide critical controls behind the tour.
- Offer “Show me around” from the workspace/help area and a contextual guide link from membership/payment.
- Update tour tests whenever the UI changes.

**Acceptance:** each step visibly targets the current control on the correct route; no stale selectors, empty overlays, keyboard traps or inaccessible close/skip actions remain.

## 8. Workstream 5 — Signed-in navigation and landing page

### Navigation

- Add **My-Workspace** to the top navigation for authenticated users only, with a clear destination to the personal workspace (the progress-based `/members` workspace or the canonical existing user workspace after route audit).
- Keep public navigation clean for signed-out visitors. Do not reveal admin-only destinations or infer privileges from client state.
- On mobile, ensure the signed-in workspace is easy to find in the menu and remains distinct from the home/logo link.
- Audit active-route indication, keyboard navigation, menu close behavior and role-aware items.

### Home page

- Remove redundant CTAs, duplicate messages and repeated explanations. Keep one primary public conversion action and only the necessary secondary action(s).
- Reorder content into a clear hierarchy: hero/value proposition, concise explanation of who MPA serves, a small set of core pathways (Jobs, Serve-Community, Mentorship, Membership), credibility/process information that is factually supported, and one final CTA.
- Add replaceable visual assets: prefer local, licensed or original SVG/illustration placeholders with clear component/asset boundaries so approved public imagery can be swapped later without rewriting layout. Avoid brittle hotlinked imagery and do not fabricate member testimonials, usage numbers or endorsements.
- Establish a consistent content width, heading scale, vertical rhythm, grid alignment and responsive image/text balance. Ensure imagery has useful alternative text where meaningful; decorative SVGs should be hidden from assistive technology.
- Preserve existing brand colors and shared shell unless a reviewed design change explicitly authorizes otherwise.

**Acceptance:** no duplicate primary CTA/message; navigation works at signed-in and signed-out states; image assets can be replaced independently; contrast, text scaling, mobile layout and loading states are checked.

## 9. Workstream 6 — Readable account references and account governance

### Readable Account ID

Keep the UUID/stable backend ID unchanged for database relationships, APIs and audit history. Introduce or use a separate immutable, unique, human-readable account reference displayed in admin UI.

Proposed presentation: **Account ID — MPA-YYYYMMDD-NNNNNN** (date plus a collision-safe sequence or equivalent server-generated unique suffix). The precise date source and sequence format must be finalized during schema/contract audit; never generate a reference from the current UI clock or a random client-side value.

- Display the reference near the account name and email, with copy control and a label that says “Account ID”.
- Use the same reference in account search, support correspondence and authorized exports.
- Preserve UUIDs internally and do not expose them as the primary human-facing identifier. If an existing record lacks a display reference, generate it through a controlled, idempotent backfill with uniqueness checks and audit/provenance; do not change the record's UUID.
- Keep status badges such as Active separate from the identifier.

### Account and membership status

The current details page reportedly says membership status and organizations are “Not available from this account response.” Trace the API response and frontend mapping. Do not replace a missing field with a guessed value.

- Return explicit account status, membership status, platform roles and organization relationships from the appropriate authorized endpoint or make a clearly separated authorized follow-up request.
- Distinguish **account role** (e.g. Member platform role) from **membership lifecycle status** (e.g. pending, active, expired, suspended, not enrolled).
- For imported users, map historical membership state through the approved import mapping and retain source dates/status. An imported account with role “Member” is not automatically an active/paid member.
- Use an explicit “Not enrolled” only when the server confirms no membership; use “Unable to load” with retry for a request failure, not as a substitute for a missing data contract.
- Return organization names and relationships only to roles authorized to see them.

### Account governance route

- Trace the “Account governance” button from `/members/catalog` through its href/router handler and destination.
- Make it open a real account-governance section/page within the admin route structure. Avoid broken hash-only destinations such as `admin#account-governance` that land on Overview without the section.
- Add an explicit section ID, tab/route state, or dedicated route consistent with existing admin navigation; ensure direct navigation and refresh work.
- Preserve admin role checks server-side and provide a meaningful denied/empty/error state.

**Acceptance:** no UUID is presented as the main account reference; imported membership details are truthful; the governance action opens the intended content on direct click and page refresh; unauthorized users cannot read governance data.

## 10. Workstream 7 — Secure user-management operations

These are high-risk administrative actions and require explicit permission checks, confirmation, audit events and secure delivery/handling.

### Reset/revoke access and one-time password

- Provide distinct actions for **Revoke sessions**, **Send sign-in recovery link**, and **Issue one-time password**. Do not conflate them.
- Require a confirmation dialog that identifies the selected account and explains the effect. For bulk actions, show the selected count and allow review before execution.
- Prefer a single-use, short-lived, cryptographically random recovery/activation token or temporary credential mechanism that forces the user to set a new password on first use. Do not store plaintext passwords; store only a secure verifier/hash for any temporary password.
- If policy requires a downloadable one-time credential file, make it available only immediately after successful generation to the authorized administrator, protect it from cache where possible, warn that it contains sensitive information, and do not make it retrievable again. Record the event without recording the credential/token itself. Delete/expire the server-side temporary artifact after the permitted retrieval/expiry window.
- Force a password change before normal use, invalidate existing sessions/refresh tokens as required, expire unused credentials, and rate-limit attempts. Never email a plaintext password or place credentials in URLs/logs.
- For bulk issue, produce a controlled, one-time download tied to the authorized action; show per-account outcome and failures without exposing credentials to users not selected. Define secure file retention and handling before implementation.
- Do not allow an administrator to view or reveal an existing password.

### Recovery email

- Add a privileged, auditable recovery-email edit flow with syntax validation and duplicate/account-ownership policy checks.
- Require confirmation and re-authentication/step-up authentication for the administrator where supported. Record old/new address in a protected audit event with appropriate masking in ordinary logs.
- Verify the new address before treating it as a trusted recovery destination where policy permits. Notify the user through existing verified channels when possible; do not silently replace a verified email without audit and notification.
- A recovery-link action should send a short-lived, single-use link to the currently authorized recovery destination and report only that the request was accepted—not claim delivery unless delivery is confirmed by the notification service.

### Audit and authorization

Audit actor, target account, action, timestamp, reason where required, outcome and correlation reference. Never log passwords, reset tokens, private evidence, or full downloadable credentials. Server endpoints must independently enforce role, target-account scope and action policy.

**Acceptance:** tests prove unauthorized actions fail server-side; tokens expire and are single-use; sessions are revoked as specified; first sign-in requires credential replacement; recovery email is audited and verified per policy; no secret appears in logs, exports or repeat-download endpoints.

## 11. Workstream 8 — Membership cards: single and bulk printing

- Trace why the current card route returns “Membership card unavailable / We could not find that item” with a long opaque reference. Identify whether the problem is a wrong identifier, missing card record, incorrect lookup, route mismatch or permission issue before changing it.
- Generate/display a card only for a backend-confirmed eligible membership and a permitted viewer. An account role alone is not sufficient evidence of active membership.
- Provide **View/Print card** for one eligible member and a **Select members → Print selected cards** flow for authorized administrators.
- Bulk printing should generate a paginated, print-optimized PDF with one card per page or a clearly reviewed grid layout, stable page breaks, readable QR/reference, no clipped fields and a clear empty/error state. Preview selected count before generation.
- Keep card fields minimal and policy-approved. Do not expose UUIDs, payment evidence, recovery email, private address or other unnecessary personal data on the card.
- Use the stable human-readable account/member reference only where appropriate; membership number and account ID must not be conflated.
- Enforce server-side permissions and selection scope; large jobs should have size limits and predictable error reporting. Log who generated/printed a batch, not unnecessary personal details.
- Ensure print actions do not depend on an ephemeral internal UUID pasted into a URL or on a card record that was never created.

**Acceptance:** single and bulk flows work for eligible records, ineligible/missing records get actionable messages, access is restricted, generated PDFs pass independent parsing/print-layout checks, and no sensitive fields leak.

## 12. Workstream 9 — Member and non-member directories with selective exports

### Directory detail

The `/members/catalog` and `/admin/accounts` (including the related `/admin/account` detail surface) should give authorized administrators a coherent, searchable view of critical attributes while respecting profile visibility and data-minimization rules.

Potential fields to support, subject to the data model and authorization policy:

- account display reference and account status;
- full name and profile photograph where allowed;
- gender only if collected, relevant to the authorized administrative purpose and permitted by policy;
- education level, qualification/credential and professional field;
- location (with clearly defined granularity), contact address and contact channels;
- membership status, membership number, membership product, start/end dates and import provenance;
- organizations and roles when authorized;
- profile completion and last-updated timestamps where useful.

Do not invent missing values or expose every field to every administrator. Distinguish “not provided,” “not applicable,” and “failed to load.” Do not make sensitive or private profile fields public merely because they are available in an admin response.

### Selective export builder

- Provide a column/field selector with sensible named presets and the ability to choose individual fields, preview the selected column list and see the expected row count before export.
- Support filters for member/non-member, membership status, organization where permitted, import batch, date range and other existing authorized search facets.
- Apply the same field-level permissions and row-scope filters to exports as to the on-screen directory. A hidden column must not leak through an export endpoint.
- Support CSV and XLSX at minimum if compatible with the existing export architecture; PDF is appropriate only for printable reports. Preserve long values, Unicode, dates, leading zeros and safe spreadsheet cell handling. Prevent spreadsheet formula injection. Clearly label currency and never aggregate unlike currencies.
- Include a generated-at timestamp, applied filters and selected fields in an appropriate export manifest/header, without exposing private criteria to unauthorized users.
- Enforce server-side export permissions, row/column allowlists, pagination/streaming limits and audit logging. For large exports, provide progress and a clear completion/failure state; do not report success for a zero-byte or invalid file.
- The same governed export capability should work for the member catalogue and the non-member/account catalogue without giving one view broader access than the other.

**Acceptance:** tests cover field-level authorization, row filtering, non-member vs member scope, empty results, long values, Unicode, leading zeros, formula-like values, pagination/large datasets, invalid/empty files and independent PDF/XLSX/CSV validation as applicable.

## 13. Workstream 10 — Jobs interest: members-only access and readable tracking

- Require authenticated, eligible membership at both the `/jobs/interest` page and every related API endpoint. Hiding a link in the UI is not authorization.
- Define the exact eligible membership states from the existing membership policy; do not assume every account with a “Member” role is currently active. If access is denied, show a friendly explanation and link to the user's membership status/application, without leaking job-interest data.
- Replace the long private continuation token in user-facing copy with a stable, short, human-readable request reference, for example `MPA-JI-YYYYMMDD-NNNNNN`, generated server-side with collision handling.
- Keep the continuation token random, private, unguessable and server-side/securely stored as currently required. Do not replace a security token with a predictable reference; the display reference is for support and status lookup only.
- Provide an authenticated “My job interests” list that can locate requests by the user's account and display reference. A reference alone must not grant access to private details.
- Ensure candidate consent and the existing private-until-consented rule remain intact. Record submission/status changes with audit history and idempotency protection.

**Acceptance:** active eligible members can submit and track their own interest; non-members and expired/suspended users are denied at page and API layers; one member cannot access another member's request by guessing a display reference; the private token is never shown in the UI or ordinary logs.

## 14. Accessibility, responsive design and content standards

Apply across all workstreams:

- Use semantic headings, labels, landmarks and button/link semantics; maintain visible keyboard focus and a logical focus order.
- Meet WCAG AA contrast for text, status badges, borders and focus indicators. Important checkboxes and inputs must not depend on faint outlines or color alone.
- Use consistent spacing, alignment, readable line length and responsive content width. Test narrow mobile widths, zoom/text scaling, tablet and desktop.
- Make errors specific and associated with their controls. Announce async submission/status changes to assistive technology without repeatedly interrupting users.
- Distinguish status using text and icon/shape in addition to color.
- Avoid duplicate CTAs, repeated messages, placeholder statistics, fake testimonials and misleading “complete” labels.
- Use plain-language labels; keep UUIDs and opaque implementation identifiers out of ordinary user-facing UI.

## 15. Test and evidence requirements

Do not mark a workstream accepted based only on a successful build or visual screenshot. Capture evidence against the exact commit.

### Automated checks

- Lint, formatting and TypeScript/type checks.
- Full backend test suite against disposable PostgreSQL, including fresh migration, upgrade from supported prior schema, rollback/compatibility checks and cleanup.
- Authorization and privacy regression tests for member, non-member, reviewer, finance, admin and unauthorized roles.
- Membership lifecycle tests covering application submission, correction/rejection, early payment evidence/verification, later approval, payment reconciliation/refund, activation, renewal and duplicate/idempotent retries.
- Upload tests for private access, file validation, checksum/attachment integrity and retry.
- Account reference generation/backfill uniqueness and preservation of backend UUID.
- User-management tests for session revocation, one-time credential expiry/use, forced password change, recovery-email change and audit secrecy.
- Card PDF and selected-field exports tested with independent parsers/libraries; verify nonempty output, expected columns/rows, Unicode, long fields and spreadsheet formula safety.
- Job-interest route/API membership authorization and private-token non-disclosure tests.
- Browser tests for all critical states, route navigation, mobile layout, screen tour, form confirmation and no duplicate submission.
- Accessibility checks for focus, labels, contrast, keyboard interaction and responsive layout.

### Manual development acceptance

Use separate test accounts for: new applicant, applicant in review, correction required, rejected applicant, approved/unpaid, paid/not activated, active member, expired/suspended member, imported legacy member, non-member, reviewer, finance user and admin. Verify each expected route and action with actual API responses. Do not use real member credentials or live payment credentials in test artifacts.

### Required evidence in the implementation PR

1. Exact commit SHA and CI run links.
2. Route/API/permission matrix and a short description of any schema changes.
3. Screenshots or browser recordings for desktop and mobile for the membership journey, workspace, account governance, payment configuration, account detail, card print and export selector.
4. Test output for lifecycle/security regressions and disposable PostgreSQL migration compatibility.
5. Independent validation output for generated exports/cards.
6. A list of remaining limitations, especially any provider sandbox or notification-delivery tests not completed.

## 16. Definition of done

The enhancement is accepted only when all applicable statements are true:

- [ ] Each reported gap is reproduced, mapped to its owner and resolved or explicitly documented as a remaining limitation.
- [ ] Membership application, evidence submission, payment verification, review, rejection/correction and activation are separate, visible, truthful stages.
- [ ] Revisiting the membership route loads existing application/payment status and does not encourage duplicate submissions.
- [ ] Manual bank/payment methods are configurable by authorized staff and the member sees the selected method's current instructions.
- [ ] `/members` is sequential and progress-based; the screen tour matches the current UI.
- [ ] Signed-in users can reach **My-Workspace**; the landing page has a clean hierarchy, no redundant CTAs and replaceable accessible visuals.
- [ ] Admin account references are readable and stable while backend UUIDs remain unchanged.
- [ ] Imported membership status and dates are represented accurately and are not inferred from account role.
- [ ] User-management security operations are permission-checked, audited, short-lived and secret-safe.
- [ ] Single and bulk membership cards work and pass PDF validation.
- [ ] Member and non-member directories show authorized critical attributes and offer a permission-safe selective export.
- [ ] Account governance opens the correct admin content directly and after refresh.
- [ ] Job interest is restricted to eligible members at both UI and API layers; private continuation tokens remain private.
- [ ] Full regression, security/privacy, migration, production-build and browser acceptance checks pass on the exact final commit.
- [ ] No production deployment or live payment enablement occurred as part of this work without separate explicit approval.

## 17. Suggested implementation PR breakdown

Use the existing agreed integration process and review each increment before proceeding. These are work packages, not instructions to create branches immediately.

1. **P0 — Membership state and payment-evidence integration:** status contract, application reuse, private evidence, confirmation, idempotency and lifecycle regression tests.
2. **P0 — Payment-method administration:** bank/manual method configuration, permissions, audit, member instructions and configuration tests.
3. **P0 — Jobs-interest authorization and references:** members-only page/API enforcement, human-readable display reference, private token preservation.
4. **P0 — Account identity and governance:** readable Account ID, correct membership/org response mapping, direct governance navigation.
5. **P0 — User-management security operations:** session revocation, recovery link/email workflow and one-time credential lifecycle after security review.
6. **P1 — Member card and selective directory/export:** single/bulk card printing, field-level permissions, export builder and independent file validation.
7. **P1 — Workspace/navigation/landing page/tour:** sequential `/members`, updated tour, My-Workspace and landing-page hierarchy/visual assets.
8. **Final acceptance:** reconcile all work packages against this document, run full CI and browser/accessibility checks, list limitations, then request review. Do not merge a work package solely because its UI renders.

## 18. Decisions to confirm during review

These details should be resolved against the current policy and data model before implementation, without blocking the initial plan review:

- The canonical route and label for My-Workspace (`/members` versus another existing personal workspace route).
- The final human-readable Account ID/reference format and whether account and membership card references should be distinct.
- Which profile attributes (especially gender, detailed address and contact information) each admin role is permitted to view/export.
- The exact membership states that qualify a user to access job-interest workflows.
- Whether one-time credentials are required or whether a single-use recovery/activation link is the safer supported policy; if a downloadable credential is retained, define expiry, retrieval, and secure handling.
- The current membership-card eligibility and field policy.
- Which export formats and report-size limits are supported by the existing reporting service.
- The actual cause of the reported missing payment-method screen and membership-card lookup failure.

**Review instruction:** Review this plan first. Do not start implementation or claim these gaps are fixed until the plan is revised/accepted and each work package is mapped to the current code and tests.


## Workstream 0 audit record

The repository baseline and contract audit is recorded in [Workstream 0 — Baseline and Contract Audit](25-workstream-0-baseline-contract-audit.md). It documents route/component/API/schema owners, existing test suites to retain, authorization/privacy contracts, and which findings are confirmed from source versus still requiring authenticated development-environment reproduction.

**CI policy:** Do not run CI for Workstream 0 or intermediate workstreams. Keep and extend relevant test files as needed, then run the complete required CI/test suite against the exact final Workstream 9 commit. Workstream 0 has not changed application code or schema and has not triggered CI.

**Current gate:** Workstream 0 is partially open: repository mapping is documented, but the environment-dependent browser reproductions and several server-handler/authorization traces must be completed before treating the baseline as fully reproduced.


## Workstream 0 source-trace update (2026-10-28)

The baseline audit now includes a supplemental source-to-handler trace in [Workstream 0 — Baseline and Contract Audit](25-workstream-0-baseline-contract-audit.md), committed as `cda59c12dff9eaad785201f734fe5d9fa70c6db9`. The trace confirms the payment-method API/service and admin configuration UI exist (with a discoverability problem), identifies inconsistent evidence handling between the dedicated payment page and embedded workspace form, confirms that the admin user-list API omits membership/organization/profile fields, and confirms that public job-interest inquiry creation does not enforce active membership.

**Gate remains open for a specific reason, not as a status label:** the required development-environment reproduction has not occurred. The membership-card error reference still needs request/log correlation, and route redirects, guide targets, actual deployed response payloads, and the members-only job-interest rule must be validated against the merged development commit. Do not start Workstream 1 or claim Workstream 0 complete until those evidence items are captured. CI remains deferred to Workstream 9; no application code or schema was changed.


## Workstream 1 implementation record (2026-10-28)

The guided membership application/payment source and additive schema changes are recorded in [Workstream 1 — Guided Membership Application and Payment](26-workstream-1-guided-membership-application-payment.md). Implementation includes a four-stage accessible application modal, eight-stage server-backed progress, visible required terms acknowledgement, application idempotency and payload conflict detection, one canonical payment submission route, configured payment-method enforcement, method-specific private evidence requirements, payment retry idempotency across status changes, applicant-safe review/payment status fields, and rejection-after-payment regression coverage.

**Verification policy remains in force:** no CI was run for this intermediate workstream. Do not treat runtime/browser/database rollback acceptance as passed. Run the full suite and disposable PostgreSQL migration/rollback checks only at final Workstream 9 acceptance against the exact final commit. Source implementation and tests are committed on `main`; the final acceptance gate is still required before production deployment or a claim of end-to-end verification.


**Terms-acceptance hardening:** the application/renewal API now requires `termsAcknowledged: true`; the database records `terms_acknowledged_at` and a SHA-256 digest bound to the saved fee/validity/eligibility fee snapshot. Renewal requests also pass through an idempotency key. The lifecycle regression test asserts missing acknowledgement is rejected and the timestamp/hash are persisted.


**Payment-method and retry contract hardening:** the manual-payment service now requires an enabled configured method, enforces that method's currency and evidence policy, and checks an existing idempotency record before current application state or upload-required validation. Replays return the original transaction only when account, application, amount, currency, method, channel, reference and sender-bank fields match; conflicting reuse is rejected. The hosted Chapa record also retains the explicit `membership_fee` purpose.


**Final Workstream 1 source sweep:** application and renewal creation now require a valid idempotency key as well as explicit terms acknowledgement; the service records the acknowledgement timestamp and a digest of the saved fee/validity/eligibility snapshot. Regression coverage includes replay after activation, payment replay after paid/rejected status transitions, changed-payload key conflict, missing configured method/evidence, and rejection-after-payment reconciliation. See the updated [Workstream 1 implementation record](26-workstream-1-guided-membership-application-payment.md). Full CI and disposable PostgreSQL rollback verification remain deliberately deferred to Workstream 9; no claim of runtime acceptance is made before those checks run.
