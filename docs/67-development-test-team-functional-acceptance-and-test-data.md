# Development Test Team — Functional Acceptance, Scenario Portfolio and Disposable Test Data

**Status:** Test-team operating specification and acceptance plan  
**Target branch:** `feat/workstream-3-progress-members-workspace`  
**Branch inspected:** `2f7a29b1e34db00d6cdabe0faf226b935d6bc200`  
**Audience:** MPA product owners, QA/test team, developers, administrators and operational reviewers  
**Environment:** Isolated development/test deployment only. This document does not authorize production seeding, production push delivery, real payment collection or destructive operations.

---

## 1. Purpose and test-team outcome

This document gives testers a repeatable way to explore the MPA platform as realistic users, verify the workflows that are actually present, capture evidence, report defects and safely remove the data created during a test cycle.

The target is not to populate development with arbitrary records. The target is a **coherent, linked portfolio of synthetic people, organizations, memberships, verification cases, jobs, service offers, mentorship journeys, community initiatives, notifications and supporting evidence**. Testers should be able to sign in using role-specific accounts and follow records from creation through review, approval, completion, reporting and audit.

The test environment must make it possible to:
- understand which functions are available to each type of user;
- test both successful and rejected/edge-case journeys;
- see the difference between authentication, membership, professional verification and role authorization;
- test mobile/PWA and desktop experiences;
- inspect evidence and workflow history without accessing unrelated users' private records;
- identify incomplete or externally dependent functions rather than treating a visible page as proof of a working backend;
- reset all generated test records and test accounts from one clearly labelled administrative action, with preview and safeguards.

**Important:** The current request is to write the test specification on this branch. It does not create test accounts, set passwords, seed the database, enable cron, activate push campaigns, or implement the proposed Test Lab/reset/export interface.

## 2. Repository baseline and how to interpret this plan

The inspected branch contains a substantial backend, web application, migrations, unit/integration tests and Playwright E2E tests. Relevant code areas include:
- `src/membership`, `src/membership-import`, `src/verification`, `src/talent`;
- `src/organization-jobs`, `src/services-mentorship`, `src/network-plus`;
- `src/platform` services for authentication, account security, audit, notifications, reports, finance receipts, private file storage, web push, referrals, community campaigns, impact/recognition, public opportunity intake and administration;
- `web/app` public, member, job, mentorship, marketplace, community-impact, notification and administrator routes;
- `test/` backend and integration suites and `e2e/` Playwright suites.

The repository already has a manual test/release policy. GitHub Actions CI was removed by a documented maintainer decision; tests remain and must be run manually. A green build or a historical workflow run is not evidence that the current branch passes.

### 2.1 Evidence labels used in this document

Use one of these labels for every capability and test result:

| Label | Meaning |
|---|---|
| **Implemented — verify** | A route/service/schema/test exists in this branch. QA must still execute the end-to-end user journey. |
| **Partially implemented / bounded** | Some workflow stages exist; known gaps, role boundaries or missing integration must be recorded. |
| **External dependency** | Requires a configured provider, worker, cron, browser permission, email gateway or payment sandbox. |
| **Documented / not proven live** | Appears in requirements/traceability but this inspection did not establish a complete operational path. |
| **Not available / blocked** | Do not ask testers to report this as a working feature. Record as a gap or future test. |

A test is **PASS** only when the tester executed it against the recorded branch/build, used the intended role, observed the expected result and attached evidence. A planned test, a page that renders, a unit test, or an HTTP 200 alone is not a functional PASS.

### 2.2 Important known boundaries to preserve

1. Membership status, professional verification, account state and platform roles are separate. A member is not automatically a reviewer, finance officer or organization administrator.
2. Organization privileges require an explicit active organization membership/assignment and are scoped to that organization. A profile's organization name grants no access.
3. API authorization is authoritative. Hiding a button is not security; testers must attempt direct URL and API access.
4. Private verification evidence must not become public or be copied into public talent/job views. Evidence reads must be restricted and audited.
5. Role changes must revoke sessions; current database roles, not stale token claims, determine authority. Self-role changes and removal of the final system administrator are prohibited.
6. The unified workspace is an entry/navigation layer, not a replacement queue or a promise that every role has complete task counts. The role-workspace status document explicitly records incomplete scoped recruiter/project-manager/read-only workspaces and the missing dedicated ethics-case workflow. Testers must record those as bounded gaps.
7. PWA push requires browser permission, subscription and configured VAPID/worker infrastructure. It cannot override device silent mode, Do Not Disturb or OS settings and is not a guaranteed alarm.
8. Community contribution campaigns are seeded as drafts and default disabled/paused. Approval, schedule activation and delivery are separate steps. Do not activate campaigns on a shared environment without a test owner and explicit approval.
9. Traceability documents mention Events, Projects, Donations/Payments, Field Evidence and Moodle. Treat these as **discovery/contract tests until a complete working route and integration are confirmed in this branch**; do not fabricate a successful live workflow based only on a requirements row.

