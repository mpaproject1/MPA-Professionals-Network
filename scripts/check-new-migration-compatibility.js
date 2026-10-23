import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const expectedDatabase = process.env.MIGRATION_CHECK_EXPECTED_DATABASE;
const allowRollback = process.env.MIGRATION_CHECK_ALLOW_ROLLBACK;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) throw new Error("DATABASE_URL must point to a disposable test database.");
if (!expectedDatabase) throw new Error("Set MIGRATION_CHECK_EXPECTED_DATABASE to the exact disposable database name.");
if (allowRollback !== "YES") throw new Error("Set MIGRATION_CHECK_ALLOW_ROLLBACK=YES only after confirming this is a disposable test database.");
if (/(^|[_-])(prod|production|live)([_-]|$)/i.test(expectedDatabase)) {
  throw new Error("Refusing to run a migration compatibility check against a production/live database name.");
}

const migrationNames = [
  "20261023100000_public_inquiry_idempotency.sql",
  "20261023101000_marketplace_demand_idempotency.sql",
  "20261023102000_mentorship_request_idempotency.sql",
  "20261023103000_service_request_idempotency.sql",
  "20261023104000_service_listing_idempotency.sql",
  "20261023105000_talent_inquiry_idempotency.sql",
  "20261023110000_verification_reference_and_assignment_history.sql",
  "20261023111000_member_cv_vault.sql",
  "20261023120000_mentorship_explicit_mentee_consent.sql",
  "20261023_support_inquiry_workflow.sql"
];
const migrationDirectory = fileURLToPath(new URL("../db/migrations/", import.meta.url));
const requiredColumns = [
  ["app_user", "id", "uuid"],
  ["file_object", "id", "uuid"],
  ["public_opportunity_inquiry", "id", "uuid"],
  ["public_opportunity_inquiry", "continuation_token_hash", "text"],
  ["marketplace_demand", "id", "uuid"],
  ["marketplace_demand", "requester_user_id", "uuid"],
  ["mentorship_request", "id", "uuid"],
  ["mentorship_request", "mentee_user_id", "uuid"],
  ["mentorship_match", "id", "uuid"],
  ["mentorship_match", "request_id", "uuid"],
  ["mentorship_match", "mentor_user_id", "uuid"],
  ["mentorship_match", "mentee_user_id", "uuid"],
  ["mentorship_match", "status", "text"],
  ["mentorship_match", "proposed_at", "timestamptz"],
  ["mentorship", "request_id", "uuid"],
  ["mentorship", "mentor_user_id", "uuid"],
  ["mentorship", "mentee_user_id", "uuid"],
  ["mentorship", "status", "text"],
  ["service_listing", "id", "uuid"],
  ["service_request", "id", "uuid"],
  ["talent_inquiry", "id", "uuid"],
  ["verification_reference_request", "id", "uuid"],
  ["verification_reference_request", "case_id", "uuid"],
  ["verification_reference_request", "consent_status", "text"],
  ["verification_reference_request", "requested_at", "timestamptz"],
  ["verification_case", "id", "uuid"],
  ["professional_profile", "id", "uuid"],
  ["support_conversation", "id", "uuid"]
];

const client = new Client({ connectionString, application_name: "mpa-migration-compatibility-check" });
let transactionOpen = false;
try {
  await client.connect();
  const identity = (await client.query("select current_database() as database_name, current_schema() as schema_name")).rows[0];
  if (identity.database_name !== expectedDatabase) {
    throw new Error(`Connected to database "${identity.database_name}", not the explicitly approved "${expectedDatabase}".`);
  }
  if (!/(test|staging|sandbox|ci|verify)/i.test(identity.database_name)) {
    throw new Error("Database name must clearly identify a test/staging/sandbox/CI/verification database.");
  }
  if (identity.schema_name !== "public") throw new Error(`Expected public search schema; got "${identity.schema_name}".`);

  const missing = [];
  for (const [table, column, type] of requiredColumns) {
    const result = await client.query(
      "select udt_name from information_schema.columns where table_schema='public' and table_name=$1 and column_name=$2",
      [table, column]
    );
    if (!result.rows[0]) missing.push(`${table}.${column} (missing)`);
    else if (result.rows[0].udt_name !== type) missing.push(`${table}.${column} (expected ${type}, found ${result.rows[0].udt_name})`);
  }
  if (missing.length) throw new Error("Existing schema preflight failed:\n- " + missing.join("\n- "));

  const ledgerExists = (await client.query("select to_regclass('public.app_schema_migration') as name")).rows[0].name;
  if (!ledgerExists) {
    throw new Error("Migration history table public.app_schema_migration is missing. Establish the operator-confirmed legacy baseline using the documented migration process before checking compatibility.");
  }
  const ledgerRows = (await client.query("select filename, checksum from public.app_schema_migration")).rows;
  const recorded = new Map(ledgerRows.map(row => [row.filename, row.checksum]));
  const migrations = [];
  for (const filename of migrationNames) {
    const sql = await readFile(new URL(filename, `file://${migrationDirectory}/`), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    if (recorded.has(filename) && recorded.get(filename) !== checksum) {
      throw new Error(`Migration checksum mismatch for ${filename}; do not edit an applied migration. Create a forward corrective migration instead.`);
    }
    migrations.push({ filename, sql });
  }

  await client.query("begin");
  transactionOpen = true;
  await client.query("set local lock_timeout = '5s'");
  await client.query("set local statement_timeout = '60s'");
  for (const migration of migrations) {
    await client.query(migration.sql);
    console.log(`PASS: ${migration.filename} applied inside rollback-only transaction`);
  }
  await client.query("rollback");
  transactionOpen = false;
  console.log("PASS: all ten migrations are compatible with this existing schema in a transaction; all DDL was rolled back.");
  console.log("NOTE: this validates migration execution and existing column types/FK targets; it does not replace application-level integration tests.");
} catch (error) {
  if (transactionOpen) {
    try { await client.query("rollback"); } catch {}
    transactionOpen = false;
  }
  throw error;
} finally {
  await client.end();
}
