# Increment 8 — Network-Plus quality and release gate

**Repository:** mpaproject1/MPA-Professionals-Network  
**Branch:** feat/workstream-3-progress-members-workspace  
**PR:** #18 (draft; no merge or deployment)

## 1. Safety contract

- Backend policy is authoritative on every read and mutation. Navigation visibility, client state, URL obscurity and role labels never grant access.
- Preserve existing membership, organization verification, Jobs, Mentorship, commercial services, service requests, Serve-Community, reports, audit and idempotency contracts.
- No production database, production data, deployment, migration or backfill is authorized.
- CI uses disposable PostgreSQL and deterministic non-production fixtures only. Never use production accounts, evidence, contact details or private records as fixtures.
- A request, application, inquiry, proposal or submission is not an agreement, contract, active partnership, membership activation or completed outcome.
- Do not delete, weaken, skip, broadly loosen or relabel a failing test to obtain a green result. A skipped test is not passing evidence.
- Every result is tied to the exact branch-head SHA. Stale, partial, cancelled, skipped or missing jobs are not completion evidence.

## 2. Authorization model and capability mapping

This matrix is the policy contract to verify, not a permission grant. Before adding or changing a write grant, map it to the existing permission catalogue and organization-scoped policy. Reuse exact existing permissions where appropriate; do not create a parallel role system or infer permissions from navigation.

| Capability | Active member | Verified organization owner/admin | Project manager | Recruiter / read-only | Support / platform admin |
|---|---|---|---|---|---|
| Enter Network-Plus | Active membership required | Active membership in selected verified organization required | Active membership in selected verified organization required | Read-only only where explicitly authorized and scoped | Need-to-know only; privileged access requires explicit support/admin authority |
| Discover opted-in members | Only audience-eligible profiles | Same, plus organization-purpose scope | Same, plus explicit organization-purpose scope | Read-only only if directory policy permits | No unrestricted directory browsing; documented need-to-know only |
| Discover verified organizations | Yes, subject to public/verified visibility | Yes | Yes | Approved read-only scope only | Need-to-know only |
| Create personal business profile | Eligible owner who independently meets member policy | Only if separately eligible as a member | Only if separately eligible as a member | No | No automatic ownership |
| Manage organization business profile | No, unless separately authorized for that organization | Owner/admin with active organization membership | Explicit organization-scoped management permission only | No by default | No automatic ownership |
| Publish service listing | Authorized personal business owner or organization manager, subject to verification | Authorized verified organization manager | Explicit organization-scoped permission only | No | Moderation only; no implied ownership |
| Submit request / inquiry / proposal | Yes, within workflow eligibility | Yes, in explicitly selected authorized organization context | Yes, in explicitly selected authorized organization context | No by default | Only through separately granted, audited support workflow |
| Accept / manage a request | Participant or resource owner with exact workflow permission | Participant or authorized organization representative | Only if assigned and permitted for that resource | No by default | No automatic participation or decision authority |
| View private contact / evidence | Own record or explicit consent and need-to-know relationship | Consent plus selected organization scope | Consent plus explicit assignment/scope | No by default | Documented, time-bounded, case-specific support authorization and audit required |

For every protected route/action, record: HTTP method; resource owner and organization/job/request relationship; exact existing permission codes; active membership and organization-membership predicates (including start/end dates and suspension); organization verification/public visibility; consent and purpose; audit actor/reason/resource; idempotency key/fingerprint; expected allow and deny cases. Platform role alone must not grant Network-Plus access without active member or organization context. Support/admin access must not create ownership, participation or consent.

Preserve Phase 1 separation in docs/43-pr18-phase-1-authorization-and-role-reconciliation.md: membership review/activation are distinct from finance payment verification/reversal; finance permissions do not grant membership decisions. Recruiter/project-manager reports remain organization/job-team scoped and aggregate-only.

## 3. Backend verification matrix

Exercise service functions and authenticated HTTP routes against disposable PostgreSQL; static source assertions alone are insufficient.