## 3. User roles and accounts required for testing

The test account portfolio must represent distinct authority boundaries. Do not give every tester an administrator account.

| Account persona | Intended access | Main tests |
|---|---|---|
| Public visitor | No sign-in | Landing pages, public jobs, public opportunities, public organization information, community updates opt-in |
| Applicant / basic account | Authenticated; no membership assumed | Registration, login, recovery, application tracking, profile completion |
| Member — incomplete | Account with incomplete member profile | Guided completion, saved progress, validation and staff-assisted completion |
| Member — pending payment | Membership application awaiting payment/verification | Payment options, manual payment evidence, status visibility and reminders |
| Active member — unverified professional | Active membership, no professional verification | Member workspace, profile privacy, verification application |
| Active member — verified professional | Active membership and approved professional verification | Talent visibility/consent, eligible jobs, mentor eligibility and member services |
| Membership reviewer | Explicit membership-review permission | Membership queue, request correction, approve/reject, audit and conflict boundaries |
| Verification reviewer | Explicit verification-review permission and assigned case | Evidence access, checklist, decision, reason, reassignment/appeal boundaries |
| Appeal reviewer | Independent appeal permission | Appeal review, independence from original decision-maker |
| Finance officer | Finance-specific permission | Payment verification, receipt/voucher, reconciliation and scoped finance reports |
| Organization representative | Organization application and authorized organization access | Organization onboarding, evidence, verification status and authorized workspace |
| Organization owner/admin | Active scoped organization membership | Manage own organization members/settings where supported; cross-org denial |
| Recruiter / hiring manager | Explicit job/team assignment | Assigned vacancy, candidates, interview/screening/offer workflow where enabled |
| Mentor | Eligible verified profile and mentorship capability | Offer, availability, request, match, sessions and feedback |
| Mentee | Eligible account | Discover mentor, request, accept/decline, sessions and outcome |
| Support staff | Specific support permission | Authorized help, case access, staff-assisted profile completion |
| Field officer / project participant | Only if implemented and explicitly scoped | Assigned initiative/project evidence and restricted update |
| Platform administrator | Platform operational permission | Account governance, content, configuration and authorized reports |
| System administrator | Highest privileged account; tightly limited | Privileged role assignment, permission management, security controls |

**Do not use a shared super-admin credential for routine testing.** Give the QA lead a separate, protected administrator account; testers should use individual role accounts so audit attribution is meaningful.

## 4. Proposed Test Lab: one-click disposable data lifecycle

### 4.1 Required administrator interface

Add a dedicated **Admin → Test Lab** (or **Admin → Development Test Data**) page. It must be visible only to an authorized system administrator or a specifically granted test-data administrator permission. Do not put reset controls inside ordinary membership, finance or campaign screens.

The page should provide these explicit actions:
- **Create test portfolio** — create the named scenario pack, synthetic accounts, linked records and evidence files.
- **Preview test portfolio** — show record counts, linked modules, account roles, file sizes and external side effects before creation.
- **Export test accounts (.xlsx)** — generate a one-time or time-limited workbook for the QA lead.
- **Download scenario/evidence index** — provide test case IDs, expected states and synthetic evidence filenames; never include private production records.
- **Reset this portfolio** — delete only records owned by the selected test portfolio.
- **Reset all test portfolios** — stronger confirmation and administrator reason required.
- **Pause test notifications / external integrations** — stop test sends and external provider calls without deleting records.
- **View reset history** — who initiated, approved and completed reset, when, portfolio ID, counts and any failures.

If implementation cannot yet provide all these actions, document the missing control as a release blocker for shared test-team use. Until then, only a developer may clean up a dedicated disposable database using a reviewed reset script.

### 4.2 Test data ownership and deletion safety

Every generated record must be linked to an immutable `test_run_id` / `test_portfolio_id` and carry an explicit test marker, e.g. `is_test_data` or an equivalent server-owned provenance field. The marker must never be accepted from an untrusted public request as proof that a record can be deleted.

The portfolio registry should store:
- unique portfolio ID and human-readable name;
- environment and branch/commit SHA;
- creator, creation time, expiry time and status;
- test account IDs and generated record IDs by module;
- file object keys and byte totals;
- notification/outbox IDs and external side-effect status;
- cleanup status, counts and audit events.

