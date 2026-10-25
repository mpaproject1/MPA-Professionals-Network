# Serve-Community G2 — backend lifecycle implementation record

**Branch:** `feat/serve-community-impact-workflows`  
**Parent PR:** #5 branch `ux/p0-navigation-and-org-privacy`  
**Gate status:** Implementation changes authored; database-backed verification is still pending. Do not mark G2 passed until the new migration and test suite run against a disposable database.

## Implemented in this increment

### Optional expiry and canonical listing lifecycle
- Additive migration `20261025120000_serve_community_g2_lifecycle.sql` adds nullable `service_listing.expires_at` and a canonical `lifecycle_status` separate from legacy publication/moderation fields.
- Backfill maps existing `published` listings to `active`, `closed` to `archived`, `paused` to `suspended`, and other legacy statuses to `draft`. It does not assign an expiry to existing rows; `expires_at` remains nullable with no default.
- Creation defaults to no expiry; explicit future expiry is validated. Owners can clear expiry with `clearExpiry: true` when editing.
- Published service discovery and request/interest/pledge creation check lifecycle state and expiry at the server boundary.
- Owner status actions accept `fulfilled` and `archived`, require a reason, retain old engagement history and write `service_listing_lifecycle_event` plus platform audit records. Fulfilled/archived listings cannot be silently edited or reopened. Owner pause is distinct from moderator suspension; invalid lifecycle transitions are rejected and repeated identical state actions replay idempotently.
- Submitting a listing for moderation records `pending_review`; publication requires existing moderation approval. Material edits return the listing to draft/review and are audited.

### Separate interest and pledge records
- `service_listing_interest` persists individual interest by `individual_user_id`, and organization interest by `organization_id` plus the acting `actor_user_id`.
- Partial unique indexes prevent duplicate active interest for the same listing and represented party. Withdrawal changes state and preserves history; a new expression creates a new record. Owners can view per-listing aggregate interest counts without receiving individual contact details.
- `service_listing_pledge` is separate from interest and service requests. It records the represented party, author, description and lifecycle status. Pledge submission uses a hashed idempotency key and payload fingerprint; retry with the same key/payload replays the original record, while key reuse with a different payload conflicts.
- Owner decisions and pledge-author withdrawal are server-authorized and state-guarded. Owners receive an in-app pledge notification and have an authorized pledge-review queue. Pledge counts are not service engagements or verified outcomes.

### Explicit service agreement before delivery
- `service_request_agreement` persists a versioned terms snapshot and hash, provider acceptance actor/time, and requester acceptance actor/time.
- Provider acceptance creates the first terms version, including scope, price/currency, listing pricing model and schedule. Requester agreement is a separate explicit action at `POST /api/v1/service-requests/:id/agreement`.
- The provider cannot start delivery until both acceptance timestamps exist on the same persisted version. Existing request idempotency, status events, completion evidence, finance verification and feedback logic are retained.
- No private-message endpoint was added. Existing request event history, notification/email workflow and feedback records remain in place.

### Tests and schema preflight
- Added `test/services-mentorship/serve-community-g2.test.js` with database-backed coverage for default no-expiry, authorized/reasoned fulfilment, closed-listing rejection, concurrent duplicate interest, withdrawal/re-expression history, organization identity persistence, pledge authorization/idempotency, and the two-party agreement gate.
- Extended `scripts/check-new-migration-compatibility.js` to include the G2 migration and assert its key columns, foreign keys, unique indexes, canonical lifecycle default and nullable/no-default expiry.
- CI remains deliberately deferred until the final gate, per the user instruction.

## Verification still required before G2 can pass

1. Run the migration compatibility script against an explicitly named disposable test database with a verified migration baseline; confirm all DDL rolls back.
2. Run `node --test test/services-mentorship/serve-community-g2.test.js` against that disposable database and fix any schema, fixture or behavioral failures.
3. Run the existing service/mentorship integration tests to prove the new lifecycle field does not regress existing publication, requests, payment verification, delivery, feedback or PR #15 mentorship behavior.
4. Add/verify an authorized announcement publication/review workflow only if the existing request announcement and notification paths do not already satisfy the intended auditable communication requirement. The new announcement table is a schema foundation, not proof that a complete announcement workflow exists.
5. Decide and implement the full impact/pricing taxonomy (pro-bono, discounted rate, capacity grant) before claiming all program models are supported; the current agreement snapshot binds the existing legacy pricing fields.
6. Reconcile the shared `server.js` and `src/services-mentorship/service.js` changes with PR #15 (`feat/mentorship-operational-workflows`) before merge. PR #17 intentionally remains based on PR #5 and does not copy PR #15 code or overwrite its branch; verify the final combined diff after the intended merge order is established.
7. Verify the exact migration against a clean disposable baseline and review the full diff before running CI at the final gate.

**Important limitation:** The GitHub connector can commit code and inspect remote files, but no disposable database connection or local repository execution was available in this work session. Therefore these database-backed tests have been authored but not executed; G2 is not yet certified as passing. No production database or deployment was touched.
