# Serve-Community Impact Model and Data Contract

**Gate:** G1 — define the impact model and data contract  
**Target branch:** `feat/serve-community-impact-workflows`  
**Parent:** PR #5, `ux/p0-navigation-and-org-privacy`  
**Status:** Contract defined; implementation/migration work is deliberately deferred to the next gate after disposable-database compatibility is available.

## 1. Governing principles

Serve-Community is an outcome-oriented community service network, not a conventional storefront. A listing may offer fully pro-bono service, a community-discounted rate, or a capacity grant. A listing has no expiry by default. Its owner may explicitly mark it fulfilled or archive it. A single completed engagement does not fulfil a continuing program automatically.

These are distinct facts and must never be collapsed into one count or status:

1. Interest: someone signals that they may participate.
2. Pledge: a person or organization records a concrete offer of support/capacity.
3. Service request: a requester asks for a defined service.
4. Accepted commitment: provider accepts and requester confirms the agreed scope/terms.
5. Active delivery: an accepted engagement has actually started.
6. Outcome submitted: provider submits delivery evidence and a result claim.
7. Outcome confirmed: requester accepts the outcome, or a specifically authorized resolution process records an outcome with evidence.
8. Listing fulfilled: the listing owner explicitly closes the program as fulfilled under the program's declared fulfilment rule.

A notification, email queued/sent, interest count, pledge, provider completion claim, or payment submission is not proof of a delivered outcome.

## 2. Record model and source-of-truth mapping

| Record | Authoritative data source | Required meaning |
|---|---|---|
| Service listing | Existing `service_listing` | Offer/program, provider identity, optional organization, scope, category, delivery mode, visibility, pricing, creation/update timestamps and moderation fields. Existing idempotency hash/fingerprint remain mandatory for create retries. |
| Listing moderation and lifecycle history | Existing listing moderation fields plus platform audit records; current listing status is retained for compatibility during transition | Record actor, timestamp, old/new state, reason, request/correlation ID and moderation decision. No unaudited status mutation. |
| Individual/organization interest | **Schema gap:** no dedicated service-listing interest record was found in the reviewed service model | A distinct, withdrawable expression of interest; organization interest records both the organization represented and the authorized user who acted. Interest never creates a service agreement. |
| Formal pledge/offer of support | **Schema gap:** no dedicated pledge record was found in the reviewed service model | Concrete offered capacity/resource, pledge author, optional organization, quantity/unit or scope, conditions, status and timestamps. A pledge is not a service request or accepted agreement. |
| Service request | Existing `service_request` | Requester/provider/listing links, requested scope, message, proposed/agreed amount/currency and timing fields, status, completion and outcome fields. Preserve idempotency hash/fingerprint and duplicate-request protections. |
| Request status history | Existing `service_request_event` plus platform audit | Actor, old/new status, note/reason and event timestamp. Append history; do not silently rewrite earlier decisions. |
| Provider acceptance and requester agreement | Existing `service_request` status/acceptance fields and event history; **agreement terms need a clearly persisted acceptance record or explicit agreement fields if current fields cannot prove both parties accepted the same version** | Provider acceptance alone is not a mutually agreed engagement. Scope/terms version, provider acceptance and requester agreement must be explicit before delivery begins. |
| Agreed engagement | Existing `service_request` once both parties have accepted the same terms | One request/engagement with agreed parties, scope, terms, dates, status and audit history. It must not be inferred from interest or a pledge. |
| Delivery and milestones | Existing `service_request_milestone` and delivery records used by the existing service methods | Evidence-backed progress. Milestones have independent statuses and reviews. Keep requester review separate from provider submission. |
| Outcome submission and confirmation | Existing `service_request.provider_completed_at`, `requester_accepted_at`, `outcome_summary`, completion timestamps, delivery evidence and status events | Provider submission and requester acceptance are separate events. Paid services additionally require finance-verified settlement before requester completion acceptance. Pro-bono services must not require a payment record. |
| Feedback | Existing `submitServiceFeedback` backend method and its persisted feedback storage | Participant feedback after an eligible engagement; participant-only visibility by default. Feedback is not a substitute for delivery evidence or outcome confirmation. |
| Listing announcement | **Schema gap:** no dedicated listing announcement record was found in the reviewed service model | Structured announcement tied to a listing and author, audience, moderation/publication status, body, timestamps and audit history. No direct/private-message channel. |
| Official notification/email | Existing notification and workflow-email infrastructure | Delivery state must accurately distinguish queued, sent, failed, and confirmed delivery when provider evidence exists. Never label sent as read. |

