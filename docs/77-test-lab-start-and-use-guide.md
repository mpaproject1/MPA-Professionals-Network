# Development Test Lab — Start and Use Guide

**Applies to:** `feat/workstream-3-progress-members-workspace` / PR #18  
**Audience:** System administrators, QA coordinators and assigned testers  
**Purpose:** Safely create synthetic test accounts, exercise the available application workflows, collect evidence and dispose of one test portfolio.

## 1. What Test Lab does

Test Lab is an administrator-operated feature for a dedicated, disposable development/QA database. It creates a named portfolio containing 22 synthetic accounts, role assignments, linked starting-state records and captured test-delivery events. It also provides:

- A one-time Excel workbook with the initial usernames/email addresses and passwords.
- A separate 22-case scenario/evidence workbook for testers to record results.
- Portfolio-scoped payment and captured-delivery monitoring.
- Service-backed synthetic payment outcome controls.
- A preview followed by one portfolio-scoped delete operation.

Test Lab does **not** create a system administrator. Use an existing authorized `system_admin` account to operate the feature. The 22 synthetic accounts use existing application roles; several personas share the same role code but have separate accounts and distinct test purposes.

The fixture pack provides a useful starting state and representative test journeys. It does not mean that every one of the 22 scenarios has been automatically completed or that every module has a full end-to-end automated workflow. Testers must perform the steps in the application and record the actual outcome and evidence.

## 2. Safety requirements — do these before enabling it

1. Use a dedicated PostgreSQL database or instance for development/QA. Do not point Test Lab at production, a production backup containing live personal data, or a shared database with records that must be retained.
2. Configure the API process to use that dedicated database through its normal `DATABASE_URL` / PostgreSQL connection configuration.
3. Confirm the API is running in a non-production environment.
4. Enable delivery capture. Do not configure live email, push, SMS or payment provider credentials for this test environment.
5. Back up the disposable database first if anything in it must be retained.

The application uses PostgreSQL-specific migrations and SQL. Test Lab can use any correctly migrated PostgreSQL database name; this is **not** support for MySQL, SQLite, SQL Server or arbitrary database engines.

## 3. Configure the API environment

