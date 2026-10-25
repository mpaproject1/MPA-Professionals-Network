# Serve-Community G6 — completion proof and outcome-based feedback

**Branch:** feat/serve-community-g6-outcome-proof  
**Base:** feat/serve-community-g5-privacy-safe-reports  
**Gate:** G6 — evidence-backed completion, requester outcome decisions and program fulfilment  
**Status:** Implementation and database-backed acceptance tests are authored. Run the disposable-database suite and final CI before claiming the gate passes.

## Lifecycle invariants

- Interest and pledge records are not service requests, agreements, active delivery, completed engagements or program fulfilment.
- Provider completion is a submission, not a terminal request state. It requires a meaningful written summary, all active milestones resolved, and the listing's configured evidence policy.
- Requester acceptance is a separate decision, with an actor, timestamp, recorded final outcome and append-only completion event.
- Requesters can accept, request a revision or dispute a submitted outcome. Revisions clear the current completion submission and require new delivery evidence; disputes pause completion until explicitly resolved. Resuming after a dispute requires fresh delivery evidence.
- The existing feedback workflow remains restricted to completed engagements and records the reviewer, structured category, rating/comments and timestamp.
- Paid work is accepted only when finance has verified successful settlement for the agreed amount and currency. Free and pro-bono engagements do not enter the paid-payment submission or verification requirement.
- Listing fulfilment follows the persisted per-listing rule. Manual is the safe default for ongoing programs; single_engagement and engagement_count only auto-fulfil after the target number of requester-accepted engagements. Provider submission alone never fulfils a listing.

## Listing policy API

PATCH /api/v1/services/listings/:listingId/completion-policy

Example request fields:
- evidencePolicy: accepted_delivery, private_file or description_only
- fulfilmentRule: manual, single_engagement or engagement_count
- fulfilmentTargetCount: integer from 1 to 1,000,000

Evidence policies:
- accepted_delivery: the latest delivery must be accepted by the requester.
- private_file: the latest delivery must be accepted and backed by a private file owned by the provider.
- description_only: the listing explicitly permits a written completion summary as the evidence type.

Fulfilment rules:
- manual: listing owner decides when an ongoing program has fulfilled its purpose.
- single_engagement: auto-fulfil after one requester-accepted engagement.
- engagement_count: auto-fulfil after fulfilmentTargetCount requester-accepted engagements.

Only authorized listing owners/organization managers may change policy. Closed listings cannot change policy. A non-manual listing cannot be manually marked fulfilled before its configured threshold is met.

## Outcome decision API

- Existing provider submission: POST /api/v1/service-requests/:requestId/status with status set to completed and a meaningful completion note.
- Existing simple acceptance: POST /api/v1/service-requests/:requestId/accept-completion with a final outcome note.
- Full decision flow: POST /api/v1/service-requests/:requestId/review-completion with status set to accepted, revision_requested or disputed, plus a note/outcome summary.

Completion decision events are append-only in service_request_completion_event. Current request state records the latest provider submitter, requester decision, decision actor/timestamp, final outcome and evidence delivery reference. Audit log and service request events are also written for material transitions.

## Validation

The G6 database test suite covers:
1. Requester cannot accept before provider submission.
2. Provider cannot submit completion without the required evidence or before active milestones are resolved.
3. Provider submission does not set the request to completed or fulfil a listing.
4. Requester acceptance records final outcome, evidence reference, actor and timestamps.
5. Revision requests clear the current completion submission and require a new accepted delivery.
6. Disputes pause completion; after resuming, new evidence is required.
7. Pro-bono/free engagements do not require payment submission or finance settlement, while discounted paid services require verified settlement separately.
8. Explicit description-only evidence is accepted only when configured; private-file policy rejects a delivery without a private file.
9. A manual/ongoing program remains active after one completed engagement.
10. A single-engagement listing is fulfilled only after requester acceptance, and cannot be fulfilled early.

Run node --test test/services-mentorship/serve-community-g6-outcomes.test.js against a disposable PostgreSQL database with all prerequisite migrations applied. Then run the existing G2–G5 tests, migration compatibility checks, lint/type/build checks, API acceptance and final CI gate. Do not run migrations or tests against production data.
