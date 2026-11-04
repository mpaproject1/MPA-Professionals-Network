# Test Lab personas, scenario workbook and payment lifecycle

## Scope implemented in source

The Test Lab catalogue defines 22 separate synthetic personas using the application's existing role codes: member, reviewer, verification reviewer, appeal reviewer, finance officer and supporting staff. It deliberately does not create a synthetic system administrator or invent new privileged roles.

The scenario catalogue contains 22 workflow cases spanning identity, membership application/review/correction, payment submission/verification/correction/failure/refund, professional and organization verification, jobs, services, mentorship, community initiatives and participation, offline projects, finance receipts, and captured notifications.

Portfolio creation exports one-time credentials for all 22 accounts. Passwords are generated once, stored only as the application's normal one-way password hashes, and are not recoverable from the account registry.

## Payment behavior

Test Lab creates a portfolio-scoped temporary cash payment method and removes that configuration after seeding. Membership applications and manual payments are created by the existing membership service. Payment verification, correction decisions and refunds are delegated to the membership service as well. The test path never invokes a bank, mobile-money, card, Chapa, webhook or other external provider.

The admin Operations panel displays portfolio payment states and captured delivery events. Pending payments can be simulated as succeeded, failed, or correction-required; successful payments can be refunded through the normal membership reversal service.

## Scenario and evidence workbook

Each active portfolio can export an XLSX workbook with the 22 scenario definitions, the relevant synthetic actor email and role, expected outcome, evidence to capture, and blank columns for execution status, evidence reference, actual result, tester notes, tester identity and execution time.

## Validation boundary

Source and regression-test changes are included in this increment. The following require an actual configured development environment and are intentionally not claimed as passed here:

- Run the new and existing backend tests against a disposable PostgreSQL instance.
- Apply all migrations to a disposable database and verify the complete ownership-capture/reset graph.
- Log in using generated credentials and walk each role's permissions in the running app.
- Exercise payment create/verify/correction/refund flows against the running application.
- Verify the XLSX downloads in a browser and run the complete Playwright suite.
- Run the PR Quality GitHub Actions workflow.

Do not enable Test Lab in production. The current application persistence and migration layer is PostgreSQL-specific; this increment does not claim SQLite, MySQL or arbitrary-database compatibility.


## Automated CI evidence update — 2026-11-04

The complete backend test-file suite and disposable-PostgreSQL migration compatibility gate passed in [PR Quality run 41772344170](https://github.com/mpaproject1/MPA-Professionals-Network/actions/runs/41772344170) on exact commit `494b8c97b83029868dabc725839d3621995879fe`. Biome, TypeScript, production build and the workflow's configured browser/PDF acceptance also passed. See [docs/78](78-pr-quality-run-41772344170-validation-record.md).

This is automated test evidence only. It does not certify a tester's completion of the manual scenarios in this document, a live Test Lab account login, actual credential workbook download/opening, payment simulation in a running development deployment, or portfolio-scoped reset/file cleanup. Keep those acceptance steps open until directly exercised and evidenced.