All test data must use synthetic names, reserved test email domains (for example `example.test`), fictional telephone numbers and non-real addresses. Do not use actual member data, real identity documents, real bank details, real CVs or personal contact details.

### 4.3 One-click reset safety requirements

The reset action must be implemented as a server-side, transactional, scoped operation—not a client-side loop that calls ordinary delete endpoints.

Before execution:
1. Require an authenticated privileged actor and fresh authorization.
2. Require the environment to identify itself as development/test; hard-block production by server configuration and environment guard.
3. Require a selected portfolio ID and show a deletion preview.
4. Require typed confirmation containing the portfolio name or ID; for global reset require an additional confirmation and reason.
5. Show the number of users, memberships, applications, organizations, files, financial/test transactions, notifications and other records to be removed.
6. Block reset if any record is linked to a non-test user, non-test organization, production provider transaction or record outside the portfolio.
7. Cancel pending test email/push jobs and scheduled campaign deliveries before removing their parent data.
8. Ensure file deletion is limited to object keys registered to the portfolio. Never recursively delete a shared storage directory.

During reset:
- delete in dependency-safe order or use explicit cascade rules verified by tests;
- revoke sessions, API tokens, Web Push subscriptions and recovery tokens for test accounts;
- remove queued jobs, outbox deliveries and notification inbox entries;
- remove private files from storage and their database references;
- delete synthetic account and business records;
- retain a minimal immutable reset audit record (portfolio ID, actor, time, counts and result) without retaining deleted personal/test secrets;
- report partial failures and allow safe retry; reset must be idempotent.

**Financial safeguards:** test payment rows must be marked as simulated. No reset may issue a real refund, void a real provider transaction, send a real payment request, change production finance ledgers or delete non-test audit evidence.

**Campaign safeguards:** a reset must cancel pending campaign deliveries for that portfolio and remove test-only subscribers. It must never activate or globally pause a real campaign as a side effect.

**Do not offer a global “delete all data” button.** The control is “Reset selected test portfolio”; the server must prove the scope before deleting.

### 4.4 Data retention and expiry

Default test portfolio expiry: 14 days after creation, configurable by an authorized administrator. Show an expiry warning. Expiry should mark the portfolio as eligible for cleanup, not silently delete it. A scheduled cleanup job may be added only after the same environment, provenance and safety checks exist. Keep reset audit metadata according to the organization's audit retention policy.

## 5. Synthetic scenario portfolio to create

Create one default portfolio named **MPA Full Journey — QA Cycle 01**. All records should link to the same portfolio ID and use predictable references such as `QA01-MEM-001`, `QA01-VER-001`, `QA01-ORG-001`, `QA01-JOB-001`, `QA01-MENT-001`.

### 5.1 Recommended initial dataset

| Data group | Quantity | Scenario variation |
|---|---:|---|
| Test accounts | 18–24 | Public/basic, incomplete member, pending member, active member, verified professional, reviewer, appeal reviewer, finance, organization, recruiter, mentor, mentee, support and admin |
| Member profiles | 6–8 | Incomplete, complete, pending, active, expired/renewal due, suspended or restricted (only if supported) |
| Membership applications | 5–6 | Draft/incomplete, submitted, needs correction, awaiting payment, payment pending verification, approved/activated |
| Payment test records | 4–5 | Simulated success, pending, failed, duplicate callback, manual receipt pending review |
| Professional verification cases | 4–5 | Draft, submitted with evidence, needs more information, approved, rejected/appeal eligible |
| Synthetic evidence files | 10–14 | PDF, JPG/PNG, DOCX and small sample files with visible “SYNTHETIC TEST DOCUMENT” watermark |
| Organizations | 3 | Pending verification, verified, rejected/needs correction |
| Organization users | 4–5 | Owner, admin, recruiter, read-only representative and cross-organization outsider |
| Job vacancies | 5–6 | Public, MPA-member-only, organization-internal, partner/network, draft and closed/expired |
| Job applications | 6–8 | Submitted, screening, interview, offer pending candidate response, withdrawn/rejected, ineligible candidate |
| Service listings/requests | 3–4 | Published offer, draft offer, new request, active/in-progress request, completed/feedback |
| Mentors | 2–3 | Eligible/available, capacity full, unavailable/time-off |
| Mentees / mentorship requests | 3–4 | New request, matched, declined, session completed with feedback |
| Network Plus discovery items | 4–6 | Synthetic business profiles, saved item, inquiry and collaboration request lifecycle |
| Community initiatives / impact | 3–4 | Proposed, approved/active, evidence submitted, review/recognition outcome where implemented |
| Notifications | 12–20 | Membership, payment, application, mentorship, service, system and community campaign categories |
| Campaign content | 3–4 drafts | Draft, revised, approved by separate reviewer; schedules remain disabled |
| Public subscribers / push | 1–2 | Opted-in synthetic browser subscriber only, created with explicit test consent |
| Reports / exports | 3–5 | Member roster, application status, finance test summary, scoped organization/job report |
| Audit events | Created naturally | Sign-in/security, role change, review decision, evidence read, payment action and reset |

