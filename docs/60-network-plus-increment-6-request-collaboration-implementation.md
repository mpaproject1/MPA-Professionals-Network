# Network-Plus Increment 6 — Request and Collaboration Lifecycle

**Target branch:** `feat/workstream-3-progress-members-workspace`  
**PR:** #18 (keep draft; do not merge)  
**Migration:** `20261031120000_network_plus_request_collaboration.sql`  
**Status:** Source implementation committed; disposable-database, automated browser and accessibility exit gates remain unverified.

## 1. Purpose and domain boundary

Increment 6 adds a private request-and-collaboration lifecycle to Network-Plus. It does not replace or migrate the existing Serve-Community `service_request`, mentorship requests, Jobs applications, talent inquiries or legacy service agreements. These remain separate domains with their existing permissions and history.

A request is an expression of intent. **Draft and submitted requests are not agreements.** Only the intended recipient (or a currently authorized representative of the addressed organization) can record acceptance. The accepted decision and its terms are retained in the request history. A collaboration workspace is created in the same database transaction as acceptance, only for engagement-capable intents.

## 2. Typed intents

| Intent | Meaning | Workspace after explicit acceptance |
|---|---|---|
| `service_request` | Request a defined professional service from a business/provider | Yes |
| `supplier_inquiry` | Ask a supplier about capacity, supply or availability | Yes |
| `referral` | Ask for or offer a professional introduction | No by default; an introduction is not automatically a project |
| `expertise_request` | Request specialist advice, review or expertise | Yes |
| `partnership_proposal` | Propose a structured partnership | Yes |
| `collaboration_request` | Propose a defined collaboration | Yes |

The service stores these values in a constrained `intent` column. It does not infer an intent from free-text descriptions.

### Required terms

- Partnership/collaboration proposals capture purpose, scope, contributions, responsibilities, outputs, timeline and authorized-representative descriptions.
- Service requests capture scope, one or more deliverables, a pricing/quotation proposal and schedule (including “to be agreed”).
- Optional completion-evidence references are kept private in the request/workspace lifecycle. No private contact information should be placed in request details; contact fields are rejected by the service validator.
- Recipient acceptance is a state decision over the submitted request terms. It is not represented as a legally reviewed contract or legal advice.

## 3. Status transition contract

| From | To | Authorized actor | Rule |
|---|---|---|---|
| draft | submitted | Requester | Sends the request; no agreement/workspace |
| draft | withdrawn | Requester | Withdraws own draft |
| submitted | under_review | Recipient representative | Acknowledges review |
| submitted / under_review | clarification_requested | Recipient representative | Must provide a reason |
| clarification_requested | submitted | Requester | Resubmits clarified request |
| submitted / under_review | accepted | Intended recipient representative | Explicit acceptance; creates eligible workspace atomically |
| submitted / under_review / clarification_requested | declined | Recipient representative | Must provide a reason |
| draft / submitted / under_review / clarification_requested | withdrawn | Requester | Withdraws before acceptance |
| accepted | in_progress | Requester or recipient | Only for engagement-capable intents |
| accepted / in_progress / disputed | completed | Requester or recipient | Requires completion evidence or a documented not-applicable reason |
| accepted / in_progress / completed | disputed | Requester or recipient | Must provide a reason |
| accepted / in_progress / disputed / completed | closed | Requester or recipient | Closes the engagement |
| declined / withdrawn / closed | — | — | Terminal |

Invalid transitions are rejected server-side. The browser never decides whether a transition is allowed. A recipient organization decision is rechecked against its current active owner/administrator membership at decision time. Direct member recipients must retain active membership.

**Workspace rule:** the service inserts a workspace only while processing the explicit `accepted` transition. A database trigger independently rejects workspace inserts unless the referenced request has an accepted timestamp and is in an accepted/active/disputed/completed state. Referral acceptance does not create a project workspace by default.

## 4. Role and visibility matrix

| Capability | Requester | Intended recipient / org representative | Additional participant | Network-Plus support |
|---|---:|---:|---:|---:|
| Create and edit a draft | Yes | No | No | No |
| Submit / withdraw own request | Yes | No | No | No |
| Review / request clarification / accept / decline | No | Yes | No | No |
| Resubmit clarification | Yes | No | No | No |
| Invite an additional participant | Accepted participant only | Accepted participant only | No | No |
| View request and history | Yes | Yes | Only after invitation consent | Case-scoped read-only |
| View workspace | Yes | Yes, after acceptance | Only after explicit invitation acceptance | Case-scoped read-only |
| Update milestones / add workspace updates | Yes | Yes | Yes, after consent | No |
| Change request lifecycle | Participant rules above | Participant rules above | No lifecycle authority | No |
| Read private contact details | Not included in response | Not included in response | Not included in response | Not included in response |

Participant visibility is enforced by participant rows and consent status. An unrelated eligible member receives the same not-found response for a request they cannot access. Workspace reads require an accepted participant row. Organization membership is resource-scoped; a platform role alone does not make a user a participant.

### Support policy

The `network_plus_support` role is registered as privileged and must be assigned through the existing system-administrator role-governance workflow. `system_admin` is also permitted. Support access is read-only and requires both a support case reference and an access reason on each list/detail request. Each support list/detail read writes an audit entry tied to the request. Support cannot accept, decline, withdraw, edit terms, invite participants or update a collaboration workspace. Moderators and business verification reviewers do not receive request access by virtue of their moderation role.