### Migration discipline

The two existing service idempotency migrations remain unchanged:

- `20261023103000_service_request_idempotency.sql`
- `20261023104000_service_listing_idempotency.sql`

Genuine schema gaps are the dedicated interest, pledge and announcement records, and an unambiguous persisted two-party agreement/terms version if the existing schema cannot represent it. Do not add duplicate tables for requests, milestones, deliveries, outcomes or feedback where the existing records already provide the required evidence.

**No migration is added in G1.** The existing base DDL/constraints and a disposable database schema have not yet been inspected sufficiently to safely determine the listing status constraint, exact foreign-key definitions, or whether an existing table already serves the missing records. An additive migration must be designed only after those are verified and must be exercised through the repository's migration compatibility checks on a disposable test database. No production database is to be used.

## 3. Canonical listing lifecycle

The canonical lifecycle is separate from moderation decisions. Implementation must either use a new canonical lifecycle field or prove that the existing status column and its database constraints can represent the contract. Do not force new states into an unknown database constraint.

| Canonical state | Meaning | Allowed next states | Authorized actor |
|---|---|---|---|
| `draft` | Private work in progress; not discoverable and accepts no interest/pledge/request | `pending_review`; remain `draft`; archive only under owner policy | Listing owner or authorized organization manager |
| `pending_review` | Submitted for moderation; not publicly discoverable and accepts no new commitments | `active` after approval; `draft` on return for changes; `rejected` with reason | Authorized moderator/reviewer decides; owner may withdraw submission to draft if policy allows |
| `active` | Approved and discoverable within listing visibility and provider eligibility rules | `paused`, `fulfilled`, `archived`, `suspended`; edit that changes material public terms returns to review | Owner/authorized organization manager for pause/fulfil/archive; authorized moderator for suspension |
| `paused` | Owner-initiated temporary pause; no new commitments while paused | `active` after owner resumes; `archived` | Listing owner or authorized organization manager; audit the action |
| `fulfilled` | Owner explicitly declares the program fulfilled; read-only historical listing | `active` only through the explicit reopening policy below; `archived` | Owner/authorized organization manager; audited reason required |
| `archived` | Intentionally retained as inactive history; no new commitments | Terminal by default; reopening requires explicit authorized policy and audit | Owner/authorized organization manager plus moderator approval when reopening public discovery |
| `suspended` | Temporarily unavailable due to safety, policy, verification or operational concern | `active` after authorized clearance; `rejected` or `archived` after reasoned decision | Authorized moderator/reviewer; owner cannot self-clear a moderation suspension |
| `rejected` | Moderation rejected publication; not discoverable and accepts no commitments | Terminal for this listing; owner may create a new listing or request review only if an explicit review/appeal workflow is implemented | Authorized moderator/reviewer |

### Moderation requirements

- Moderation state is an explicit decision, not inferred from a public visibility flag.
- Approval is required before `active`; verified organization status and existing personal professional/member eligibility checks remain enforced.
- Rejection and suspension require a reason, actor, timestamp and audit event.
- Material edits to an active listing must not bypass review. They return to draft/pending review according to the implementation policy; the previous published terms must not be silently rewritten for existing engagements.
- `fulfilled`, `archived`, `paused`, `suspended`, `rejected`, `draft`, and `pending_review` listings reject new interest, pledges, and service requests at the server boundary. Public UI hiding alone is insufficient.
- No expiry is applied by default. If an owner later chooses an expiry, it is an explicit field/action and does not silently fulfil the listing.
- Fulfilment is a deliberate owner action with a reason and optional outcome summary. Existing engagements remain accessible to their authorized participants and retain their history.
- A completed request does not automatically fulfil the listing.
- **Reopening policy:** default closed. Reopening a fulfilled or archived listing requires owner/authorized organization manager action, a reason, a new audited lifecycle event, and fresh moderator approval before it becomes active. No direct status patch may bypass these steps.

## 4. Interest lifecycle and permissions

### Statuses

- `interested`: active expression of interest.
- `withdrawn`: actor withdrew it; retained as history.
- `invalidated`: authorized reviewer invalidated it for a documented reason; never silently deleted.

### Actors and transitions

