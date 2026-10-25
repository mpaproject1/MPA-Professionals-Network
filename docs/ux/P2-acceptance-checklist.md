# P2 UX acceptance checklist

- [ ] Check the home and About pages plus services, private demand, mentorship and membership at desktop, tablet and mobile widths.
- [ ] Verify keyboard access, visible focus, labels, errors and reduced-motion behavior.
- [ ] Test loading, empty, failed-load, retry and permission-denied states separately.
- [ ] Confirm private demand drafts are opt-in, scoped to the current browser tab/session, expire after 24 hours and never submit automatically.
- [ ] Confirm successful submission clears the draft while recoverable errors preserve entered values.
- [ ] Test public visitor, non-member, active member, provider, mentor, organization owner/staff, reviewer, finance and administrator journeys.
- [ ] Test direct route/API authorization and unrelated organization/private file access.
- [ ] Rapid-submit create and transition actions; inspect persisted records and status history.
- [ ] Retry uncertain responses and verify idempotency and retained input.
- [ ] Run the opt-in Playwright suite only with dedicated non-production test identities and its explicit environment flags. Never run mutation journeys against live user data.
- [ ] Run full CI on the reconciled branch, inspect every failure, and do not weaken tests to obtain a pass.
- [ ] Do not merge or deploy until CI and manual acceptance evidence are recorded.

## Admin Workspace acceptance contract — PR #5

The Admin Workspace is not complete until every item below is evidenced. A catalogue redesign, successful page render, or mocked count does not satisfy acceptance.

### Definition of done

- [ ] Preserve existing changes; no unrelated authorization, privacy, membership, or migration regressions.
- [ ] Dashboard counts and alerts are sourced from verified backend data.
- [ ] Administrative mutations are permission-checked, confirmed when consequential, and audited where required.
- [ ] Reports are validated against their actual data and intended definitions.
- [ ] Search, filters, pagination, empty states, loading states, and error recovery work correctly.
- [ ] All eight routes pass desktop and mobile browser acceptance.
- [ ] Required builds and tests pass, with failures investigated rather than hidden.
- [ ] The final change is delivered as a reviewable pull request; no unverified production deployment.

### Route-by-route acceptance

- [ ] `/admin` — verify each operational count/alert against a documented backend response; distinguish a confirmed zero from unavailable or failed data; verify queue links open the correct authorized workspace.
- [ ] `/admin/members` — preserve import/export preview, validation, conflict resolution and existing member lifecycle rules; verify supported member-level actions against backend permissions and audit history.
- [ ] `/admin/organizations` — verify search, status filters, pagination and linked-account scope; do not add direct membership mutations without a permission-checked, confirmed and audited backend workflow.
- [ ] `/admin/reports` — validate report definitions, source queries, scope, filters, totals and exported output against known fixtures; verify sensitive reports/exports remain permission-checked. `test/platform/reports-acceptance.test.js` seeds a unique audit event and checks filtered results, date-range rejection, PDF/XLSX signatures and export audit records.
- [ ] `/admin/marketplace` — verify demand/listing search, server status filters, 10-item pagination and page boundaries against returned records; confirm consequential moderation, matching, merge and publication actions; verify persisted outcome and audit history.
- [ ] `/admin/support` — verify backend search, status/escalation filters, 25-item pagination, queue ownership, assignment/transfer permissions, status transitions, response feedback, empty/error/retry states and narrow-screen usability.
- [ ] `/admin/reference-portfolio` — verify dataset/version selection, searchable 25-item working-copy pages, draft edits, item validation, required publication reason and confirmation, published-version integrity and audit history.
- [ ] `/admin/security` — verify passkey/recovery controls and any security alerts using authoritative server state; keep sensitive actions permission-checked and confirmed.

### Evidence required before merge

- [ ] Record the exact PR head SHA and matching passing CI run.
- [ ] Record desktop and mobile browser results for all eight routes, including light/dark theme, direct-route authorization, loading, empty, failure/retry and successful workflows.
- [ ] Record backend/API evidence for dashboard counts and every administrative mutation being accepted.
- [ ] Record report fixture comparisons and export checks.
- [ ] Keep PR #5 in draft and do not merge or deploy while any required evidence is missing.

## Implementation evidence and boundaries — 25 October 2026

- **Dashboard operational counts:** /admin uses the existing support-demand-response report catalogue and run endpoint. The backend report aggregates membership applications, professional verification, organization verification and marketplace demand from persisted records. The dashboard checks that the report is authorized and returns a complete snapshot; it shows an unavailable state and retry rather than fabricating zero counts. Unreviewed totals are derived from the report's Unreviewed column, not from the first page of a list.
- **Member lifecycle actions:** /admin/members/catalog is intentionally read-only. Verified supported workflows include membership applications/payment review in /admin/membership and audited import preview/apply/export in /admin/members. No individual member-record activate/suspend/cancel/renew mutation was present in the inspected route contract, so none was added to the catalogue.
- **Organization membership administration:** the previous API only exposed organization-member mutations under the organization-scoped route, whose service requires the acting user to be that organization's owner/administrator. Dedicated platform-admin POST /api/v1/admin/organizations/:organizationId/members and PATCH /api/v1/admin/organizations/:organizationId/members/:userId handlers now call service methods that independently enforce platform organization-management authority, require an 8-character audit reason, validate roles/statuses, protect the owner role, and write audit events in the same transaction. UI actions require explicit confirmation. Integration/CI must still verify these mutations against disposable PostgreSQL before merge.
- **Reports:** the new database-backed acceptance test inserts a unique audit fixture, checks date/outcome/search filters against the known row, checks invalid date-range rejection, exercises PDF and XLSX exports, and verifies report generation/export audit events. The full report catalogue still requires per-report fixture coverage; this single fixture does not prove every report definition correct.
- **Queue behavior:** Serve-Community demand and listing queues now have local search and 10-item paging; the support endpoint now accepts scoped search, limit and offset while retaining consent-aware contact search and assignment visibility. Reference-data items now have search and 25-item paging; publishing requires a reason and browser confirmation.
- **Not yet accepted:** these changes are implementation candidates until the current PR head passes lint, TypeScript, production build, backend integration tests and the required desktop/mobile browser checks. No production deployment or merge is authorized by this checklist.
