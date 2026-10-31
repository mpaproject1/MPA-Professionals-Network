import {createHash} from "node:crypto";
import {readdir, readFile} from "node:fs/promises";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
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
  "20261023_support_inquiry_workflow.sql",
  "20261025120000_serve_community_g2_lifecycle.sql",
  "20261025130000_serve_community_g3_impact_metrics.sql",
  "20261025140000_serve_community_g4_announcement_commitment_experience.sql",
  "20261025150000_serve_community_g6_outcome_proof.sql",
  "20261029160000_account_references_and_governance.sql",
  "20261031110000_network_plus_business_discovery.sql",
  "20261031120000_network_plus_request_collaboration.sql",
  "20261031130000_serve_community_initiatives.sql",
  "20261031140000_serve_community_offline_completed_projects.sql",
  "20261031150000_community_impact_detection.sql",
  "20261031170000_community_impact_retention_policy.sql",
  "20261031180000_community_impact_manual_claims.sql"
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
  ["service_request_feedback", "request_id", "uuid"],
  ["service_request_feedback", "reviewer_user_id", "uuid"],
  ["talent_inquiry", "id", "uuid"],
  ["verification_reference_request", "id", "uuid"],
  ["verification_reference_request", "case_id", "uuid"],
  ["verification_reference_request", "referee_contact", "text"],
  ["verification_reference_request", "consent_status", "text"],
  ["verification_reference_request", "verification_status", "text"],
  ["verification_reference_request", "requested_at", "timestamptz"],
  ["verification_case", "id", "uuid"],
  ["professional_profile", "id", "uuid"],
  ["support_conversation", "id", "uuid"],
  ["service_listing", "completion_evidence_policy", "text"],
  ["service_listing", "fulfilment_rule", "text"],
  ["service_listing", "fulfilment_target_count", "int4"],
  ["service_request", "provider_completion_submitted_by", "uuid"],
  ["service_request", "requester_outcome_decision", "text"],
  ["service_request", "requester_outcome_decision_by", "uuid"],
  ["service_request", "requester_outcome_decision_at", "timestamptz"],
  ["service_request", "requester_outcome_note", "text"],
  ["service_request", "final_outcome_summary", "text"],
  ["service_request", "completion_evidence_delivery_id", "uuid"],
  ["service_request_completion_event", "id", "uuid"],
  ["service_request_completion_event", "request_id", "uuid"],
  ["service_request_completion_event", "actor_user_id", "uuid"],
  ["service_request_completion_event", "event_type", "text"],
  ["service_request_completion_event", "evidence_delivery_id", "uuid"],
  ["service_request_completion_event", "created_at", "timestamptz"],
  ["network_plus_request", "id", "uuid"],
  ["network_plus_request", "intent", "text"],
  ["network_plus_request", "status", "text"],
  ["network_plus_request", "requester_user_id", "uuid"],
  ["network_plus_request_participant", "request_id", "uuid"],
  ["network_plus_request_event", "request_id", "uuid"],
  ["network_plus_request_event", "idempotency_hash", "text"],
  ["network_plus_request_event", "request_fingerprint", "text"],
  ["network_plus_request_event", "reason", "text"],
  ["network_plus_collaboration_workspace", "request_id", "uuid"],
  ["network_plus_collaboration_milestone", "workspace_id", "uuid"],
  ["network_plus_collaboration_milestone", "idempotency_hash", "text"],
  ["network_plus_collaboration_milestone", "request_fingerprint", "text"],
  ["network_plus_collaboration_event", "workspace_id", "uuid"],
  ["network_plus_collaboration_event", "idempotency_hash", "text"],
  ["network_plus_collaboration_event", "request_fingerprint", "text"],
  ["network_plus_request_support_grant", "request_id", "uuid"],
  ["network_plus_request_support_grant", "support_user_id", "uuid"],
  ["network_plus_request_support_grant", "support_case_reference", "text"],
  ["network_plus_request_support_grant", "expires_at", "timestamptz"],
  ["serve_community_initiative","id","uuid"],["serve_community_initiative","owner_user_id","uuid"],["serve_community_initiative","owner_organization_id","uuid"],["serve_community_initiative","status","text"],
  ["serve_community_initiative_event","initiative_id","uuid"],["serve_community_initiative_event","actor_user_id","uuid"],
  ["serve_community_participation","initiative_id","uuid"],["serve_community_participation","participant_user_id","uuid"],["serve_community_participation","consent_text_hash","text"],["serve_community_participation","contact_consent","bool"],
  ["serve_community_participation_consent_event","participation_id","uuid"],["serve_community_participation_consent_event","actor_user_id","uuid"],
  ["serve_community_participation_event","participation_id","uuid"],["serve_community_legacy_classification","service_listing_id","uuid"],["serve_community_legacy_classification","initiative_id","uuid"],

];

