# Network-Plus Increment 4 — Business Discovery domain design

**Branch:** `feat/workstream-3-progress-members-workspace`  
**Plan:** [docs/53-network-plus-discovery-and-collaboration-integration-plan.md](53-network-plus-discovery-and-collaboration-integration-plan.md)  
**Design status:** complete draft for product/data-contract review; **not approved for schema implementation**  
**Scope:** domain definitions, policy boundaries, reuse decisions, record classification and rollback strategy. No schema, migration, API, UI or data conversion is introduced by this increment.

## 1. Product boundary and invariants

Business Discovery is the commercial/professional discovery and collaboration area within Network-Plus. It is not a renamed public volunteer marketplace.

- **Network-Plus / Business Discovery:** member-owned businesses, organization-owned businesses, professional/commercial services and typed commercial collaboration requests.
- **Serve-Community:** volunteering, community initiatives, participation, pro-bono impact commitments, community-discount programmes and capacity grants where the primary purpose is community benefit.
- **Verified Member Discovery:** canonical people and professional profiles; a person is not a business.
- **Organization Discovery:** canonical verified organizations that explicitly opt in; organization discovery is not the private organization workspace.
- **Service delivery:** the private, agreed engagement between requester and provider after the listing has been discovered.

A listing is not a contract. A request is not acceptance. A verification badge is not a guarantee of quality, licensing, solvency or future performance. A payment is not proof of delivery. A free price does not automatically make a listing a volunteer initiative; a paid listing does not automatically make it commercial if its governing programme is a community-impact initiative.

**No automatic conversion rule:** title, description, category, provider type, organization association, price, free/paid status or existing impact flag alone is insufficient to classify an existing record.

## 2. Business ownership contract

Every business profile must resolve to one explicit ownership model and one accountable owner context. Ownership must never be inferred from who created a listing or who happens to hold a platform role.

### 2.1 Individual member-owned business

- The canonical owner is one or more existing MPA person/user identities; do not create a duplicate person or member record.
- The accountable primary owner must have a current active membership and the personal professional capability required for member business actions.
- Additional co-owners must be explicitly declared and accept the ownership association before receiving owner-level authority.
- A member may manage only their own business and explicitly delegated business resources.
- Professional credentials remain separate claims attached to the relevant person. Business verification does not verify every employee, director or service credential.

### 2.2 Organization-owned business

- The owner is an existing canonical `organization` record, not an individual account or a duplicate organization record.
- The organization must be verified and in good standing before public Business Discovery publication.
- A person acts only through an active `organization_membership` for that exact organization. Platform-wide roles and membership in another organization grant no authority.
- The business remains organization-owned when staff members change. Removing a staff member's organization access must remove their operational access without changing the business owner.
- Organization verification and business-specific verification are separate decisions. Existing organization verification must not be treated as proof of a particular trading name, licence, service capability or business status.

### 2.3 Joint ownership

Support joint ownership as a first-class *ownership relationship*, not as a shared login or informal note.

- A joint business has one canonical business identity and multiple explicit owner parties. Parties may be eligible individuals and/or an organization where the legal/operating arrangement supports it.
- One accountable primary owner is required for notices, revalidation and operational continuity. This does not erase co-owner rights.
- Each owner party must provide explicit consent to the ownership association. A pending or disputed owner must not be silently treated as consenting.
- Record ownership share/percentage only if a documented legal, verification or governance requirement needs it. Do not collect equity percentages by default.
- Owner-level actions (ownership changes, transfer, closure, material identity changes) require the defined owner-consent rule. Routine listing and request operations may be delegated to named managers without transferring ownership.
- A joint business does not grant any party access to another party's personal profile, organization workspace, verification evidence or unrelated businesses.
- Disputed ownership freezes sensitive ownership changes and new publication; it does not erase the business or rewrite historical engagements.

### 2.4 Ownership change and continuity

Ownership transfer is a reviewed, auditable process: proposed transfer → evidence and affected-party notice → required consent → reviewer decision where policy requires it → effective date → updated accountable owner. Preserve the prior owner and event history. Never rewrite historical requests, agreements, invoices or outcomes as though the new owner participated in them.

## 3. Ownership and organization-role matrix

The following is the proposed minimum policy. It is intentionally stricter than the broad organization-resource role set used by some existing workflows. It must be agreed before implementation.

