# Network-Plus Increment 7 — Serve-Community backend and participation

**Branch:** `feat/workstream-3-progress-members-workspace`  
**PR:** #18 — draft; no merge or deployment.  
**Status:** implementation added; CI and disposable-database validation must pass before acceptance.

## Approved boundary
Only independently reviewed and published community-benefit initiatives appear in Serve-Community. Commercial services remain in Network-Plus. Existing service listings are not copied, relabelled, hidden, deleted or changed. A legacy listing can be mapped only through a specific owner-proposed classification, independent moderator approval and a recorded reversal path.

## Domain and lifecycle
The additive migration creates a distinct initiative domain, append-only initiative events, private participation applications, versioned consent events, append-only participation events, and explicit legacy classification mappings/events. It does not modify existing service listings, requests, volunteer pledges or mentorship tables.

Initiative lifecycle: `draft → submitted → under_review → approved → published`; review may request clarification or reject; published initiatives may be suspended, completed or archived. Only `published` and non-expired rows are exposed publicly. Reviewer permissions are system-only and the reviewer role is privileged; no account is assigned by migration. Submitter/owner self-review is prohibited.

## Consent and participation
- Participation submission requires a current active MPA membership.
- Both affirmative choices are required: voluntary participation/privacy terms and explicit sharing of account name/email with the initiative owner for coordination only.
- Consent and privacy notice versions plus a SHA-256 hash are persisted with immutable grant events. Contact-sharing consent is not public.
- Applications are idempotent; a partial unique index prevents duplicate active applications.
- Participants can withdraw while submitted or accepted. Withdrawal appends consent-withdrawal and lifecycle events; history is not erased.
- Initiative owners can review private applications and accept/decline/complete them. Capacity is enforced transactionally. Owners cannot apply to their own initiatives.
- Notifications use the existing in-app service. No public participant names, contact details, application notes or counts are exposed.

## API
- Public read: `GET /api/v1/serve-community/initiatives`, `GET /api/v1/serve-community/initiatives/:id`.
- Owner: `POST/PATCH /api/v1/serve-community/initiatives`, `POST /:id/submit`, `GET /api/v1/me/serve-community/initiatives`, `GET /api/v1/serve-community/initiatives/:id/participations`, `PATCH /api/v1/serve-community/participations/:id/decision`.
- Participant: `POST /api/v1/serve-community/initiatives/:id/participations`, `GET /api/v1/me/serve-community/participations`, `POST /api/v1/me/serve-community/participations/:id/withdraw`.
- Moderation: `GET /api/v1/admin/serve-community/initiatives`, `PATCH /api/v1/admin/serve-community/initiatives/:id/review`.
- Legacy mapping: owner proposal at `POST /api/v1/serve-community/legacy-classifications`; independent review/reversal at `PATCH /api/v1/admin/serve-community/legacy-classifications/:id/review`.

## UX integration
The public page fetches the directory from the approved-only API; illustrative cards are removed. Search and category filters query persisted data. Detail dialogs provide initiative information and consent form. Logged-out visitors are directed to sign in; applications require active membership server-side. Signed-in participants see their private participation statuses. Empty and error states do not invent opportunities.

## Validation gates
- [x] Additive initiative schema and append-only event/consent history.
- [x] Reviewer role and system-only moderation/classification permissions; no automatic role assignments.
- [x] Published-only public projection and private owner/member projections.
- [x] Idempotent participation, versioned consent, explicit contact-sharing consent and withdrawal.
- [x] Auditable reversible legacy classification proposal/approval/reversal; no migration backfill.
- [x] API-backed directory, consent-gated participation UI and browser acceptance coverage.
- [ ] Apply migration on disposable PostgreSQL and pass rollback compatibility assertions.
- [ ] Run all backend tests, TypeScript, Biome, Next.js production build and Playwright on this exact commit.
- [ ] Review CI results and resolve every blocker/regression.

No production database was changed. No production deployment or merge was performed.
