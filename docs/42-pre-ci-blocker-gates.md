# Pre-CI blocker gate: database, combined diff, and runtime authorization

This gate is intentionally separate from CI and must run against a **disposable database restored from the current non-production schema**. Never point it at production.

## 1. Confirm the exact revision and base

```bash
git fetch origin
git rev-parse origin/main
git rev-parse origin/ux/p0-navigation-and-org-privacy
git diff --stat origin/main...origin/ux/p0-navigation-and-org-privacy
git diff --check origin/main...origin/ux/p0-navigation-and-org-privacy
```

The PR base must match the current `main` SHA reported by GitHub. Record both full SHAs with the gate results. Do not rely on an older short SHA.

## 2. Verify the ten new migrations without keeping DDL

Restore a sanitized copy of the existing schema and migration ledger to a disposable database whose name contains `test`, `staging`, `sandbox`, `ci`, or `verify`. The ledger must be present and its recorded checksums must match already-applied migration files.

Run this from the repository root, substituting the test connection details:

```bash
export DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/mpa_pre_ci_test'
export MIGRATION_CHECK_EXPECTED_DATABASE='mpa_pre_ci_test'
export MIGRATION_CHECK_ALLOW_ROLLBACK=YES
npm run check:migrations:rollback
```

The checker:
- verifies the connection is to the exact expected disposable database and refuses production/live-style names;
- verifies the existing schema has the expected base tables and column types;
- checks recorded migration checksums before execution;
- runs the ten new migrations in one transaction;
- verifies newly added column types, foreign-key targets, mentorship consent constraints, and the rematching index;
- always rolls back the DDL, including on failure.

A successful rollback-only check is **not** a production migration and does not prove application behavior. If the migration ledger is missing or its checksum differs, stop and resolve the baseline/checksum issue rather than bypassing it.

## 3. Runtime regression suite

After the rollback-only migration check passes, apply the migrations to a **separate disposable test database** using the repository migration process. Then run:

```bash
npm test
npm run web:build
npm run test:e2e
```

Record the database name, full branch SHA, command, exit code, and any failing test names. Do not claim the tests passed until their commands actually finish successfully.

Required evidence includes:
- same idempotency key + same payload returns one record, including concurrent retries;
- same key + changed payload returns a conflict;
- concurrent duplicate mentorship requests and talent inquiries cannot create duplicate active/pending records;
- both mentor-first and mentee-first consent orders require two independent acceptances;
- declined mentorship proposals remain in history when a different mentor is proposed;
- cross-organization users cannot download applicant attachments;
- attachments on draft applications remain inaccessible to hiring teams;
- assigned-reviewer and organization-scoped access is enforced at the service/API boundary, not only hidden in the UI;
- service completion requires a provider submission followed by requester acceptance, and the audit/status history is persisted.

## 4. Combined-diff review checklist

Review the full PR diff against the verified base, not only the last commit. In particular inspect:
- `server.js`: route uniqueness, authentication/role gates, request IDs, and idempotency-key forwarding;
- `src/services-mentorship/service.js`: transaction locking, consent order, duplicate replay/conflict, status history, and rematching;
- `src/verification/service.js`: membership gates, assigned-reviewer rules, and reference consent/history;
- `src/talent/service.js`: requester/org scope, verified-directory visibility, duplicate/concurrent inquiry protection;
- `src/platform/private-file-storage.js`: owner, active application, organization scope, reviewer assignment, and private/no-store download handling.

## Stop conditions

Do not merge, deploy, or run migrations on production if:
- the exact PR base/head cannot be recorded;
- the rollback-only compatibility check fails;
- the migration ledger baseline/checksums are unresolved;
- a concurrency, authorization, or private-file test fails;
- CI is green only on an older commit;
- browser acceptance has not been recorded for the final tested revision.
