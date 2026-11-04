# Network-Plus Phase 0 — implementation alignment audit

**Repository:** `mpaproject1/MPA-Professionals-Network`  
**Branch:** `feat/workstream-3-progress-members-workspace`  
**PR:** #18 (keep draft)  
**Scope:** Increment 4/5/6 contract alignment; no production migration or deployment.

## 1. Phase 0 decision summary

The canonical Network-Plus model is the Increment 5 business/listing domain plus the Increment 6 connection-request domain. Do not create another business, provider, member, organization, listing, service-request or collaboration-request entity.

- Canonical person and organization identities remain `app_user` and `organization`.
- One Network-Plus business identity is `network_plus_business`; ownership and delegation are `network_plus_business_ownership` and `network_plus_business_access`.
- One Network-Plus commercial listing model is `network_plus_service_listing`, owned by a canonical business.
- One Network-Plus connection-request foundation is `network_plus_request`, with participant, event and support-grant tables.
- A collaboration workspace is an optional extension of an accepted connection request. It is not a second request or engagement record.
- Existing `service_listing` / `service_request`, mentorship, Jobs, talent inquiry and Serve-Community records remain separate legacy/domain workflows. They are not alternate Network-Plus listing/request stores and are not copied or dual-written.

## 2. Reconciled request-intent contract

Increment 4 defines seven request types while the original Increment 6 service, SQL constraint and UI exposed six. The omitted type was `business_opportunity`.

The canonical set is now exactly seven:

| Intent code | Meaning | Workspace policy |
|---|---|---|
| `service_request` | Request a defined professional service | Optional after acceptance |
| `supplier_inquiry` | Ask about supply, capacity or availability | Optional after acceptance |
| `referral` | Request or offer an introduction | Not supported; keep lightweight |
| `expertise_request` | Request specialist advice or review | Optional after acceptance |
| `partnership_proposal` | Propose a structured partnership | Optional after acceptance |
| `collaboration_request` | Propose a scoped collaboration | Optional after acceptance |
| `business_opportunity` | Express interest in a sponsored programme, grant or business-support opportunity | Not supported; qualification/selection remains outside a project workspace |

The intent is a typed reason for a connection request, not a separate listing type or application system. Job applications, mentorship applications, public opportunity intake and volunteer participation remain in their own domains.

A forward-only migration, `20261103120000_network_plus_phase0_contract_alignment.sql`, updates the database intent constraint. It does not rewrite request rows or backfill another entity.

## 3. Compact schema map

| Layer | Canonical tables | Purpose / boundary |
|---|---|---|
| Identity | `app_user`, `organization`, `organization_membership` | Existing identities and current organization authority |
| Business | `network_plus_business` | One business profile with verification, moderation and publication states |
| Ownership | `network_plus_business_ownership` | Explicit member/organization owner parties and accepted ownership |
| Delegation | `network_plus_business_access` | Business-scoped, capability-specific, expiring/revocable access |
| Business review | `network_plus_business_verification_case`, `network_plus_business_verification_evidence` | Independent review and private evidence references |
| Listing | `network_plus_service_listing` | Commercial/professional listing attached to one business |
| Listing history | `network_plus_service_listing_event` | Listing lifecycle audit history |
| Request | `network_plus_request` | Typed connection request, recipient, optional business/listing reference, details, terms, state and idempotency |
| Participants | `network_plus_request_participant` | Requester, recipient representatives and consented additional participants |
| Request history | `network_plus_request_event` | Append-only state/audit history and idempotency fingerprint |
| Support | `network_plus_request_support_grant` | Explicit request/user/case-scoped, expiring read-only support access |
| Optional collaboration | `network_plus_collaboration_workspace` | At most one workspace for an accepted eligible request |
| Workspace details | `network_plus_collaboration_milestone`, `network_plus_collaboration_event` | Participant-visible work updates only when the optional workspace is enabled |

The Increment 5 listing schema is the current baseline, not the complete future Network-Plus taxonomy. Increment 4's richer structured category, geography, capacity, audience, pricing and availability requirements remain Phase 1 product work; implement them by extending the canonical listing, not by adding another listing table.

## 4. Canonical state map

**Business verification:** `draft → submitted → under_review → verified | changes_requested | rejected`; verified businesses may later be suspended and revalidated under the review policy.

**Business moderation/publication:** business moderation and publication are separate from verification. A listing follows its own moderation/publication lifecycle (draft, pending review, published, changes requested, rejected, paused, suspended, archived). Publishing requires current owner authority, verified business state and approved moderation.

**Connection request:**
- `draft → submitted → under_review → clarification_requested → submitted`
- Recipient decision: `submitted/under_review → accepted | declined`
- Requester pre-acceptance action: `draft/submitted/under_review/clarification_requested → withdrawn`
- Accepted engagement: `accepted → in_progress → completed | disputed | closed`
- `declined`, `withdrawn` and `closed` are terminal; a completed request may be disputed or closed according to the service transition map.

Acceptance records recipient intent and does not create a workspace or assert a legal contract. A separate explicit opt-in enables a workspace for eligible accepted requests. The existing database trigger still enforces the accepted-request prerequisite. Referral and business-opportunity requests remain lightweight.

**Participant consent:** requester is recorded as accepted; recipient representatives are pending until the authorized recipient accepts the request; invited additional participants cannot view the request/workspace until they accept the invitation. Revoked participants lose access.

**Workspace:** `active | blocked | disputed | completed | closed`; workspace events are append-only. Workspace absence is a valid state for every accepted request.