## 5. Schema and integrity

The additive migration creates:

- `network_plus_request` — intent, state, requester/recipient, optional business/listing reference, summary, private details, terms, acceptance/completion timestamps, version and idempotency fingerprint.
- `network_plus_request_participant` — participant role and explicit consent state.
- `network_plus_request_event` — append-only transition/audit history, actor, reason, trace ID and idempotency fingerprint.
- `network_plus_collaboration_workspace` — one workspace per accepted engagement, purpose/scope/timeline and lifecycle.
- `network_plus_collaboration_milestone` — milestone owner, due date, state and completion evidence metadata.
- `network_plus_collaboration_event` — participant updates, blockers, decisions and outcomes.

Foreign keys use canonical `app_user`, `organization`, Increment 5 business and listing records. Partial unique indexes protect request creation, transition retries, milestone creation and collaboration-event retries. A unique request-to-workspace constraint prevents duplicate workspaces. No existing request or service data is copied, transformed, deleted or backfilled.

## 6. API surface

All routes are authenticated by the existing API dispatcher; domain functions recheck access and participant/resource scope.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/v1/network-plus/requests` | Participant request index; supports status/intent filters |
| POST | `/api/v1/network-plus/requests` | Create a private draft; requires `X-Idempotency-Key` |
| GET | `/api/v1/network-plus/requests/:id` | Participant detail/history; support reads require reason and ticket query values |
| POST | `/api/v1/network-plus/requests/:id/submit` | Submit draft; requires idempotency key |
| POST | `/api/v1/network-plus/requests/:id/transitions` | Request state transition; requires idempotency key |
| POST | `/api/v1/network-plus/requests/:id/participants` | Invite an eligible additional participant after acceptance |
| POST | `/api/v1/network-plus/requests/:id/participants/respond` | Invited participant accepts/declines |
| GET | `/api/v1/network-plus/requests/:id/workspace` | Accepted-participant workspace read |
| POST | `/api/v1/network-plus/requests/:id/workspace/milestones` | Create milestone; requires idempotency key |
| PATCH | `/api/v1/network-plus/requests/:id/workspace/milestones/:milestoneId` | Update milestone state/owner/due date |
| POST | `/api/v1/network-plus/requests/:id/workspace/events` | Add update/blocker/decision/outcome; requires idempotency key |

Creation, list/detail, submission, transition and participant-invite operations use persistent rate limits. Request creation and state transitions use advisory locks plus persisted fingerprints so a repeated key with identical content returns the existing result; reuse with different content returns a conflict. Milestone/event creation follows the same safe-retry contract.

## 7. Notifications and audit

- Submission notifies recipient representatives; acceptance/decline/clarification/withdrawal and other transitions notify the other participants.
- Additional participant invitation is delivered as an in-app notification; the invitation does not grant workspace access until the participant explicitly accepts.
- Request transitions write both request-specific history and the platform audit log in the transaction.
- Milestone and collaboration updates write workspace events and platform audit records.
- Support list/detail reads are audited with the support reason and case reference.
- Notifications are informational; the database request state remains authoritative.

## 8. Browser journey

The guarded route `/network-plus/requests` provides:
1. Typed request creation and draft save.
2. A separate submit action with a clear “not an agreement” message.
3. Recipient review, clarification, explicit acceptance or decline.
4. Requester resubmission or withdrawal.
5. Accepted workspace with milestone creation/status updates and progress/blocker/decision/outcome entries.
6. Completion evidence capture and dispute/close actions.

The Playwright suite `e2e/network-plus-requests.spec.js` covers the draft-not-submitted journey, explicit recipient acceptance before workspace display, and narrow-mobile overflow. These are authored tests; they have not yet been executed in this turn.

## 9. Validation and exit gate

Added:
- `test/platform/network-plus-request-collaboration.test.js` — source-contract assertions for schema, routes, lifecycle, privacy, support policy, browser and migration wiring.
- `test/p0/network-plus-request-collaboration.integration.test.js` — disposable PostgreSQL integration journey covering member verification, draft/submission, pre-acceptance workspace denial, recipient acceptance, idempotent decision replay/conflict, participant-only workspace reads, milestones, updates and notification events. It skips when `DATABASE_URL` is not configured.
- `e2e/network-plus-requests.spec.js` — browser journey tests.
- `scripts/check-new-migration-compatibility.js` — includes the Increment 6 migration, columns, unique indexes, status checks, workspace acceptance trigger and support role.

**Not yet passed/evidenced:**
- [ ] Run the full migration chain against the explicitly disposable PostgreSQL database and confirm transaction rollback.
- [ ] Execute the integration test above and verify all notification/privacy/idempotency assertions.
- [ ] Execute Playwright on desktop/tablet/mobile; manually review keyboard focus, screen-reader labels and WCAG AA contrast.
- [ ] Run backend tests, Biome, TypeScript and Next.js production build.
- [ ] Review business-to-recipient routing and final governance of authorized representative authority before enabling real business request intake.
- [ ] Review legal terms/quotation and evidence-retention policy before treating any accepted request as a legal agreement.

No production migration, deployment, PR merge or main-branch change is part of this increment. Keep PR #18 draft until the exit gate passes.
