# Development Test Lab — Setup, Delivery Isolation and Reset Runbook

## Purpose

The Development Test Lab creates disposable synthetic accounts and linked QA data. It is an admin-operated test environment, not a production administration tool.

## Required environment configuration

Set these values in the API process environment or local `.env` (never commit secrets):

```dotenv
NODE_ENV=development
TEST_LAB_ENABLED=true
TEST_LAB_DISPOSABLE_DATABASE=true
TEST_DELIVERY_MODE=capture
TEST_LAB_SIGN_IN_URL=http://localhost:3000/login
```

The application currently uses PostgreSQL (`pg` driver and PostgreSQL-specific migrations/triggers). Test Lab no longer requires a hard-coded database name: it can use any correctly migrated PostgreSQL database. It does not make the MPA application compatible with MySQL, SQLite, SQL Server or other engines.

`TEST_LAB_DISPOSABLE_DATABASE=true` is an explicit operator acknowledgement that the configured database is isolated and contains no production data. It is not an automated emptiness check. Use a dedicated database/instance and separate credentials. Test Lab remains hard-blocked when `NODE_ENV=production`.

## Initial deployment

1. Provision a dedicated disposable PostgreSQL database and configure `DATABASE_URL` for that database.
2. Back up the disposable database if it contains anything that must be retained.
3. Apply all committed migrations with the repository migration command.
4. Confirm the Test Lab portfolio and composite-key ownership migrations are recorded in `app_schema_migration`, and that `20261103100000_test_lab_no_recoverable_credentials.sql` has removed the former credential ciphertext column.
5. Set the environment variables above on the API process only after confirming the target database is disposable. Restart the API.
6. Sign in using an existing `system_admin` account. Test Lab does not create or export a system administrator.
7. Open **Admin → Development Test Lab** and create a portfolio. The current fixture pack creates nine synthetic accounts and linked starting-state records across membership, payments, verification, organization/job, services/mentorship, Serve-Community, offline projects and donor finance. These are not yet complete end-to-end scenario journeys.
8. Portfolio creation immediately downloads a one-time XLSX credential workbook. Distribute it only through an approved secure channel. If it is lost, use **Regenerate credentials + Excel**; this rotates all active test passwords transactionally and revokes their existing sessions before issuing a replacement workbook.
9. Testers sign in using their assigned accounts. Accounts are disabled and sessions revoked after portfolio expiry; default expiry is 14 days, configurable up to 30 days.

## Credentials and delivery isolation

- Test accounts use `example.test` email addresses, synthetic names and generated passwords.
- The database stores only the application's normal one-way password hash. No plaintext or encrypted recoverable password is retained.
- Initial credentials are generated in memory and included in the authenticated create response as an XLSX workbook. Subsequent export is a POST operation that rotates passwords and revokes sessions; previous passwords stop working.
- Credential responses are no-store and system-admin-only. Never share the workbook publicly; delete local copies after the test window.
- Email and push dispatch are captured locally when `TEST_DELIVERY_MODE=capture`; hosted payment providers are blocked. Simulator payment state changes affect only rows registered to the selected active portfolio and never call a real provider.
- Do not configure live email, push or payment credentials in a shared QA environment.

## Provenance and reset

The migrations register UUID `id` rows in `test_portfolio_record` and composite/non-UUID primary keys in `test_portfolio_composite_record`. Ownership is detected through known account/user reference fields and synthetic account emails. Reset uses the live PostgreSQL foreign-key graph to delete registered rows child-first; it does not broaden deletion when a dependency is missing.

Admin workflow:

1. Open **Admin → Development Test Lab**.
2. Select **Reset** for the portfolio and review the account count, record inventory and captured delivery count.
3. Enter or retain a reset reason of at least eight characters.
4. Select **Delete entire test portfolio**. The preview is the confirmation checkpoint; this single delete action performs the scoped database reset.

The server requires a system administrator, a non-production environment, the disposable-database acknowledgement and capture delivery mode. It deletes only portfolio-registered records, clears captured deliveries, marks the portfolio reset and writes an audit event. It removes only private-local evidence files whose resolved paths remain inside `PRIVATE_FILE_STORAGE_ROOT`. Unsupported storage providers or unsafe paths fail closed.

Database deletion is transactional. An unregistered/non-test foreign-key dependency blocks the transaction rather than triggering a broad cascade. File cleanup occurs after the database commit; failed file removals are returned as cleanup warnings and require operator follow-up. Do not treat a reset with file-cleanup warnings as fully clean.

## Current fixture coverage and known gaps

The current pack creates nine accounts: four member personas, membership reviewer, verification reviewer, appeal reviewer, finance officer and support staff. It creates membership draft/submitted/correction/payment-pending states, synthetic verification and organization evidence, a pending-review job and draft application, draft service listing/request, draft mentor and requested mentorship, submitted Serve-Community initiative/participation consent, submitted offline project/event history, simulated payment rows and a donor finance record.

These are starting states, not proof that testers can complete all workflows. Remaining scope includes distinct recruiter, organization, mentor/mentee, provider/requester, community, project and donor personas; complete workflow transitions; Network Plus consent handoffs; referrals; event journeys; payment verification/reversal/reconciliation; scenario progress/evidence tracking; full workbook sheets; and PostgreSQL login/reset isolation integration tests.

## Verification checklist

- [ ] Non-system-admin users cannot create, export, inspect or reset portfolios.
- [ ] Production environment rejects Test Lab even when enabled.
- [ ] Missing disposable-database acknowledgement rejects create/export/reset.
- [ ] A correctly migrated non-production PostgreSQL database with any database name works after explicit disposable acknowledgement.
- [ ] No recoverable password column or credential-encryption key is required.
- [ ] Initial XLSX opens and contains credentials for every created account.
- [ ] Credential regeneration invalidates previous passwords and revokes existing sessions.
- [ ] Email/push remain captured and hosted payment providers are not called.
- [ ] Reset inventory matches the portfolio ownership registry.
- [ ] Reset removes only the selected portfolio; unrelated records remain.
- [ ] An unregistered foreign-key dependency causes full database rollback.
- [ ] Private file cleanup reports and permits reconciliation of failures.
- [ ] Expired accounts are disabled and their active sessions revoked.
