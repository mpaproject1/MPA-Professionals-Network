# Serve-Community G4 — public announcements and private engagement updates

**Branch:** `feat/serve-community-impact-workflows`  
**Gate:** G4 — build the public announcement and commitment experience  
**Status:** Source implementation authored; database, regression and browser acceptance are pending. Do not mark G4 passed yet.

## Audience boundary

- Public listing announcements are attached to a listing, carry author/time/audience/moderation fields, require owner/authorized organization-manager submission and moderator publication, and are visible only after publication. The public catalog has a global feed plus a listing-specific feed; both use the same server-side audience filter.
- Listing announcement audiences are now `public` or `members`. New listing announcements cannot use `participants`; engagement-only information belongs on the specific request.
- G4 migration archives all legacy participant-audience listing announcements and adds a database guard that participant-audience legacy records must remain archived.
- Operational updates live in `service_request_update`, keyed to one `service_request`, and can be created/read only by the requester or an authorized provider-side participant. They are append-only structured records (`progress`, `schedule_change`, `delivery_note`, `blocker`, `handover`), not a private DM channel.
- Feedback remains attached to a completed request, requires a structured category, validates ratings/comments, and is never shown in the public listing feed. The UI only offers feedback on completed engagements.

## Content safeguards

- Server-side validation rejects email addresses, external URLs, likely phone numbers, social handles and common sensitive-data indicators in listing announcements, operational updates and feedback comments.
- Public announcement publication remains moderation-gated. Client validation is only a usability aid; the server is authoritative.
- Content pattern checks cannot reliably identify every person's name or all sensitive details. Moderators still need to review public content; no arbitrary public disclosure of participant-only records is supported by this increment.
- Existing records are preserved; legacy participant-only listing announcements are archived rather than deleted.

## Official notifications and links

- Creating an operational update generates an in-app system notification to the other authorized participant side, with a deep link to the exact request card.
- Feedback submission notifies the other participant side without copying private feedback text into the notification.
- Existing request/pledge/announcement notification links now target the relevant service or request record where supported.
- Existing workflow-email infrastructure may queue email for service request events. Queued/sent is not described as delivered; only trusted delivery evidence can establish delivery. G4 does not claim email delivery.
- Notification and email actions are links back to the service/request workflow. No private messaging endpoint or public comment thread is introduced.

## Implementation files

- `db/migrations/20261025140000_serve_community_g4_announcement_commitment_experience.sql`
- `src/services-mentorship/service.js`
- `server.js`
- `web/app/services/[id]/page.tsx` (listing-specific feed and owner submission form)
- `web/app/services/page.tsx` (global public feed, participant-only request updates and structured feedback)
- `web/app/services/page.tsx`
- `test/services-mentorship/serve-community-g2.test.js`
- `scripts/check-new-migration-compatibility.js`

## Required G4 acceptance

1. Run the migration compatibility script against a verified disposable database and confirm all G2/G3/G4 DDL rolls back.
2. Run the G2/G3/G4 database-backed test file and existing service/mentorship regression suites.
3. Test public announcements: anonymous read, active-member read, non-member denial for members-only content, draft/pending hidden, moderator-only publish/reject, and owner-only submission.
4. Test engagement updates: requester/provider authorized reads, unrelated-user denial, retry idempotency, contact/sensitive-content rejection, and notification deep link.
5. Test structured feedback: only completed engagement, authorized participant only, category required, rating bounds, contact/sensitive-content rejection, and no public listing exposure.
6. Browser acceptance: listing announcement feed and submission, moderation state messaging, request update form, feedback form, and notification link landing on the exact request card.
7. Reconcile shared files with PR #15, then run CI only at the final gate as instructed.

No database-backed test, browser acceptance, CI run, production database operation or deployment has been performed as part of this source edit.