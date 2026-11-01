# Development Test Lab — Setup, Delivery Isolation and Reset Runbook

## Purpose

The Development Test Lab provides disposable synthetic accounts and data for QA in an isolated development database. It is not a production administration tool and must remain disabled outside a disposable environment.

## Required environment configuration

Set these values in the API process environment or local `.env` (never commit secrets):

```dotenv
NODE_ENV=development
TEST_LAB_ENABLED=true
TEST_LAB_DATABASE_NAME=your_exact_disposable_database_name
TEST_LAB_CREDENTIAL_ENCRYPTION_KEY=<32-random-bytes-as-base64url>
TEST_DELIVERY_MODE=capture
TEST_LAB_SIGN_IN_URL=http://localhost:3000/login
```

Generate the encryption key:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

The database name must exactly match PostgreSQL `current_database()`. A mismatch blocks Test Lab operations. Production mode is hard-blocked even if the environment variables are accidentally enabled.

## Initial deployment

1. Back up the disposable development database.
2. Apply all committed migrations with the repository migration command.
3. Confirm migration `20261102120000_test_lab_portfolios.sql` is recorded in `app_schema_migration`.
4. Set the environment variables above on the API process. Restart the API.
5. Sign in using an existing system-administrator account (Test Lab does not create or export a system administrator).
6. Open **Admin → Development Test Lab**.
7. Create a portfolio. The initial fixture creates nine synthetic accounts: member, reviewer, verification reviewer, appeal reviewer, finance officer and support personas, with multiple member states. It also creates clearly simulated ETB payment records.
8. Export the XLSX account workbook and distribute it through an approved secure channel only.
9. Testers sign in with the role-specific accounts. Test accounts are automatically disabled and their sessions revoked after portfolio expiry; default expiry is 14 days, configurable up to 30 days.

## What is isolated

- Email dispatch is captured to the Test Lab delivery ledger when `TEST_DELIVERY_MODE=capture`; no Resend or signed-webhook delivery occurs.
- Push dispatch is captured locally; no Web Push service endpoint is contacted.
- Hosted Chapa checkout/verification is blocked while Test Lab is enabled. The initial portfolio payment rows are explicitly simulated and do not represent a provider transaction.
- Test accounts use `example.test` email addresses, synthetic names and generated passwords. Passwords are stored only as AES-256-GCM ciphertext using the dedicated environment key; application authentication stores only the normal password hash.
- The XLSX export is authenticated, system-admin-only and returned with no-store headers. It is not written to the repository or sent by email.

If Test Lab is enabled but capture mode is not configured, portfolio creation and email dispatch are blocked, and push dispatch skips without calling a provider. Do not configure live payment/email/push credentials for a shared QA environment.

## Provenance and automatic capture

The migration installs a database trigger on UUID-primary-key tables in the public schema. It detects references to a portfolio account by user UUID or test email and records the row in `test_portfolio_record`. This includes owned records created later by testers through ordinary application workflows, such as notifications, applications, organization records and private file metadata, provided those rows directly reference the test account.

Rows without a UUID `id` primary key are not automatically tracked by the generic trigger. The reset service explicitly removes known account join/preference rows. If a workflow uses a non-UUID/composite-key table and its rows reference a test account, extend the migration/reset logic before enabling that workflow for the shared test team.

## Reset procedure

1. Open Admin → Development Test Lab.
2. Choose **Reset** for the selected portfolio.
3. Review the table-by-table record inventory, account count and captured-delivery count.
4. Type the exact portfolio name and enter a reason of at least eight characters.
5. Confirm reset.
6. Verify the portfolio status is `reset`, test accounts and sessions are removed, registered rows are deleted, captured deliveries are cleared, and registered private files are removed.
7. A reset audit event is retained. The portfolio row remains as a non-secret audit marker.

The reset runs in a database transaction and deletes registered records child-first using the actual foreign-key graph. If an unregistered or non-test record references a registered row, PostgreSQL rejects the delete and the transaction rolls back. The reset reports an error rather than attempting a broader cascade. File paths are resolved against `PRIVATE_FILE_STORAGE_ROOT`; any path outside that root is rejected. File cleanup occurs after the database commit; failed file removals are reported for operator follow-up.

## Security and operational rules

- Never enable Test Lab on production. The service refuses `NODE_ENV=production` and verifies the exact database name.
- Never use real member emails, real ID documents, real payment receipts, or production credentials in the portfolio.
- Never export credentials for real accounts. The XLSX contains only portfolio accounts.
- Never share the workbook publicly. Delete local copies after the test window and reset the portfolio.
- Keep the encryption key out of Git, issue comments, logs and the workbook.
- Do not set a live Resend key or live payment credentials in a shared QA environment.
- A test record that has been shared with or referenced by a non-test record intentionally blocks reset. Resolve that relationship safely; do not disable foreign-key constraints or force-delete.
- The current fixture set is an account/security/payment foundation. The trigger automatically captures future records owned by test accounts, but it does not pre-populate every scenario entity (for example, complete job/mentorship/organization lifecycle fixtures). Those domain fixtures should be added through the owning domain services as a follow-up rather than inserting incomplete rows directly.

## Verification checklist

- [ ] Test Lab API rejects non-system-admin users.
- [ ] Production environment rejects Test Lab even when enabled.
- [ ] Incorrect database allowlist rejects create/export/reset.
- [ ] Missing or invalid encryption key rejects create/export.
- [ ] Email capture writes only to `test_delivery_capture`.
- [ ] Push capture does not invoke VAPID provider delivery.
- [ ] Chapa hosted checkout is blocked while Test Lab is enabled.
- [ ] XLSX opens in Excel/LibreOffice and contains only test accounts.
- [ ] Reset preview matches the registry inventory.
- [ ] Reset removes the selected portfolio and no unrelated records.
- [ ] A deliberately unregistered FK reference causes a full rollback.
- [ ] Expired accounts are disabled and active sessions revoked.
