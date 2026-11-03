# Test Lab credentials, database portability and disposal

**Branch:** `feat/workstream-3-progress-members-workspace`  
**Current source scope:** 22 synthetic personas, scenario/evidence workbook export, membership-service-backed payment controls and admin operations monitoring.

## Credential handling

- Test Lab creates 22 distinct synthetic accounts using the application's existing role codes: `member`, `reviewer`, `verification_reviewer`, `appeal_reviewer`, `finance_officer` and `supporting_staff`.
- Test Lab does not create a synthetic `system_admin`. An existing authorized administrator operates the feature.
- Passwords are generated in memory and stored only as the application's normal one-way password hashes. There is no plaintext or encrypted recoverable password store.
- Portfolio creation returns an initial XLSX credential workbook in the authenticated response. The admin page downloads it immediately.
- Explicit credential regeneration rotates the active portfolio passwords transactionally and revokes existing sessions before returning a replacement workbook. Previous passwords stop working.
- Credential workbooks are secrets. Share them only through approved restricted channels and delete local copies after testing.

## Database and environment support boundary

The application uses the Node `pg` driver and PostgreSQL-specific SQL/migrations (including JSONB, UUID arrays, PL/pgSQL ownership triggers and PostgreSQL catalog queries). Test Lab no longer relies on a hard-coded database-name allowlist, so it can use any correctly migrated PostgreSQL database configured for the application.

This is **not** compatibility with MySQL, SQLite, SQL Server or arbitrary database engines. Supporting another engine requires platform-wide database adapters and dialect-specific migrations, transactions, locking and trigger behavior.

Enable Test Lab only in a dedicated non-production environment:

```dotenv
NODE_ENV=development
TEST_LAB_ENABLED=true
TEST_LAB_DISPOSABLE_DATABASE=true
TEST_DELIVERY_MODE=capture
TEST_LAB_SIGN_IN_URL=http://localhost:3000/login
```

The disposable-database flag is an explicit operator acknowledgement, not an automated proof that a database is empty or safe. Production is hard-blocked. Email/push must be captured locally and hosted payment providers must remain unused.

## Portfolio disposal

The admin workflow previews a portfolio's registered account, record and file inventory before offering the single delete action. The server:

1. Requires an authenticated `system_admin` and non-production/disposable-database/capture guards.
2. Locks the portfolio and performs database deletion transactionally.
3. Deletes only registered UUID and composite/non-UUID primary-key rows, ordered child-first using the live foreign-key graph.
4. Removes disposable account access through the registered user deletion path.
5. Removes portfolio delivery captures and records a reset audit event.
6. Removes only private-local evidence files whose resolved paths remain inside the configured private storage root. Unsupported storage providers or unsafe paths fail closed.

An unregistered foreign-key dependency blocks the database transaction rather than broadening deletion. File deletion occurs after the database transaction; failures are returned as cleanup warnings and require operator reconciliation. Do not declare the portfolio fully clean while file warnings remain.

## Current usage and acceptance boundary

The current Test Lab UI is at **Admin → Development Test Lab** (`/admin/test-lab`). It creates 22 role-based synthetic accounts and cross-module starting-state fixtures. The scenario workbook contains 22 manual execution cases with expected results and evidence columns. It is a downloadable checklist; tester results are not currently synchronized to an in-app scenario-progress dashboard.

The Operations panel displays captured delivery events and synthetic membership payment states. Payment creation, verification, correction decisions and refunds are routed through the membership application/payment services. The Test Lab payment actions do not call an external provider or represent real money movement.

The current scenario catalogue does not prove that every module has a complete automated end-to-end fixture journey. Event workflows, referrals, Network Plus and other uncovered journeys must be assessed separately before being described as complete.

## Environment-dependent acceptance still required

Run these checks in the configured disposable development environment; do not claim they passed from source review alone:

- Apply all migrations to a disposable PostgreSQL database.
- Run focused Test Lab tests and the full backend test suite.
- Verify login and actual permission boundaries for every synthetic persona.
- Exercise membership payment creation, verification, correction and refund against the running app.
- Open and inspect both generated XLSX workbooks.
- Run browser/Playwright scenarios and verify delivery capture.
- Prove one-portfolio reset removes its registered data/files while unrelated portfolios and non-test records survive.
- Reconcile any file-cleanup warnings and verify account expiry/session revocation.

For the step-by-step operator procedure, see [Development Test Lab — Start and Use Guide](77-test-lab-start-and-use-guide.md).
