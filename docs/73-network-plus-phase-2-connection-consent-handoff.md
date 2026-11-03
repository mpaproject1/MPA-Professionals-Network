# Network-Plus Phase 2 — Connection requests and consent handoff

**Repository:** `mpaproject1/MPA-Professionals-Network`  
**Branch:** `feat/workstream-3-progress-members-workspace`  
**PR:** #18 (keep draft)  
**Migration:** `20261103140000_network_plus_phase2_connection_handoff.sql`  
**Foundation:** the canonical `network_plus_request` and `network_plus_request_participant` records from Increment 6 / Phase 0.

## 1. Product boundary

Network-Plus helps two parties make a private, intentional professional connection. It does not become a messaging product, order system, checkout, payment processor, contract manager, CRM or calendar/attendance system.

- A request is not an agreement. Recipient acceptance is explicit.
- The platform does not reveal contact information just because a request was sent or accepted.
- Each contact field is released only after both sides explicitly consent to that same field.
- A meeting is a one-time proposal/counterproposal/confirmation handoff.
- Negotiation, contracting, payments, delivery and ongoing coordination happen outside Network-Plus.
- The accepted-engagement collaboration workspace remains optional and is still available only for its existing eligible intent set.

## 2. One canonical request foundation

No second request table or new identity model is introduced.

Existing request intents remain compatible:
- `service_request`
- `supplier_inquiry`
- `referral`
- `expertise_request`
- `partnership_proposal`
- `collaboration_request`
- `business_opportunity`

Four lightweight connection intents are added:
- `interest` — “I’m interested”
- `question` — ask one focused question
- `quote_request` — ask for a quotation or pricing discussion
- `meeting_request` — request a first meeting

The four lightweight intents do not qualify for the collaboration workspace or engagement milestone lifecycle. They can be accepted or declined, but do not become tracked service delivery. The existing request state machine remains the sole lifecycle authority.

Product profiles remain discovery-only. They allow `supplier_inquiry`, `referral`, `interest`, `question`, `quote_request` and `meeting_request`; they do not create service orders, payments, delivery records, inventory or transactions. Paused/unavailable listings continue to reject new requests.

## 3. Recipient response and clarification

The recipient can:
- accept the request;
- decline the request;
- answer a `question` intent once with a private response; or
- ask one structured clarification at a time.

The one-time question answer is stored on the canonical request record, visible only to the requester and recipient representatives, and does not create a message thread or automatically accept the request.

Clarification topics are controlled: scope, budget, timeline, quantity, location, availability, eligibility or other. The requester answers the open clarification and the request returns to the recipient's submitted/review queue. Clarifications are attached to the canonical request and are not an open-ended chat thread.

A status-only transition to `clarification_requested` is no longer permitted through the generic transition API; use the structured clarification endpoint so every clarification has a private record and answer.

## 4. Bilateral field-specific contact consent

The additive `network_plus_request_contact_consent` table stores one row per request, accepted recipient representative and field. Supported fields are email, phone, WhatsApp, website and business location.

Each row records:
- requester consent status and consent timestamp;
- recipient-representative consent status and consent timestamp;
- encrypted requester and recipient values; and
- the request/representative pairing.

Consent is independently granted, declined or revoked by each side. A contact value is returned to the other participant only when both statuses for that field are `accepted`. Revocation clears that side's encrypted value and immediately prevents further release. No contact values are included in ordinary request list/detail payloads or support-access payloads.

Contact values are encrypted at application level using AES-256-GCM with a random 96-bit IV, authenticated encryption tag, versioned `v1` envelope and additional authenticated data bound to the request ID, recipient user ID and contact field. Ciphertext copied to another request, recipient or field will fail authentication.

Configure `NETWORK_PLUS_CONTACT_ENCRYPTION_KEY` with a unique random secret of at least 32 characters in every environment before enabling contact sharing. Generate a high-entropy value (for example, `openssl rand -base64 48`), store it only in the environment's secret manager, and keep a separately access-controlled encrypted backup. Never commit a real key, place it in database rows, or include it in logs.