- Eligible signed-in individual: create or withdraw their own individual interest.
- Authorized active organization member: create/withdraw interest on behalf of that organization; persist both acting user and organization.
- Listing owner/provider: view aggregate interest; participant-level detail only where the person/organization has consented to that disclosure or the detail is necessary and authorized for an accepted operational workflow.
- Moderator/admin: review abuse or invalid records under permission checks; every invalidation is audited.
- Transitions: none → `interested`; `interested` → `withdrawn` by the actor; `interested` → `invalidated` by an authorized reviewer. Re-expression creates a new history record or a versioned reactivation event, never overwrites the withdrawal history.
- Unique active interest is counted once per listing and represented party. Organization and individual interest are separate categories; a person acting for an organization is not automatically counted as an individual interest.

Interest must not expose contact details publicly, create a service request, notify arbitrary third parties, or imply an accepted pledge.

## 5. Pledge / offer-of-support lifecycle and permissions

### Statuses

- `draft`: private, incomplete offer.
- `submitted`: formal offer awaiting listing owner/reviewer decision.
- `accepted`: offer accepted by the authorized listing owner; this confirms the pledge, not a service engagement.
- `declined`: offer declined with a reason.
- `withdrawn`: pledger withdrew before fulfilment; retained in history.
- `fulfilled`: the pledged support was delivered and its evidence was recorded/confirmed.
- `cancelled`: an accepted pledge was cancelled through an authorized, reasoned decision.

### Actors and transitions

- Eligible individual or authorized organization member authors a pledge; organization identity and acting user are both stored when applicable.
- Pledger: `draft` → `submitted`; `submitted` → `withdrawn`; accepted pledge may request cancellation, but must not unilaterally erase the record.
- Listing owner/authorized organization manager: `submitted` → `accepted` or `declined`; acceptance/decline is audited with reason.
- Authorized participants/reviewer record delivery evidence; pledge owner/recipient confirmation or authorized resolution transitions `accepted` → `fulfilled`.
- `declined`, `withdrawn`, `fulfilled`, and `cancelled` are terminal unless a separate audited correction/reopen policy is approved.
- A pledge does not start service delivery, reserve a service slot, or increment agreed-service/active-delivery/outcome counts.

## 6. Service request and agreement lifecycle

Existing request statuses and transition guards remain authoritative unless a tested migration explicitly extends them:

- `requested`: requester has submitted an idempotent request; provider has not accepted.
- `accepted`: provider accepted the request, but delivery may not start until both parties agree the same scope/terms version.
- `in_progress`: provider started delivery after the agreement requirement is satisfied.
- `completed`: provider submission and requester outcome acceptance are both persisted; paid service settlement is verified where required.
- `declined`: provider declined with a reason.
- `cancelled`: engagement was cancelled under the existing role/state rules with a reason.
- `disputed`: a participant raised a documented concern; delivery must not be counted as a verified outcome.
- Existing terminal-state rules and audit events are preserved. Invalid transitions return a conflict; they are not coerced into a nearby status.

### Agreement gate

The agreement must bind both parties to the same version of scope, pricing model/amount, currency, pro-bono/discount/capacity-grant terms, schedule/due dates, milestone plan, and any conditions. Store the version/hash and each party's acceptance actor/time. Any material amendment creates a new version and requires renewed acceptance before work continues. Provider acceptance alone, a requester's proposal, or a status of `accepted` alone must not be represented as fully agreed unless the schema can prove both parties accepted identical terms.

Provider completion submission and requester completion acceptance remain separate. Delivery/milestone evidence must be reviewed according to existing controls. Finance verification remains mandatory for paid engagements; no weakening of this gate is allowed. Feedback is available only after an eligible engagement and does not itself certify the outcome.

## 7. Announcement lifecycle, audience and safety

### Statuses

- `draft`: author-only.
- `pending_review`: submitted for review; not public.
- `published`: visible only to the selected allowed audience.
- `rejected`: not published; reviewer reason retained.
- `archived`: no longer in the active feed; history retained.

### Audience rules

- `public`: public listing announcement only after moderation/publication policy passes.
- `members`: visible to eligible active members under server-side membership checks.
- `participants`: visible only to authorized participants of the linked engagement and explicitly authorized organizational operators where necessary.
- Announcement author must be the listing owner or a user with the relevant organization capability. Moderator can approve/reject; edits to a published public announcement return it to review.
- No private messaging. Structured announcements and official system notifications are the only communication channels in this increment.
- Public text must be validated against disclosure rules; never include private contact data, participant names, personal circumstances, or engagement-specific status unless there is an explicit lawful basis/consent and authorized disclosure.
- Operational updates about a request, delivery, concern, feedback, or outcome are participant-scoped by default. Public disclosure requires separate explicit consent and moderation.
- Email state distinguishes queued/sent/failed and confirmed delivery where available; never imply read/seen without evidence.

