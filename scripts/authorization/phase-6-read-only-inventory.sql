-- MPA Authorization Phase 6: read-only inventory.
-- Run with a SELECT-only database role. No DDL/DML is present in this file.
-- Capture outputs in a restricted evidence location; user IDs are sensitive.
BEGIN TRANSACTION READ ONLY;

-- 0. Environment and read-only transaction proof.
SHOW transaction_read_only;
SELECT current_database() AS database_name,
       current_user AS database_principal,
       current_setting('server_version') AS postgres_version,
       now() AT TIME ZONE 'UTC' AS captured_at_utc;

-- 1. Discover migration ledger candidates. Inspect the result and query the
-- confirmed ledger table separately; do not assume a table name or schema.
SELECT table_schema, table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  AND (table_name ILIKE '%migration%'
       OR table_name ILIKE '%schema%version%'
       OR column_name ILIKE '%migration%'
       OR column_name ILIKE '%version%')
ORDER BY table_schema, table_name, ordinal_position;

-- 2. Confirm authorization table columns and constraints before interpreting
-- the inventory. Adjust current_schema() if the application uses another one.
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

-- 3. Deployed role catalogue, including unused role rows and assignment counts.
SELECT r.id AS role_id, r.role_code, r.name, r.description,
       count(ur.user_id) AS assignment_count,
       count(ur.user_id) FILTER (WHERE u.status = 'active') AS active_user_assignments,
       count(ur.user_id) FILTER (WHERE u.status IS DISTINCT FROM 'active') AS non_active_user_assignments
FROM app_role r
LEFT JOIN app_user_role ur ON ur.role_id = r.id
LEFT JOIN app_user u ON u.id = ur.user_id
GROUP BY r.id, r.role_code, r.name, r.description
ORDER BY r.role_code, r.id;

-- 4. User-role links, using internal IDs only (no names, emails or credentials).
SELECT ur.user_id, r.role_code, u.status AS user_status,
       count(*) OVER (PARTITION BY ur.user_id) AS role_count_for_user
FROM app_user_role ur
JOIN app_role r ON r.id = ur.role_id
LEFT JOIN app_user u ON u.id = ur.user_id
ORDER BY ur.user_id, r.role_code;

-- 5. Duplicate and orphan role links.
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

-- 6. Permission catalogue and direct grants.
SELECT permission_code, area, label, description, sensitive, system_only
FROM app_permission
ORDER BY permission_code;

SELECT up.user_id, up.permission_code, u.status AS user_status,
       p.area, p.sensitive, p.system_only
FROM app_user_permission up
LEFT JOIN app_user u ON u.id = up.user_id
LEFT JOIN app_permission p ON p.permission_code = up.permission_code
ORDER BY up.user_id, up.permission_code;

-- 7. Duplicate, unknown and orphan direct grants, plus system-only grants.
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

-- This transaction is read-only. End it without changing database state.
ROLLBACK;
