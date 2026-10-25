# Serve-Community G5 — privacy-safe participant and impact reports

**Branch:** `feat/serve-community-g5-privacy-safe-reports`  
**Base:** `feat/serve-community-impact-workflows`  
**Gate:** G5 — authorized participant and impact reporting  
**Status:** Source changes authored; database-backed tests, export-route acceptance, full regression and final CI are pending. Do not mark G5 passed until those gates run.

## Access boundaries

- Listing owners can request an impact report for their own listing.
- Active organization users with `owner`, `administrator`, or `project_manager` membership can request reports for listings owned by their organization.
- An unrelated user receives a server-side 403. The API route and report-generation service both enforce access; changing a listing ID in the URL is not sufficient to gain access.
- The governance view is a separate `view=governance` request and is restricted to `system_admin`, `admin`, `reviewer`, or an explicit governance-report permission. Ordinary listing owners cannot request it.
- Report generation and exports share the same authorized aggregate service. The export route does not query participant tables independently.

## Privacy controls

- Participant-level rows are never returned. No participant IDs, names, email addresses, phone numbers, private addresses, contact links, pledge descriptions, free-text outcome summaries, decision reasons or decision actor IDs are selected into report output.
- Participant-sensitive counts are suppressed when fewer than five distinct participants are represented. Monthly, feedback-category, milestone-category and governance-decision event totals are shown only when their group contains at least five distinct participants; groups are suppressed independently to reduce differencing and indirect re-identification.
- The minimum group size is returned as report metadata; suppressed values are represented as `value: null` with an explicit suppression flag.
- Governance audit reporting exposes only decision-status aggregates and the latest decision timestamp for each group, not actor or reason details.
- Exports are built only from the already-filtered report result, carry suppression labels, and are sent with private/no-store headers. Export events are audited.

## Data represented

- Interested individual and organization counts.
- Submitted pledges and accepted commitments.
- Active engagements with a mutually accepted persisted agreement.
- Completed engagements with provider completion, requester confirmation, and a non-empty recorded outcome summary (the summary text itself is never exposed).
- Feedback completion by structured category and operational update/milestone activity by category.
- Time-based activity summaries and, in the governance view, aggregated lifecycle decision history.

## API

- `GET /api/v1/services/listings/:listingId/impact-report?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /api/v1/services/listings/:listingId/impact-report?view=governance`
- `GET /api/v1/services/listings/:listingId/impact-report/export?format=pdf|xlsx&view=owner|governance`

All endpoints require authenticated access. Date filters are validated server-side.

## Acceptance still required

1. Run `test/services-mentorship/serve-community-g5-reports.test.js` against a verified disposable database with the G2–G4 migrations applied.
2. Execute the included organization-manager report test against the disposable database and confirm the fixture's active membership constraints.
3. Exercise the API and both export formats for owner, organization manager, unrelated user, reviewer and administrator identities.
4. Inspect PDF and XLSX contents to confirm there are no participant lists or contact fields and suppressed values remain suppressed.
5. Run the existing G2/G3/G4 service tests, reports acceptance/export tests, migration compatibility checks, lint/type/build checks and the final CI gate.
6. Reconcile the shared `server.js` and service/report files with PR #15 before merge. Do not deploy or run against production data as part of this gate.

No production database operation or deployment is part of this change. CI and database-backed acceptance have not been run yet.