**Rotation procedure:** use a maintenance window and disable contact-sharing writes while rotating. Back up the database and old key first. Set `DATABASE_URL`, `NETWORK_PLUS_CONTACT_ENCRYPTION_OLD_KEY`, `NETWORK_PLUS_CONTACT_ENCRYPTION_NEW_KEY`, and `NETWORK_PLUS_CONTACT_KEY_ROTATION_CONFIRM=YES`, then run `npm run network-plus:rotate-contact-key`. For a production-like database, the separate `NETWORK_PLUS_CONTACT_KEY_ROTATION_ALLOW_PRODUCTION=YES` confirmation is also required. The utility locks the consent table, reads both the earlier three-part AES-GCM envelope (legacy, without AAD) and the current versioned `v1` envelope, and re-encrypts every non-null value into the record-bound `v1` format. It verifies each new ciphertext before commit and rolls back the complete transaction on any failure. The application temporarily supports read-only decryption of legacy envelopes so previously stored contact values remain accessible during the planned rotation; all new writes use only the authenticated `v1` format. After a successful rotation, set `NETWORK_PLUS_CONTACT_ENCRYPTION_KEY` to the new secret before re-enabling contact sharing. Retain the old key and database backup until post-rotation verification and recovery checks are complete; then retire the old key according to the organization's secret-retention policy. Do not rotate by merely replacing the runtime key.

## 5. Meeting handoff

The additive `network_plus_request_meeting` table records a single active meeting proposal per request, with retained history for resolved proposals.

Lifecycle:
1. Either accepted primary participant proposes a place type, date/time, IANA timezone and duration.
2. The other participant accepts, declines or sends one counterproposal.
3. The original proposer accepts or declines the counterproposal.
4. On acceptance, the record stores the confirmed place/time/duration.

Supported place types: business office, coffee/public place, online or other agreed place. The service validates future dates, timezone and supported durations. Contact details and meeting links are prohibited in place details. Network-Plus does not issue calendar invitations, track attendance or host the meeting.

## 6. Notifications and privacy

All lifecycle notifications use the existing in-app notification and Web Push delivery infrastructure. The new `network_plus` category is available in notification filters and user preferences. Notification actions deep-link to `/network-plus/requests`.

Events include request submission/decision, clarification requested/answered, contact consent/release, and meeting proposal/counterproposal/confirmation/decline. Notification bodies contain no contact values. Request content remains participant-scoped. Clarification and meeting details are visible only to the requester and the accepted recipient representative; additional workspace invitees do not see these handoff details. Contact values are released only to the two participants who consented to that field. Existing case-scoped support access is audited and does not grant contact-value release.

## 7. API surface

