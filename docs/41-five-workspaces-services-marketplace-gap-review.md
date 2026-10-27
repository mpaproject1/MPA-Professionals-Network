# Five Workspaces, Services and Marketplace — Gap Review and Recommended Workflow

**Scope:** source-informed planning for the current MPA Professionals Network branch. This document does not claim browser/API acceptance or production readiness. Keep PR #5 open and draft; no merge, deployment, or production database changes.

## Executive finding

The application already has meaningful foundations for service listings and requests, mentorship offers/requests, job applications and interviews, saved discovery items, notifications, organization outcome reporting, demand topics/interests, moderation, and audit events. These are separate domain flows, not yet one consistently complete five-workspace product.

The principal product gap is continuity: users can discover or request something, but the system needs a consistent, auditable path from **request → agreed scope → active delivery → evidence/outcome → requester confirmation → closure or dispute**. A public marketplace must not imply that a request is a confirmed contract or that a listed service has been delivered.

## 1. Member workspace

| Capability | Source-level position | Gap / recommended difference |
|---|---|---|
| Member and non-member dashboard | Personal outcome workspace aggregates jobs, services, mentorship and inquiries in `src/platform/stakeholder-outcomes.js`. | Confirm the UI provides one clear personalized home for both account types. Non-members should see profile, public opportunities, saved items and their own requests; member-only capabilities should be labelled with the exact eligibility rule, not hide profile editing. |
| Professional profile | Applicant profile updates are allowed before active membership; verification remains membership-gated. | Verify all fields, responsive form feedback, location granularity and privacy settings in browser/API tests. |
| CV / portfolio and employer-specific sharing | Added a private CV vault at `/member/cv`, private file validation, explicit attachment to a selected application, employer access through the authorized application scope, audited download, sharing history and revocation. Replacing/removing the saved CV withdraws existing CV attachments. | Validate the new migration and attachment schema; run negative cross-organization tests, browser checks, and confirm historical downloaded copies cannot be recalled. The CV is never published automatically. |
| Find and save opportunities | Opportunity discovery and saved discovery-item services exist. | Validate search/filter, eligibility, deadlines, verification state, empty/error/retry states and every supported item type. |
| My applications | Application and interview data are present in the outcome workspace. | Confirm additional-information requests, withdrawal, decision history and notifications all have real persisted transitions and clear next actions. |
| My mentoring | Mentorship entities include goals, sessions and progress counts. | Verify member-facing mentor details, consent, session notes/feedback, rematching and confidentiality. |
| My learning | A complete learning/assignment/assessment lifecycle is not established by the reviewed source. | Show “Coming soon” without fake registration or completion controls until a real persisted learning workflow exists. |
| Saved items, notifications, account/privacy/help | Supporting services exist in parts of the codebase. | Confirm unified coverage across opportunity, mentor, learning, adviser, profile, consent, session management, preferences and account closure. |

**Member UX rule:** a non-member may maintain their own profile and use public discovery. Explain membership benefits and restricted actions in place; do not block ordinary profile editing or suggest that membership guarantees employment.

## 2. Employment and employer workspace

| Capability | Source-level position | Gap / recommended difference |
|---|---|---|
| Employer registration and verification | Organization registration, verification case and public/private organization projections exist. | Test evidence upload, return-for-correction, rejection, verified state and notifications as one journey. |
| Employer dashboard | Organization outcome aggregation includes jobs, pipeline, interviews, offers and hires. | Ensure dashboard cards link to the exact scoped queue and show overdue/awaiting-action counts without leaking other organizations' records. |
| Create opportunity | Job/requisition services exist. | Validate all required fields, eligibility, compensation disclosure, deadlines, contact visibility and draft/review/verified/returned/rejected/paused/closed states. |
| Applicant management | Job applications, interview records and outcome reporting exist. | Run negative API tests using another organization's job/application/interview IDs for every read/write endpoint. Validate reviewer/recruiter permissions and private profile consent. |
| Outcomes | Interview, offer, acceptance and hire metrics exist in organization outcome reporting. | Confirm authorised staff can record outcome evidence and dates, and that reports distinguish self-reported outcomes from independently confirmed outcomes. |
| Partnerships | Organization mentorship offers and other demand mechanisms exist. | Use a dedicated partnership request with owner, objective, scope, expected contribution, timeline, status and outcome instead of free-text messages that cannot be tracked. |