Counts are a starting fixture size, not a limit. Seed only what can be traced and safely removed. Do not seed unsupported workflow states by direct SQL just to make a screen look populated.

### 5.2 Synthetic people and account identity

Use fictional personas with a clear prefix:
- Amina Yusuf — incomplete member profile;
- Bilal Ahmed — pending membership/payment;
- Hana Mohammed — active member, professional verification pending;
- Yusuf Ibrahim — active and verified professional;
- Samira Ali — mentor;
- Khalid Osman — mentee;
- Mariam Abdi — membership reviewer;
- Ahmed Nur — verification reviewer;
- Fatima Hassan — finance officer;
- Ibrahim Suleiman — organization owner/recruiter;
- QA System Admin — system administrator.

These are fictional test identities, not real people. Use only the fields necessary for the workflow. Do not generate realistic national IDs or real credential numbers; use obviously synthetic values such as `TEST-ID-QA01-001`.

### 5.3 Evidence files to generate

Prepare small, non-sensitive sample files specifically for testing:
1. `QA01-member-cv.pdf` — synthetic one-page CV;
2. `QA01-education-certificate.pdf` — watermarked certificate example;
3. `QA01-professional-license.pdf` — fictional license sample;
4. `QA01-identity-placeholder.pdf` — placeholder, not a replica of a government ID;
5. `QA01-organization-registration.pdf` — fictional organization registration evidence;
6. `QA01-organization-governance.pdf` — sample governance document;
7. `QA01-job-description.pdf` — vacancy details;
8. `QA01-cover-letter.pdf` — candidate application;
9. `QA01-service-deliverable.pdf` — sample professional deliverable;
10. `QA01-initiative-baseline.jpg` and `QA01-initiative-progress.jpg` — generated/illustrative images clearly labelled synthetic;
11. `QA01-payment-receipt-simulated.pdf` — clearly marked “NO REAL PAYMENT”;
12. `QA01-project-evidence-note.pdf` — synthetic field inspection note.

All documents should contain the portfolio ID, synthetic watermark and fixture reference. Avoid any genuine identity, financial or personal data. Use the same files to test allowed/denied downloads, MIME/type validation, file size limits, replacement/version handling where supported, and deletion.

## 6. Functional scenario catalogue and tester instructions

For each case: sign in with the named persona, follow the UI, record the generated reference, capture the evidence, then sign out before switching roles. Use desktop and mobile viewport for responsive workflows. Record actual result; do not skip an unavailable step silently.

### A. Public website, navigation and account access

| ID | Persona | Tester action | Expected result / evidence |
|---|---|---|---|
| PUB-01 | Visitor | Open landing page; inspect navigation, theme, content and footer | Public content loads; no private data; screenshot desktop and mobile |
| PUB-02 | Visitor | Open public jobs, community updates and public opportunity pages | Only public/published records visible; capture URL and screenshots |
| ACC-01 | Applicant | Register a new account using a unique `example.test` email | Account created or clear validation shown; capture reference |
| ACC-02 | Applicant | Sign in, sign out and sign in again | Session lifecycle works; protected route redirects appropriately |
| ACC-03 | Applicant | Test invalid password, duplicate email and password policy | Friendly validation; no internal stack trace or misleading error |
| ACC-04 | Applicant | Start account recovery using test-only mail capture | Recovery flow is rate-limited, token expires and cannot be reused; provider required |
| ACC-05 | Any user | Try another account's private route/API directly | Denied without leaking private record existence or content |
| ACC-06 | Any user | Change account role/status (admin test) then reuse old session | Old session invalidated; reauthentication required |

### B. Member application, profile and membership lifecycle