All routes require authenticated Network-Plus access and participant-level authorization.

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/v1/network-plus/requests` | Create an idempotent private draft |
| POST | `/api/v1/network-plus/requests/:id/submit` | Submit to recipient |
| POST | `/api/v1/network-plus/requests/:id/transitions` | Accept, decline, withdraw and eligible legacy lifecycle transitions |
| POST | `/api/v1/network-plus/requests/:id/answer` | Recipient answers a question intent once |
| POST | `/api/v1/network-plus/requests/:id/clarifications` | Recipient asks structured clarification |
| POST | `/api/v1/network-plus/requests/:id/clarifications/:clarificationId/respond` | Requester answers |
| POST | `/api/v1/network-plus/requests/:id/contact-consent` | Accept, decline or revoke one contact field |
| GET | `/api/v1/network-plus/requests/:id/contact-handoff` | Read consent status and mutually released fields |
| POST | `/api/v1/network-plus/requests/:id/meetings` | Propose a meeting |
| POST | `/api/v1/network-plus/requests/:id/meetings/:meetingId/respond` | Accept, counter or decline |

The existing request detail endpoint returns participant-visible clarification and meeting history. It never includes decrypted contact values; those are returned only by the dedicated consent handoff endpoint after bilateral approval.

## 8. User experience

- Opportunity detail cards provide icon-led “I’m interested”, “Ask a question”, “Request quotation” (product/service profiles) and “Request meeting” actions.
- Each action opens a four-step guided request wizard: choose action, describe the request, choose the recipient, review and save a private draft. Listing and business context are preselected.
- The recipient sees accept, decline and structured clarification actions.
- The contact panel shows per-field consent state, not the other party's contact value before mutual approval.
- The meeting panel shows a proposal, counterproposal and confirmed handoff.
- The existing optional collaboration workspace is not shown for the four lightweight intents.
- The request workspace uses the existing Network-Plus app shell and Lucide icon language.

## 9. Regression plan

1. Apply the Phase 2 migration after Phase 0 and Phase 1 on a disposable PostgreSQL database; verify both forward execution and rollback.
2. Verify all eleven supported intents and legacy request rows remain compatible.
3. Create, submit and accept each lightweight intent; confirm no collaboration workspace is created or offered.
4. Verify product-profile requests allow only discovery connection intents and reject service-order/commerce intents.
5. Verify recipient accept/decline, one-time question answers and structured clarification; reject duplicate answers, duplicate open clarifications and requester/recipient role violations.
6. Verify each contact field independently: requester consent alone does not reveal recipient data; recipient consent completes release; declined/revoked consent prevents release; outsiders and support staff cannot read values.
7. Verify AES-GCM ciphertext is not plaintext, wrong/missing keys fail safely, and contact values never appear in list/detail/notification payloads.
8. Verify meeting proposal, responder acceptance, one counterproposal, proposer confirmation, decline, duplicate active proposal and invalid date/time/timezone/duration rejection.
9. Verify meeting place text rejects contact details and external meeting links.
10. Verify notifications are categorized as `network_plus`, respect existing in-app/push preferences and link to the request workspace.
11. Run Playwright for listing-scoped actions, request creation, recipient response, consent controls, meeting controls, mobile layout and keyboard accessibility.
12. Run Biome, TypeScript, production build, backend unit/integration suites, PostgreSQL migration compatibility and full Playwright gates.

## 10. Verification status

The Phase 2 schema, service methods, authenticated API routes, opportunity actions, request workspace controls, notification category and regression coverage are source changes on PR #18.

This document does **not** claim that the migration has executed against disposable PostgreSQL, that backend/Playwright suites or CI have passed, or that the encryption key has been configured in a deployed environment. Keep PR #18 draft until those gates are verified.


## 11. Implementation audit addendum — 2026-11-03

**Source snapshot audited:** PR #18 head `b8b92cbda9b57680e3b2481314561a2c995cccf7` (before this documentation update). The PR remains open and draft.

Source-level corrections now present:

- Fixed the missing comma in the migration compatibility runner's required migration list.
- Unified current recipient-authority revalidation for clarification, question answers, contact handoff, meeting handoff and request-detail action permissions, including organization representatives.
- Added a database check requiring the one-time question response, actor and timestamp to be recorded together, and only for the `question` intent.
- Extended the migration compatibility preflight to inspect Phase 2 request-response, consent, meeting and clarification columns and the consent primary-key index.
- Extended the rollback rehearsal to snapshot and compare the exact Phase 2 table, column, constraint and index state after rollback.
- Bound AES-GCM ciphertext to its request, recipient and field context; introduced an authenticated `v1` ciphertext envelope and safe authentication-failure handling.
- Added a transactional contact-key rotation utility and the `network-plus:rotate-contact-key` package command, with explicit confirmation, table locking, new-key verification and rollback.
- Made local meeting-time conversion reject both DST gaps and repeated-hour ambiguity. The selected policy is to ask the user to choose a different local time rather than silently select one of two possible instants.
- Added a browser regression scenario for both DST cases and included `e2e/network-plus-requests.spec.js` in the PR Quality browser acceptance list.
- Added source regression assertions for recipient authority, schema/rollback coverage, context-bound encryption and key rotation.

**Evidence boundary:** These are inspected source changes and newly authored regression tests. The tests have not yet been executed in this continuation. No disposable PostgreSQL migration/rollback run, backend suite, Playwright run, Biome check, TypeScript check, production build or successful GitHub Actions result is claimed here. The rotation utility has not been run against any database. The encryption key has not been verified in a deployed environment.

**Phase 2 exit status: NOT CLOSED.** Runtime verification remains mandatory. Keep PR #18 draft. Do not begin Phase 3 until the Phase 2 migration, authorization/privacy, encryption, notification, DST, backend, browser, lint, typecheck and production-build gates have actual recorded results.


## 12. Follow-up source audit — 2026-11-03

**Source snapshot:** `c2c6af71ef39d18f3804876cc6c4f4141b65948c` (the branch head before this documentation update).

Additional defects found and corrected after the initial audit:

- The question-answer path still contained the older business-only permission check; it now calls the shared current-recipient-authority check. Business permissions, verified organization owner/administrator status and active individual membership are rechecked at answer time.
- Request-detail privacy previously trusted a stale recipient participant row. Former recipient representatives could continue to see the one-time answer and private handoff history after their authority was revoked. The detail projection now requires current recipient authority; clarification and meeting history is restricted to the requester and current recipient representative, and meeting rows are not returned to additional participants or support readers.
- The new response-integrity migration block was malformed as a single-dollar delimiter. It now uses a valid named PostgreSQL dollar-quote delimiter (`$phase2$`) and enforces the all-or-none response/actor/timestamp invariant for question intents.
- The migration compatibility checker now inventories Phase 2 columns and foreign-key targets, verifies contact-consent/meeting/clarification checks and indexes, and snapshots/restores the exact Phase 2 table, column, constraint and index baseline during its rollback-only rehearsal.
- Contact decryption and the rotation utility now support the earlier three-part AES-GCM envelope as a read/rotation-only legacy format. Rotation rewrites it to the record-bound `v1` AAD envelope; new writes remain `v1` only. The integration test exercises legacy reads, ciphertext-at-rest, cross-field ciphertext substitution failure, and notification payloads without contact values.
- Recipient-answer integration coverage now includes revoked business response authority and confirms that support readers do not receive the private response.
- Meeting-time ambiguity is now rejected in both the browser conversion and the API validation boundary. The backend derives the selected local wall time and rejects repeated-hour instants in IANA timezones, preventing direct API callers from bypassing the browser check.
- The request integration test includes a fall-back DST repeated-hour API case. Browser acceptance includes both a nonexistent spring-forward time and an ambiguous fall-back time.

### Actual validation evidence available (historical, not current-head evidence)

GitHub Actions run [`41405549658`](https://github.com/mpaproject1/MPA-Professionals-Network/actions/runs/41405549658) checked out commit `491c554ae1e589d8358f54f2d1789e96f646b97e` on 2026-11-02, before the Phase 2 corrections listed above:

- Biome: passed.
- TypeScript: passed.
- Next.js production build: passed.
- Disposable PostgreSQL migration compatibility rehearsal: passed for the migration set present at that older commit; it did not include the new Phase 2 migration.
- Backend suite: 519 passed, 0 failed, 3 skipped (522 total).
- Browser acceptance: 40 passed, 2 failed, 2 skipped. Both failures were in `e2e/workspace-app-ux.spec.js` on `/members`. The saved Playwright trace shows a client-side `TypeError: Cannot read properties of undefined (reading 'map')` in the Community Impact workspace panel: the test's generic API fixture returned `{}` for `/api/v1/me/community-impact/workspace`, while the panel's response contract requires array fields such as `categoryBreakdown`, `dimensions`, `claims`, `items`, `detectedContributions` and `reminders`. The resulting app error boundary prevented `#progress-title` from rendering. The fixture has now been corrected to return the complete empty-state shape in commit `496914dd8a84dcab67f330514709ddf5134770d4`; this correction is not yet rerun and is not yet a passing result.

**Current-head evidence:** the latest source commit before this documentation correction is `496914dd8a84dcab67f330514709ddf5134770d4`. No GitHub Actions run or commit status has been returned for the Phase 2 source batch or the fixture correction. The earlier run is historical baseline evidence only and must not be represented as validation of the new migration, encryption compatibility, authority/privacy fixes, DST tests or corrected workspace fixture. The current source changes have not yet been executed against disposable PostgreSQL or in the backend/browser suites. The contact-key rotation utility has not been run. No deployed encryption key has been inspected.

**Phase 2 exit status: NOT CLOSED.** Do not start Phase 3 until a run against the current source head proves the Phase 2 migration forward path and rollback, current authorization/privacy, legacy and `v1` encryption behavior, notifications, DST handling, backend suite, Playwright suite, Biome, TypeScript and production build. The current draft PR remains open; no merge or deployment is authorized.
