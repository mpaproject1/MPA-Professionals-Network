import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
const { Client } = pg;

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
  const repositoryMigrationFiles = (await readdir(migrationDirectory)).filter(name => name.endsWith(".sql")).sort();
  const repositoryMigrations = new Map();
  for (const filename of repositoryMigrationFiles) {
    const sql = await readFile(join(migrationDirectory, filename), "utf8");
    repositoryMigrations.set(filename, { sql, checksum: createHash("sha256").update(sql).digest("hex") });
  }
  for (const [filename, recordedChecksum] of recorded) {
    const current = repositoryMigrations.get(filename);
    if (!current) throw new Error(`Migration history contains ${filename}, but that migration file is missing from this revision.`);
    if (recordedChecksum !== current.checksum) {
      throw new Error(`Migration checksum mismatch for ${filename}; do not edit an applied migration. Create a forward corrective migration instead.`);
    }
  }
  const migrations = migrationNames.map(filename => {
    const migration = repositoryMigrations.get(filename);
    if (!migration) throw new Error(`Required migration file is missing: ${filename}`);
    return { filename, sql: migration.sql };
  });

  await client.query("begin");
  transactionOpen = true;
  await client.query("set local lock_timeout = '5s'");
  await client.query("set local statement_timeout = '60s'");
  for (const migration of migrations) {
    await client.query(migration.sql);
    console.log(`PASS: ${migration.filename} applied inside rollback-only transaction`);
  }
  const postMigrationColumns = [
    ["public_opportunity_inquiry","idempotency_request_hash","text"],
    ...["marketplace_demand","mentorship_request","service_request","service_listing","talent_inquiry"].flatMap(table=>[[table,"request_idempotency_hash","text"],[table,"request_fingerprint","text"]]),
    ["verification_reference_request","requester_user_id","uuid"],
    ["verification_reference_request","referee_user_id","uuid"],
    ["verification_reference_request","response_text","text"],
    ["verification_reference_request","responded_by","uuid"],
    ["verification_reference_request","reviewed_by","uuid"],
    ["verification_reference_request","review_reason","text"],
    ["verification_reference_request","reviewed_at","timestamptz"],
    ["verification_reference_request","updated_at","timestamptz"],
    ["verification_case_assignment_history","id","uuid"],
    ["verification_case_assignment_history","case_id","uuid"],
    ["verification_case_assignment_history","previous_reviewer_id","uuid"],
    ["verification_case_assignment_history","new_reviewer_id","uuid"],
    ["verification_case_assignment_history","changed_by","uuid"],
    ["professional_profile","cv_file_id","uuid"],
    ["professional_profile","cv_updated_at","timestamptz"],
    ["mentorship_match","mentee_consent_status","text"],
    ["mentorship_match","mentee_responded_at","timestamptz"],
    ["mentorship_match","mentee_response_note","text"],
    ["support_conversation_workflow","conversation_id","uuid"],
    ["support_conversation_workflow","priority","text"],
    ["support_conversation_workflow","waiting_on","text"],
    ["support_conversation_workflow","escalated_at","timestamptz"],
    ["support_conversation_workflow","escalated_by","uuid"],
    ["support_conversation_workflow","updated_by","uuid"]
  ];
  const columnErrors = [];
  for (const [table,column,type] of postMigrationColumns) {
    const result = await client.query(
      "select udt_name from information_schema.columns where table_schema='public' and table_name=$1 and column_name=$2",
      [table,column]
    );
    if (!result.rows[0]) columnErrors.push(`${table}.${column} missing after migration`);
    else if (result.rows[0].udt_name !== type) columnErrors.push(`${table}.${column} expected ${type}, found ${result.rows[0].udt_name}`);
  }
  if (columnErrors.length) throw new Error("Post-migration column checks failed:\\n- " + columnErrors.join("\\n- "));

  const requiredForeignKeys = [
    ["public_opportunity_inquiry","app_user_id","app_user","id"],
    ["marketplace_demand","requester_user_id","app_user","id"],
    ["mentorship_request","mentee_user_id","app_user","id"],
    ["mentorship_match","request_id","mentorship_request","id"],
    ["mentorship_match","mentor_user_id","app_user","id"],
    ["mentorship_match","mentee_user_id","app_user","id"],
    ["service_listing","provider_user_id","app_user","id"],
    ["service_request","service_listing_id","service_listing","id"],
    ["service_request","requester_user_id","app_user","id"],
    ["service_request","provider_user_id","app_user","id"],
    ["talent_inquiry","requester_user_id","app_user","id"],
    ["talent_inquiry","professional_user_id","app_user","id"],
    ["verification_reference_request","case_id","verification_case","id"],
    ["verification_reference_request","requester_user_id","app_user","id"],
    ["verification_reference_request","referee_user_id","app_user","id"],
    ["verification_reference_request","responded_by","app_user","id"],
    ["verification_reference_request","reviewed_by","app_user","id"],
    ["verification_case_assignment_history","case_id","verification_case","id"],
    ["verification_case_assignment_history","previous_reviewer_id","app_user","id"],
    ["verification_case_assignment_history","new_reviewer_id","app_user","id"],
    ["verification_case_assignment_history","changed_by","app_user","id"],
    ["professional_profile","cv_file_id","file_object","id"],
    ["support_conversation_workflow","conversation_id","support_conversation","id"],
    ["support_conversation_workflow","escalated_by","app_user","id"],
    ["support_conversation_workflow","updated_by","app_user","id"]
  ];
  const fkErrors = [];
  for (const [table,column,targetTable,targetColumn] of requiredForeignKeys) {
    const result = await client.query(
      `select 1
         from pg_constraint c
         join pg_class src on src.oid=c.conrelid
         join pg_namespace sn on sn.oid=src.relnamespace
         join pg_class dst on dst.oid=c.confrelid
         join pg_namespace dn on dn.oid=dst.relnamespace
         join unnest(c.conkey) with ordinality sk(attnum,ord) on true
         join unnest(c.confkey) with ordinality dk(attnum,ord) on dk.ord=sk.ord
         join pg_attribute sa on sa.attrelid=src.oid and sa.attnum=sk.attnum
         join pg_attribute da on da.attrelid=dst.oid and da.attnum=dk.attnum
        where c.contype='f' and sn.nspname='public' and dn.nspname='public'
          and src.relname=$1 and sa.attname=$2 and dst.relname=$3 and da.attname=$4
        limit 1`,
      [table,column,targetTable,targetColumn]
    );
    if (!result.rowCount) fkErrors.push(`${table}.${column} -> ${targetTable}.${targetColumn}`);
  }
  if (fkErrors.length) throw new Error("Foreign-key target checks failed:\\n- " + fkErrors.join("\\n- "));

  const consentConstraint = await client.query(
    "select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='public.mentorship_match'::regclass and conname='mentorship_match_mentee_consent_status_check'"
  );
  if (!consentConstraint.rows[0]?.definition?.includes("'pending'") ||
      !consentConstraint.rows[0]?.definition?.includes("'accepted'") ||
      !consentConstraint.rows[0]?.definition?.includes("'declined'")) {
    throw new Error("Mentorship mentee-consent check constraint is missing or has unexpected values.");
  }
  const requiredUniqueIndexes = [
    "ux_marketplace_demand_idempotency_hash",
    "ux_mentorship_request_idempotency_hash",
    "ux_service_request_idempotency_hash",
    "ux_service_listing_idempotency_hash",
    "ux_talent_inquiry_idempotency_hash",
    "ux_mentorship_match_one_open_request"
  ];
  for (const name of requiredUniqueIndexes) {
    const row = (await client.query(
      "select indexdef from pg_indexes where schemaname='public' and indexname=$1",
      [name]
    )).rows[0];
    if (!row || !row.indexdef.toUpperCase().includes("CREATE UNIQUE INDEX")) {
      throw new Error(`Required unique index ${name} is missing or not unique.`);
    }
    if (name === "ux_mentorship_match_one_open_request" &&
        (!row.indexdef.toLowerCase().includes("where") || !row.indexdef.includes("mentee_consent_status"))) {
      throw new Error("The mentorship rematching index must remain a partial index scoped to non-declined proposals.");
    }
  }

  const requiredChecks = [
    ["verification_reference_request","verification_reference_request_consent_status_check",["pending","accepted","consented","declined","withdrawn"]],
    ["verification_reference_request","verification_reference_request_verification_status_check",["pending","received","verified","insufficient","disputed","not_verified","needs_clarification"]],
    ["support_conversation_workflow","support_conversation_workflow_priority_check",["low","normal","high","urgent"]],
    ["support_conversation_workflow","support_conversation_workflow_waiting_on_check",["none","member","organization","provider","internal"]],
    ["mentorship_match","mentorship_match_mentee_consent_status_check",["pending","accepted","declined"]]
  ];
  for (const [table,name,values] of requiredChecks) {
    const row = (await client.query(
      "select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid=$1::regclass and conname=$2 and contype='c'",
      [`public.${table}`,name]
    )).rows[0];
    if (!row || values.some(value=>!row.definition.includes(`'${value}'`))) {
      throw new Error(`Check constraint ${table}.${name} is missing or does not contain the expected allowed values.`);
    }
  }

  const badBackfill = await client.query(`
    select count(*)::int as count
      from mentorship_match mm
      join mentorship m
        on m.request_id=mm.request_id
       and m.mentor_user_id=mm.mentor_user_id
       and m.mentee_user_id=mm.mentee_user_id
     where m.status='active'
       and mm.status in ('declined','cancelled','expired')
       and mm.mentee_consent_status='accepted'
  `);
  if (badBackfill.rows[0].count > 0) {
    throw new Error(`Mentorship history has ${badBackfill.rows[0].count} active relationship(s) linked to a declined/cancelled/expired match with accepted mentee consent.`);
  }
  const missingActiveConsent = await client.query(`
    select count(*)::int as count
      from mentorship m
      left join mentorship_match mm
        on m.request_id=mm.request_id
       and m.mentor_user_id=mm.mentor_user_id
       and m.mentee_user_id=mm.mentee_user_id
     where m.status='active'
       and (mm.id is null or mm.status<>'accepted' or mm.mentee_consent_status<>'accepted')
  `);
  if (missingActiveConsent.rows[0].count > 0) {
    throw new Error(`Mentorship consent migration left ${missingActiveConsent.rows[0].count} active relationship(s) without a matching accepted proposal and recorded mentee consent; review these records before applying.`);
  }

  await client.query("rollback");
  transactionOpen = false;
  console.log("PASS: all ten migrations and post-migration schema assertions succeeded; all DDL was rolled back.");
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