| Action | Individual owner | Joint co-owner | Organization owner/admin | Project manager | Recruiter | Read-only |
|---|---:|---:|---:|---:|---:|---:|
| View a published listing | Eligible Network-Plus viewer | Eligible viewer | Eligible viewer | Eligible viewer | Eligible viewer | Eligible viewer |
| Create a draft for the owned business | Yes | Yes, after accepted ownership | Yes | Only with explicit business assignment | No by default | No |
| Edit listing content / capacity / availability | Yes | Yes, subject to agreed owner controls | Yes | Assigned businesses only | No by default | No |
| Submit, pause or withdraw a listing | Yes | Owner-consent policy for material actions | Yes | Assigned businesses; owner notification | No by default | No |
| Respond to routine service requests | Yes | Yes | Yes | Assigned requests only | No by default | No |
| Agree commercial terms / accept engagement | Yes | Yes, subject to owner policy | Yes | Only with explicit commercial authority | No by default | No |
| Manage ownership / transfer / close business | Owner process | Required co-owner consent | Organization owner/admin governance | No | No | No |
| View private verification evidence | Own evidence, restricted | Own/authorized evidence only | Authorized owner/admin | No by default | No | No |
| Decide verification / suspension appeal | No | No | No | No | No | No |

**Rules:**
- The proposed default for organization business management is owner/administrator. A project manager may receive explicit, business-scoped operational assignment; the organization role alone is not blanket authority to accept commercial terms.
- Recruiter is a Jobs-specific role and is not automatically a Business Discovery role.
- Read-only is never a mutation role.
- Only an independent authorized verification/review function decides verification, suspension and appeals. Business owners cannot approve themselves.
- A user with several roles receives the union of explicitly authorized capabilities, not a broad bypass. Every mutation checks the target business and request at the server.

## 4. Business verification and trust contract

Business verification is distinct from MPA membership, professional-claim verification and organization verification.

### Evidence categories (policy-level, not schema fields)

Evidence should be proportionate to business type and jurisdiction and may include:

- legal/trading identity and registration where applicable;
- owner/authorized representative identity and authority to act;
- operating address or service geography where required (not necessarily public);
- licence, permit or regulated-profession authorization when the listed service legally requires it;
- proof of relationship between the trading name and the individual/organization owner;
- relevant professional/service credentials, each linked to the person or issuing authority that holds them;
- evidence of joint ownership/consent where applicable.

Evidence is private by default, access-controlled, retained only under the approved retention schedule, and never copied into a public directory response. Public profiles show a bounded verification status, scope and date where policy allows, not source documents or reviewer notes.

### Review states

`draft → submitted → under_review → verified | changes_requested | rejected`

- `changes_requested` returns the case to the applicant with a reason and resubmission path.
- `rejected` is a recorded decision with reason, reviewer, timestamp and appeal path; it is not a delete.
- `verified` applies only to the reviewed business identity and evidence scope. It is not a blanket endorsement of all claims or services.

### Expiry and revalidation

- Verification must carry an evidence-dependent validity/review date where the evidence itself expires or the relevant policy requires periodic revalidation.
- Send advance notifications to the accountable owner and authorized delegates.
- Revalidation is a new evidence/review event linked to the existing business identity; it does not create a second business.
- If a required licence or evidence expires, the affected regulated offering must be paused or hidden until revalidated. Do not silently extend an expired credential.
- If the evidence has no statutory expiry, define a risk-based review interval and material-change triggers rather than inventing an arbitrary universal expiry.

### Suspension and appeal

`verified → suspended` may occur for expired/missing mandatory evidence, credible safety/fraud concerns, ownership disputes, regulatory notice or substantiated policy breach. Suspension must record reason, scope, reviewer, evidence reference, start time, review deadline and appeal route.

- A suspended business and its affected listings are removed from new discovery and new request initiation.
- Existing accepted engagements are not silently deleted or auto-cancelled. Apply a risk-based hold, participant notice and continuity/safety decision.
- The owner can respond or appeal; only an authorized reviewer can reinstate or reject the appeal.
- Reinstate only after required conditions are satisfied; preserve the complete suspension/review history.
- A listing may be suspended independently of the whole business when only one offering is affected.

## 5. Service taxonomy and listing contract

### Taxonomy

Use a governed, hierarchical taxonomy with stable codes and human-readable labels. Initial top-level families should cover professional services, business services, products/supply, consulting/advisory, technical/digital, creative/media, education/training, facilities/operations and specialist/regulatory services. The taxonomy must be reviewed by product and operations before implementation; do not treat free-text category as an authorization or credential.

Each listing has exactly one primary service/product category and may have controlled secondary tags. Categories must not mix community programme labels (Pro-Bono/Impact, Community Discounted Rate, Capacity Grant) into commercial service taxonomy.

