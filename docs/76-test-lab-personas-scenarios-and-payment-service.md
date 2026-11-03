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
