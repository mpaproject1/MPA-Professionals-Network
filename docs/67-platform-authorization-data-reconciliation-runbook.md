# Platform authorization data reconciliation runbook

**Purpose:** Execute Phase 6 of `docs/65-platform-authorization-and-role-audit.md` as a strictly read-only inventory before any role/grant cleanup or migration.

**Safety:** This runbook performs SELECT/catalogue inspection only. It does not insert, update, delete, revoke, normalize, or migrate authorization data. Run first against a restored/staging snapshot where possible, then against production using a read-only database account and an approved maintenance/change record. Do not run with the application's write-capable database credentials.

## 1. Preconditions and evidence capture

1. Confirm the target database, environment, PostgreSQL version, UTC timestamp, operator, branch and current application commit.
2. Use a database principal with SELECT access only. Confirm the session is read-only:
   ```sql
   SHOW transaction_read_only;
   SELECT current_database(), current_user, current_setting('server_version'),
          now() AT TIME ZONE 'UTC' AS captured_at_utc;
   ```
3. Start a read-only transaction for the inventory:
   ```sql
   BEGIN TRANSACTION READ ONLY;
   ```
4. Save every result as CSV or query output without exposing email addresses, names, phone numbers, tokens, password hashes or other unnecessary personal data. User-level assignment reports should use internal user IDs only and be stored in a restricted location.

## 2. Confirm schema and migration-ledger shape

Do not assume a migration ledger table name. Discover candidate ledger tables and columns first:

```sql
SELECT table_schema, table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  AND (
    table_name ILIKE '%migration%'
    OR table_name ILIKE '%schema%version%'
    OR column_name ILIKE '%migration%'
    OR column_name ILIKE '%version%'
  )
ORDER BY table_schema, table_name, ordinal_position;
```

Capture the migration ledger rows from the confirmed ledger table using a SELECT-only query approved for that exact schema. Compare applied migration identifiers with the repository migration filenames. Record missing, duplicate, unknown and out-of-order entries. Do not infer that a migration is applied merely because its file exists in Git.

Confirm the authorization table definitions and constraints:

```sql
SELECT table_schema, table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND table_name IN ('app_role', 'app_permission', 'app_user_role',
                     'app_user_permission', 'app_user')
ORDER BY table_name, ordinal_position;

SELECT conrelid::regclass AS table_name, conname, contype,
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN (
  to_regclass('app_role'), to_regclass('app_permission'),
  to_regclass('app_user_role'), to_regclass('app_user_permission')
)
ORDER BY conrelid::regclass::text, conname;
```

If the application uses a non-default schema, qualify all table names and adjust `current_schema()` before proceeding.

## 3. Inventory role catalogue and assignments

### 3.1 All deployed role rows and assignment counts

```sql
SELECT r.id AS role_id, r.role_code, r.name, r.description,
       count(ur.user_id) AS assignment_count,
       count(ur.user_id) FILTER (WHERE u.status = 'active') AS active_user_assignments,
       count(ur.user_id) FILTER (WHERE u.status IS DISTINCT FROM 'active') AS non_active_user_assignments
FROM app_role r
LEFT JOIN app_user_role ur ON ur.role_id = r.id
LEFT JOIN app_user u ON u.id = ur.user_id
GROUP BY r.id, r.role_code, r.name, r.description
ORDER BY r.role_code, r.id;
```

### 3.2 Role assignments with no personal data

```sql
SELECT ur.user_id, r.role_code, u.status AS user_status,
       count(*) OVER (PARTITION BY ur.user_id) AS role_count_for_user
FROM app_user_role ur
JOIN app_role r ON r.id = ur.role_id
LEFT JOIN app_user u ON u.id = ur.user_id
ORDER BY ur.user_id, r.role_code;
```

### 3.3 Duplicate and orphan role links

```sql
SELECT user_id, role_id, count(*) AS duplicate_count
FROM app_user_role
GROUP BY user_id, role_id
HAVING count(*) > 1
ORDER BY user_id, role_id;

SELECT ur.user_id, ur.role_id
FROM app_user_role ur
LEFT JOIN app_user u ON u.id = ur.user_id
LEFT JOIN app_role r ON r.id = ur.role_id
WHERE u.id IS NULL OR r.id IS NULL
ORDER BY ur.user_id, ur.role_id;
```

Do not treat multiple different roles on one user as duplicates. Review role combinations against the explicit separation-of-duties rules and the target user's actual operational responsibilities.

## 4. Inventory direct permissions and grants

### 4.1 Permission catalogue

```sql
SELECT permission_code, area, label, description, sensitive, system_only
FROM app_permission
ORDER BY permission_code;
```

### 4.2 Direct grants (user IDs only)

```sql
SELECT up.user_id, up.permission_code, u.status AS user_status,
       p.area, p.sensitive, p.system_only
FROM app_user_permission up
LEFT JOIN app_user u ON u.id = up.user_id
LEFT JOIN app_permission p ON p.permission_code = up.permission_code
ORDER BY up.user_id, up.permission_code;
```