const client = new Client({ connectionString, application_name: "mpa-migration-compatibility-check" });
let transactionOpen = false;
try {
  await client.connect();
  const identity = (await client.query("select current_database() as database_name, current_schema() as schema_name")).rows[0];
  if (identity.database_name !== expectedDatabase) {
    throw new Error(`Connected to database "${identity.database_name}", not the explicitly approved "${expectedDatabase}".`);
  }
  if (!/(test|sandbox|ci|verify)/i.test(identity.database_name)) {
    throw new Error("Database name must clearly identify a disposable test/sandbox/CI/verification database; shared staging databases are not accepted.");
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
  if (recorded.size === 0) {
    throw new Error("Migration history is empty. Establish an operator-confirmed baseline with the repository migration process before checking compatibility.");
  }
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
  const lastPreGateMigration = "20261016200000_saved_discovery_items.sql";
  const baselineIndex = repositoryMigrationFiles.indexOf(lastPreGateMigration);
  if (baselineIndex < 0) throw new Error(`Expected baseline marker ${lastPreGateMigration} is missing from this revision.`);
  const missingBaselineFiles = repositoryMigrationFiles.slice(0,baselineIndex+1).filter(filename=>!recorded.has(filename));
  if (missingBaselineFiles.length) {
    throw new Error("Migration history is not confirmed through the last pre-gate migration. Reconcile the test database baseline before applying the gate migrations:\\n- " + missingBaselineFiles.join("\\n- "));
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
    ["network_plus_business","id","uuid"],
    ["network_plus_business","business_kind","text"],
    ["network_plus_business","verification_status","text"],
    ["network_plus_business","moderation_submitted_by","uuid"],
    ["network_plus_business","request_idempotency_hash","text"],
    ["network_plus_business","request_fingerprint","text"],
    ["network_plus_business_ownership","business_id","uuid"],
    ["network_plus_business_ownership","owner_user_id","uuid"],
    ["network_plus_business_ownership","owner_organization_id","uuid"],
    ["network_plus_business_ownership","consent_status","text"],
    ["network_plus_business_access","capability_code","text"],
    ["network_plus_business_access","user_id","uuid"],
    ["network_plus_business_verification_case","business_id","uuid"],
    ["network_plus_business_verification_case","submitted_by","uuid"],
    ["network_plus_business_verification_case","status","text"],
    ["network_plus_business_verification_evidence","case_id","uuid"],
    ["network_plus_business_verification_evidence","file_object_id","uuid"],
    ["network_plus_service_listing","business_id","uuid"],
    ["network_plus_service_listing","submitted_by","uuid"],
    ["network_plus_service_listing","request_idempotency_hash","text"],
    ["network_plus_service_listing","request_fingerprint","text"],
    ["network_plus_service_listing_event","listing_id","uuid"],
    ["network_plus_business_event","business_id","uuid"],
    ["network_plus_business_event","actor_user_id","uuid"],
    ["app_user","account_reference","text"],
    ["app_user","account_reference_source","text"],
    ["app_user","account_reference_assigned_at","timestamptz"],
    ["service_listing","lifecycle_status","text"],
    ["service_listing","expires_at","timestamptz"],
    ["service_listing","completion_evidence_policy","text"],
    ["service_listing","fulfilment_rule","text"],
    ["service_listing","fulfilment_target_count","int4"],
    ["service_request","provider_completion_submitted_by","uuid"],
    ["service_request","requester_outcome_decision","text"],
    ["service_request","requester_outcome_decision_by","uuid"],
    ["service_request","requester_outcome_decision_at","timestamptz"],
    ["service_request","requester_outcome_note","text"],
    ["service_request","final_outcome_summary","text"],
    ["service_request","completion_evidence_delivery_id","uuid"],
    ["service_request_completion_event","id","uuid"],
    ["service_request_completion_event","request_id","uuid"],
    ["service_request_completion_event","actor_user_id","uuid"],
    ["service_request_completion_event","event_type","text"],
    ["service_request_completion_event","evidence_delivery_id","uuid"],
    ["service_request_completion_event","created_at","timestamptz"],
    ["service_listing_lifecycle_event","listing_id","uuid"],
    ["service_listing_lifecycle_event","actor_user_id","uuid"],
    ["service_listing_interest","listing_id","uuid"],
    ["service_listing_interest","individual_user_id","uuid"],
    ["service_listing_interest","organization_id","uuid"],
    ["service_listing_interest","actor_user_id","uuid"],
    ["service_listing_pledge","listing_id","uuid"],
    ["service_listing_pledge","individual_user_id","uuid"],
    ["service_listing_pledge","organization_id","uuid"],
    ["service_listing_pledge","actor_user_id","uuid"],
    ["service_listing_pledge","request_idempotency_hash","text"],
    ["service_listing_pledge","request_fingerprint","text"],
    ["service_request_agreement","request_id","uuid"],
    ["service_request_agreement","terms_version","int4"],
    ["service_request_agreement","terms_hash","text"],
    ["service_listing_announcement","listing_id","uuid"],
    ["service_listing_announcement","author_user_id","uuid"],
    ["service_request_feedback","category","text"],
    ["service_request_update","request_id","uuid"],
    ["service_request_update","author_user_id","uuid"],
    ["service_request_update","category","text"],
    ["service_request_update","request_idempotency_hash","text"],
    ["service_request_update","request_fingerprint","text"],
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
    ["support_conversation_workflow","updated_by","uuid"],
    ["serve_community_offline_project","id","uuid"],
    ["serve_community_offline_project","completion_date","date"],
    ["serve_community_offline_project","beneficiary_count","int4"],
    ["serve_community_offline_project","outcome_metrics","jsonb"],
    ["serve_community_offline_project","image_urls","jsonb"],
    ["serve_community_offline_project","image_alt_text","jsonb"],
    ["serve_community_offline_project","offline_source","text"],
    ["serve_community_offline_project","consent_confirmed","bool"],
    ["serve_community_offline_project","public_visible","bool"],
    ["serve_community_offline_project","source_reference","text"],
    ["serve_community_offline_project","video_urls","jsonb"],
    ["serve_community_offline_project","created_by","uuid"],
    ["serve_community_offline_project","updated_by","uuid"],
    ["serve_community_offline_project","status","text"],
    ["serve_community_offline_project_event","id","uuid"],
    ["serve_community_offline_project_event","project_id","uuid"],
    ["serve_community_offline_project_event","actor_user_id","uuid"],
    ["serve_community_offline_project_event","event_code","text"],
    ["serve_community_offline_project_event","reason","text"],
    ["serve_community_offline_project_event","created_at","timestamptz"]
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

  const requiredNotNull = [
    ["service_listing","lifecycle_status"],
    ["verification_reference_request","updated_at"],
    ["mentorship_match","mentee_consent_status"],
    ["support_conversation_workflow","conversation_id"],
    ["support_conversation_workflow","priority"],
    ["support_conversation_workflow","waiting_on"],
    ["support_conversation_workflow","created_at"],
    ["support_conversation_workflow","updated_at"],
    ["serve_community_offline_project","created_by"],
    ["serve_community_offline_project","updated_by"],
    ["serve_community_offline_project","status"],
    ["serve_community_offline_project_event","project_id"],
    ["serve_community_offline_project_event","actor_user_id"],
    ["serve_community_offline_project_event","event_code"],
    ["serve_community_offline_project_event","reason"],
    ["serve_community_offline_project_event","created_at"]
  ];
  for (const [table,column] of requiredNotNull) {
    const result = await client.query(
      `select a.attnotnull
         from pg_attribute a
         join pg_class c on c.oid=a.attrelid
         join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname=$1 and a.attname=$2 and not a.attisdropped`,
      [table,column]
    );
    if (!result.rows[0]?.attnotnull) throw new Error(`Expected ${table}.${column} to be NOT NULL.`);
  }

  const requiredDefaults = [
    ["service_listing","lifecycle_status","draft"],
    ["verification_reference_request","updated_at","now"],
    ["mentorship_match","mentee_consent_status","pending"],
    ["support_conversation_workflow","priority","normal"],
    ["support_conversation_workflow","waiting_on","none"],
    ["support_conversation_workflow","created_at","now"],
    ["support_conversation_workflow","updated_at","now"]
  ];
  for (const [table,column,expected] of requiredDefaults) {
    const result = await client.query(
      `select pg_get_expr(d.adbin,d.adrelid) as expression
         from pg_attribute a
         join pg_class c on c.oid=a.attrelid
         join pg_namespace n on n.oid=c.relnamespace
         left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
        where n.nspname='public' and c.relname=$1 and a.attname=$2 and not a.attisdropped`,
      [table,column]
    );
    if (!result.rows[0]?.expression || !result.rows[0].expression.toLowerCase().includes(expected)) {
      throw new Error(`Expected default ${expected} for ${table}.${column}.`);
    }
  }

  const referencePriceConstraint = (await client.query("select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='public.service_listing'::regclass and conname='service_listing_reference_price_check' and contype='c'")).rows[0];
  if (!referencePriceConstraint || !referencePriceConstraint.definition.includes("reference_price_amount") || !referencePriceConstraint.definition.includes("impact_model")) throw new Error("G3 reference price check constraint is missing or incomplete.");

  const impactColumns = (await client.query("select column_name,udt_name,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name='service_listing' and column_name in ('impact_model','reference_price_amount')")).rows;
  const impactModelColumn=impactColumns.find(row=>row.column_name==="impact_model");
  if (impactColumns.length!==2 || !impactModelColumn || impactModelColumn.udt_name!=="text" || impactModelColumn.is_nullable!=="NO" || !String(impactModelColumn.column_default||"").includes("standard") || !impactColumns.some(row=>row.column_name==="reference_price_amount"&&row.udt_name==="numeric")) throw new Error("G3 impact columns are missing or have unexpected types/default/nullability.");

  const expiryDefinition = (await client.query("select a.attnotnull, pg_get_expr(d.adbin,d.adrelid) as expression from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where n.nspname='public' and c.relname='service_listing' and a.attname='expires_at' and not a.attisdropped")).rows[0];
  if (!expiryDefinition || expiryDefinition.attnotnull || expiryDefinition.expression) throw new Error("service_listing.expires_at must remain nullable with no expiry default.");

  const requiredForeignKeys = [
    ["serve_community_offline_project","created_by","app_user","id"],
    ["serve_community_offline_project","updated_by","app_user","id"],
    ["serve_community_offline_project","reviewed_by","app_user","id"],
    ["serve_community_offline_project_event","project_id","serve_community_offline_project","id"],
    ["serve_community_offline_project_event","actor_user_id","app_user","id"],
    ["network_plus_business","created_by","app_user","id"],
    ["network_plus_business","verified_by","app_user","id"],
    ["network_plus_business","moderation_submitted_by","app_user","id"],
    ["network_plus_business_ownership","business_id","network_plus_business","id"],
    ["network_plus_business_ownership","owner_user_id","app_user","id"],
    ["network_plus_business_ownership","owner_organization_id","organization","id"],
    ["network_plus_business_ownership","created_by","app_user","id"],
    ["network_plus_business_access","business_id","network_plus_business","id"],
    ["network_plus_business_access","user_id","app_user","id"],
    ["network_plus_business_access","granted_by","app_user","id"],
    ["network_plus_business_verification_case","business_id","network_plus_business","id"],
    ["network_plus_business_verification_case","submitted_by","app_user","id"],
    ["network_plus_business_verification_case","reviewer_user_id","app_user","id"],
    ["network_plus_business_verification_evidence","case_id","network_plus_business_verification_case","id"],
    ["network_plus_business_verification_evidence","file_object_id","file_object","id"],
    ["network_plus_business_verification_evidence","created_by","app_user","id"],
    ["network_plus_service_listing","business_id","network_plus_business","id"],
    ["network_plus_service_listing","created_by","app_user","id"],
    ["network_plus_service_listing","submitted_by","app_user","id"],
    ["network_plus_service_listing","reviewed_by","app_user","id"],
    ["network_plus_service_listing_event","listing_id","network_plus_service_listing","id"],
    ["network_plus_service_listing_event","actor_user_id","app_user","id"],
    ["network_plus_business_event","business_id","network_plus_business","id"],
    ["network_plus_business_event","actor_user_id","app_user","id"],
    ["service_listing_lifecycle_event","listing_id","service_listing","id"],
    ["service_listing_lifecycle_event","actor_user_id","app_user","id"],
    ["service_listing_interest","listing_id","service_listing","id"],
    ["service_listing_interest","individual_user_id","app_user","id"],
    ["service_listing_interest","organization_id","organization","id"],
    ["service_listing_interest","actor_user_id","app_user","id"],
    ["service_listing_pledge","listing_id","service_listing","id"],
    ["service_listing_pledge","individual_user_id","app_user","id"],
    ["service_listing_pledge","organization_id","organization","id"],
    ["service_listing_pledge","actor_user_id","app_user","id"],
    ["service_request_agreement","request_id","service_request","id"],
    ["service_request_agreement","provider_accepted_by","app_user","id"],
    ["service_request_agreement","requester_accepted_by","app_user","id"],
    ["service_request_update","request_id","service_request","id"],
    ["service_request_update","author_user_id","app_user","id"],
    ["service_listing_announcement","listing_id","service_listing","id"],
    ["service_listing_announcement","author_user_id","app_user","id"],
    ["service_listing_announcement","moderated_by","app_user","id"],
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
    ["support_conversation_workflow","updated_by","app_user","id"],
    ["serve_community_initiative","owner_user_id","app_user","id"],
    ["serve_community_initiative","owner_organization_id","organization","id"],
    ["serve_community_initiative","created_by","app_user","id"],
    ["serve_community_initiative","submitted_by","app_user","id"],
    ["serve_community_initiative","reviewed_by","app_user","id"],
    ["serve_community_initiative_event","initiative_id","serve_community_initiative","id"],
    ["serve_community_initiative_event","actor_user_id","app_user","id"],
    ["serve_community_participation","initiative_id","serve_community_initiative","id"],
    ["serve_community_participation","participant_user_id","app_user","id"],
    ["serve_community_participation","decided_by","app_user","id"],
    ["serve_community_participation_consent_event","participation_id","serve_community_participation","id"],
    ["serve_community_participation_consent_event","actor_user_id","app_user","id"],
    ["serve_community_participation_event","participation_id","serve_community_participation","id"],
    ["serve_community_participation_event","actor_user_id","app_user","id"],
    ["serve_community_legacy_classification","service_listing_id","service_listing","id"],
    ["serve_community_legacy_classification","initiative_id","serve_community_initiative","id"],
    ["serve_community_legacy_classification","proposed_by","app_user","id"],
    ["serve_community_legacy_classification","reviewed_by","app_user","id"],
    ["serve_community_legacy_classification_event","classification_id","serve_community_legacy_classification","id"],
    ["serve_community_legacy_classification_event","actor_user_id","app_user","id"]
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
    "ux_network_plus_business_idempotency_hash",
    "ux_network_plus_business_member_owner",
    "ux_network_plus_business_org_owner",
    "ux_network_plus_business_primary_owner",
    "ux_network_plus_service_idempotency_hash",
    "ux_marketplace_demand_idempotency_hash",
    "ux_mentorship_request_idempotency_hash",
    "ux_service_request_idempotency_hash",
    "ux_service_listing_idempotency_hash",
    "ux_service_listing_interest_active_individual",
    "ux_service_listing_interest_active_organization",
    "ux_service_listing_pledge_idempotency_hash",
    "ux_service_listing_announcement_idempotency_hash",
    "ux_service_request_update_idempotency_hash",
    "ux_talent_inquiry_idempotency_hash",
    "ux_mentorship_match_one_open_request",
    "ux_network_plus_request_idempotency",
    "ux_network_plus_request_event_idempotency",
    "ux_network_plus_collaboration_event_idempotency",
    "ux_network_plus_collaboration_milestone_idempotency",
    "ux_serve_community_initiative_idempotency_hash","ux_serve_community_participation_idempotency_hash","ux_serve_community_participation_active","ux_serve_community_legacy_classification_initiative"
  ];
  for (const name of requiredUniqueIndexes) {
    const row = (await client.query(
      "select indexdef from pg_indexes where schemaname='public' and indexname=$1",
      [name]
    )).rows[0];
    if (!row || !row.indexdef.toUpperCase().includes("CREATE UNIQUE INDEX")) {
      throw new Error(`Required unique index ${name} is missing or not unique.`);
    }
    if (["ux_marketplace_demand_idempotency_hash","ux_mentorship_request_idempotency_hash","ux_service_request_idempotency_hash","ux_service_listing_idempotency_hash","ux_service_listing_pledge_idempotency_hash","ux_service_request_update_idempotency_hash","ux_talent_inquiry_idempotency_hash"].includes(name) &&
        (!row.indexdef.includes("request_idempotency_hash") || !row.indexdef.toLowerCase().includes("where"))) {
      throw new Error(`Idempotency index ${name} must uniquely index the request hash and exclude null keys.`);
    }
    if (name === "ux_mentorship_match_one_open_request" &&
        (!row.indexdef.toLowerCase().includes("where") ||
         !row.indexdef.includes("mentee_consent_status") ||
         !row.indexdef.includes("'proposed'") ||
         !row.indexdef.includes("'accepted'") ||
         !row.indexdef.includes("'declined'"))) {
      throw new Error("The mentorship rematching index must be partial and cover only proposed/accepted matches that have not been declined by the mentee.");
    }
  }
  const supportGrantIndex=await client.query("select 1 from pg_indexes where schemaname=$1 and indexname=$2",["public","ix_network_plus_request_support_grant_active"]);
  if(!supportGrantIndex.rowCount) throw new Error("The active request-scoped support grant index is missing.");

  const publicInquiryTokenIndex = await client.query(
    "select indexdef from pg_indexes where schemaname='public' and tablename='public_opportunity_inquiry' and indexdef ilike 'CREATE UNIQUE INDEX%' and indexdef ilike '%continuation_token_hash%'"
  );
  if (!publicInquiryTokenIndex.rowCount) {
    throw new Error("public_opportunity_inquiry.continuation_token_hash must remain uniquely indexed for safe public-inquiry replay.");
  }
  const oldRequestUnique = await client.query(
    "select count(*)::int as count from pg_constraint where conrelid='public.mentorship_match'::regclass and contype='u' and pg_get_constraintdef(oid)='UNIQUE (request_id)'"
  );
  if (oldRequestUnique.rows[0].count > 0) {
    throw new Error("The old one-match-per-request unique constraint remains and would prevent declined-match rematching.");
  }

  const requiredChecks = [
    ["service_listing","service_listing_lifecycle_status_check",["draft","pending_review","active","paused","fulfilled","archived","suspended","rejected"]],
    ["service_listing","service_listing_impact_model_check",["standard","pro_bono","community_discount","capacity_grant"]],
    ["service_listing","service_listing_impact_pricing_check",["standard","pro_bono","community_discount","capacity_grant"]],
    ["service_listing","service_listing_completion_evidence_policy_check",["accepted_delivery","private_file","description_only"]],
    ["service_listing","service_listing_fulfilment_rule_check",["manual","single_engagement","engagement_count"]],
    ["service_request","service_request_requester_outcome_decision_check",["accepted","revision_requested","disputed"]],
    ["service_listing_lifecycle_event","service_listing_lifecycle_event_to_status_check",["draft","pending_review","active","paused","fulfilled","archived","suspended","rejected"]],
    ["service_request_feedback","service_request_feedback_category_check",["service_quality","communication","timeliness","outcome","accessibility","other"]],
    ["service_request_update","service_request_update_category_check",["progress","schedule_change","delivery_note","blocker","handover"]],
    ["service_listing_announcement","service_listing_announcement_participant_audience_archived_check",["participants","archived"]],
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

  const serveRoles=await client.query("select role_code from app_role where role_code='serve_community_reviewer'");
  const servePermissions=await client.query("select permission_code,system_only from app_permission where permission_code=any($1::text[])",[["serve_community.initiatives.moderate","serve_community.legacy.classify"]]);
  if(!serveRoles.rowCount||servePermissions.rowCount!==2||servePermissions.rows.some(x=>x.system_only!==true))throw new Error("Serve-Community reviewer role and system-only permissions are missing.");
  const serveTriggers=await client.query("select count(*)::int count from pg_trigger where not tgisinternal and tgname=any($1::text[])",[["trg_serve_community_initiative_event_immutable","trg_serve_community_participation_event_immutable","trg_serve_community_consent_event_immutable","trg_serve_community_legacy_classification_event_immutable"]]);
  if(serveTriggers.rows[0].count!==4)throw new Error("Serve-Community append-only history triggers are missing.");
  const noLegacyBackfill=await client.query("select count(*)::int count from serve_community_legacy_classification");
  if(noLegacyBackfill.rows[0].count!==0)throw new Error("Fresh migration unexpectedly created legacy classification rows.");
  const requestChecks = [
    ["network_plus_request","network_plus_request_intent_check",["service_request","supplier_inquiry","referral","expertise_request","partnership_proposal","collaboration_request"]],
    ["network_plus_request","network_plus_request_status_check",["draft","submitted","under_review","clarification_requested","accepted","declined","withdrawn","in_progress","completed","disputed","closed"]],
    ["network_plus_collaboration_workspace","network_plus_collaboration_workspace_status_check",["active","blocked","disputed","completed","closed"]],
    ["network_plus_collaboration_milestone","network_plus_collaboration_milestone_status_check",["not_started","in_progress","blocked","completed","cancelled"]]
  ];
  for (const [table,name,values] of requestChecks) {
    const row=(await client.query("select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid=$1::regclass and conname=$2 and contype='c'",[`public.${table}`,name])).rows[0];
    if(!row||values.some(value=>!row.definition.includes(`'${value}'`))) throw new Error(`Increment 6 check constraint ${table}.${name} is missing expected states.`);
  }
  const workspaceTrigger=await client.query("select 1 from pg_trigger where tgname='trg_network_plus_workspace_requires_acceptance' and not tgisinternal");
  if(!workspaceTrigger.rowCount) throw new Error("Collaboration workspace database acceptance trigger is missing.");
  const supportRole=await client.query("select 1 from app_role where role_code='network_plus_support'");
  if(!supportRole.rowCount) throw new Error("The scoped Network-Plus support role is missing.");
  const supportGrantTable=await client.query("select 1 from information_schema.tables where table_schema=$1 and table_name=$2",["public","network_plus_request_support_grant"]);
  if(!supportGrantTable.rowCount) throw new Error("The expiring request-scoped support grant table is missing.");
  const immutableTriggers=await client.query("select count(*)::int count from pg_trigger where not tgisinternal and tgname=any($1::text[])",[["trg_network_plus_request_event_immutable","trg_network_plus_collaboration_event_immutable"]]);
  if(immutableTriggers.rows[0].count!==2) throw new Error("Request and collaboration event history must be append-only.");
  const businessPermissions = await client.query("select permission_code,system_only from app_permission where permission_code=any($1::text[])",[["business.verify","business.moderate"]]);
  if (businessPermissions.rowCount!==2 || businessPermissions.rows.some(row=>row.system_only!==true)) {
    throw new Error("Business verification/moderation permissions must be registered as system-only capabilities without user grants.");
  }
  const businessRoles = await client.query("select role_code from app_role where role_code=any($1::text[])",[["business_verification_reviewer","business_moderator"]]);
  if (businessRoles.rowCount!==2) throw new Error("Dedicated Network-Plus verification and moderation roles must be registered without automatic user assignments.");
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
  console.log("PASS: all listed migrations and post-migration schema assertions succeeded; all DDL was rolled back.");
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
