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
- decline the request; or
- ask one structured clarification at a time.

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

Contact values are encrypted at application level using AES-256-GCM. Configure `NETWORK_PLUS_CONTACT_ENCRYPTION_KEY` with a unique random secret of at least 32 characters in every environment before enabling contact sharing. Keep the secret stable and securely backed up: changing or losing it makes previously stored encrypted values unreadable. Never commit a real key to the repository.

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

Events include request submission/decision, clarification requested/answered, contact consent/release, and meeting proposal/counterproposal/confirmation/decline. Notification bodies contain no contact values. Request content, clarification, meeting details and contact-consent state are visible only to request participants; the existing case-scoped support access remains audited and does not grant contact-value release.

## 7. API surface

All routes require authenticated Network-Plus access and participant-level authorization.

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/v1/network-plus/requests` | Create an idempotent private draft |
| POST | `/api/v1/network-plus/requests/:id/submit` | Submit to recipient |
| POST | `/api/v1/network-plus/requests/:id/transitions` | Accept, decline, withdraw and eligible legacy lifecycle transitions |
| POST | `/api/v1/network-plus/requests/:id/clarifications` | Recipient asks structured clarification |
| POST | `/api/v1/network-plus/requests/:id/clarifications/:clarificationId/respond` | Requester answers |
| POST | `/api/v1/network-plus/requests/:id/contact-consent` | Accept, decline or revoke one contact field |
| GET | `/api/v1/network-plus/requests/:id/contact-handoff` | Read consent status and mutually released fields |
| POST | `/api/v1/network-plus/requests/:id/meetings` | Propose a meeting |
| POST | `/api/v1/network-plus/requests/:id/meetings/:meetingId/respond` | Accept, counter or decline |

The existing request detail endpoint returns participant-visible clarification and meeting history. It never includes decrypted contact values; those are returned only by the dedicated consent handoff endpoint after bilateral approval.

## 8. User experience

- Opportunity detail cards provide icon-led “I’m interested”, “Ask a question”, “Request quotation” (product/service profiles) and “Request meeting” actions.
- Each action opens the existing request workspace with the listing and business context preselected.
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
5. Verify recipient accept/decline and structured clarification; reject duplicate open clarifications and requester/recipient role violations.
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