| ID | Persona | Tester action | Expected result / evidence |
|---|---|---|---|
| MEM-01 | Incomplete member | Start membership application; save partial details and leave | Draft/progress retained; no premature activation |
| MEM-02 | Incomplete member | Resume application and complete required profile sections | Progress and validation update; record owner remains correct |
| MEM-03 | Applicant | Submit with missing/invalid fields | Clear field-level errors; no duplicate or partial orphan records |
| MEM-04 | Pending member | Select available membership/payment option | Correct configured product/amount and payment instructions displayed |
| MEM-05 | Pending member | Upload simulated manual payment receipt | Evidence stored privately; status remains pending verification |
| MEM-06 | Finance/reviewer | Review and decide the payment through authorized workflow | Authorized state transition and audit event; no real charge |
| MEM-07 | Membership reviewer | Review submitted application; request correction | Member sees correction request and can resubmit |
| MEM-08 | Membership reviewer | Approve/reject a complete application | Decision, reason and audit history persist; no self-approval |
| MEM-09 | Active member | View membership status/card and renewal information | Correct status and dates; card/export only if available |
| MEM-10 | Member/admin | Test expiry/renewal reminder using controlled test clock/fixture | One reminder per configured period; no duplicate |
| MEM-11 | Admin | Import synthetic legacy member rows with match/duplicate/error cases | Preview, validation, matching and import results; no real data |
| MEM-12 | Admin | Export member directory using permitted scope | Export is scoped, audited and excludes restricted fields |

### C. Professional profile, verification and talent registry

| ID | Persona | Tester action | Expected result / evidence |
|---|---|---|---|
| VER-01 | Member | Complete professional profile and submit verification | Case reference and status visible; evidence is private |
| VER-02 | Member | Submit missing, wrong-type or oversized evidence | Rejected with actionable message; no unsafe file |
| VER-03 | Verification reviewer | Open assigned case and inspect evidence | Only authorized reviewer can read; evidence read is audited |
| VER-04 | Reviewer | Request additional information | Member sees request and can submit revised evidence |
| VER-05 | Reviewer | Approve/reject with reason | Status, decision-maker, timestamps and reason persist |
| VER-06 | Member | Attempt to approve own case / conflicted reviewer test | Server denies; independent reviewer required |
| VER-07 | Member | Submit appeal after eligible decision | Appeal is separate and independent; original decision preserved |
| VER-08 | Verified member | Set consent/visibility and appear in talent search | Only consented, eligible, verified profile projection appears |
| VER-09 | Visitor/organization | Search talent and inspect returned fields | No private evidence, sensitive data or non-consented contact details |
| VER-10 | Outsider | Request evidence URL directly | Access denied; no public storage URL leakage |

### D. Organizations, jobs and recruitment

| ID | Persona | Tester action | Expected result / evidence |
|---|---|---|---|
| ORG-01 | Organization representative | Submit organization application and synthetic evidence | Organization record and verification case created |
| ORG-02 | Reviewer | Review organization evidence and request correction/decide | Status and audit trail persist |
| ORG-03 | Org owner | Invite/add organization user with scoped role | Only permitted roles granted within own organization |
| ORG-04 | Org B user | Access Org A data through UI and direct API | Denied; organization scope enforced |
| JOB-01 | Recruiter | Create draft vacancy with scope, requirements and closing date | Draft saved; not publicly visible |
| JOB-02 | Recruiter/admin | Submit vacancy for approval/publish if workflow permits | Approval and published visibility rules respected |
| JOB-03 | Visitor | Browse and apply to a public job | Application reference and confirmation; private candidate data protected |
| JOB-04 | Ineligible member | Apply to member-only/exclusive job | Eligibility is checked server-side; clear explanation |
| JOB-05 | Eligible member | Apply to member-only vacancy | Application accepted; eligibility snapshot retained |
| JOB-06 | Recruiter | Review candidate, screen, add note and progress state | Only assigned job team sees candidate data |
| JOB-07 | Hiring team | Schedule interview and record scorecard/feedback where enabled | Participant, decision and timestamps persisted |
| JOB-08 | Recruiter | Issue offer and await candidate response where enabled | Candidate controls acceptance; offer history retained |
| JOB-09 | Candidate | Withdraw application / update permitted response | Valid transition and audit history |
| JOB-10 | Org B recruiter | Request Org A vacancy/candidate | Denied, including direct API/export |

### E. Services marketplace, mentorship and Network Plus