## 3. Mentorship workspace

The source has mentorship transitions, matching/session helpers, organization mentorship offers and organization mentorship requests. That is a useful foundation, but these should not be presented as one complete programme without checking the UI and all transition routes.

Required acceptance:
- Mentor application records expertise, experience, languages, availability, boundaries and conduct agreement.
- Mentee application records goals, preferences, availability and expectations.
- A coordinator proposes a match; each party separately accepts; the relationship remains proposed until both consent.
- Active plans persist goals, sessions, attendance and action items.
- Completion requires an outcome/feedback step; extension and rematching retain history and do not expose confidential notes to unauthorised parties.
- A confidential concern route must be separated from ordinary mentor/mentee messages.

**Gap:** browser/API acceptance of the complete mentor, mentee, coordinator, consent, session, concern and rematching journeys is still required. Existing organization mentorship requests are not proof that every individual mentorship flow is complete.

## 4. Service workspace — what it should do

The service domain is more than a directory. Current source in `src/services-mentorship/service.js` supports moderated service listings, listing status, requester/provider checks, idempotent requests, duplicate protection, request events, proposed scope/price/currency/dates, and completion confirmation helpers. Service requests have a persisted lifecycle and requester/provider access logic.

Recommended service journey:

1. **Publish an offer:** provider defines service, deliverables, delivery mode, indicative price or “discuss first”, availability, eligibility and visibility. MPA moderation/organization verification is shown separately from professional credentials.
2. **Request service:** requester states the need, expected outcome, timing and optional budget. This is an inquiry, not yet an agreed deal.
3. **Clarify and agree:** requester and provider confirm scope, deliverables, price/currency (or explicitly pro bono), milestones, due dates, communication channel and cancellation/dispute terms. Save a dated agreement snapshot.
4. **Accept and start:** only an authorised provider accepts; mark in progress after both sides have seen the agreed scope.
5. **Deliver:** provider records milestone updates and attaches appropriately private evidence or deliverables. Never publish private attachments to the marketplace.
6. **Confirm outcome:** provider marks delivered; requester confirms, requests revision with a reason, or opens a dispute. No silent closure and no unilateral “completed” claim treated as both parties' confirmation.
7. **Close and learn:** preserve the full event history, feedback, optional consented impact metrics, and cancellation/no-show/dispute reasons. Nonprofit reporting uses aggregated, privacy-safe counts.

**Gaps to verify/finish:** whether every API route enforces participant and organization scope; whether the UI exposes the whole lifecycle; whether the agreed terms are immutable snapshots; whether disputes, revisions, cancellation, timeout/escalation and notifications are persisted and tested; and whether the completion rules are consistent for paid and pro-bono requests. Do not describe helper functions alone as end-to-end completion.

## 5. Marketplace — purpose and distinction

The marketplace is the **discovery and matching layer** across services, demand, and potentially approved opportunities. It is not itself the service-delivery workflow.

| Area | Primary question | What belongs there |
|---|---|---|
| Marketplace | “What help, expertise, opportunity or collaboration is available or needed?” | Search and filters; approved provider/service cards; organisation requests; public aggregate demand; clear verification/moderation and eligibility labels; request-introduction action. |
| Service workspace | “What exactly did these two parties agree to do, and was it delivered?” | Private request, scope, price/pro-bono terms, milestones, evidence, revisions, confirmation, cancellation/dispute and outcome history. |
| Mentorship workspace | “Is there a consensual developmental relationship, and is it progressing safely?” | Matching, dual consent, goals, sessions, actions, feedback, concerns, extension and rematching. |
| Organization workspace | “What is this organization authorised to manage?” | Own vacancies, applicants, service requests, partnership requests, assigned staff and its own outcomes. |
| Support/admin | “Is this safe, fair, authorised and auditable?” | Consent-safe demand review, moderation, complaints/escalation, access decisions, audit and aggregate impact reporting. |