### 4.3 Duplicate, unknown and orphan direct grants

```sql
SELECT user_id, permission_code, count(*) AS duplicate_count
FROM app_user_permission
GROUP BY user_id, permission_code
HAVING count(*) > 1
ORDER BY user_id, permission_code;

SELECT up.user_id, up.permission_code,
       CASE WHEN u.id IS NULL THEN 'orphan-user'
            WHEN p.permission_code IS NULL THEN 'unknown-permission'
            ELSE 'catalogued' END AS finding
FROM app_user_permission up
LEFT JOIN app_user u ON u.id = up.user_id
LEFT JOIN app_permission p ON p.permission_code = up.permission_code
WHERE u.id IS NULL OR p.permission_code IS NULL
ORDER BY finding, up.user_id, up.permission_code;

SELECT up.user_id, up.permission_code
FROM app_user_permission up
JOIN app_permission p ON p.permission_code = up.permission_code
WHERE p.system_only IS TRUE
ORDER BY up.user_id, up.permission_code;
```

A permission being present in `app_permission` does not prove that its semantics match the canonical source policy. Compare every deployed code with `PERMISSION_CATALOG` in `src/platform/authorization-policy.js`. The catalogue's `legacy-runtime` and `policy-defined` classifications must remain distinct from migration-seeded permissions.

## 5. Reconciliation classification worksheet

Export the query outputs and classify every distinct deployed role and permission code. Use one row per code, not one row per user assignment.

| Field | Required value |
|---|---|
| code_type | `role` or `permission` |
| code | Exact deployed code |
| database_present | Yes/No |
| migration_source | Exact applied migration ID, or `not found` |
| source_policy_status | canonical / legacy-runtime / policy-defined / deprecated / unknown |
| authority_domain | platform / organization / job / project / case / profile / self / not applicable |
| scope_type | global / organization / resource / assigned_case / self / not applicable |
| assignment_count | Count from inventory |
| active_assignment_count | Count for active accounts |
| proposed_disposition | retain / map / retire / investigate |
| replacement_code | Approved replacement, or blank |
| risk_and_impact | Explicitly document affected workflows and separation-of-duties concerns |
| reviewer | Named authorized reviewer |
| approval_reference | Change-control or governance approval ID |

Classify every role row, including zero-assignment roles. Classify every direct permission code, including codes that appear only in legacy assignments. Identify role combinations that cross independent duties (membership review/activation, finance verification/reversal, verification/appeals, ethics review, and organization/resource scope).

## 6. Reconciliation rules

- Unknown role codes are not platform-assignable. Do not delete them until every code reference, assignment and dependent workflow has been examined.
- Organization, job, project, profile, case and self-scoped roles must not be converted into global platform roles.
- Unknown direct permissions are not to be granted or silently renamed. Preserve the source rows while the owning workflow and migration provenance are investigated.
- Duplicate links may be removed only after confirming the database constraints, assignment provenance, audit requirements and a tested rollback.
- Inactive-user assignments are still inventory evidence; do not discard them automatically.
- A role with zero current assignments may still be referenced by code, historical records, integrations or provisioning flows.
- Never infer that a user should lose a grant merely because the user's account is inactive.
- Do not change role bundles, direct grants, session state, migrations or production records as part of this read-only phase.

## 7. Approval and migration gate

Before any write/migration phase, produce and approve:

1. Complete role and permission code inventory with source/migration provenance.
2. User-assignment and direct-grant exception report, restricted to internal IDs.
3. Explicit replacement/retirement mapping for every legacy code with assignments.
4. Separation-of-duties and tenant-scope impact assessment.
5. Reversible migration plan with pre/post row counts, backup reference, transaction strategy and rollback SQL.
6. Staging rehearsal results proving no required user capability is silently lost and no scoped role becomes global.
7. Independent approval from the platform/security owner.

Only after all seven items are approved may a separately authorized migration be prepared. The read-only inventory itself must never mutate data.

## 8. Completion record template

Record the following in the Phase 6 evidence section of `docs/65-platform-authorization-and-role-audit.md`:

- Inventory captured at (UTC):
- Environment/database identifier (no credentials):
- Database principal and read-only proof:
- Application commit:
- Migration ledger table and applied migration count:
- Role rows / distinct role codes / assigned role links:
- Permission rows / distinct permission codes / direct grant links:
- Duplicate and orphan counts:
- Unknown/unreconciled role and permission codes:
- Inactive-user assignment count:
- Export artifact location and access classification:
- Reviewer and approval reference:
- Explicit confirmation: no writes, migrations, grant changes, session revocations or deployment performed.

**Phase exit:** Source tooling and the safe read-only procedure are ready when this runbook is committed. Phase 6 operational reconciliation remains pending until the production inventory is captured, every deployed code is classified and the mapping is approved. No source-only change can truthfully satisfy that production-data exit gate.
