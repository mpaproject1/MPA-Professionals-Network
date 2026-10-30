# Jobs UX and workflow workstream

## Purpose

Bring the existing Jobs portal and applicant-tracking foundations into one progressive journey without replacing their security, membership, privacy, audit or idempotency contracts. This work is intentionally integrated into Workstream 3 on `feat/workstream-3-progress-members-workspace`; it does not create a separate branch or migration stream.

## Stakeholders and primary journeys

| Stakeholder | Journey | Primary workspace |
| --- | --- | --- |
| Visitor / prospective applicant | Discover public vacancies → inspect terms → ask a question or register future interest | `/jobs`, `/apply/job`, `/jobs/interest` |
| Signed-in member / applicant | Prepare profile → discover → check eligibility → save draft → submit → respond to interview / offer → track outcome | `/jobs`, `/track` |
| Employer owner / administrator | Register organization → submit evidence → await verification → create requisition / vacancy → publish → govern team → report | `/organizations`, `/recruitment` |
| Recruiter / hiring manager | Review assigned pipeline → screen → shortlist → schedule interviews → recommend / issue offer → record outcome | `/recruitment` |
| Interviewer / job-team member | Access only assigned job work → review candidate materials permitted to role → submit interview feedback | `/recruitment` |
| MPA reviewer / Support Desk | Review organization verification and public job-seeker inquiries within the relevant support permissions | Existing organization and support review workspaces |
| Candidate after submission | See own status, reference, stage-specific next action and private history | `/track` |

A vacancy is a specific employer role with a formal application. General job interest is a request to be considered for future suitable opportunities. Mentorship, volunteering, Serve-Community, projects and partnerships remain distinct workflows and must not be presented as job vacancies.

## Existing route and API contracts

- Public vacancy discovery: `GET /api/v1/jobs`; detail: `GET /api/v1/jobs/:id`.
- Authenticated eligibility and formal application: `GET /api/v1/jobs/:id/eligibility`, `POST /api/v1/jobs/:id/application-drafts`, `PATCH /api/v1/job-applications/:id`, `POST /api/v1/job-applications/:id/submit`.
- Applicant-owned saved jobs and alerts: `/api/v1/jobs/:id/save`, `/api/v1/me/saved-jobs`, `/api/v1/me/job-alerts`.
- Public inquiry and secure continuation: `/api/v1/public/opportunity-inquiries` and the existing reference/token-protected continuation routes.
- Employer workspace: organization-scoped `/api/v1/organizations/:id/jobs`, requisitions, job dashboard, candidate list, team, screening questions, scorecards, interviews, offer approval and vacancy outcomes.
- Candidate progress: `GET /api/v1/me/application-tracking`; application history is exposed through the existing applicant-owned tracking response.

## Security and lifecycle contracts to preserve

1. Public discovery is not an authorization boundary. The service must enforce posting scope, deadline, publication status, verified organization and eligibility on direct detail/application requests.
2. Exclusive/member-only vacancies retain the central eligibility engine and active-membership / verified-professional-claim checks. Never infer eligibility from UI state.
3. Applicant drafts, submissions and responses remain applicant-owned. Duplicate submissions and uncertain network outcomes must remain idempotent and safely recoverable.
4. Organization and job-team access remains scoped to the exact organization/job. A role in one organization cannot grant access to another.
5. Private attachments remain private file objects and are returned only to authorized roles. Public profile/inquiry data must not expose private verification evidence.
6. The employer cannot accept an offer on behalf of the candidate. Internal offer approval and candidate acceptance are separate decisions.
7. Requisition, job, application, interview, offer, hiring and vacancy-outcome events remain separately auditable. A vacancy marked hired is not a substitute for an employment contract or onboarding process.
8. Non-member consideration remains an explicit human decision, not an automatic eligibility bypass.
9. No schema migration is justified by the UX changes implemented to date.

## Implementation changes in this workstream

- Vacancy discovery now uses human-readable employment and work-arrangement filters rather than asking applicants to type internal enum-like values.
- Posting-scope labels and options are being aligned with the actual database vocabulary (`public`, `mpa_members`, `organization_internal`, `partner_network`).
- A vacancy inquiry opened from a specific card carries that vacancy ID into the inquiry form. The public inquiry form no longer silently selects the first vacancy returned by the API.
- The public inquiry form clearly distinguishes a question about a specific vacancy from general job inquiry and links separately to the future-job-interest workflow.
- Applicant tracking now returns stage-specific next actions for submitted, screening, shortlisted, interview, offer approval, approved offer, accepted, hired, rejected and withdrawn states.
- Formal application screening questions are now rendered from the vacancy detail response; text, number, yes/no, single-choice and multiple-choice answers are persisted with drafts, restored to the applicant, and revalidated by the server at submission. Empty required multi-select answers are rejected.
- The applicant progress workspace now loads the applicant-owned interview schedule and stage history, supports participant confirmation/decline for open interviews, and supports candidate-owned offer acceptance or withdrawal. Applicant progress omits reviewer event notes and participant user identifiers.
- Employer screening-question and interview-mode controls now use the exact values supported by the database constraints. Candidate list and mutation access share the same job-scoped hiring-team authorization rule.

## Remaining validation gates before calling the workstream complete

- Run the complete PR Quality workflow on the final branch head and resolve every failure without deleting, weakening or bypassing tests.
- Verify the database integration path for organization owner, administrator, recruiter, project manager, read-only, hiring manager, interviewer, observer, approver, unrelated organization member and applicant.
- Verify direct API calls for cross-organization and cross-job access, private attachment reads, notes visibility, interview feedback and offer approval.
- Exercise complete browser journeys for public visitor, eligible member, ineligible member, non-member inquiry, employer owner, recruiter, hiring manager, interviewer, candidate and authorized reviewer.
- Verify responsive behavior at narrow mobile widths, keyboard-only navigation, labels/errors/focus, loading/empty/error/success states and duplicate-submit recovery.
- Remaining source-level gap: the employer recruitment page schedules interviews but does not yet provide a complete interview list, interviewer feedback submission experience, or a governed interview reschedule proposal/confirmation flow. The backend has a feedback service and interview response mechanism, but these do not by themselves complete the stakeholder journey.
- Reconcile the job `pending_review` status with the current publication path and moderation policy before changing any lifecycle transition. Do not silently bypass a required review.
- Verify the candidate-facing visibility of confirmed schedule changes after the employer interview-management workflow is completed.
- Verify that organization recruiting summaries and vacancy outcomes are sourced from persisted records and are correctly scoped.
- Do not deploy to production or modify production data as part of this workstream.

## Completion rule

The workstream is complete only when source implementation, route/API authorization, database integration tests, browser stakeholder journeys, accessibility/responsive checks and the final CI run all pass on the same final commit. A source-level change or a green subset of tests is not sufficient evidence of completion.
