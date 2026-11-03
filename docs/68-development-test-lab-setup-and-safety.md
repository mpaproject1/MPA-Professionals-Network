# Development Test Lab — Setup and Safety

The complete operator and tester instructions now live in:

**[Development Test Lab — Start and Use Guide](77-test-lab-start-and-use-guide.md)**

Use that guide for environment setup, database preparation, portfolio creation, the 22 synthetic accounts, scenario/evidence workbook, payment and delivery monitoring, and portfolio reset.

## Non-negotiable safety settings

Configure the API process only in a dedicated non-production PostgreSQL environment:

```dotenv
NODE_ENV=development
TEST_LAB_ENABLED=true
TEST_LAB_DISPOSABLE_DATABASE=true
TEST_DELIVERY_MODE=capture
TEST_LAB_SIGN_IN_URL=http://localhost:3000/login
```

Set the sign-in URL to the actual development portal URL. Restart the API after changing environment values.

- Production is hard-blocked.
- The disposable-database flag is an operator acknowledgement, not proof that the database is empty.
- Delivery capture is mandatory. Do not configure live email, push or payment provider credentials in this QA environment.
- The app uses PostgreSQL-specific persistence and migrations. A different PostgreSQL database name is supported after migrations; other database engines are not.
- Test Lab requires an existing `system_admin` account. It does not create or export administrator credentials.
- Passwords are stored only as the application's one-way password hashes. The initial Excel workbook is the only delivery of initial plaintext passwords. Regenerating credentials rotates passwords and revokes prior sessions.

## Database preparation

From the repository root:

```bash
npm install
npm run migrate
```

Start the API and portal using the deployment's normal development process. For local development, the repository scripts include `npm start` and `npm run web:dev`.

Open **Admin → Development Test Lab** (`/admin/test-lab`). Do not create a portfolio until the Environment safeguards panel reports a non-production environment, Test Lab enabled, disposable database acknowledged and delivery mode `capture`.

## Disposal

Use the portfolio's **Reset** action, inspect the inventory preview, enter a reason of at least eight characters and select **Delete entire test portfolio**. Reset deletes only portfolio-registered records and eligible private-local evidence files. Foreign-key ownership gaps block unsafe deletion. File cleanup can report warnings after the database transaction; reconcile them before declaring the portfolio fully disposed.

See the [Start and Use Guide](77-test-lab-start-and-use-guide.md) for the full tester workflow, operational controls, troubleshooting and end-of-cycle checklist.