| ID | Persona | Tester action | Expected result / evidence |
|---|---|---|---|
| SVC-01 | Eligible member | Create professional service listing | Owner, scope and publication status correct |
| SVC-02 | Visitor/member | Discover a published service and submit a request | Request linked to listing and requester |
| SVC-03 | Provider/requester | Progress request through permitted states and attach deliverable | Only participants can access; event history retained |
| SVC-04 | Requester | Accept/reject delivery and leave feedback where enabled | Outcome and feedback gates enforced |
| MEN-01 | Eligible professional | Create mentor profile and availability | Eligibility and capacity validated |
| MEN-02 | Mentee | Discover mentors and submit a request | Match criteria and request status visible |
| MEN-03 | Mentor | Accept/decline request and schedule a session | Availability/time-off/capacity respected |
| MEN-04 | Both parties | Complete session, record outcome and feedback | Completion gates and self-rating prevention enforced |
| MEN-05 | Ineligible member | Attempt to become mentor without eligibility | Server denies; no role claim bypass |
| NP-01 | Member | Discover synthetic business/service profiles and save item | Saved discovery item belongs to current user |
| NP-02 | Member | Send business inquiry and collaboration request | Consent and participant boundaries enforced |
| NP-03 | Other user | Access another user's saved items or inquiry | Denied; no cross-user leakage |

### F. Community service, impact, referrals and campaigns

| ID | Persona | Tester action | Expected result / evidence |
|---|---|---|---|
| COM-01 | Member/visitor | Browse initiatives and submit an idea/volunteer pledge where available | Public/private boundaries and ownership correct |
| COM-02 | Initiative owner | Submit synthetic impact claim and supporting evidence | Claim status and evidence linkage visible |
| COM-03 | Reviewer | Review claim, request clarification and decide | Decision and audit record persist |
| COM-04 | Member | View recognition/score and underlying explanation | Only supported metrics shown; no invented score |
| COM-05 | Member | Use referral link/code and test attribution | Referrer attribution follows documented rules; duplicates handled |
| COM-06 | Admin/editor | Create/edit a community campaign draft | New version created; seeded content remains draft |
| COM-07 | Independent approver | Review Qur'an/hadith references, destination and copy; approve | Author cannot approve own version; approval digest recorded |
| COM-08 | Admin | Preview Friday/Sunday slot schedule | Africa/Addis_Ababa local time shown; slots remain paused until explicitly enabled |
| COM-09 | Member | Opt in/out of community invitations | Campaign preference changes only campaign category |
| COM-10 | Visitor | Subscribe to public community updates | Explicit consent and browser permission required; manage/unsubscribe works |
| COM-11 | Admin/QA | Run scheduler in dry-run/test mode | Due slot and recipient preview; idempotency suppresses duplicates |
| COM-12 | QA lead | Verify operational notices while campaign opt-out is enabled | Payment/security/application notices remain independent |

### G. Notifications, PWA, security and account governance

| ID | Persona | Tester action | Expected result / evidence |
|---|---|---|---|
| NOT-01 | Member | Open notification inbox and mark item read | Correct unread/read state and category |
| NOT-02 | Member | Change category preferences | Campaign preferences do not suppress essential operational notices |
| NOT-03 | Member | Enable browser push after explicit action | Browser permission prompt only after click; subscription linked to account |
| NOT-04 | Member | Sign out/account switch and test same browser endpoint | Subscription ownership changes safely; prior account queued delivery cancelled |
| NOT-05 | QA lead | Test push success, retry and invalid endpoint in sandbox | Delivery ledger and bounded retries; invalid subscription revoked |
| PWA-01 | Visitor | Install on supported desktop/Android browser | Manifest, icons and standalone entry point work |
| PWA-02 | iOS tester | Add to Home Screen and open app | Mobile entry point and navigation usable |
| PWA-03 | Mobile user | Test offline public shell then open private action | Public assets may load; private API/data are not cached; action requires reconnect |
| PWA-04 | Mobile user | Tap push notification action | Correct route opens; protected route returns to intended action after sign-in |
| SEC-01 | Admin | Grant/remove test role to a test account | Current system-admin authority required; audit event present |
| SEC-02 | Admin | Attempt self-role change or remove final system admin | Server rejects |
| SEC-03 | Reviewer | Access case outside assigned scope | Denied |
| SEC-04 | User | Attempt direct API call with forged role claim | Server uses current DB roles and denies |
| SEC-05 | User | Try another user's profile, files, notification or saved item | Denied with no private data leakage |

### H. Finance, reporting, public intake and other documented domains

These scenarios are discovery/contract tests until the tester confirms a complete route, permissions, data model and integration are available on the running branch.

