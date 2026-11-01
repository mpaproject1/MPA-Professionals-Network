# Network-Plus: source audit, product boundaries and implementation plan

**Target branch:** feat/workstream-3-progress-members-workspace  
**PR:** [#18 — Workstream 3](https://github.com/Jcodestest/MPA-Professionals-Network/pull/18)  
**Audit baseline:** c05cf51413bb7d1d95c04c5b2f738a0d19a18669 (2026-10-30)  
**Implementation baseline:** 6a9f65d095f897048b1961777813d8e0367c6ea8 (2026-10-30)  
**Status:** Source-foundation audit and incremental delivery plan; Increment 4 owner-approved on 2026-10-31. Increments 5 and 6 have source implementations documented in `docs/59-network-plus-increment-5-business-discovery-implementation.md` and `docs/60-network-plus-increment-6-request-collaboration-implementation.md`; their disposable-database, API, browser and accessibility exit gates remain pending.  
**Implementation status (reviewed 2026-10-31):** Increments 0–3 have source changes on this branch. Increment 3's documented automated exit gate now passes at `c849f0be2c0308880a2d7a117d4a63d8cd104355`: PR Quality run #1212 completed successfully across disposable PostgreSQL backend tests (including migration compatibility), Biome, Next.js build/browser acceptance (including `e2e/network-plus-discovery.spec.js`) and TypeScript. The earlier failed runs #1204 and earlier are superseded for this exact head; do not use them as current status. Increment 3's source and CI exit gate are recorded in [docs/57-network-plus-increment-3-validation-and-gaps.md](57-network-plus-increment-3-validation-and-gaps.md). Remaining release-readiness follow-ups are a seeded real-account staging walkthrough and full manual keyboard/screen-reader/contrast review; the automated browser tests use mocked session/access responses while backend integration uses disposable PostgreSQL. Increment 4 is documented in [docs/58-network-plus-increment-4-business-discovery-domain-design.md](58-network-plus-increment-4-business-discovery-domain-design.md) and was approved by the project owner on 2026-10-31 as the implementation contract for the next increment. The approval accepts the documented ownership models, stricter organization-role boundary, separate business verification/listing lifecycles, seven typed request categories, consent/audit/idempotency requirements, workflow-reuse boundaries, conservative record classification and rollback approach. Increment 4 itself remains design-only: no business schema, migration, API, UI or bulk record conversion is added. Schema work belongs to Increment 5 below. Jurisdiction-specific legal/compliance and evidence-retention policy must be finalized before affected listings are publicly published; this does not authorize guessing legal requirements or exposing private evidence.  
**Change control:** This plan authorizes work on the target branch only. It does not authorize a merge, main-branch changes, production deployment or production database changes.

## 1. Product contract

Network-Plus is a top-level, member/authorized-organization professional networking destination with two distinct discovery experiences:

1. **Verified Member Discovery** — discover eligible MPA professionals and verified organizations, their expertise, capabilities, interests and collaboration intent.
2. **Business Discovery** — discover member-owned businesses and organization-provided professional/commercial services, then initiate scoped service, supplier, referral, partnership or collaboration requests.

Serve-Community remains a separate public-facing experience for community initiatives, volunteering, participation and community impact. Its public volunteer calls, participation lifecycle and impact reporting must not be relabelled as commercial business listings.

### Boundary rules

| Concern | Network-Plus | Serve-Community |
|---|---|---|
| Purpose | Professional networking and commercial collaboration | Volunteering, initiatives and community impact |
| Audience | Eligible active members and authorized organization accounts | Public discovery; private actions remain authenticated |
| Discovery | Members, organizations, businesses and professional services | Initiatives and volunteer opportunities |
| Requests | Service, supplier, referral, expertise, partnership and collaboration | Volunteer participation, initiative interest and community support |
| Outcomes | Accepted engagements, collaboration milestones and business outcomes | Participation and community impact outcomes |
| Pricing | Commercial, quotation-based or free; clearly disclosed | Existing pro-bono/discount/capacity-grant impact policies |

A profile is not a business. Organization registration is not organization discovery. A volunteer initiative is not a commercial service. A submitted request is not an accepted contract or partnership.

## 2. Source audit at baseline c05cf514

This is a source-level audit, not a claim that all browser journeys or every authorization path have been runtime-tested.

### 2.1 Individual professional identity and member discovery — reuse

**Existing source**
- web/app/network/page.tsx is already a verified talent directory. It calls GET /api/v1/talent and GET /api/v1/talent/:userId, and supports professional inquiries, saved searches and saved discovery items.
- src/talent/service.js implements searchTalent, getTalent, profile visibility, verified-claim filtering, and inquiry creation/response.
- src/platform/identity-policy.js separates personal professional identity from organization resource access.
- Directory visibility is opt-in through verification_visibility.directory_visible. Profile visibility is constrained by professional_profile.directory_visibility (private, members, public).
- Search results require active membership records, directory opt-in and eligible verified professional claims. A member viewer can see member-visible profiles; an anonymous/non-member viewer is limited to public-visible profiles.
- Creating a talent inquiry requires the requester to have current active membership. The target must be an active member with directory visibility and an eligible verified claim. Contact details are not released merely by search or profile viewing; release is an explicit response action.

**Reuse decision**
- Reuse canonical person, professional_profile, professional_experience, professional profile references, verification claims, membership records, visibility preferences, saved discovery and talent inquiry records.
- Do not create a second person/member/profile table or duplicate verification badges.
- Reconcile /network as the initial Verified Member Discovery implementation under Network-Plus, subject to the access boundary.
- Keep private verification evidence and reviewer notes out of discovery responses.

**Validation still required**
- Test anonymous, active-member, expired-member and organization-account access.
- Verify members/public/private visibility and experience/education/portfolio rules with fixtures.
- Inspect the complete getTalent response for contact release and ensure unrelated contact fields are never serialized.
- Organization discovery is not implemented by the talent directory and needs a separate read contract.

### 2.2 Organization identity and workspace — reuse, not discovery

**Existing source**
- web/app/organizations/page.tsx is an organization registration, verification-evidence, review-queue and workspace journey. It calls GET /api/v1/organizations for the signed-in user's organizations and POST /api/v1/organizations for registration.
- The organization page is not a searchable organization directory.
- src/platform/identity-policy.js defines organization resource roles owner, administrator, recruiter and project_manager. assertOrganizationCapability checks an active organization_membership row for the specific organization and returns its verification status.
- Organization membership is resource-scoped. A platform role must never be treated as membership of an arbitrary organization.
- Registration, verification, membership and public visibility are separate states.

**Reuse decision**
- Reuse canonical organization, organization_membership, verification case/evidence and organization-scoped authorization.
- Add a separate read-only discovery experience backed by canonical organization rows. `network_plus_visible` is a dedicated opt-in, defaults to false, and is independent of `public_visible`; the directory projection exposes only id, display name, type, approved description, website and broad location.
- Reuse the existing organization workspace ownership and permissions for future organization business/service management.
- Do not repurpose GET /api/v1/organizations as a directory; it is the signed-in user's private organization list.

**Validation still required**
- Verified organizations must explicitly opt in through `network_plus_visible`; existing organizations are not backfilled and remain hidden until an owner/administrator opts in.
- Define which active organization roles may discover, submit requests, publish listings and manage collaboration records.
- Test multi-organization accounts and organization-scoped ownership checks.

### 2.3 Existing services and service requests — preserve as a distinct foundation

**Existing source**
- web/app/services/page.tsx and web/app/services/[id]/page.tsx implement the current service-listing experience.
- The current service contract includes service category, delivery mode, location, pricing model, impact model, listing lifecycle/moderation, provider listings, interest, pledges, service requests, agreements, deliveries, progress updates, completion review and feedback.
- The UI distinguishes interest, pledges, agreed services and active deliveries. It uses idempotency keys and handles uncertain submissions safely.
- Listings can be associated with an organization. The service implementation checks organization capability and requires verified organization status before an organization can publish.
- Public service detail and announcements currently coexist with member/provider workflows.
- web/app/serve-community/page.tsx currently puts “Professional services”, mentorship and community demands together; its introduction also mentions careers and community initiatives.

**Reuse decision**
- Preserve the existing service request, agreement, delivery, progress, completion, feedback, idempotency and audit foundations.
- Do not silently convert existing service listings or requests into Network-Plus business records.
- Before any route move or migration, classify existing records by actual intent and ownership. Impact-model records and community service commitments must remain in their existing Serve-Community context.
- Network-Plus commercial services may reuse workflow primitives only after a distinct business/service contract, visibility policy and lifecycle are approved. Shared code is acceptable; ambiguous shared listing semantics are not.

**Required reconciliation**
- Serve-Community must focus on initiatives, volunteering, participation and community impact.
- Existing public services that are genuinely community-benefit/pro-bono initiatives need an explicit product decision and clear presentation. Do not assume every current /services record is a volunteer initiative.
- Network-Plus Business Discovery must be a separate directory and management experience, not merely a renamed /services page.

### 2.4 Mentorship requests and matching — preserve as a separate relationship type

**Existing source**
- src/services-mentorship/service.js and src/services-mentorship/operations.js implement a distinct mentorship request, matching, mentor-interest, mutual acceptance, session coordination, feedback and outcome workflow.
- The operations layer checks current membership and professional identity for mentor eligibility, uses supporting_staff/system_admin for matching operations, records audit events and notifications, and supports participant decisions for proposed sessions.
- Mentorship request sharing is consent-controlled; eligible mentors receive a minimized request summary rather than participant contact details.

**Reuse decision**
- Preserve mentorship as its own programme and relationship lifecycle. A mentorship request must not be recast as a commercial service request or business partnership.
- Reuse common technical patterns where appropriate (idempotency, status transitions, explicit acceptance, notifications, audit and privacy controls), not mentorship-specific tables or statuses as generic business-collaboration records.

### 2.5 Public opportunity intake — not a business-collaboration substitute

- src/platform/public-opportunity.js supports public first-contact mentorship inquiries and inquiries tied to a specific published public vacancy. No-vacancy job interest is separately restricted to eligible active members.
- Public intake stores contact details and consent; continuation tokens are hashed. Organization users can review job inquiries scoped to their vacancies.
- docs/33-public-opportunity-intake.md documents this boundary.
- These are Jobs/Mentorship intake workflows. Do not repurpose them as business-service, supplier or partnership requests.

### 2.6 Navigation and access boundary — current gap

- web/components/shell.tsx currently includes About, Job Portal, Serve-Community, My-Workspace, My-Learning, Mentorship, Membership, Saved and Profile. There is no Network-Plus item.
- The shell currently loads /api/v1/me and /api/v1/organizations for some navigation decisions. A non-empty organization array or client-side role list is not sufficient proof of Network-Plus eligibility.
- /network is an existing verified talent directory, not a Network-Plus landing page. /organizations is a private organization workspace, not organization discovery.
- Hiding a link is not authorization. Direct URL entry and API calls must be protected server-side.

**Decision and current implementation**
- Network-Plus is now a top-level desktop/mobile destination, shown only after the shell receives an eligible result from the authenticated server access endpoint.
- The server resolver checks a current active membership record or an active owner/administrator/project_manager membership in a verified organization. It returns only boolean access context and a safe next action; it does not return organization IDs or private profile data.
- The Network-Plus landing and existing /network Verified Member Discovery route use a shared access guard. Direct page entry is checked again; the shell's hidden link is not treated as the security boundary.
- Existing /api/v1/talent behavior has not been broadened or rewritten. Its existing explicit public-profile visibility policy remains intact; the guarded Network-Plus UI requires the new access endpoint.
- Entry eligibility is either (a) current active MPA membership, or (b) active membership in a verified organization under an approved organization-role policy.
- A platform role alone, unverified organization, draft registration, expired membership or stale client flag is insufficient.
- Entry access does not grant authority to publish, edit, accept requests, see private contact details or access another user's records. Each action remains resource- and permission-scoped.

## 3. Target routes

| Route | Purpose | Access |
|---|---|---|
| /network-plus | Landing page with two discovery destinations | Eligible member/organization context |
| /network | Existing Verified Member Discovery, reconciled under Network-Plus | Network-Plus access |
| /network-plus/organizations | Verified organization discovery; not the private workspace | Network-Plus access |
| /network-plus/businesses | Business Discovery; later increment | Network-Plus access |
| /network-plus/businesses/:id | Business profile and published offerings; later increment | Network-Plus access |
| /network-plus/services/:id | Commercial/professional service details; later increment | Network-Plus access |
| /network-plus/opportunities | Partnership and collaboration opportunities; later increment | Network-Plus access |
| /network-plus/requests | User's service, referral and collaboration requests; later increment | Participant/resource authorization |
| /network-plus/collaborations | Accepted collaboration workspace; later increment | Authorized participants |
| /organizations | Existing private organization registration and management | Authenticated; resource-scoped actions |
| /serve-community | Public initiatives and volunteering | Public |
| /services | Existing service foundation pending classification and UX reconciliation | Existing policy; do not widen access |

Business routes above are planned destinations, not permission to create business tables before the audit and access-boundary increments are complete.

## 4. Detailed incremental implementation plan

### Increment 0 — baseline and compatibility inventory
1. Record the branch head and inspect current changes before each write.
2. Map canonical identity, membership, organization, verification, service listing, service request and talent inquiry tables/migrations.
3. Map each relevant API route to its service function, authorization policy, visibility rule, audit event and tests.
4. Identify all current consumers of /network, /services, /organizations and /serve-community.
5. Record existing records/lifecycles that must remain unchanged.
6. Keep unresolved assumptions explicit; do not silently infer product policy.

**Exit gate:** no duplicate identity/profile/organization model proposed; each existing route has a documented owner and access policy.  
**Implementation record:** the audit mapped canonical `app_user`/`person`/`professional_profile`/`membership_record`/`verification_claim`, `organization`/`organization_membership`/`organization_verification_case`/evidence, and the separate `talent_inquiry` lifecycle. Private `GET /api/v1/organizations` remains workspace-only; Network-Plus uses a new explicit read endpoint and a bounded projection. No new identity or organization table is introduced.

### Increment 1 — Network-Plus eligibility contract and server boundary (implemented; validation pending)
1. Add a server-owned access resolver checking current membership status/date bounds and active organization-membership records joined to the specific verified organization.
2. Return only minimal eligibility data: eligible/not eligible, eligible context types and a safe next action. Do not expose private member/organization details for navigation.
3. Never infer eligibility from local storage, client role claims, a non-empty organization array, a member role alone or a client-provided organization ID.
4. Enforce the resolver on Network-Plus landing and Verified Member Discovery, including direct URL entry.
5. Keep action authorization separate: entry is not permission to publish, manage an organization, accept requests or view private contact data.
6. Test signed-out, active member, expired/inactive member, organization owner/admin/project_manager, inactive organization membership, unverified organization, multiple organization memberships, unrelated platform roles and stale sessions.

**Exit gate:** server-side tests prove the access decision; direct URL entry cannot bypass it; public Serve-Community routes remain public.  
**Implementation record:** the resolver continues to require current membership dates or an active owner/administrator/project_manager membership joined to a verified organization. The organization directory service repeats the eligibility check before querying. Recruiter/read_only and platform-role-only contexts remain denied. Unit and integration coverage has been added; final CI evidence is pending.

### Increment 2 — top-level navigation and landing UX (initial implementation committed; validation pending)
1. Add Network-Plus to desktop and mobile top-level navigation only after the server access result is known.
2. Do not flash an unauthorized item while access is pending or failed.
3. Add a landing page with two unmistakable destinations: Verified Member Discovery and Business Discovery.
4. Reuse existing visual components, responsive breakpoints, loading/error/empty states and status conventions.
5. Keep private organization management separate from organization discovery.
6. Preserve Jobs, Mentorship, Membership, Serve-Community and Home/logo behavior.

**Exit gate:** desktop/tablet/narrow-mobile browser tests, keyboard/focus checks and no navigation regressions.  
**Implementation record:** the navigation eligibility state is associated with the exact current token so a previous session's positive result cannot flash after a token change. The landing page links to member and organization discovery separately; browser/accessibility validation remains pending.

### Increment 3 — Verified Member Discovery reconciliation
1. Reuse existing talent search, profile and inquiry foundations.
2. Present /network as Verified Member Discovery within Network-Plus and provide a clear return path.
3. Add organization discovery as a separate read-only experience using canonical verified organization records and explicit visibility fields; never reuse the private /organizations response.
4. Keep member and organization results distinct, with separate result types and filters.
5. Preserve opt-in visibility, verified-claim provenance, contact-release consent, inquiry idempotency and participant scoping.
6. Add privacy tests for public, member-only, private, expired-member and organization-context viewers.

**Exit gate:** existing talent tests remain green; organization discovery tests prove visibility and authorization; no duplicate identity storage.  
**Implementation record:** `/network` reuses the existing talent API, profile, saved-search, inquiry, idempotency and consent paths and now has a clear Network-Plus return link. `/network-plus/organizations` uses a separate result type, filters and authenticated API. Organization visibility is `network_plus_visible=false` by default; only an active verified organization with explicit opt-in is returned. Owners/administrators can opt in/out from their existing private workspace with a reason and audit event. The directory never consumes `listMyOrganizations()` and never returns legal name, email, phone, street address, verification evidence, reviewer notes or membership roster. Integration coverage includes public/member-only/private profiles, expired members, organization-context viewers, contact release, inquiry replay/conflict, participant scoping, organization opt-in, role eligibility and opt-out.

### Increment 4 — Business Discovery domain design (approved; no schema in this increment)
1. Define ownership for individual member-owned businesses, organization-owned businesses and any joint ownership.
2. Define business verification evidence, review status, expiry/revalidation and suspension.
3. Define service taxonomy and listing fields: audience, delivery mode, geography, capacity, pricing model/currency, credentials and availability.
4. Define a commercial listing lifecycle distinct from volunteer/impact lifecycle.
5. Define typed requests: service, supplier, referral, expertise, partnership proposal, collaboration and business opportunity.
6. Define consent, notifications, audit, idempotency, withdrawal, dispute, completion and outcome semantics.
7. Decide exactly which existing service workflow primitives can be reused.
8. Classify existing records; do not bulk-convert based on title, category or price alone.

**Exit gate:** project-owner approval recorded 2026-10-31. The approved design is the input contract for Increment 5; legal/compliance policy for regulated categories, retention and jurisdiction-specific disclosures remains a publication gate, not a reason to invent defaults in the schema.

### Increment 5 — business and professional-service models (implementation in progress; additive migration committed)
1. Add business profile and ownership relations only if no canonical equivalent exists.
2. Add professional service listings linked to an authorized business/organization owner.
3. Link provider identity to canonical member/organization records.
4. Add moderation, verification, publication and suspension policies.
5. Add search/list/detail endpoints enforcing Network-Plus access and field-level visibility.
6. Add organization/business-scoped management endpoints with current resource-membership checks.
7. Add audit events, notifications, rate limits and idempotency.
8. Add non-destructive migrations, compatibility checks, rollback notes and fixtures.

**Exit gate:** schema review, migration compatibility, API authorization/privacy tests and duplicate/ownership tests. No production migration.

**Implementation record (2026-10-31; validation pending):**
- Added additive migration `20261031110000_network_plus_business_discovery.sql` for `network_plus_business`, explicit canonical owner relations, business-scoped capability delegation, verification cases/private evidence references, separate commercial service listings, and lifecycle event tables.
- No person, member, professional-profile or organization identity table is duplicated. Business owner parties reference existing `app_user` or `organization` rows. Joint ownership requires a separate pending consent record for each co-owner.
- Added `src/network-plus/business-discovery.js` with business creation/management, ownership consent, explicit manager delegation, business verification submission/review, profile moderation/publication, commercial service listing management/moderation, and bounded discovery projections.
- Added authenticated API routes in `server.js` under `/api/v1/network-plus/businesses`, `/api/v1/network-plus/services` and `/api/v1/admin/network-plus/*`. Discovery and management functions re-resolve Network-Plus access; organization-owned business actions require current owner/administrator membership for the exact organization, while project-manager actions require an explicit business-scoped capability.
- Public discovery projections return published, verified and approved business/listing fields only; they do not serialize ownership parties, contact details, verification evidence or reviewer notes. Listing audience is stored distinctly from public/member/organization identity visibility.
- Added idempotency hashes/fingerprints, persistent rate limits for discovery and creation/submission endpoints, audit-log events, lifecycle event records and in-app reviewer/owner notifications.
- Added `test/platform/network-plus-business-discovery.test.js` and extended `scripts/check-new-migration-compatibility.js` to execute the migration in the disposable-database rollback check and assert core tables, columns, indexes and foreign keys.
- Detailed Increment 5 schema, API, ownership, moderation, rollback and remaining validation record: [docs/59-network-plus-increment-5-business-discovery-implementation.md](59-network-plus-increment-5-business-discovery-implementation.md).
- Existing `service_listing`, `service_request`, Serve-Community impact records and historical data are not altered, backfilled or converted. No production migration was run.

**Known validation/release gates still open:** full PostgreSQL migration execution and rollback, runtime API integration tests against seeded member/organization identities, runtime private-evidence authorization tests, confirmation of reviewer permission assignment through the existing governance workflow, and CI/type/lint/browser checks. The implementation adds private evidence attachment, reviewer metadata listing and a reviewer-scoped authorization path through the existing private-file endpoint; the browser review UI is not part of this increment. Do not mark Increment 5 complete until these are addressed and the full disposable-DB/CI gate passes.

### Increment 6 — request and collaboration lifecycle
1. Support service requests, supplier inquiries, referrals, expertise requests, partnership proposals and collaboration requests as distinct typed intents.
2. Define explicit status transitions: draft/submitted, under review, clarification requested, accepted, declined, withdrawn, in progress, completed, disputed/closed as applicable.
3. Require explicit recipient acceptance. A submitted request is never an agreement.
4. For partnerships, capture purpose, scope, contributions, responsibilities, outputs, timeline and authorized representatives.
5. For service engagements, capture scope, deliverables, pricing/quotation, schedule, acceptance and completion evidence as applicable.
6. Restrict request records to participants and authorized staff under a documented support policy.
7. Create collaboration workspaces only for accepted engagements; track milestones, owners, updates, blockers, decisions and outcomes.
8. Preserve contact privacy, consent, audit history, idempotency and safe retry semantics.

**Exit gate:** lifecycle and role matrices, API/browser journeys, notification tests and participant-privacy tests.

### Increment 7 — Serve-Community separation and public UX
1. Rebuild Serve-Community around initiatives, volunteering, community participation and impact.
2. Remove commercial/business directory language and commercial listing calls to action from its public information architecture.
3. Keep genuine community-benefit initiatives and approved impact services in the public experience under clear community-impact labels.
4. Retain pro-bono, community-discount and capacity-grant semantics only where they belong to approved Serve-Community programmes.
5. Preserve volunteer/initiative lifecycle, consent, participation and aggregate privacy-safe reporting.
6. Classify existing service records through a reviewed decision; do not migrate, hide or relabel records without an approved mapping and reversible plan.

**Exit gate:** public visitors can discover initiatives and volunteer; commercial services are not presented as volunteer initiatives; existing service and impact reports remain correct.

### Increment 8 — quality and release gate
- Backend: authorization matrix, resource ownership, verification, consent, audit, idempotency, lifecycle and privacy tests.
- Frontend: desktop/tablet/mobile, direct URL entry, loading/error/empty states, session expiry and navigation visibility.
- Accessibility: semantic headings/landmarks/labels, keyboard operation, visible focus, WCAG AA contrast, zoom/text scaling, reduced motion and screen-reader status announcements.
- Database: migration compatibility against supported baselines and populated fixtures; no destructive or unreviewed backfill.
- Regression: profile, organization registration/verification, Jobs, Mentorship, Serve-Community, services and reports.
- CI: run after the implementation scope is ready for complete validation; a partial or stale run is not completion evidence.
- Deployment: separate approval and process; this plan authorizes no production deployment or production data mutation.

## 5. Initial role and capability proposal

| Action | Active member | Verified org owner/admin | Project manager | Recruiter/read-only | Support/admin |
|---|---|---|---|---|---|
| Open Network-Plus | Yes | Yes, with active org membership | Yes, with active org membership | Read-only only if approved | Explicit audited operational context |
| Discover opted-in members | Yes | Yes | Yes | Read-only if eligible | Need-to-know only |
| Discover verified organizations | Yes | Yes | Yes | Read-only if eligible | Need-to-know only |
| Create personal business profile | Eligible owner only | Only if separately eligible as member | Only if separately eligible as member | No | No automatic ownership |
| Manage organization business | No, unless authorized for that org | Yes | Only with explicit permission | No by default | No automatic ownership |
| Publish a service listing | Authorized business owner/manager | Authorized verified org manager | Only with explicit permission | No | Moderation role only |
| Submit service/partnership request | Yes | Yes, in selected org context | Yes, in selected org context | No by default | Audited support scope only |
| Accept/manage a request | Participant/authorized owner | Participant/authorized org representative | Only if assigned and permitted | No by default | No automatic participation |
| View private contact/evidence | With consent and need-to-know | With consent and org scope | With consent and explicit scope | No | Documented support authorization and audit |

This matrix is a design proposal, not an implemented grant. Map each capability to the existing permission registry and organization-scoped policy before implementing write actions. Navigation visibility must never grant permissions.

## 6. Required regression scenarios

1. Signed-out visitor cannot open Network-Plus pages/protected APIs; public Serve-Community remains available.
2. Active member can enter Network-Plus while remaining absent from member discovery if directory visibility is disabled.
3. Member discovery returns only profiles whose owners opted into the relevant audience and have eligible verified claims.
4. Expired, suspended or not-yet-started membership does not satisfy active-member access.
5. Verified organization owner/admin/project_manager with active organization membership can enter under the approved policy; inactive membership or unverified organization cannot.
6. Platform role without active member/organization context cannot gain access by editing client state or URL.
7. Multi-organization accounts see only authorized contexts; editing an organization ID cannot cross scope.
8. Organization registration draft is not discoverable or publishable.
9. Existing service request participants retain their current visibility and lifecycle; no service request becomes a business collaboration implicitly.
10. Volunteer initiatives and impact records remain separate from commercial services.
11. Duplicate submissions remain idempotent.
12. Request submission alone never creates an agreement, contract, active partnership or completed outcome.
13. Private contact details are not disclosed before explicit consent and authorized release.
14. Sensitive support/admin access has a documented reason and audit event.
15. Existing profile, organization verification, Jobs, Mentorship and Serve-Community tests remain green.

## 7. Change control and implementation order

1. Complete and maintain this source audit.
2. Implement and test the server-side Network-Plus eligibility resolver.
3. Add conditional top-level navigation and guarded landing/member-discovery routes.
4. Reconcile talent discovery and add a separate verified-organization discovery contract.
5. Only then design and implement Business Discovery data models.
6. Build commercial requests and collaboration lifecycle after the business/service contract is approved.
7. Separate Serve-Community UX and validate both experiences end to end.

Every increment stays on feat/workstream-3-progress-members-workspace. Re-read the branch head and affected files before every write; if the branch changes, reconcile concurrent work rather than overwriting it. Keep PR #18 draft until full scope and acceptance evidence are complete.

## 8. Product/governance decisions still open

- Resolved for this increment: only verified organizations with explicit `network_plus_visible=true` opt-in appear. Existing records default to false; no backfill is performed.
- Whether organization read_only members can enter and exactly what they can see.
- Whether recruiter is eligible for discovery only and whether it has any business/service authority.
- Evidence and review standards for member-owned and organization-owned businesses.
- Commercial service categories, pricing disclosure and boundary between community-benefit and commercial services.
- Whether partnerships need lightweight terms confirmation or remain expressions of interest.
- Contact-release policy for member-to-member and organization-to-organization requests.
- Whether existing published /services records remain public, move to Serve-Community or are individually classified. No bulk decision is assumed.

## 9. Source references inspected

- web/components/shell.tsx — global navigation and client navigation state.
- web/app/network/page.tsx — existing verified talent discovery, inquiries and saved searches.
- src/talent/service.js — talent visibility, verified claims and inquiry authorization.
- src/platform/identity-policy.js — active membership and organization resource capability policies.
- web/app/organizations/page.tsx — organization registration, verification and workspace UI.
- web/app/services/page.tsx and web/app/services/[id]/page.tsx — current service listing/request/delivery workflows.
- src/platform/public-opportunity.js — public Jobs/Mentorship intake, not business collaboration.
- src/services-mentorship/service.js and src/services-mentorship/operations.js — mentorship matching and participant relationship lifecycle.
- web/app/serve-community/page.tsx — current Serve-Community information architecture requiring separation.
- docs/33-public-opportunity-intake.md — public intake contract.
- docs/organization-progress-journey.md — organization workspace progress contract.
- server.js — API dispatch and authentication boundary.
- src/platform/network-plus-access.js and test/platform/network-plus-access.test.js — server-owned entry eligibility and focused policy tests.
- web/components/network-plus-access-guard.tsx, web/app/network/layout.tsx and web/app/network-plus/page.tsx — guarded routes and initial two-experience landing.
- web/components/shell.tsx — conditional top-level navigation.


## 10. Increment 0–3 implementation file map and validation status

| Area | Implementation | Regression coverage |
|---|---|---|
| Schema | `db/migrations/20261030220000_network_plus_organization_visibility.sql` adds one opt-in boolean to canonical `organization`; no new identity table or backfill | Migration compatibility remains to be run |
| Eligibility | `src/platform/network-plus-access.js` remains the server-owned entry resolver; `src/organization-jobs/service.js` enforces it again for organization discovery | `test/platform/network-plus-access.test.js`; PostgreSQL integration tests |
| Organization visibility | `updateNetworkPlusVisibility` limits changes to owner/administrator, requires verified status for opt-in, requires a reason and writes an audit event | `test/p0/network-plus-discovery.integration.test.js`; source-contract assertions |
| Organization directory | `GET /api/v1/network-plus/organizations` returns a bounded safe projection from canonical organization rows | `test/platform/network-plus-discovery-contract.test.js`; PostgreSQL integration tests |
| Member discovery | Existing talent service/API remains authoritative; no parallel profile, claim, inquiry or identity model | `test/p0/network-plus-discovery.integration.test.js` |
| Navigation and UX | `/network`, `/network-plus`, `/network-plus/organizations`, organization workspace visibility control and token-bound navigation | Source-contract tests; `e2e/network-plus-discovery.spec.js` is included in PR Quality; browser and accessibility execution pending |

**Validation boundary:** no CI workflow, production deployment, production migration or live data mutation is authorized by this implementation record. The integration tests require the disposable PostgreSQL database configured by PR Quality. They have been added but no successful execution is evidenced yet. Complete PR Quality, migration compatibility, frontend build/type checks, browser journeys, responsive checks and accessibility checks remain the final validation gate.


## 11. Increment 5 and 6 implementation records

- **Increment 5 — Business Discovery:** `docs/59-network-plus-increment-5-business-discovery-implementation.md`. Additive business ownership, verification, moderation and commercial service listing model. Its validation status remains IN PROGRESS; no production migration is authorized.
- **Increment 6 — Request and Collaboration Lifecycle:** `docs/60-network-plus-increment-6-request-collaboration-implementation.md`. Adds six typed request intents, explicit participant consent, recipient acceptance, transition history, idempotent request decisions, accepted-only collaboration workspaces, milestones, updates, notifications and case-scoped support reads. It adds no conversion of legacy service/mentorship/Jobs/Serve-Community requests.
- Keep PR #18 draft. Do not merge, deploy or run production migrations. The source implementation is not an exit-gate pass until disposable PostgreSQL integration, migration rollback, Playwright, backend checks, frontend build/type checks and manual accessibility/privacy review are evidenced.


## 12. Increment 7 UX prototype status (2026-10-31)

The owner approved the Serve-Community classification policy: only explicitly reviewed and approved community-benefit initiatives appear in the live Serve-Community directory; commercial services remain in Network-Plus; existing records are not automatically converted, deleted, hidden or relabelled. Any legacy classification must be individually reviewed, audited and reversible.

The first public UX prototype is recorded in [docs/61-network-plus-increment-7-serve-community-ux.md](61-network-plus-increment-7-serve-community-ux.md). The public page has been separated from commercial services, Mentorship, Jobs and organization workspace navigation. It includes an interactive search/category filter and accessible sample concept detail dialog. Every sample is visibly labelled as preview-only and cannot be mistaken for a live approved initiative.

**Increment 7 remains IN PROGRESS, NOT PASSED.** The source audit found no public approved-initiative inventory or public volunteer participation API. The existing volunteer-pledge endpoints are private member-owned pledge management; marketplace-demand topics include service and mentorship demand; service impact reports are owner/governance reports. None is silently reused as a public initiative directory. A distinct approved initiative lifecycle, public projection, consent-based participation and audited reversible legacy classification remain required. The UX prototype does not claim to deliver these backend capabilities.


## 13. Increment 7 backend and workflow implementation (2026-10-31)

The distinct Serve-Community initiative and consent-based participation domain has now been implemented on this branch. The implementation includes an additive migration, append-only initiative/participation/consent/classification histories, independent reviewer authorization, owner proposal/edit/submit flows, published-only public discovery, private owner participation decisions, participant withdrawal, and explicit reversible legacy service classification. The public directory now reads the approved-only API instead of illustrative cards. Owner and moderator workspaces are available at `/serve-community/manage` and `/admin/serve-community`.

The legacy classification flow is deliberately opt-in and owner-originated. No service listing was converted or hidden. A legacy service can only be linked to a separately created initiative after owner proposal and independent reviewer approval; reversal changes only the mapping history and never mutates the source service listing.

**Validation remains pending on the exact implementation head.** Do not merge or deploy until the migration compatibility rollback check, backend test suite, type/lint checks, production build and Playwright acceptance all pass. PR #18 remains draft.


## CI remediation record — run 41267820253

- Audited the failed run at source revision `c32ecaf4d00ffdd4449683e4d65a25f02a5ce754`; four jobs failed: Next.js build, backend legacy-schema migration verification, Biome lint and TypeScript.
- Repaired the Community Impact manual-claim migration structure: restored the consent hash constraint and consent fields, created the private evidence table before its indexes/triggers/retention alterations, and removed a duplicated second copy of the claim tables and guards. Consent, evidence provenance, reviewer assignment, immutable history and retention controls remain enforced.
- Removed the build-time dependency on fetching Google Fonts by using local/system font fallback variables; corrected both recognition admin header import paths.
- Corrected claim reviewer API field casing, guarded nullable evidence file identifiers, and typed the scoring-policy JSON variable.
- Applied safe Biome fixes to import ordering, explicit button types, unused imports, the redundant fragment/ternary/boolean casts, and the type-only icon reference. No lint rules or CI gates were disabled.
- Changes are on `feat/workstream-3-progress-members-workspace`. This record does not claim CI has passed: rerun the complete validation against the updated branch head and resolve any newly exposed diagnostics before treating the workstream as ready. No production database or deployment was touched.


## CI remediation record — run 41268897280

- Run 41268897280 executed on `feat/workstream-3-progress-members-workspace` at `d4bbd62bb807040a9bba5177e904ad3c272c75b0` and failed four jobs: Next.js build, Biome, disposable PostgreSQL legacy-schema upgrade, and TypeScript.
- The build and TypeScript failures share one direct source cause: `web/app/organizations/workspace/page.tsx` still types its form handler as `FormEvent`, but the type import had been removed. The `FormEvent` type-only import is restored; no runtime behavior or form permissions changed.
- The migration failure is independent: `20261101280000_community_impact_governed_taxonomies.sql` replaces the `reference_dataset.domain` check and attempts to validate it against pre-existing legacy rows. The expanded constraint is now added `NOT VALID`: existing legacy rows are preserved, while new or changed rows must satisfy the expanded allowed-domain list. No row data is deleted or rewritten. This leaves a future data-review/constraint-validation task rather than silently coercing historic taxonomy values.
- Biome reports 23 blocking `assist/source/organizeImports` diagnostics across server, platform, tests and web files, plus 491 warnings. The warnings are not being suppressed and lint rules are not being weakened. The import-order blockers still require safe formatting-only corrections and a fresh Biome run; this remediation record does not claim the lint gate is fixed.
- The workflow's legacy-schema baseline safety check behaved as designed. It is not an error to remove or bypass.
- Changes remain on the existing branch. No production database, production deployment, merge, force-push or branch operation was performed. Build, TypeScript, migration and lint must be rerun on the new commit before declaring the run resolved.