## 5. Permission and access map

| Actor / capability | Allowed | Explicitly not implied |
|---|---|---|
| Network-Plus entrant | Current active member, or active owner/administrator/project-manager member of a verified organization | Entry does not grant mutation authority over a business, listing or request |
| Individual business owner | Manage the business when active accepted ownership and current membership/member capability are revalidated | Cannot verify/moderate own business |
| Organization owner/admin | Manage only businesses owned by that exact organization, while current membership and organization verification remain valid | Membership in another organization or a platform role grants nothing |
| Organization project manager | Only explicit business-scoped delegated capabilities, rechecking active organization membership | No blanket business authority from the project-manager role |
| Business delegate | Only the active assigned capability (e.g. `business.respond_requests`, `business.accept_terms`) | Respond permission does not grant authority to accept terms |
| Business verification reviewer | Independent verification decisions under `business_verification_reviewer` / `business.verify` | Cannot review a business they own or manage |
| Listing moderator | Independent listing moderation under `business_moderator` / `business.moderate` | Cannot moderate a business they own or manage |
| Requester | Create/edit own draft, submit, clarify/resubmit, withdraw and update own connection disposition | Cannot accept on behalf of the recipient |
| Recipient representative | Review, clarify or decline; accept only with current recipient/business authority | Acceptance does not disclose private contact fields or create a workspace |
| Additional participant | View request/workspace and contribute only after invitation acceptance | No request lifecycle authority |
| Network-Plus support | Read only after a system-admin grant scoped to one request, user and support case, with expiry, repeated reason/ticket and audit | No mutation, acceptance, invitation or workspace editing |

Contact details remain outside request/listing projections and require the separate explicit consent-controlled release workflow. Server-side domain functions recheck entry, participant and resource authority; UI role state is never the security boundary.

## 6. API map

- Business/listing discovery and management: `/api/v1/network-plus/businesses`, `/api/v1/network-plus/services`, plus the dedicated admin verification/moderation routes.
- Connection requests: `GET/POST /api/v1/network-plus/requests`, request detail, `/submit`, `/transitions`, participant invitation/response.
- Optional workspace: `POST /api/v1/network-plus/requests/:id/workspace` enables it after acceptance; `GET` reads it; milestone and event routes require an existing workspace.
- Support access is isolated under `/api/v1/admin/network-plus/requests/:id/support-access`.

The POST workspace route is an explicit opt-in operation; the accepted transition no longer inserts a workspace.

## 7. Regression plan

1. **Migration compatibility:** apply the full migration chain to the named disposable PostgreSQL database; assert the seven-value intent constraint, foreign keys, unique request/workspace constraints and accepted-only workspace trigger; roll back the compatibility transaction.
2. **Intent contract:** accept all seven intent values; reject unknown values; validate required `business_opportunity` opportunity type, eligibility and selection process; reject malformed optional deadline.
3. **Canonical business/listing:** create member-owned, organization-owned and joint businesses; reject unaccepted ownership, stale organization membership, undelegated project manager and owner self-review; assert one business/listing model and no writes to legacy `service_listing`.
4. **Request authorization:** verify member, organization, business-owner, delegate, recruiter, read-only and outsider boundaries; recheck current authority at decision time.
5. **Lifecycle/idempotency:** draft is private; submission notifies but does not accept; recipient acceptance is explicit; identical idempotency replay is safe; different payload reuse conflicts; invalid transitions fail.
6. **Optional workspace:** accepted request has no workspace by default; eligible accepted participant can create one; repeated opt-in returns the same workspace; referral/business-opportunity workspace attempts fail; unaccepted/outsider access fails; support cannot create or edit it.
7. **Privacy and audit:** request details reject contact fields; no contact data appears in list/detail responses; consent and support grants are scoped and audited; immutable event history remains append-only.
8. **Browser:** draft → submit → recipient decision; acceptance shows optional workspace action, not a workspace; opt-in opens it; mobile overflow, keyboard focus and accessible labels pass.
9. **Full gates:** backend unit/integration tests, disposable PostgreSQL, Biome, TypeScript, production build, Playwright and manual keyboard/screen-reader review.

## 8. Phase 0 exit status

The implementation now has one canonical Network-Plus business/listing foundation and one request foundation. The seven-intent mismatch is corrected with a forward-only constraint migration. Collaboration workspaces are optional and created only through an explicit post-acceptance action.

**Not asserted in this audit:** full Network-Plus Phase 1 taxonomy/listing UX, a production migration, a live deployment, or successful execution of CI/database/browser gates. Keep PR #18 draft until the required validation completes.


## Current PR Quality evidence update — 2026-11-04

The previous pending/no-run statement is superseded for automated PR Quality validation by [run 41772344170](https://github.com/mpaproject1/MPA-Professionals-Network/actions/runs/41772344170), run #1358, on exact commit `494b8c97b83029868dabc725839d3621995879fe`. The workflow completed successfully: Biome lint, TypeScript, Next.js production build plus the configured Chromium/browser and membership-card PDF acceptance, and disposable-PostgreSQL migration compatibility plus the complete backend test-file suite all passed. See [the consolidated validation record](78-pr-quality-run-41772344170-validation-record.md).

This corrects only the CI evidence status. It does not close any separately listed manual/device/browser journey, live deployment, provider-delivery, scheduled-operation, data-governance, encryption-key rotation, or other product acceptance gap that this run did not execute.
