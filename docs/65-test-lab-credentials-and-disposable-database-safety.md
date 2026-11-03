# Test Lab credentials, database portability and disposal

**Branch:** `feat/workstream-3-progress-members-workspace`  
**Status:** Partial implementation hardening; full scenario-pack acceptance remains open.

## Credential handling

- Test Lab creates each account using the application's normal `hashPassword` implementation.
- No recoverable password is stored in `test_portfolio_account`; the forward migration removes the former `password_ciphertext` column.
- Portfolio creation returns a one-time XLSX credential workbook in the authenticated response. The admin page downloads it immediately.
- The administrator can explicitly regenerate and export credentials later. This rotates every active account password in one database transaction and revokes all existing sessions before returning the workbook.
- Expired/disabled accounts cannot be silently reactivated by credential export.
- The workbook is a secret: share it only through an approved secure channel and delete local copies after testing.

## Database and environment support boundary

The application currently uses the Node `pg` driver and PostgreSQL-specific SQL/migrations (including PL/pgSQL ownership triggers, JSONB, UUID arrays and PostgreSQL catalog queries). This change removes the Test Lab's hard-coded database-name allowlist, so it can operate against any **PostgreSQL database** to which this application is correctly migrated and connected.

It does **not** make the whole MPA application compatible with MySQL, SQLite, SQL Server or arbitrary database engines. That requires a platform-wide database adapter and dialect-specific migration/transaction/locking/trigger work; claiming otherwise would be unsafe.

Test Lab remains blocked when `NODE_ENV=production`. For an isolated local, development, QA or staging deployment, enable it only after confirming that the configured PostgreSQL database contains no production data:

```dotenv
TEST_LAB_ENABLED=true
TEST_LAB_DISPOSABLE_DATABASE=true
TEST_DELIVERY_MODE=capture
```

The disposable-database flag is an explicit operator acknowledgement, not an automated proof that a database is empty or safe. Use a dedicated database/instance and separate credentials for QA. Keep external email/push in capture mode and hosted payment providers blocked.

## Portfolio disposal

The admin workflow lists a portfolio, previews its registered account/record/file inventory, then exposes one delete action. The server:

1. Requires an authenticated `system_admin` and the non-production/disposable-database/capture guards.
2. Locks the portfolio and performs database deletion in a transaction.
3. Deletes only registered UUID and composite/non-UUID primary-key rows, ordered child-first using the live foreign-key graph.
4. Revokes/removes disposable account access through the registered user deletion path.
5. Removes portfolio delivery captures and marks the portfolio reset with an audit event.
6. Removes only private-local evidence files whose resolved paths remain inside the configured private storage root. Unsupported storage providers or unsafe paths fail closed.

An unregistered foreign-key dependency blocks the database transaction instead of broadening deletion. File deletion occurs after the database transaction; failures are returned as cleanup warnings and require an operator retry/reconciliation. A green reset status must not be inferred when file cleanup reports failures.

## Remaining acceptance work

This hardening does not yet prove the full Test Lab product acceptance described in the original audit. The current fixture pack still needs role-separated personas and complete, connected journeys for membership activation/renewal, verification appeals, organization review/workspaces, recruiter hiring stages, service fulfilment, mentorship sessions/outcomes, community execution/evidence, project review/completion, donor reconciliation/reversal, Network Plus consent handoffs, referrals and events. Those fixtures must use actual application role permissions and normal workflow transition services rather than inventing roles or treating inserted status rows as completed workflows.

The admin operations UI still needs full scenario progress/evidence tracking and the captured delivery/payment monitoring controls. The full workbook should include a scenario index, data inventory, evidence index and tester results in addition to credentials. Completion requires disposable PostgreSQL integration tests, login checks for every persona, representative UI/API journeys, and a reset isolation test proving unrelated real records survive.
