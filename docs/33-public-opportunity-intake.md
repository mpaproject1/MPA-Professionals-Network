# Public Job & Mentorship Intake

## Purpose
Public first-contact intake remains available for mentorship and inquiries tied to a specific published public vacancy. No-vacancy job interest is a separate members-only workflow at `/jobs/interest`.

The design follows **Adl (Justice)** and **Satr (Confidentiality)**:

1. A visitor selects a specific published public vacancy or a public mentorship path. No-vacancy job interest requires an authenticated, currently eligible MPA member.
2. First submission collects only intent and contact information plus consent.
3. The system returns a reference and one continuation secret.
4. The continuation page explains the formal application path and accepts useful detailed information.
5. Formal job eligibility, professional verification, membership rules and mentorship matching remain governed by the existing authenticated workflows.
6. Non-member consideration is never automatic. An authorized administrator or organization user must explicitly record the decision.

## Job path
- Public vacancies are discoverable through `/jobs`.
- `/apply/job` accepts inquiries tied to a specific published public vacancy.
- `/jobs/interest` is reserved for authenticated accounts with a current active membership record (`status='active'`, start date reached, and no expired end date). A role named `member` is not sufficient.
- Member job-interest requests use a server-generated `MPA-JI-YYYYMMDD-NNNNNN` support reference. The reference is not an access credential; private details and consent actions are scoped to the authenticated owning account.
- The first step records name, email/phone and intent.
- The detailed continuation can capture summary, experience, education, skills, availability, motivation and document notes.
- Organization users authorized for the vacancy can see the inquiry.
- Organization decision roles are owner, administrator, recruiter and project manager.
- A decision can move the inquiry to considering/invited/declined/closed and explicitly enable non-member consideration.

## Mentorship path
- Public mentor discovery remains available through `/mentorship`.
- `/apply/mentorship` accepts a goal and contact information first.
- A visitor may select a public mentor or request matching assistance.
- Detailed information can be supplied through the secure continuation.
- System administrators/supporting staff or the selected public mentor can review the inquiry.
- Non-member consideration is explicit and auditable.

## Privacy boundary
The public inquiry stores contact information and applicant-provided intent/details. It does not expose Phase 2 private evidence, reviewer notes, verification evidence, or internal organization notes.

For public mentorship and specific-vacancy inquiries, the continuation token is stored only as a SHA-256 hash and the raw token is used for their secure continuation flow. No-vacancy job-interest requests use a separately generated server-side secret whose hash is stored; that secret is never returned to or displayed in the member UI. Members track their own requests by account and support reference.

## API
- `POST /api/v1/public/opportunity-inquiries` (mentorship or specific published public vacancy only; no-vacancy job interest is rejected)
- `GET /api/v1/me/job-interests`
- `POST /api/v1/me/job-interests`
- `GET /api/v1/me/job-interests/:reference`
- `GET /api/v1/me/job-interests/:reference/sharing-history`
- `POST /api/v1/me/job-interests/:reference/sharing-consent`
- `GET /api/v1/me/job-interest-sharing-organizations?q=...`
- `GET /api/v1/public/opportunity-inquiries/:reference/details?token=...`
- `PATCH /api/v1/public/opportunity-inquiries/:reference/details`
- `POST /api/v1/public/opportunity-inquiries/:reference/link`
- `GET /api/v1/opportunity-inquiries` — authorized inbox
- `PATCH /api/v1/opportunity-inquiries/:id` — authorized human decision

## UI entry points
- Landing page: public Jobs and Mentorship application cards.
- Global navigation: Apply.
- `/jobs` → public vacancy discovery.
- `/jobs/interest` → authenticated, eligible-member no-vacancy job-interest workspace.
- `/mentorship` → public mentorship inquiry.
- `/track?ref=...&token=...` → secure inquiry tracking.
- `/apply/opportunity?ref=...&token=...` → detailed continuation.

This is an intake layer, not a replacement for the governed ATS or mentorship lifecycle.
