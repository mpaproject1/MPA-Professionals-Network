# Network-Plus Increment 7 — Serve-Community separation and public UX

**Branch:** `feat/workstream-3-progress-members-workspace`  
**PR:** #18 — keep draft; do not merge or deploy.  
**Plan:** [docs/53-network-plus-discovery-and-collaboration-integration-plan.md](53-network-plus-discovery-and-collaboration-integration-plan.md)  
**Status:** Public UX separation prototype implemented; full increment and exit gate are **NOT COMPLETE**.

## 1. Approved product boundary

The project owner approved this policy on 2026-10-31:

- Serve-Community publicly presents only community-benefit initiatives that have been explicitly reviewed and approved.
- Standard commercial professional services remain in Network-Plus Business Discovery.
- Existing service records are not automatically converted, deleted, hidden or relabelled.
- Any future classification of a legacy service record requires an auditable, reversible decision and a reviewed mapping.
- Mentorship, Jobs, membership and organization workspaces remain separate journeys.
- Private participation and member data remain behind their existing authorization boundaries. Public impact reporting must remain aggregate and privacy-safe.

## 2. Source reconciliation

The current source did not contain a public, approved initiative-directory contract:

- `web/app/serve-community/page.tsx` previously combined commercial professional services, mentorship, Jobs, community demand and organization workspace links in one page.
- `src/platform/volunteer-pledges.js` and `GET/POST/PATCH/DELETE /api/v1/me/volunteer-pledges` manage a member's own private volunteer pledges. They are not a public initiative directory or public volunteer registration workflow.
- `/api/v1/marketplace-demand/topics` publishes reviewed demand topics, but its contract explicitly includes service and mentorship demand. It is not an approved initiative inventory and must not be repurposed as one.
- `/api/v1/services/listings/:id/impact-report` is an owner/governance report for existing service listings. It is not a public discovery API.
- Existing service listings, requests, pledges, agreements, delivery history and impact reports are retained without migration or visibility changes.

## 3. Implemented UX prototype

The public page now has:

- A distinct Serve-Community hero and community-impact value proposition.
- Clear trust principles for review, voluntary participation and privacy-safe reporting.
- An interactive search field and category filters.
- Responsive initiative cards with a detail dialog, keyboard Escape close, accessible labels and visible focus states.
- A clear boundary link to Network-Plus for professional/commercial discovery.
- No commercial services search, mentorship, Jobs or organization workspace presented as Serve-Community pathways.
- Sample initiative cards are conspicuously labelled as illustrative preview content, not approved opportunities; no registration, interest, volunteer pledge or impact metrics are fabricated.

The sample concepts are presentation fixtures only. They are not stored in the database, sent to an API or represented as actual MPA programmes.

## 4. Remaining implementation required before Increment 7 can pass

A live experience still requires a distinct initiative and participation contract. Do not mark this increment complete based on the UX prototype alone.

1. Define the initiative lifecycle and ownership model, including draft, submitted, under review, clarification, approved/published, suspended, completed and archived states; enforce valid transitions server-side.
2. Define the approved public projection and classification controls. Existing commercial service records must not be auto-imported. If selected legacy impact services are to appear, record each approved mapping and reversal path.
3. Add an additive migration for initiative records and explicit moderation/classification audit history only after the domain contract is reviewed. Preserve all existing tables and records.
4. Implement public read-only discovery of approved/published initiatives with search, category, location, delivery mode, pagination and bounded safe fields. Never return contact details, private notes, participant lists or internal evidence.
5. Implement authenticated, consent-based participation/volunteer interest with idempotency, explicit withdrawal, capacity and eligibility rules where applicable, and notifications to authorized owners.
6. Reuse member volunteer pledges only as a separate member-owned offer. Do not publish those private pledge rows without a distinct opt-in and moderation contract.
7. Preserve impact reporting semantics and aggregate suppression; do not publish page views or infer impact from listing exposure.
8. Add disposable-PostgreSQL migration/API tests, authorization and negative-case tests, Playwright public discovery/participation journeys, mobile/responsive checks and WCAG AA keyboard/screen-reader/contrast review.

## 5. Validation

- [x] Source audit completed for the current page, volunteer-pledge service/API, demand-topic API and impact-report API.
- [x] Interactive UX prototype separates the public community destination from commercial/professional, Jobs and Mentorship journeys.
- [x] Preview/sample content is clearly disclosed and cannot be mistaken for live approved listings.
- [ ] Live initiative schema, moderation lifecycle and auditable classification controls.
- [ ] Approved-only public initiative API and authorization/privacy tests.
- [ ] Consent-based volunteer participation and withdrawal lifecycle.
- [ ] Disposable PostgreSQL migration and rollback compatibility.
- [ ] Playwright, responsive and accessibility acceptance on the new implementation head.
- [ ] Regression verification for services, mentorship, Jobs and impact reporting.

**Exit status: IN PROGRESS — NOT PASSED.** No legacy service records were changed. No production migration, deployment, merge or main-branch update was performed.