| ID | Domain | Tester action | Evidence / limitation |
|---|---|---|---|
| FIN-01 | Finance | View simulated payment and verify a manual receipt | Test-only transaction, separate finance permissions and audit |
| FIN-02 | Finance | Generate receipt/voucher for simulated transaction | Correct reference, amount, status and test watermark |
| FIN-03 | Finance | Test duplicate/delayed/failing provider callback in sandbox | Idempotency and reconciliation; never use a live payment |
| REP-01 | Reports | Run member, application, finance and organization reports | Counts reconcile to source records; scope and export audited |
| REP-02 | Reports | Save a view/filter and export | Saved view belongs to actor; export includes only authorized fields |
| PUB-03 | Public opportunity | Submit a public job/mentorship/opportunity intake | Tracking reference, validation and safe status disclosure |
| EVT-01 | Events | Locate event creation/registration/rescheduling routes | Mark PASS only if live UI/API supports registration, capacity and reschedule; otherwise record gap |
| PRJ-01 | Projects/field | Locate assigned project and submit synthetic evidence | Test only if assignment, offline/sync and inspection route are implemented |
| DON-01 | Donations | Exercise payment/allocation/receipt only in provider sandbox | No real charge; allocation and audit must reconcile |
| LMS-01 | Learning | Check Moodle/SSO/enrollment/completion integration | Requires configured provider and documented contract; otherwise external dependency/not proven |
| ETH-01 | Ethics | Check dedicated ethics case workflow | Known gap: do not substitute general professional-verification queue; record blocked until dedicated case workflow exists |

## 7. Test evidence and defect reporting

Each tester must create one test execution record per scenario. Minimum fields:

- scenario ID and title;
- tester name or test account reference (never password);
- portfolio ID and synthetic record reference;
- branch name, commit SHA, web build identifier and API build identifier if available;
- environment URL and browser/device/OS;
- date/time and timezone;
- preconditions and steps actually performed;
- expected result and actual result;
- result: PASS / FAIL / BLOCKED / NOT RUN;
- screenshot/video, exported report or sanitized network evidence;
- created record IDs and file references;
- defect/issue URL and severity;
- cleanup confirmation.

Capture screenshots at meaningful transitions: before submit, success/confirmation, pending/review state, final decision, denied access and mobile notification. Crop or redact credentials, tokens, private keys, real personal data and browser autofill. Do not attach raw authorization headers or push subscription endpoints.

### Defect severity

- **Critical:** cross-user/cross-organization private data exposure, unauthorized privileged action, real payment or destructive production side effect.
- **High:** core account/membership/verification/payment/job workflow cannot complete or produces incorrect authorization/financial state.
- **Medium:** significant workflow, data consistency, mobile navigation or reporting defect with workaround.
- **Low:** cosmetic, wording, spacing or non-blocking usability issue.

A defect report must include reproducible steps and sanitized evidence, not only “does not work”.

## 8. Test account workbook specification

The QA lead should be able to export a workbook with these sheets:

1. **Read Me** — portfolio ID, environment, branch SHA, created/expiry date, sign-in URL, reset instructions and security warning.
2. **Accounts** — persona, synthetic display name, email, initial password, platform roles, organization scope, account status, test case assignment and password-change status.
3. **Scenario Index** — scenario ID, required persona, linked fixture reference, steps summary and expected outcome.
4. **Data Inventory** — module, synthetic record reference, status, linked records and evidence filenames.
5. **Evidence Index** — evidence reference, filename, file type, size, intended workflow and privacy/access test.
6. **Tester Results** — blank execution columns for tester, result, timestamp, notes and defect link.

### Credential handling requirements

- Use only synthetic `example.test` addresses and accounts created in the isolated test environment.
- Generate random, unique, high-entropy initial passwords server-side. Do not use shared/default passwords such as `Password123`.
- Store only password hashes in the application database. Never store plaintext passwords in logs, database tables, source control or the portfolio metadata.
- Generate the workbook only after explicit administrator action. Do not email credentials automatically.
- The workbook must be downloaded over an authenticated admin session, be short-lived and no longer available through a public URL. Record the export event.
- Show a warning that the workbook contains temporary credentials; distribute through an approved secure channel and delete it after the test window.
- Require password change at first sign-in where supported. If testers need repeatable access, issue a new credential export rather than persisting plaintext credentials.
- Do not export the system administrator or any production account credentials.
- If the account system cannot enforce expiry, first-login password change and revocation, the workbook must label those accounts as manually controlled and the QA lead must revoke them at cleanup.

**Current state:** This branch has account administration/security capabilities, but this document does not claim that a secure temporary-account generator or credential workbook export already exists. Build and security-test that Test Lab capability before promising downloadable credentials.

## 9. Environment setup and execution sequence