Set the following values in the API process environment (or the deployment's private environment configuration). Never commit secrets or a populated `.env` file.

```dotenv
NODE_ENV=development
TEST_LAB_ENABLED=true
TEST_LAB_DISPOSABLE_DATABASE=true
TEST_DELIVERY_MODE=capture
TEST_LAB_SIGN_IN_URL=http://localhost:3000/login
```

Adjust `TEST_LAB_SIGN_IN_URL` to the actual development portal login URL. It is included in the credential workbook for tester convenience.

Important:

- `TEST_LAB_ENABLED=true` enables the feature only outside production.
- `TEST_LAB_DISPOSABLE_DATABASE=true` is an explicit operator acknowledgement. It is **not** an automatic check that the database is empty or safe.
- `TEST_DELIVERY_MODE=capture` is mandatory for portfolio creation. Email/push delivery must be captured locally rather than sent to real recipients.
- Production is hard-blocked by the application even if these flags are accidentally set.
- Keep real payment-provider credentials out of this environment. Test Lab payment scenarios use the application's membership services and a temporary test-only manual payment method; they must not move real money.

Restart the API after changing environment values so the running process receives them.

## 4. Prepare the database and application

From the repository root, install the project dependencies if this environment has not already been prepared, then apply the committed migrations:

```bash
npm install
npm run migrate
```

Build/start the portal and API using the deployment's normal development procedure. For a local portal, the repository scripts include:

```bash
npm run web:dev
npm start
```

Run the API and portal as separate processes where required by the local setup. Confirm that the API is healthy and that the portal can sign in before creating a portfolio.

The migration history must include the Test Lab portfolio ownership/reset migrations and the migration that removes recoverable credential storage. Test Lab uses the application's existing PostgreSQL schema; it is not a standalone database installer.

## 5. Create a portfolio (system administrator)

1. Sign in to the development portal with an existing `system_admin` account.
2. Open **Admin → Development Test Lab** (route: `/admin/test-lab`).
3. Review the **Environment safeguards** panel. It should show:
   - Environment: a non-production value such as `development` or `test`.
   - Test Lab: **Enabled**.
   - Database safety: **Disposable acknowledged**.
   - Delivery: **capture**.
4. Give the portfolio a clear name, for example `MPA QA — Membership and Services — Cycle 01`.
5. Set an expiry between 1 and 30 days. The default is 14 days.
6. Select **Create portfolio** and wait for the success message and automatic download of the credentials workbook.

If the create button is disabled, do not work around it. Correct the environment configuration and restart the API. If creation fails because a role, product or migration is missing, apply the correct migrations and resolve the prerequisite rather than inserting records manually.

## 6. Distribute and use the 22 test accounts

The initial workbook is a one-time secret. It contains the generated login email, password, display name, persona, application role, sign-in URL, portfolio name and expiry.

- Save the workbook in an approved restricted QA location.
- Give each tester only the account(s) assigned to that tester.
- Do not send credentials in public chat, issue comments, screenshots or source control.
- Do not reuse these passwords outside the disposable test environment.
- Delete local workbook copies when the test cycle ends.

Passwords are generated once and stored only as the application's normal one-way password hashes. The application does not retain plaintext or encrypted recoverable passwords.

### Persona catalogue

| ID | Persona | Application role |
|---|---|---|
| P01 | Member — incomplete profile | `member` |
| P02 | Member — pending membership | `member` |
| P03 | Active member — verification pending | `member` |
| P04 | Verified professional / mentor | `member` |
| P05 | Member — job seeker / applicant | `member` |
| P06 | Member — employer representative | `member` |
| P07 | Member — service requester | `member` |
| P08 | Member — pro bono service provider | `member` |
| P09 | Member — mentorship applicant | `member` |
| P10 | Member — community initiative proposer | `member` |
| P11 | Member — volunteer participant | `member` |
| P12 | Member — offline project reporter | `member` |
| P13 | Member — donation contributor | `member` |
| P14 | Member — organization owner | `member` |
| P15 | Membership reviewer — queue triage | `reviewer` |
| P16 | Membership reviewer — correction decision | `reviewer` |
| P17 | Verification reviewer — evidence assessor | `verification_reviewer` |
| P18 | Verification reviewer — organization assessor | `verification_reviewer` |
| P19 | Verification reviewer — appeal evidence assessor | `verification_reviewer` |
| P20 | Independent appeal reviewer | `appeal_reviewer` |
| P21 | Finance officer — payment verification | `finance_officer` |
| P22 | Support staff — notification delivery observer | `supporting_staff` |

These are 22 distinct accounts/personas, not 22 distinct permission roles. The role shown in the workbook is the role actually assigned to the account. Do not grant a persona extra roles to make a test pass. Use the existing system administrator only for Test Lab administration.

### Sign-in and role testing

1. Open the sign-in URL from the workbook.
2. Sign in with the assigned account and its initial password.
3. Confirm that the visible workspace, actions and records match the account's role and persona.
4. Perform only the scenario actions assigned to that tester.
5. Sign out before switching to another persona. Do not share one browser session between testers unless each user signs out completely.
6. If login fails, first confirm that the account has not expired and that no administrator has regenerated the portfolio credentials.

### Credential regeneration

For an active portfolio, **Regenerate credentials + Excel** creates new passwords for the active portfolio accounts and revokes their existing sessions. Use this only when the original workbook is lost or credentials must be rotated.

After regeneration:
- The old workbook is invalid.
- All testers must use the newly downloaded workbook.
- Existing sessions are revoked; testers must sign in again.
- Securely replace and delete the old workbook.

Do not regenerate credentials in the middle of a test run unless the coordinator has notified all testers.

## 7. Execute scenarios and collect evidence

Select **Scenarios + evidence Excel** for an active portfolio. The workbook contains 22 catalogue cases and the synthetic actor's persona/email where available, along with expected result and evidence guidance.

The cases cover:

| Scenario IDs | Area |
|---|---|
| TL-001 | Identity and access |
| TL-002–TL-004 | Membership application, review and correction |
| TL-005–TL-009 | Manual payment, verification, failure, correction and refund |
| TL-010–TL-011 | Professional and organization verification |
| TL-012–TL-013 | Job vacancy and job application |
| TL-014–TL-015 | Pro bono service listing and service request |
| TL-016–TL-017 | Mentor profile, availability and mentorship request |
| TL-018–TL-019 | Community initiative and participation consent |
| TL-020 | Offline project and evidence |
| TL-021 | Synthetic donation receipt |
| TL-022 | Captured notifications and governance audit |

For every assigned case:

1. Read the expected result and evidence instructions before changing data.
2. Sign in as the named actor persona.
3. Complete the action through the normal application UI/API available to that role.
4. Where the scenario requires review, sign in separately as the named reviewer/counterparty persona.
5. Confirm the resulting status and audit/history entry. Do not treat a success toast alone as proof of persistence.
6. Record **Execution status**, **Evidence reference**, **Actual result**, **Tester notes**, **Executed by** and **Executed at** in the workbook.
7. Store screenshots or exported evidence in the approved QA evidence location. Redact credentials, tokens, private personal data and secrets before sharing.
8. Mark a case blocked or failed when the required UI, permission or transition is missing. Do not change database rows manually to make the workbook appear complete.

The scenario workbook is an export/checklist for recording execution. It does not currently synchronize tester results back into the application or provide an in-app scenario-progress dashboard.

## 8. Payment lifecycle and delivery monitoring

For an active portfolio, select **Operations**.

### Payment monitoring

The panel lists synthetic membership payment records, applicant, amount, currency and current status. Available actions depend on the payment's current state:

- **Simulate success** — sends the verification decision through the membership service.
- **Simulate failure** — sends the rejection decision through the membership service.
- **Request correction** — sends a correction-required decision through the membership service.
- **Simulate refund** — available for a successful synthetic payment and uses the membership reversal service.

These actions are for QA only. They do not contact a bank, mobile-money, card processor or external payment gateway, and they must never be used to represent a real receipt of funds. The normal membership service controls the resulting payment/application state and audit history.

### Captured delivery events

The same panel lists captured delivery events, channel, event code, timestamp and captured payload. Use this to confirm that a test email/push workflow reached the capture path without contacting an external recipient.

A captured event is **not** proof that a real email or push notification was delivered to a device. Do not use a test portfolio to validate real provider delivery.

## 9. Reset and dispose of a portfolio

Reset is destructive and permanent. Coordinate with all testers first.

1. Open **Admin → Development Test Lab**.
2. Locate the portfolio and select **Reset**.
3. Review the preview: account count, captured delivery count, record inventory and warning.
4. Confirm that the portfolio name and inventory identify the intended QA cycle.
5. Enter a reset reason of at least eight characters.
6. Select **Delete entire test portfolio** once.
7. Review the result message. If file cleanup reports failures, record the warning and reconcile the remaining private files before declaring the environment clean.

The reset is portfolio-scoped. Database rows must be registered to the selected portfolio; deletion follows the live foreign-key graph and fails closed if an unregistered dependency blocks safe deletion. Only private-local evidence files whose resolved paths remain within the configured private storage root are eligible for removal. The database deletion is transactional; file cleanup happens after the database transaction and can report warnings.

Do not manually delete portfolio rows with SQL. Do not delete the entire database to clean up one portfolio. Keep unrelated QA portfolios and all non-portfolio records intact.

Expired portfolios are subject to account expiry handling: synthetic accounts are disabled and their sessions revoked. Expiry is not a substitute for the explicit portfolio reset/disposal procedure.

## 10. Troubleshooting

| Symptom | What to check |
|---|---|
| Test Lab page says **Not enabled** | Confirm `TEST_LAB_ENABLED=true` in the API process and restart the API. |
| Creation is locked | Confirm non-production `NODE_ENV`, `TEST_LAB_DISPOSABLE_DATABASE=true` and `TEST_DELIVERY_MODE=capture`. |
| Production-blocked response | This is intentional. Do not attempt to bypass the production guard; use a dedicated development/QA deployment. |
| Database cannot be identified | Check the API's PostgreSQL connection configuration and connectivity. |
| Required role/product/fixture prerequisite missing | Apply the repository migrations and verify the membership product and role seed data. Do not create ad hoc rows to bypass prerequisites. |
| Credential workbook is missing | For an active portfolio, an administrator can regenerate credentials; this invalidates the previous passwords and sessions. |
| Test account cannot sign in | Check the workbook's sign-in URL, exact email/password, portfolio expiry and whether credentials were regenerated. |
| Payment action is unavailable | Check the current payment status. Only pending payments can be approved/rejected/requested for correction; only successful payments can be refunded. |
| Reset is blocked | Read the server error and reset preview. An unregistered foreign-key dependency intentionally blocks unsafe deletion. Escalate the dependency for ownership registration rather than broadening deletion. |
| Reset reports file warnings | Database cleanup may have completed, but private-file removal needs reconciliation. Do not report full cleanup until warnings are resolved. |

## 11. Known boundaries and acceptance status

- PostgreSQL is the supported database engine for this application.
- Test Lab currently provisions 22 synthetic personas and 22 scenario definitions, but the scenarios still require manual execution and evidence recording.
- The workbook is a downloadable QA artifact, not a live in-app test management system.
- The Operations panel currently focuses on captured delivery events and membership payment states.
- The current scenario catalogue is not proof that every workflow in events, referrals, Network Plus, donations, organization workspaces or other modules has a complete fixture and executable end-to-end journey.
- Running migrations, full backend tests, Playwright, real account login, payment lifecycle acceptance, XLSX opening and reset-isolation checks must be completed in the configured disposable development environment. Do not mark these checks passed based only on source-level tests or this guide.

## 12. End-of-cycle checklist

- [ ] All assigned scenario rows have an execution status and evidence reference.
- [ ] Failed/blocked scenarios have reproducible notes and are reported to the development team.
- [ ] Testers have signed out of all synthetic accounts.
- [ ] Credential workbooks and local credential copies have been securely deleted.
- [ ] The coordinator has reviewed the reset preview for the correct portfolio.
- [ ] The portfolio has been reset and any file-cleanup warnings reconciled.
- [ ] Unrelated portfolios and non-test records remain untouched.
- [ ] The QA environment remains configured for capture mode and is not exposed as a production feature.