### Required listing contract

| Field group | Required meaning |
|---|---|
| Identity | Business identity, provider/owner context, display name, summary, detailed scope and unique public slug/identifier |
| Classification | Primary taxonomy code, optional secondary tags, service/product type, commercial/impact boundary |
| Audience | Individuals, organizations, SMEs, nonprofits, public institutions, or a controlled combination; eligibility and exclusions |
| Delivery | Remote, onsite, hybrid, shipped/supply, or appointment-based as appropriate |
| Geography | Countries/regions/cities served, remote availability and any service-radius constraints; never expose private home address |
| Capacity | Available capacity, active-work limit, lead time, intake status and next availability; do not infer capacity from views |
| Pricing | Free, fixed, hourly, unit-based, range, quote/negotiable, subscription/retainer or not-applicable; currency is ISO 4217; tax/fees and quote assumptions disclosed where relevant |
| Credentials | Business verification scope plus separately verified person/service credentials, issuing authority, validity and limits |
| Availability | Accepting requests, paused, schedule/booking windows, lead time, blackout periods and timezone |
| Governance | Draft/moderation/publication state, verification reference, owner consent, visibility audience, created/updated/reviewed dates |
| Contact | No public personal contact by default; use a scoped request/consent workflow |
| Evidence | Private references to approved evidence/deliverables, never public file URLs |

Price is not a classification signal. A zero-price commercial offer may remain Business Discovery; a discounted service may belong to Serve-Community if it is part of an approved impact programme. Tax, licensing and consumer-protection disclosure requirements must be defined for the relevant operating jurisdictions before publication.

## 6. Commercial listing lifecycle — separate from impact lifecycle

Proposed business listing lifecycle:

`draft → pending_review → published → paused → published`

Terminal/exceptional outcomes:
- `changes_requested`: return to owner with actionable reason;
- `rejected`: reviewed rejection with appeal/withdrawal path;
- `withdrawn`: owner withdraws before/after publication; retain history;
- `expired`: listing validity/availability window ends; require owner renewal;
- `suspended`: policy/trust intervention; not the same as owner pause;
- `archived`: retained, non-discoverable record after closure/retirement.

Publication requires: eligible owner context, verified business, approved listing content, required credentials for regulated claims, capacity/availability and pricing disclosures, and required consent. Business verification and listing moderation are separate controls. A published business does not mean every listing is automatically approved.

The existing Serve-Community impact lifecycle and labels remain independent. Never map `pro_bono`, `community_discount` or `capacity_grant` to a commercial listing status. An impact programme may have its own approved participation/fulfilment lifecycle.

## 7. Typed request contract

Every request records a type, requesting party, target business/listing/party, purpose, minimum necessary details, visibility/consent, status, timestamps, idempotency identity and audit history. Type-specific details must be validated against the type; do not make one generic free-text message carry all business semantics.

| Request type | Purpose and minimum structured content | Successful progression |
|---|---|---|
| Service request | Specific offering, need, desired outcome, location/delivery fit, timing, optional budget | Clarify → scope/quote → both parties accept terms → delivery workflow |
| Supplier request | Product/specification, quantity, quality/standard, delivery location/date, quote and procurement constraints | Supplier response → quote/terms → authorized purchase/engagement |
| Referral | Person/business to be referred, referral purpose, receiving party, explicit referrer and subject consent | Consent check → referral sent → recipient accepts/declines → outcome recorded |
| Expertise request | Problem/domain, expertise needed, expected contribution, duration and whether paid/pro-bono | Expert response → scope/terms → acceptance → contribution/outcome |
| Partnership proposal | Parties, shared objective, contribution, governance, budget/funding (if any), timeline, decision owners and risks | Proposal → due diligence → negotiation → authorized approval → agreement or decline |
| Collaboration | Shared deliverable, roles, responsibilities, milestones, resources, IP/confidentiality expectations and timeline | Scope → participant consent → collaboration plan → progress → outcome |
| Business opportunity | Opportunity type, sponsor/provider, eligibility, value/compensation, deadline, selection process and terms | Review/interest → qualification → proposal/selection → acceptance or closure |

Do not reuse job applications, mentorship requests, public opportunity intake or volunteer participation records as business requests. Referral consent must cover the person being referred; a user cannot disclose another person's contact details merely because they know them.

## 8. Consent, notification, audit, idempotency and lifecycle semantics

### Consent and privacy