1. QA lead confirms the environment is a dedicated development deployment and not production.
2. Record the exact branch and commit SHA. Confirm database name and API/web base URLs.
3. Use a dedicated disposable PostgreSQL database and isolated file storage bucket/path.
4. Install committed dependencies with `npm ci --no-audit --no-fund`.
5. Configure test-only secrets and provider sandbox credentials. Never copy production secrets.
6. Run migrations twice; the second run should be a safe no-op.
7. Run backend tests: `npm test`.
8. Build web: `npm run web:build`.
9. Start API and web using test configuration; run API smoke checks against localhost/staging only.
10. Run browser tests: `npx playwright test e2e`.
11. Create the synthetic portfolio through Test Lab (once implemented) or a reviewed developer fixture runner.
12. Export account workbook; distribute securely to testers.
13. Execute role-based scenarios in parallel only when they do not depend on shared mutable records. Use distinct accounts for independent tests.
14. Run security/cross-scope tests after successful happy paths.
15. Review results, resolve defects, rerun failed scenarios and record evidence against the same commit or a new explicitly identified commit.
16. Reset the portfolio and verify zero remaining test-owned records/files/subscriptions/jobs, except the retained reset audit entry.

The repository's manual validation policy remains authoritative: no current CI workflow should be assumed. Never run destructive migration fixtures against production.

## 10. Completion and sign-off criteria

The test cycle is complete only when:
- every scenario is marked PASS, FAIL, BLOCKED or NOT RUN; none is silently omitted;
- all critical and high-severity defects are resolved or explicitly accepted by the product owner;
- role and organization isolation tests pass;
- private file access and deletion tests pass;
- finance and provider tests used sandbox/simulated data only;
- mobile/PWA scenarios are tested on real target devices where relevant;
- external dependencies and unavailable modules are explicitly identified;
- exported test account workbook is securely distributed and later invalidated;
- portfolio reset is executed and verified;
- test report records branch SHA, environment, test counts, evidence links and unresolved gaps.

### Sign-off

| Responsibility | Name | Decision | Date |
|---|---|---|---|
| QA lead |  |  |  |
| Product owner |  |  |  |
| Engineering lead |  |  |  |
| Security/operations reviewer |  |  |  |

---

## 11. Follow-up implementation backlog (not delivered by this document)

The following are required to make the proposed test-team experience real; this document itself does not implement them.

1. Add a server-owned test portfolio registry and immutable provenance on every generated entity/file/job.
2. Build deterministic fixture packs using existing application services (not unsafe direct SQL inserts) and validate referential integrity.
3. Build Test Lab admin UI with create/preview/reset and a server-side reset service.
4. Add reset dependency map and tests proving non-test records cannot be deleted.
5. Add temporary account generation, expiry/revocation and secure XLSX export using the existing XLSX/reporting conventions.
6. Add synthetic evidence fixture generation and private file storage registration.
7. Add test-only notification/email/push/payment adapters and outbound side-effect suppression.
8. Add a test portfolio health/inventory report and cleanup verification.
9. Add Playwright E2E tests for Test Lab authorization, portfolio creation, credential export, reset preview, reset, idempotency and production-environment hard block.
10. Reconcile every scenario in this manual to a real route, API contract, permission and automated test. Update this document whenever functionality or known gaps change.

**Release rule:** Do not expose one-click reset or credential export to a shared test team until the isolation, authorization, audit, file deletion, external side-effect and production-hard-block tests pass.


---

## 12. Implementation update — Development Test Lab foundation

The Test Lab foundation is now implemented on the target branch. See [Development Test Lab setup and safety runbook](68-development-test-lab-setup-and-safety.md).

Delivered in the branch:
- environment/database allowlist and production hard-block;
- portfolio creation with synthetic role-based accounts;
- encrypted-at-rest temporary credentials and authenticated XLSX export;
- initial in-app welcome notifications, captured email outbox entries, four membership application states and simulated payment records;
- database ownership capture for UUID-keyed rows referencing test accounts;
- child-first portfolio-scoped reset with foreign-key fail-closed behavior and private-local file cleanup;
- automatic expiry disabling and session revocation;
- test-only email/push capture and hosted Chapa blocking;
- admin Test Lab screen, API endpoints, setup documentation and contract/XLSX tests.

**Fixture scope limitation:** the initial fixture pack is an account, notification, email-capture and simulated-payment foundation. It does not yet pre-create every domain workflow entity listed in Section 6 (such as fully linked membership-review/verification, organization/job, service/mentorship, project/donation and event journeys). Those fixtures must be added through their owning domain services and tested against their existing permissions before the test portfolio can be described as a complete end-to-end business-data pack. The ownership trigger captures future UUID-keyed rows that directly reference test accounts; non-UUID/composite-key tables require explicit cleanup coverage. See Section 11 of the setup runbook for the safety boundary.