**Employer partnership boundary:** the current Employer workspace links to the persisted organization mentorship offer/request workflow. A separate general-purpose employer partnership lifecycle (proposal, scope, owner, milestones, agreement, outcomes and closure) is not yet implemented; do not label mentorship requests as generic partnership agreements.

**Nonprofit objective:** marketplace success is not maximising transaction volume. Measure needs matched, useful services delivered, people/organisations supported, completion and satisfaction, geographic/language inclusion, pro-bono contribution where voluntarily disclosed, and unresolved requests. Avoid exposing member contact details or turning every connection into a fee-bearing transaction.

### Can an organization request a service and track it becoming a deal and then executed?

Yes—recommended as a first-class **Organization Service Request** workflow. It should connect to an existing service listing but have its own reference and event history. Do not infer a deal merely because an organization clicked “contact” or a provider accepted an inquiry.

Recommended status language:
- **Request sent** — private request created, provider not yet responded.
- **Clarifying details** — one or both parties need to define scope.
- **Proposal ready** — provider submitted deliverables, price/pro-bono terms and schedule.
- **Agreement confirmed** — both authorised parties accepted the same saved terms.
- **In progress** — work started against the confirmed terms.
- **Delivered — awaiting confirmation** — provider submitted outcome evidence.
- **Revision requested** — requester explained what remains outstanding.
- **Completed** — requester confirmed delivery, or a clearly disclosed independent resolution rule applied.
- **Cancelled / declined / disputed** — terminal or managed exception with reason and next action.

For every transition save: request reference, acting user and organisation, prior/new status, timestamp, reason, agreement version, notification outcome and relevant evidence references. Enforce idempotency and participant/organization scope. An organisation may see its own request and authorized team; the provider sees only requests addressed to them; public users see no private deal records. Support can inspect only under explicit permission and must log access/decision actions.

## 6. Phase 3 role-specific gaps to close before marking complete

1. **Organization/recruiter:** direct negative API tests for cross-organization job, application, interview, candidate and team IDs; permission-by-permission acceptance; browser tests for the real recruiter journey.
2. **Reviewer:** route-by-route test inventory for decisions, checklist items, appeals, references and private evidence; assignment/reassignment history and conflict-of-interest tests.
3. **Support Desk:** manager-controlled transfer is now implemented in source with recipient validation and audit reason. Still missing: schema-backed priority, escalation policy, waiting-on-member/organization states, notification delivery proof, and negative tests for consent-safe demand sharing/private attachments.
4. **Finance:** deliberately blocked until MPA confirms separation of duties. Do not silently decide who reviews applications, verifies payments, reverses payments or activates membership. After approval, implement the finance-first exception queue and test duplicate, wrong amount/currency, reversal and unrelated-record isolation.
5. **Administrator:** audit list API/UI exists, but completeness across every mutation, before/after detail, mandatory reason, failed attempts, retention/access policy and runtime schema compatibility are not proven. Add an audit coverage inventory and verify each mutation.
6. **Five workspaces:** this is a source-informed gap map, not a claim that every requested screen has been built or browser-tested. The workspace navigation should reveal only real capabilities and show “Coming soon” for non-existent learning/other flows.

## Acceptance bar

Do not mark a gap complete based only on source-pattern tests. For each role and workflow require: service/API permission tests (including negative cross-tenant IDs), safe test-database integration tests, browser journey tests, verified audit/event history, and explicit evidence of error/retry/empty states. Run CI after the agreed Phase 3 implementation set is complete. No production deployment or production DB changes are authorised by this work.