- Discovery visibility, contact release, referral sharing, evidence access, commercial negotiation and outcome publication are separate consent purposes.
- Consent must identify the actor, purpose, recipient/audience, data categories, scope, version, timestamp and revocation path.
- No public phone/email or private registration evidence by default. Reveal contact details only when the relevant party has explicitly opted in and the request state permits it.
- Withdrawal of discovery consent hides future discovery but does not erase lawful audit/contract records or cancel an already accepted engagement automatically.
- Do not place sensitive evidence, payment details or private negotiation content in notification payloads.

### Notifications

Notify only the affected owner, authorized delegates and request participants on actionable events: submission, assignment, decision, changes requested, acceptance/decline, quote, terms awaiting acceptance, due date, dispute, expiry, suspension, revalidation and completion. Deduplicate retries and expose delivery status/retry without duplicating the underlying business action.

### Audit

Record actor, effective organization/business context, action, resource, request/correlation ID, before/after state or safe change summary, outcome, timestamp and reason for sensitive actions. Audit evidence must not be a public activity feed. Verification, owner transfer, role assignment, consent change, suspension, dispute resolution and financial/terms acceptance require explicit audit events.

### Idempotency

Mutating requests require a client-generated high-entropy key, scoped to actor + operation + resource. Store a canonical request fingerprint. Same key/same payload returns the original outcome; same key/different payload returns a conflict. Retries must not create duplicate requests, agreements, payments, notifications or audit transitions. Use transactional locking/uniqueness for concurrent replay.

### Withdrawal and cancellation

- Requester may withdraw an unaccepted request; record reason and notify the other party.
- After acceptance, cancellation follows agreed terms and role-authorized mutual/exception rules. Do not relabel a cancellation as withdrawal.
- Business/listing withdrawal stops new requests but leaves existing requests and agreements visible to their authorized participants.
- Consent withdrawal affects future sharing; it is not a silent erasure of existing obligations.

### Disputes

A dispute is a distinct, participant-visible but restricted case with category, description, evidence references, requested remedy, response, assigned independent reviewer, decision, appeal and closure. Disputes pause only the affected transition/payment where policy requires. Business owners cannot adjudicate their own dispute. Never use a normal feedback comment as a dispute record.

### Completion and outcomes

- Service completion reuses the existing two-sided delivery review model; requester acceptance is distinct from provider claiming delivery. Paid completion must respect verified payment settlement/reversal state.
- Partnership/collaboration completion requires the agreed deliverables or milestones, participant/authorized sponsor confirmation and outcome summary.
- Distinguish self-reported, counterparty-confirmed and independently verified outcomes.
- Feedback is not verification, and outcome metrics are not page views or unverified listing interest.
- Aggregate reporting must suppress small cohorts and exclude contact details, private evidence and confidential terms.

## 9. Existing workflow reuse decision

The repository already has substantial service workflow primitives. Reuse is conditional and layered:

| Existing foundation | Decision for Business Discovery |
|---|---|
| Canonical `person`, `app_user`, membership and professional profile | Reuse identities and membership checks. Never create duplicate people or member profiles. |
| Canonical `organization` and `organization_membership` | Reuse organization identity, verified status and resource-scoped membership. Do not infer business ownership from organization discovery opt-in. |
| Verification cases/evidence and private file storage | Reuse storage/security and reviewer patterns; define business-specific evidence scope and review decision. Do not reuse professional claims as business verification. |
| `service_listing` | Existing source supports provider/organization ownership, category, delivery, pricing, visibility, capacity, expiry, impact model, moderation and idempotency. Treat as a legacy mixed-purpose service listing until record classification and product approval decide whether to extend, adapt or separate it. No blanket semantic conversion. |
| `service_request` and `service_request_event` | Reuse only for the service-request type if its current state and participant model meet the approved commercial contract. Do not overload it for supplier, referral, expertise, partnership, collaboration or business-opportunity requests. |
| Service agreement, milestone, update, delivery, completion review, payment and feedback workflows | Reuse service-delivery primitives after contract, participant, terms snapshot, payment and dispute gaps are validated. Keep delivery data private to participants. |
| Audit log, notifications and idempotency/fingerprint patterns | Reuse technical patterns and shared infrastructure. Keep domain-specific event names, permissions and payload minimization. |
| Talent inquiry | Reuse only for person-to-person professional discovery inquiries. It is not a supplier or business partnership request. |
| Mentorship request/match/session | Do not reuse domain records or statuses. Reuse only technical patterns such as consent, explicit acceptance, notifications and audit. |
| Jobs/public opportunity intake | Do not repurpose job applications or public intake as business requests. |
| Serve-Community interest, pledge, impact and outcome reporting | Keep separate. Do not convert commercial requests into volunteer participation or impact claims. |