| Area | Positive cases | Negative / adversarial cases | Required evidence |
|---|---|---|---|
| Authentication and entry | Eligible active member; verified organization owner/admin/project manager with active org membership | Signed out; invalid/expired token; inactive, future-start, expired or suspended membership; platform role without qualifying context | API decisions, response projection and direct browser entry |
| Resource ownership | Owner, participant, assigned reviewer or authorized organization representative | Substitute another user's UUID or organization/job/request ID; access unrelated tenant | Two-or-more-organization fixtures and direct API assertions |
| Verification | Verified, publicly visible organization and eligible verified professional claim | Draft, pending, rejected, suspended or unverified organization/claim | Lifecycle fixtures prove no premature discovery/publishing |
| Consent and privacy | Current explicit consent for the stated purpose/audience | Missing/withdrawn consent, replaced notice version, unrelated viewer, consent for another purpose | Field-level response assertions and immutable consent history |
| Audit and support | Authorized, reasoned, case-specific support action | Missing reason, wrong case, expired grant, unrelated resource, support role without grant | Immutable audit record with actor, reason, scope, expiry and action |
| Idempotency | Same key and payload returns original logical result | Same key with changed payload; concurrent duplicate; retry after uncertain response | Exactly one business record and stable response |
| Lifecycle | Every documented transition by authorized actor | Skipped/reverse transition, self-approval, duplicate terminal action, transition after expiry | State/event history, authorization and notification assertions |
| Privacy projections | Each role receives only fields needed for its task | Private email/phone/evidence/notes in public, unrelated-organization or read-only response | Explicit field allowlist/denylist assertions on API and exports |

For writes, test both service and API guards. Include concurrency tests for capacity, one-active-application constraints, duplicate decisions and idempotency. Failed transactions must leave no partial domain rows or misleading audit/notification side effects.

## 4. Frontend and browser acceptance

- Desktop, tablet and narrow mobile coverage for Network-Plus discovery, organization context selection, service listing/request, request/collaboration progress, mentorship, Jobs and Serve-Community.
- Direct URL entry for every protected page from a fresh signed-out browser and after session expiry.
- Loading, error, retry, empty, permission-denied, not-found, stale-session and success states.
- Navigation is recalculated from current /api/v1/me data; stale token claims or modified client state cannot reveal protected data.
- Multi-organization switching changes the active scope and dataset. Back/forward and deep links cannot preserve unauthorized organization data.
- Duplicate submit, slow response, interruption and retry cannot create duplicate requests or agreements.
- Applicant, provider, mentor, organization owner, recruiter, interviewer, reviewer and support journeys expose only fields/actions permitted by their relationship and scope.

### Existing environment-backed role-suite gap

e2e/p2-role-journeys.spec.js is explicitly disabled unless MPA_E2E_ROLE_JOURNEYS=1 and dedicated MPA_E2E_* non-production accounts/fixtures are configured. The current PR Quality workflow does not run this file. Do not count it as covered by the current browser job.

Before release acceptance, either provision isolated disposable role accounts and private organization/file fixtures and run the suite against a non-production environment, or replace its environment dependency with deterministic fixtures that exercise the real backend authorization decisions (do not mock the authorization decision itself). If neither is available, mark role journeys BLOCKED. Never use production data.

## 5. Accessibility acceptance

Apply to all changed journeys and shared navigation, dialogs, forms, tables, status updates and notifications.

- Semantic landmarks and heading hierarchy; one clear page-level heading.
- Programmatic labels, descriptions and error associations for every input; native button/link semantics.
- Full keyboard operation, logical focus order, visible focus, no traps, and focus return after dialogs close.
- WCAG 2.2 AA contrast for text, controls, borders, focus indicators and status; status never relies on color alone.
- Reflow at 320 CSS px and 200% text zoom/browser text scaling without loss of content or unnecessary two-dimensional scrolling.
- Reduced-motion preference respected; essential state never conveyed only through animation.
- Loading, validation, success, failure and asynchronous status changes announced through suitable live regions without repetitive announcements.
- Screen-reader names, roles, values and expanded/selected/disabled states correct for navigation, menus, tabs, dialogs and controls.
- Automated axe/WCAG scans supplement, but do not replace, keyboard and screen-reader checks.

Record viewport, browser, assistive technology, route, observed issue and remediation for manual checks. A successful build is not accessibility evidence.

## 6. Database and migration acceptance

- Apply all pending migrations to a clean disposable PostgreSQL database.
- Upgrade a supported legacy baseline with populated fixtures and sentinel rows; verify preserved records, references, ownership, membership and audit history.
- Run migration compatibility/rollback checks against an explicitly confirmed disposable database.
- Verify constraints, foreign keys, indexes, partial unique indexes, triggers, immutable event histories and transaction rollback.
- Rerun migrations and prove idempotency; no duplicate ledger entries or data changes.
- Force a migration failure after schema changes and prove both DDL and migration-ledger writes roll back.
- Verify additive-only behavior: no destructive changes, unreviewed backfill, automatic role grants, or conversion of commercial services into Serve-Community initiatives.
- Fixtures include active/future/expired/suspended memberships; verified/unverified organizations; multiple organizations; private/public listings; consent granted/withdrawn; duplicate/replayed requests; and legacy service records.
- Never run checks against production or shared staging databases.

