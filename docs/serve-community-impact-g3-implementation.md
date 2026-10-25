# Serve-Community G3 — impact badges, live metrics and G2 source/schema closure

**Branch:** `feat/serve-community-impact-workflows`  
**Gate:** Implementation authored; database-backed and browser verification remain pending.  
**Migration:** `20261025130000_serve_community_g3_impact_metrics.sql`

## Impact model and pricing evidence

- `service_listing.impact_model` supports `standard`, `pro_bono`, `community_discount`, and `capacity_grant`.
- Existing listings backfill to `standard`; the migration does not invent historical impact claims or reference prices.
- `pro_bono` requires the free pricing model, zero price, and no reference price.
- `community_discount` requires a positive fixed/hourly price and a documented reference price strictly higher than the actual price. The percentage shown in the UI is calculated from those stored values.
- `capacity_grant` is an explicit persisted model, not inferred from page views or request counts.
- Backend validation and database CHECK constraints both enforce the pricing claims. The editor guides users to compatible price fields.

## Authoritative live metrics

`listServices` and `getServiceListing` calculate the following from persisted records on the server:

- **Organizations interested:** distinct organization identities with current eligible interest.
- **Users interested:** distinct individual user identities with current eligible interest.
- **Users / organizations pledged:** distinct eligible pledgers with submitted or accepted pledges.
- **Agreed services:** service requests whose latest persisted agreement has both provider and requester acceptance timestamps and whose request is in an eligible agreed state.
- **Active deliveries:** in-progress service requests with both parties accepting the same latest terms version.
- **Verified outcomes:** completed requests with provider completion, requester acceptance, a non-empty outcome summary, and finance-verified payment where the listing is not free.

Interest, pledges, agreed services, deliveries and verified outcomes are separate. Reads and anonymous page views do not create interest or increase any metric. Zero verified outcomes are omitted from the UI rather than presented as a success claim.

## UI behavior

- `/services` and `/services/[id]` show the impact classification, supported price/discount, ongoing/no-expiry or expiry state, and server-calculated metrics.
- Commitment choices are distinct: **Express Interest**, **Pledge Support**, and **Request Service**.
- Pledges require a description and preserve the idempotency key across uncertain retries.
- The provider workspace shows lifecycle and moderation status so under-review, fulfilled, archived and paused states are not confused.
- Loading, empty, error, retry, busy and success states are retained.

## G2 source/schema closure

- Added idempotent announcement creation, owner submission/archive, moderator-only publication/rejection, audience-aware reads, audit history and notifications for authors/participants.
- Added announcement idempotency columns/index in G3 migration; the announcement is not public before moderator publication.
- No private messaging endpoints were added.
- The existing G2 migration compatibility checker now includes G3 migration, impact constraints and announcement idempotency index.

## Verification still required

1. Run `scripts/check-new-migration-compatibility.js` only against an explicitly named disposable database with the approved migration baseline and rollback enabled.
2. Run `node --test test/services-mentorship/serve-community-g2.test.js` and existing service/mentorship regression tests against that disposable database.
3. Run browser acceptance for listing creation/editing, impact badge validation, all three commitment actions, metric refresh after writes, announcement visibility and lifecycle labels.
4. Reconcile the shared service files with PR #15 before merge.
5. Run CI only at the final gate, as instructed.

No database-backed tests, CI, browser acceptance, production database operations or deployment are claimed as completed in this record.