## 8. Outcome, audit and privacy contract

- All material lifecycle/status transitions record actor ID, timestamp, old/new state, reason/note, record type/ID and request/correlation ID in append-only event/audit history.
- Retain original request terms, agreement versions, milestone decisions, delivery evidence references, provider completion submission, requester confirmation, feedback and finance decisions. Corrections append a new event; they do not erase prior decisions.
- Participant-level report access is scoped to the listing owner/authorized organization role, engagement participants for their own engagement, and authorized admin/review roles for their purpose. A listing owner does not gain blanket access to unrelated private data.
- Reports exclude email, phone, private address, private files, unrestricted contact links and unnecessary personal narrative. Apply small-group suppression where aggregate data could reveal a participant's identity.
- No unrestricted participant export. Any export must use the same server-side scope/privacy filters as the report endpoint and be audited.
- Aggregate counts do not expose participant identities and must be calculated server-side from current eligible states, with organization identity deduplicated separately from acting users.

## 9. Authoritative metric definitions

| Metric | Definition and inclusion rule | Explicit exclusions |
|---|---|---|
| Organizations interested | Distinct organizations with one current `interested` record for this listing | Withdrawn/invalidated records; individual-only interest; duplicate actors from the same organization |
| Individuals interested | Distinct eligible individual parties with one current `interested` record and no organization representation | Organization interest; withdrawn/invalidated records |
| Professionals pledged | Distinct eligible professional users with a `submitted` or `accepted` active pledge, according to the displayed label | Draft, declined, withdrawn, cancelled or fulfilled pledges; do not count one person twice for the same pledge |
| Organizations pledging | Distinct organizations with a `submitted` or `accepted` active pledge | Draft/declined/withdrawn/cancelled/fulfilled pledges |
| Agreed services | Distinct engagements whose exact terms version has provider acceptance and requester agreement persisted | Requested-only, provider-accepted-only, declined, cancelled before agreement, interest or pledge |
| Active deliveries | Distinct agreed engagements with delivery started and status `in_progress`, excluding paused/disputed/cancelled/completed | Requests not started; disputed-only; completed; declined/cancelled |
| Outcome submissions | Distinct engagements with provider completion submission and required delivery evidence | Progress updates without completion evidence; queued notifications |
| Verified/completed outcomes | Distinct engagements with requester acceptance persisted and required milestone/evidence checks satisfied, or an authorized documented resolution under an explicit policy; paid engagements additionally have finance-verified settlement | Provider claim alone, pending requester review, disputed, unpaid-but-paid-required, feedback alone |
| Fulfilled listing/program | Listing whose canonical lifecycle is explicitly `fulfilled` by an authorized owner under the declared fulfilment rule | A single completed engagement; all requests completed unless the program rule explicitly requires that and owner still confirms |
| Announcements published | Count of current `published` announcement records within the viewer's authorized audience | Draft, pending review, rejected, archived; do not count email deliveries as announcements |

All metrics must be sourced from persisted backend records, computed server-side with authorization filters, and clearly labelled. Missing data is shown as unavailable/zero only when the backend can prove zero; loading or failed queries must never display fabricated counters.

## 10. G1 acceptance and deferred verification

- [x] Record types, canonical states, actors, transitions, visibility and metric definitions documented.
- [x] Existing listing/request/idempotency, milestone/delivery, completion/payment and feedback sources reused where appropriate.
- [x] Genuine schema gaps explicitly identified; no duplicate request/delivery/outcome/feedback schema proposed.
- [x] No private messaging introduced; privacy and audit requirements documented.
- [x] No runtime code, schema, existing rows or migration history changed in G1.
- [ ] Before any migration: inspect exact base DDL and constraints; confirm foreign-key target types, status checks and existing event/audit schema on a disposable database.
- [ ] Add only the verified missing tables/columns with reversible, additive migrations; update migration compatibility preflight and tests.
- [ ] Prove listing/request legacy states map safely to the canonical lifecycle without dropping, rewriting or silently reclassifying existing records.
- [ ] Add server-side transition, role, consent, idempotency, concurrency and privacy tests before UI work.

G1 defines the contract; it does not claim the runtime lifecycle is already implemented. The next gate must implement these rules in the backend first and must not begin final UI design until authoritative transitions and aggregates are testable.