## 7. Required regression scenarios

1. Signed-out visitor cannot open Network-Plus pages/protected APIs; public Serve-Community remains available.
2. Active member can enter Network-Plus while absent from member discovery when directory visibility is disabled.
3. Member discovery returns only profiles whose owners opted into the relevant audience and whose required claims are eligible/verified.
4. Expired, suspended and not-yet-started membership does not satisfy active-member access.
5. Verified organization owner/admin/project manager with active organization membership enters only under approved policy; inactive membership or unverified organization is denied.
6. Platform role without active member/organization context cannot gain access by editing client state, token display claims or URL.
7. Multi-organization accounts see only authorized contexts; replacing organization ID cannot cross scope.
8. Organization registration draft is neither discoverable nor publishable.
9. Existing service-request participants retain visibility and lifecycle; no service request becomes a business collaboration implicitly.
10. Volunteer initiatives and impact records remain separate from commercial services and Network-Plus requests.
11. Duplicate submissions remain idempotent, including concurrent retries and same-key/different-payload rejection.
12. Submission alone never creates an agreement, contract, active partnership, accepted collaboration or completed outcome.
13. Private contact details are not disclosed before explicit current purpose-specific consent and authorized release; withdrawal stops future disclosure without erasing audit history.
14. Sensitive support/admin access requires a documented reason and case/resource-scoped grant, and creates an audit event.
15. Existing profile, organization registration/verification, Jobs, Mentorship, Serve-Community, services, requests, finance/membership separation and reports remain green.

Every scenario must map to at least one named backend test and, where user-facing, one browser test. An unmapped or unexecuted scenario remains open.

## 8. CI and exact-SHA release evidence

The current .github/workflows/pr-quality.yml provides Biome, TypeScript, disposable-PostgreSQL backend tests (including legacy upgrade and migration compatibility), Next.js production build and a selected Playwright acceptance list.

Known gaps:
- The workflow does not run e2e/p2-role-journeys.spec.js; its own comments state isolated role fixtures are not configured.
- The browser job runs selected specs, not the complete e2e/ suite.
- No dedicated automated axe/WCAG job or recorded manual screen-reader evidence artifact is present.
- The selected browser list does not prove every scenario in Section 7.
- A green CI result cannot establish environment-backed role or manual accessibility gates unless they actually execute and evidence is reviewed.

A release candidate is ready only when all items below pass on the same final head SHA:

- [ ] All current PR Quality jobs pass; none missing, cancelled, stale or skipped in a way that hides required coverage.
- [ ] Backend PostgreSQL integration tests cover authorization, ownership, consent, audit, idempotency, lifecycle and privacy.
- [ ] Clean install, populated legacy upgrade, rollback/failure atomicity and rerun idempotency pass.
- [ ] Biome, TypeScript and production build pass.
- [ ] Browser acceptance for changed workflows passes at desktop/tablet/mobile, including direct URLs, session expiry and all states.
- [ ] Environment-backed role journeys or equivalent deterministic real-backend fixture suite execute and pass.
- [ ] Accessibility automation and manual keyboard/zoom/reduced-motion/screen-reader checks pass with recorded evidence.
- [ ] All 15 regression scenarios map to executed tests; no unresolved P0/P1 regression remains.
- [ ] Branch head and PR diff are reviewed after CI; no new commit supersedes the evidence.

CI is pre-deployment only. It must not deploy, migrate production or mutate production data. Deployment requires separate explicit approval and process.

## 9. Current readiness snapshot

| Gate | Current evidence | State |
|---|---|---|
| Backend implementation/tests | Source and tests exist; full PostgreSQL execution on current head not evidenced | Await CI |
| Authorization matrix | Phase 1 permission separation and scoped report integration coverage documented; full cross-domain role-to-policy test mapping remains | Open |
| Browser journeys | Selected API-backed Playwright specs; real role suite excluded pending isolated fixtures | Open |
| Accessibility | No dedicated axe job or complete manual evidence in current workflow | Open |
| Database compatibility | Clean install and legacy upgrade/rollback checks are defined; current-head execution not evidenced | Await CI |
| Regression scenarios | Requirements defined here; every scenario is not yet mapped to a named executed test | Open |
| Deployment | Not authorized | Not authorized |

**Handoff:** the user may initiate CI after reviewing this contract. Initiating CI is not acceptance. Any gate not executed or lacking evidence remains blocked/open; Increment 8 must not be declared complete until all gates pass.