**Important source caveat:** current service code has different provider-side behavior for individual and organization listings, and generic organization resource roles are broader than the proposed Business Discovery matrix. The future implementation must introduce a narrow business-specific capability check rather than silently inheriting recruiter/read_only permissions or treating every existing service permission as approved.

## 10. Existing-record classification — no bulk conversion

Classify records into an explicit review queue with evidence and confidence; do not mutate their domain, owner or lifecycle automatically.

| Classification outcome | Criteria | Safe treatment |
|---|---|---|
| Clearly community impact | Explicit programme/initiative context, approved impact policy and community participation semantics | Retain in Serve-Community; no commercial conversion |
| Clearly commercial service | Owner and purpose are established; offer is a professional/commercial service; terms and intended audience are consistent | Candidate for Business Discovery after owner confirmation and moderation |
| Ambiguous service | Title/category/price alone, mixed purpose, unclear owner or conflicting impact/pricing semantics | Leave in existing service experience; request human review |
| Organization-associated legacy service | Organization link exists but authority, owner consent or organization verification scope is unclear | Preserve record; verify organization-specific authority and owner intent |
| Personal provider service | Provider user exists but current membership/professional capability or business identity is unclear | Preserve; revalidate current eligibility without rewriting history |
| Mentorship/job/volunteer record | Domain-specific lifecycle/participant fields identify a different workflow | Remain in its existing domain; never convert based on labels |

Classification record should capture source record ID/type, current owner, current lifecycle, current visibility, observed purpose, evidence references, proposed target domain, decision/reviewer, owner confirmation, confidence, timestamp and rollback reference. A human decision is required for ambiguous records. A record may remain in the legacy service experience indefinitely if classification is unresolved.

## 11. Migration and rollback strategy — design only

No migration is part of Increment 4.

When a later implementation is approved:

1. Freeze the reviewed source baseline and export a read-only classification inventory; do not mutate production data.
2. Implement additive structures and adapters only after the product contract and role matrix are approved. Avoid destructive renames, table rewrites or default visibility changes.
3. Backfill only explicitly reviewed and owner-confirmed records, using stable source IDs and idempotent mapping records.
4. Keep source records, original lifecycle events, agreements, payments, feedback and audit history intact. Do not rewrite historical actor/owner identity.
5. Dual-read or shadow-compare the proposed Business Discovery projection against source records before enabling discovery.
6. Enable by feature flag and explicit owner opt-in; keep new business listings hidden until verification/moderation and consent conditions pass.
7. Reconcile counts and per-record ownership/status; verify no cross-organization leakage and no duplicate listing/request.
8. Roll back by disabling the feature flag/projection and restoring the previous read path. Do not delete new audit history or reverse financial/contract events; resolve any in-flight requests under a documented continuity plan.
9. Production migration/deployment requires a separate explicit authorization and tested backup/restore plan.

## 12. Exit gate and review checklist

Increment 4 is ready to exit only after reviewers agree on all of the following:

- [ ] Individual, organization and joint ownership definitions and transfer/consent rules.
- [ ] Organization role matrix, including explicit business-scoped project-manager delegation and recruiter/read-only exclusions.
- [ ] Business verification evidence, reviewer authority, validity, revalidation, suspension and appeal policy.
- [ ] Taxonomy, audience, delivery, geography, capacity, pricing/currency, credentials and availability contract.
- [ ] Commercial listing lifecycle distinct from Serve-Community impact lifecycle.
- [ ] Seven typed request contracts and their acceptance/withdrawal/dispute/completion rules.
- [ ] Consent purposes, notification routing, audit requirements and idempotency behavior.
- [ ] Exact reuse boundary for service request/delivery primitives versus new typed request domains.
- [ ] Existing-record classification rules, owner confirmation, exception handling and rollback.
- [ ] Legal/compliance review for regulated services, privacy, consumer disclosures, referral consent and record retention in target jurisdictions.

**Exit status: NOT YET APPROVED.** This document completes the design draft and records a proposed contract. Product/data reviewers must agree the ownership and role matrix and classification policy before any business schema or migration is proposed.

## 13. Explicit non-goals for this increment

- No business/business-owner/listing/request tables or columns.
- No migrations, seed data, API endpoints, UI routes or permission grants.
- No automatic record classification, bulk conversion, backfill or data cleanup.
- No changes to existing service, mentorship, Jobs, membership, finance or Serve-Community records.
- No change to production, deployment, main branch or PR merge state.
