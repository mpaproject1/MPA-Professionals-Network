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
  "20261103120000_network_plus_phase0_contract_alignment.sql",
  "20261103130000_network_plus_phase1_needs_offers.sql",
  "20261103140000_network_plus_phase2_connection_handoff.sql",
  "20261103150000_network_plus_phase3_requester_disposition.sql",
  "20261103160000_finance_and_network_plus_notification_contracts.sql",
  "20261031130000_serve_community_initiatives.sql",
  "20261031140000_serve_community_offline_completed_projects.sql",
  "20261031150000_community_impact_detection.sql",
  "20261031170000_community_impact_retention_policy.sql",
  "20261031180000_community_impact_manual_claims.sql",
  "20261031200000_member_referrals.sql",
  "20261031210000_job_application_referral_code.sql",
  "20261031220000_referral_candidate_outcome_summary.sql",
  "20261031230000_referral_retention_snapshots.sql",
  "20261101090000_community_impact_governance_completion.sql",
  "20261101110000_community_impact_unified_score.sql",
  "20261101120000_community_impact_score_source_adapters.sql",
  "20261101130000_community_impact_score_history_guards.sql",
  "20261101140000_community_impact_score_policy_transition_guard.sql",
  "20261101150000_community_impact_score_single_reversal.sql",
  "20261101160000_community_impact_score_policy_rubric_config.sql",
  "20261101170000_community_impact_assessment_score_policy.sql",
  "20261101180000_community_impact_score_modifiers_and_rubrics.sql",
  "20261101190000_community_impact_score_effective_date_guard.sql",
  "20261101200000_community_impact_score_outcome_maturity_rule.sql",
  "20261101210000_community_impact_score_recipient_confirmation_rules.sql",
  "20261101220000_community_impact_score_recipient_confirmation_scope.sql",
  "20261101230000_community_impact_score_historical_dedup.sql",
  "20261101240000_community_impact_recognition_and_engagement.sql",
  "20261101250000_community_impact_recognition_program_governance.sql",
  "20261101260000_community_impact_recognition_lifecycle_guards.sql",
  "20261101270000_community_impact_notification_category.sql",
  "20261101280000_community_impact_governed_taxonomies.sql",
  "20261101290000_community_impact_taxonomy_code_constraints.sql",
  "20261102090000_community_impact_claim_candidate_one_to_one.sql",
  "20261102100000_community_impact_claim_candidate_many_to_one.sql",
  "20261102150000_membership_geography_and_fee_obligations.sql",
  "20261102160000_membership_fee_dispositions_and_backfill.sql",
  "20261102170000_membership_fee_disposition_idempotency.sql",
  "20261102180000_membership_fee_balance_currency_integrity.sql",
  "20261102190000_membership_geography_country_uniqueness.sql",
  "20261102200000_membership_import_allow_zero_declared_amount.sql"
];
const requiredCommunityImpactTaxonomyDatasets = ["community_impact_contribution_categories","community_impact_contribution_types","community_impact_contributor_roles","community_impact_evidence_types"];
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
  ["membership_geography_version","id","uuid"],
  ["membership_geography_unit","version_id","uuid"],
  ["membership_geography_unit","unit_code","text"],
  ["membership_geography_unit","metadata","jsonb"],
  ["member_residence","user_id","uuid"],
  ["member_residence","country_unit_id","uuid"],
  ["membership_fee_obligation","application_id","uuid"],
  ["membership_fee_obligation","membership_record_id","uuid"],
  ["membership_fee_obligation","amount_due","numeric"],
  ["membership_fee_obligation_payment","payment_transaction_id","uuid"],
  ["membership_fee_balance_disposition","idempotency_key","text"],
  ["membership_fee_adjustment","approved_by","uuid"],
  ["membership_fee_reminder","member_outbox_id","uuid"],
  ["membership_import_row","paid_amount","numeric"],
  ["community_impact_recognition_program", "id", "uuid"],
  ["community_impact_recognition_nomination", "id", "uuid"],
  ["community_impact_achievement_award", "id", "uuid"],
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
  ["network_plus_request", "recipient_response", "text"],
  ["network_plus_request", "recipient_response_by", "uuid"],
  ["network_plus_request", "recipient_response_at", "timestamptz"],
  ["network_plus_request", "requester_disposition", "text"],
  ["network_plus_request", "requester_disposition_remark", "text"],
  ["network_plus_request", "requester_disposition_updated_at", "timestamptz"],
  ["network_plus_request", "review_due_at", "timestamptz"],
  ["network_plus_request", "review_reminder_sent_at", "timestamptz"],
  ["network_plus_request", "recipient_withdrawn_at", "timestamptz"],
  ["network_plus_request_contact_consent", "request_id", "uuid"],
  ["network_plus_request_contact_consent", "recipient_user_id", "uuid"],
  ["network_plus_request_contact_consent", "field_code", "text"],
  ["network_plus_request_contact_consent", "requester_status", "text"],
  ["network_plus_request_contact_consent", "recipient_status", "text"],
  ["network_plus_request_contact_consent", "requester_value_ciphertext", "text"],
  ["network_plus_request_contact_consent", "recipient_value_ciphertext", "text"],
  ["network_plus_request_contact_consent", "requester_consented_at", "timestamptz"],
  ["network_plus_request_contact_consent", "recipient_consented_at", "timestamptz"],
  ["network_plus_request_contact_consent", "updated_at", "timestamptz"],
  ["network_plus_request_meeting", "id", "uuid"],
  ["network_plus_request_meeting", "request_id", "uuid"],
  ["network_plus_request_meeting", "proposer_user_id", "uuid"],
  ["network_plus_request_meeting", "responder_user_id", "uuid"],
  ["network_plus_request_meeting", "status", "text"],
  ["network_plus_request_meeting", "place_type", "text"],
  ["network_plus_request_meeting", "place_details", "text"],
  ["network_plus_request_meeting", "counter_place_type", "text"],
  ["network_plus_request_meeting", "counter_place_details", "text"],
  ["network_plus_request_meeting", "counter_starts_at", "timestamptz"],
  ["network_plus_request_meeting", "counter_timezone", "text"],
  ["network_plus_request_meeting", "counter_duration_minutes", "int4"],
  ["network_plus_request_meeting", "confirmed_place_type", "text"],
  ["network_plus_request_meeting", "confirmed_place_details", "text"],
  ["network_plus_request_meeting", "confirmed_starts_at", "timestamptz"],
  ["network_plus_request_meeting", "confirmed_timezone", "text"],
  ["network_plus_request_meeting", "starts_at", "timestamptz"],
  ["network_plus_request_meeting", "timezone", "text"],
  ["network_plus_request_meeting", "duration_minutes", "int4"],
  ["network_plus_request_meeting", "counter_starts_at", "timestamptz"],
  ["network_plus_request_meeting", "counter_timezone", "text"],
  ["network_plus_request_meeting", "counter_duration_minutes", "int4"],
  ["network_plus_request_meeting", "confirmed_starts_at", "timestamptz"],
  ["network_plus_request_meeting", "confirmed_timezone", "text"],
  ["network_plus_request_meeting", "confirmed_duration_minutes", "int4"],
  ["network_plus_request_meeting", "confirmed_by", "uuid"],
  ["network_plus_request_meeting", "confirmed_at", "timestamptz"],
  ["network_plus_request_meeting", "responded_by", "uuid"],
  ["network_plus_request_meeting", "responded_at", "timestamptz"],
  ["network_plus_request_meeting", "idempotency_hash", "text"],
  ["network_plus_request_meeting", "request_fingerprint", "text"],
  ["network_plus_request_clarification", "id", "uuid"],
  ["network_plus_request_clarification", "request_id", "uuid"],
  ["network_plus_request_clarification", "prompt_code", "text"],
  ["network_plus_request_clarification", "asked_by", "uuid"],
  ["network_plus_request_clarification", "answered_by", "uuid"],
  ["network_plus_request_clarification", "prompt_code", "text"],
  ["network_plus_request_clarification", "question", "text"],
  ["network_plus_request_clarification", "answer", "text"],
  ["network_plus_request_clarification", "status", "text"],
  ["network_plus_request_clarification", "answered_at", "timestamptz"],
  ["network_plus_request_clarification", "created_at", "timestamptz"],
  ["network_plus_request_clarification", "updated_at", "timestamptz"],
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

  // Capture objects that may already exist because this audit deliberately replays
  // migrations over an installed schema. A rollback must restore that exact baseline,
  // not erase objects that were present before the transaction.
  const taxonomyConstraintNames = ["community_impact_claim_category_code_check","community_impact_claim_contribution_type_code_check","community_impact_claim_contribution_role_code_check","community_impact_claim_evidence_type_code_check"];
  const taxonomyConstraintBaseline = await client.query(
    "select conrelid::regclass::text relation,conname,pg_get_constraintdef(oid) definition,convalidated from pg_constraint where conname=any($1::text[]) order by conrelid::regclass::text,conname",
    [taxonomyConstraintNames]
  );
  // The CI database has already applied the full migration set before this
  // compatibility rehearsal. These reference datasets may therefore exist
  // before BEGIN. Snapshot datasets, versions and items so rollback is checked
  // against the real pre-rehearsal state rather than an incorrect empty state.
  const taxonomyDataBaseline = await client.query(
    `select entity,row_data
       from (
         select 'dataset'::text entity,to_jsonb(d) row_data
           from reference_dataset d
          where d.dataset_key=any($1::text[])
         union all
         select 'version'::text entity,to_jsonb(v) row_data
           from reference_dataset_version v
           join reference_dataset d on d.id=v.dataset_id
          where d.dataset_key=any($1::text[])
         union all
         select 'item'::text entity,to_jsonb(i) row_data
           from reference_item i
           join reference_dataset_version v on v.id=i.dataset_version_id
           join reference_dataset d on d.id=v.dataset_id
          where d.dataset_key=any($1::text[])
       ) taxonomy_rows
      order by entity,row_data::text`,
    [requiredCommunityImpactTaxonomyDatasets]
  );

  const communityImpactGovernanceTableNames = ["community_impact_identity_assurance_case","community_impact_identity_assurance_evidence","community_impact_identity_assurance_decision","community_impact_detection_policy_governance","community_impact_detection_policy_event","community_impact_offline_attribution","community_impact_offline_attribution_evidence","community_impact_claim_candidate_link","community_impact_reviewer_conflict","community_impact_contribution_assessment","community_impact_contribution_assessment_event","community_impact_retention_evaluation","community_impact_governance_event"];
  const communityImpactGovernanceTriggerNames = ["trg_community_impact_block_conflicted_assignment","trg_community_impact_block_conflicted_decision","trg_community_impact_policy_event_immutable","trg_community_impact_assessment_event_immutable","trg_community_impact_governance_event_immutable","trg_community_impact_detection_policy_activation_guard","trg_community_impact_offline_attribution_guard","trg_community_impact_identity_decision_immutable","trg_community_impact_identity_evidence_immutable","trg_community_impact_retention_evaluation_immutable","trg_community_impact_assessment_guard"];
  const scoreTableNames = ["community_impact_score_policy_version","community_impact_score_active_policy","community_impact_score_policy_event","community_impact_score_ledger","community_impact_score_recalculation","community_impact_score_adjustment_event","community_impact_score_source_link","community_impact_score_source_link_event"];
  const scoreTriggerNames = ["trg_community_impact_score_ledger_immutable","trg_community_impact_score_policy_immutable","trg_community_impact_score_source_link_immutable","trg_community_impact_score_policy_event_immutable","trg_community_impact_score_recalculation_immutable","trg_community_impact_score_adjustment_event_immutable","trg_community_impact_score_source_link_event_immutable"];
  // The disposable CI database has already installed the complete migration set.
  // Snapshot every object group checked below so the rollback rehearsal verifies
  // exact restoration of the installed baseline, not an incorrectly assumed empty schema.
  const governanceTableBaseline = await client.query("select table_name from information_schema.tables where table_schema='public' and table_name=any($1::text[]) order by table_name",[communityImpactGovernanceTableNames]);
  const governanceTriggerBaseline = await client.query("select t.tgname trigger_name,t.tgrelid::regclass::text relation,pg_get_triggerdef(t.oid) definition from pg_trigger t where not t.tgisinternal and t.tgname=any($1::text[]) order by t.tgname,t.tgrelid::regclass::text",[communityImpactGovernanceTriggerNames]);
  const scoreTableBaseline = await client.query("select table_name from information_schema.tables where table_schema='public' and table_name=any($1::text[]) order by table_name",[scoreTableNames]);
  const scoreTriggerBaseline = await client.query("select t.tgname trigger_name,t.tgrelid::regclass::text relation,pg_get_triggerdef(t.oid) definition from pg_trigger t where not t.tgisinternal and t.tgname=any($1::text[]) order by t.tgname,t.tgrelid::regclass::text",[scoreTriggerNames]);
  const scoreColumnBaseline = await client.query("select table_name,column_name,udt_name,is_nullable,column_default from information_schema.columns where table_schema='public' and ((table_name='community_impact_score_source_link' and column_name='source_fingerprint') or (table_name='community_impact_contribution_assessment' and column_name='score_policy_version_id')) order by table_name,column_name");
  const scoreIndexNames = ["uq_community_impact_score_historical_fingerprint","uq_community_impact_score_ledger_single_reversal"];
  const scoreIndexBaseline = await client.query("select indexname,indexdef from pg_indexes where schemaname='public' and indexname=any($1::text[]) order by indexname",[scoreIndexNames]);
  const pushTableNames = ["notification_push_subscription","notification_push_delivery"];
  const pushTableBaseline = await client.query("select table_name from information_schema.tables where table_schema='public' and table_name=any($1::text[]) order by table_name",[pushTableNames]);
  const pushPreferenceDefaultBaseline=await client.query("select column_default from information_schema.columns where table_schema='public' and table_name='notification_preference' and column_name='push_enabled'");

  const networkPlusPhase2TableNames=["network_plus_request_contact_consent","network_plus_request_meeting","network_plus_request_clarification"];
  const networkPlusPhase2TableBaseline=await client.query("select table_name from information_schema.tables where table_schema='public' and table_name=any($1::text[]) order by table_name",[networkPlusPhase2TableNames]);
  const networkPlusPhase2ColumnBaseline=await client.query(
    "select table_name,column_name,udt_name,is_nullable,column_default from information_schema.columns where table_schema='public' and (table_name=any($1::text[]) or (table_name='network_plus_request' and column_name=any($2::text[]))) order by table_name,column_name",
    [networkPlusPhase2TableNames,["recipient_response","recipient_response_by","recipient_response_at"]]
  );
  const networkPlusPhase2ConstraintBaseline=await client.query(
    "select conrelid::regclass::text relation,conname,pg_get_constraintdef(oid) definition,convalidated from pg_constraint where conrelid=any(array['public.network_plus_request'::regclass,'public.network_plus_request_contact_consent'::regclass,'public.network_plus_request_meeting'::regclass,'public.network_plus_request_clarification'::regclass]) order by relation,conname"
  );
  const networkPlusPhase2IndexBaseline=await client.query(
    "select tablename,indexname,indexdef from pg_indexes where schemaname='public' and tablename=any($1::text[]) order by tablename,indexname",
    [["network_plus_request","network_plus_request_contact_consent","network_plus_request_meeting","network_plus_request_clarification"]]
  );

  await client.query("begin");
  transactionOpen = true;
  await client.query("set local lock_timeout = '5s'");
  await client.query("set local statement_timeout = '60s'");
  // This disposable rollback rehearsal runs against a schema that already has later migrations installed.
  // Remove the later activation guard only inside this transaction so the historical detection migration
  // is replayed in its original order; the governance migration below reinstalls the guard before assertions.
  await client.query("drop trigger if exists trg_community_impact_detection_policy_activation_guard on community_impact_detection_active_policy");
  // The Phase 1 migration is replayed against a database where it has already run.
  // Remove only the constraints it owns inside this rollback-only rehearsal so the
  // original migration can recreate and validate them in sequence.
  await client.query(`
    alter table network_plus_service_listing
      drop constraint if exists network_plus_listing_kind_check,
      drop constraint if exists network_plus_listing_attributes_object,
      drop constraint if exists network_plus_listing_wizard_step_check,
      drop constraint if exists network_plus_listing_taxonomy_version_check,
      drop constraint if exists network_plus_listing_category_fk,
      drop constraint if exists network_plus_listing_pricing_model_check,
      drop constraint if exists network_plus_listing_pricing_details_object,
      drop constraint if exists network_plus_listing_availability_status_check,
      drop constraint if exists network_plus_listing_service_radius_check,
      drop constraint if exists network_plus_listing_lead_time_check,
      drop constraint if exists network_plus_listing_active_work_limit_check,
      drop constraint if exists network_plus_listing_audience_segments_check
  `);
  for (const migration of migrations) {
    await client.query(migration.sql);
    console.log(`PASS: ${migration.filename} applied inside rollback-only transaction`);
  }

  // The manual-claims migration is replayed against an already-migrated schema.
  // Verify that its three named CHECK constraints exist, are validated, and
  // retain the intended invariants after the replay-safe drop/recreate.
  const manualClaimChecks = [
    ["private_upload_session","private_upload_session_purpose_scope_check"],
    ["private_upload_session","private_upload_session_claim_retention_check"],
    ["community_impact_claim_evidence","community_impact_claim_evidence_removal_check"]
  ];
  for (const [table,name] of manualClaimChecks) {
    const result = await client.query(
      "select pg_get_constraintdef(oid) as definition, convalidated from pg_constraint where conrelid=$1::regclass and conname=$2 and contype='c'",
      [`public.${table}`,name]
    );
    if (!result.rows[0]?.convalidated) {
      throw new Error(`Required validated CHECK constraint ${table}.${name} is missing or not validated.`);
    }
    const definition = result.rows[0].definition;
    if (name === "private_upload_session_purpose_scope_check" &&
        (!definition.includes("purpose") || !definition.includes("purpose_reference_id") ||
         !definition.includes("community_impact_claim_evidence"))) {
      throw new Error("Upload purpose scope constraint does not bind claim evidence uploads to a claim reference.");
    }
    if (name === "private_upload_session_claim_retention_check" &&
        (!definition.includes("retention_policy_version_id") || !definition.includes("retention_rule_snapshot") ||
         !definition.includes("community_impact_claim_evidence"))) {
      throw new Error("Upload claim-retention constraint does not require a retention policy version and snapshot.");
    }
    if (name === "community_impact_claim_evidence_removal_check" &&
        (!definition.includes("removed_at") || !definition.includes("removed_by") ||
         !definition.includes("removal_reason"))) {
      throw new Error("Evidence removal constraint does not require actor and reason metadata.");
    }
  }
  console.log("PASS: all manual-claim upload and evidence-removal CHECK constraints exist and are validated");

  // Audit every declarative constraint created by the manual-claims migration:
  // CHECK, FOREIGN KEY, PRIMARY KEY and UNIQUE constraints must all be present
  // and validated. Partial unique indexes are checked separately below.
  const manualClaimConstraintCounts = [
    ["community_impact_claim",16,4,1,2],
    ["community_impact_claim_consent",5,3,1,0],
    ["community_impact_claim_evidence",8,5,1,1],
    ["community_impact_claim_assignment",1,3,1,0],
    ["community_impact_claim_decision",4,3,1,0],
    ["community_impact_claim_appeal",5,6,1,1],
    ["community_impact_claim_event",4,3,1,0]
  ];
  for (const [table,checks,foreignKeys,primaryKeys,uniqueConstraints] of manualClaimConstraintCounts) {
    const result = await client.query(
      "select contype, count(*)::int as count, bool_and(convalidated) as all_validated from pg_constraint where conrelid=$1::regclass and contype=any(array['c','f','p','u']) group by contype",
      [`public.${table}`]
    );
    const counts = new Map(result.rows.map(row=>[row.contype,{count:row.count,validated:row.all_validated}]));
    for (const [kind,expected] of [["c",checks],["f",foreignKeys],["p",primaryKeys],["u",uniqueConstraints]]) {
      const actual=counts.get(kind);
      if ((actual?.count||0)!==expected || (expected>0 && actual?.validated!==true)) {
        throw new Error(`Manual-claims migration constraint audit failed for ${table}: expected ${expected} validated ${kind} constraints, found ${actual?.count||0}.`);
      }
    }
  }
  const manualClaimIndexes = [
    "uq_community_impact_claim_evidence_url",
    "uq_community_impact_claim_active_assignment",
    "ix_community_impact_claim_owner",
    "ix_community_impact_claim_queue",
    "ix_community_impact_claim_evidence_claim",
    "ix_community_impact_claim_reviewer",
    "ix_community_impact_claim_decision_history",
    "ix_community_impact_claim_event_history",
    "ix_private_upload_session_claim_purpose",
    "ix_community_impact_claim_evidence_active",
    "ix_community_impact_claim_consent_history"
  ];
  for (const name of manualClaimIndexes) {
    const result=await client.query("select indexdef from pg_indexes where schemaname='public' and indexname=$1",[name]);
    if(!result.rowCount) throw new Error(`Manual-claims migration index ${name} is missing.`);
  }
  console.log("PASS: all manual-claims CHECK, FOREIGN KEY, PRIMARY KEY, UNIQUE constraints and supporting indexes are present and validated");
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
    ["community_impact_claim","claimant_user_id","app_user","id"],
    ["community_impact_claim","retention_policy_version_id","community_impact_retention_policy_version","id"],
    ["community_impact_claim","consent_retention_policy_version_id","community_impact_retention_policy_version","id"],
    ["community_impact_claim","current_reviewer_id","app_user","id"],
    ["community_impact_claim_consent","claim_id","community_impact_claim","id"],
    ["community_impact_claim_consent","actor_user_id","app_user","id"],
    ["community_impact_claim_consent","retention_policy_version_id","community_impact_retention_policy_version","id"],
    ["community_impact_claim_evidence","claim_id","community_impact_claim","id"],
    ["community_impact_claim_evidence","file_object_id","file_object","id"],
    ["community_impact_claim_evidence","uploaded_by","app_user","id"],
    ["community_impact_claim_evidence","retention_policy_version_id","community_impact_retention_policy_version","id"],
    ["community_impact_claim_assignment","claim_id","community_impact_claim","id"],
    ["community_impact_claim_assignment","reviewer_user_id","app_user","id"],
    ["community_impact_claim_assignment","assigned_by","app_user","id"],
    ["community_impact_claim_decision","claim_id","community_impact_claim","id"],
    ["community_impact_claim_decision","reviewer_user_id","app_user","id"],
    ["community_impact_claim_decision","retention_policy_version_id","community_impact_retention_policy_version","id"],
    ["community_impact_claim_appeal","claim_id","community_impact_claim","id"],
    ["community_impact_claim_appeal","decision_id","community_impact_claim_decision","id"],
    ["community_impact_claim_appeal","claimant_user_id","app_user","id"],
    ["community_impact_claim_appeal","assigned_reviewer_id","app_user","id"],
    ["community_impact_claim_appeal","retention_policy_version_id","community_impact_retention_policy_version","id"],
    ["community_impact_claim_appeal","decision_retention_policy_version_id","community_impact_retention_policy_version","id"],
    ["community_impact_claim_event","claim_id","community_impact_claim","id"],
    ["community_impact_claim_event","actor_user_id","app_user","id"],
    ["community_impact_claim_event","retention_policy_version_id","community_impact_retention_policy_version","id"],
    ["private_upload_session","purpose_reference_id","community_impact_claim","id"],
    ["private_upload_session","retention_policy_version_id","community_impact_retention_policy_version","id"],
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
    ["network_plus_request","recipient_response_by","app_user","id"],
    ["network_plus_request_contact_consent","request_id","network_plus_request","id"],
    ["network_plus_request_contact_consent","recipient_user_id","app_user","id"],
    ["network_plus_request_meeting","request_id","network_plus_request","id"],
    ["network_plus_request_meeting","proposer_user_id","app_user","id"],
    ["network_plus_request_meeting","responder_user_id","app_user","id"],
    ["network_plus_request_meeting","confirmed_by","app_user","id"],
    ["network_plus_request_meeting","responded_by","app_user","id"],
    ["network_plus_request_clarification","request_id","network_plus_request","id"],
    ["network_plus_request_clarification","asked_by","app_user","id"],
    ["network_plus_request_clarification","answered_by","app_user","id"],
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
    "network_plus_request_contact_consent_pkey",
    "ux_network_plus_request_meeting_active",
    "ux_network_plus_request_meeting_idempotency",
    "ux_serve_community_initiative_idempotency_hash","ux_serve_community_participation_idempotency_hash","ux_serve_community_participation_active","ux_serve_community_legacy_classification_initiative","uq_community_impact_claim_evidence_url","uq_community_impact_claim_active_assignment"
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
    if (name === "uq_community_impact_claim_evidence_url" &&
        (!row.indexdef.toLowerCase().includes("claim_id") ||
         !row.indexdef.toLowerCase().includes("evidence_url") ||
         !row.indexdef.toLowerCase().includes("where") ||
         !row.indexdef.toLowerCase().includes("is not null"))) {
      throw new Error("Community Impact evidence URL uniqueness must be scoped to a claim and non-null URLs.");
    }
    if (name === "uq_community_impact_claim_active_assignment" &&
        (!row.indexdef.toLowerCase().includes("claim_id") ||
         !row.indexdef.toLowerCase().includes("active") ||
         !row.indexdef.toLowerCase().includes("where") ||
         !row.indexdef.toLowerCase().includes("true"))) {
      throw new Error("Community Impact reviewer assignment uniqueness must allow only one active assignment per claim.");
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
  // This is a lookup index, not a uniqueness constraint. The table's
  // (request_id, recipient_user_id, field_code) primary key supplies the
  // uniqueness invariant; the recipient-first index supports peer inbox reads.
  const contactConsentPeerIndex = await client.query(
    "select indexdef from pg_indexes where schemaname=$1 and indexname=$2",
    ["public", "ix_network_plus_contact_consent_peer"]
  );
  if (!contactConsentPeerIndex.rows[0]?.indexdef ||
      !contactConsentPeerIndex.rows[0].indexdef.includes("network_plus_request_contact_consent") ||
      !contactConsentPeerIndex.rows[0].indexdef.includes("recipient_user_id")) {
    throw new Error("The recipient-first contact-consent lookup index is missing or malformed.");
  }
  // Meeting history is intentionally a non-unique lookup index; uniqueness
  // belongs only to the active-meeting partial index and idempotency key.
  const meetingHistoryIndex = await client.query(
    "select indexdef from pg_indexes where schemaname=$1 and indexname=$2",
    ["public", "ix_network_plus_request_meeting_history"]
  );
  const meetingHistoryDefinition = meetingHistoryIndex.rows[0]?.indexdef || "";
  if (!meetingHistoryDefinition ||
      meetingHistoryDefinition.toUpperCase().includes("CREATE UNIQUE INDEX") ||
      !meetingHistoryDefinition.includes("network_plus_request_meeting") ||
      !meetingHistoryDefinition.includes("request_id") ||
      !meetingHistoryDefinition.includes("created_at")) {
    throw new Error("The meeting-history lookup index is missing, malformed, or unexpectedly unique.");
  }
  // Open clarification threads are queried by request/status/time. This is
  // deliberately non-unique; a request may have multiple clarification rows.
  const clarificationIndex = await client.query(
    "select indexdef from pg_indexes where schemaname=$1 and indexname=$2",
    ["public", "ix_network_plus_request_clarification_open"]
  );
  const clarificationDefinition = clarificationIndex.rows[0]?.indexdef || "";
  if (!clarificationDefinition ||
      clarificationDefinition.toUpperCase().includes("CREATE UNIQUE INDEX") ||
      !clarificationDefinition.includes("network_plus_request_clarification") ||
      !clarificationDefinition.includes("request_id") ||
      !clarificationDefinition.includes("status") ||
      !clarificationDefinition.includes("created_at")) {
    throw new Error("The clarification lookup index is missing, malformed, or unexpectedly unique.");
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
    ["mentorship_match","mentorship_match_mentee_consent_status_check",["pending","accepted","declined"]],
    ["network_plus_request","network_plus_request_recipient_response_complete_check",["question"]],
    ["network_plus_request","network_plus_request_requester_disposition_check",["in_progress","completed","cancelled"]],
    ["network_plus_request","network_plus_request_disposition_closure_remark_check",["completed","cancelled"]],
    ["network_plus_request","network_plus_request_status_check",["recipient_withdrawn"]]
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
  const phase2ConstraintRows=(await client.query(
    "select cl.relname table_name,c.conname,lower(pg_get_constraintdef(c.oid)) definition from pg_constraint c join pg_class cl on cl.oid=c.conrelid join pg_namespace n on n.oid=cl.relnamespace where n.nspname='public' and cl.relname=any($1::text[]) and c.contype='c' order by cl.relname,c.conname",
    [["network_plus_request","network_plus_request_contact_consent","network_plus_request_meeting","network_plus_request_clarification"]]
  )).rows;
  const requirePhase2Check=(table,fragments)=>{
    const found=phase2ConstraintRows.some(row=>row.table_name===table&&fragments.every(fragment=>row.definition.includes(fragment.toLowerCase())));
    if(!found)throw new Error(`Network-Plus Phase 2 check constraint on ${table} is missing required invariant fragments: ${fragments.join(", ")}.`);
  };
  requirePhase2Check("network_plus_request",["recipient_response is null","recipient_response_by is null","recipient_response_at is null","intent = 'question'","recipient_response is not null","recipient_response_by is not null","recipient_response_at is not null"]);
  requirePhase2Check("network_plus_request",["status <> 'recipient_withdrawn'","accepted_at is not null","recipient_withdrawn_at is not null"]);
  requirePhase2Check("network_plus_request_contact_consent",["field_code","'email'","'phone'","'whatsapp'","'website'","'business_location'"]);
  requirePhase2Check("network_plus_request_contact_consent",["requester_status","'pending'","'accepted'","'declined'","'revoked'"]);
  requirePhase2Check("network_plus_request_contact_consent",["recipient_status","'pending'","'accepted'","'declined'","'revoked'"]);
  requirePhase2Check("network_plus_request_contact_consent",["requester_status = 'accepted'","requester_value_ciphertext is not null","requester_consented_at is not null"]);
  requirePhase2Check("network_plus_request_contact_consent",["recipient_status = 'accepted'","recipient_value_ciphertext is not null","recipient_consented_at is not null"]);
  requirePhase2Check("network_plus_request_meeting",["status","'proposed'","'countered'","'confirmed'","'declined'","'cancelled'"]);
  requirePhase2Check("network_plus_request_meeting",["place_type","'office'","'coffee'","'online'","'other'"]);
  requirePhase2Check("network_plus_request_meeting",["duration_minutes","15","30","45","60","90","120"]);
  requirePhase2Check("network_plus_request_meeting",["responder_user_id <> proposer_user_id"]);
  requirePhase2Check("network_plus_request_meeting",["status = 'countered'","counter_place_type is not null","counter_starts_at is not null","counter_timezone is not null","counter_duration_minutes is not null"]);
  requirePhase2Check("network_plus_request_meeting",["status = 'confirmed'","confirmed_place_type is not null","confirmed_by is not null","confirmed_starts_at is not null","confirmed_timezone is not null","confirmed_duration_minutes is not null"]);
  requirePhase2Check("network_plus_request_clarification",["prompt_code","'scope'","'budget'","'timeline'","'quantity'","'location'","'availability'","'eligibility'","'other'"]);
  requirePhase2Check("network_plus_request_clarification",["status","'open'","'answered'","'closed'"]);
  requirePhase2Check("network_plus_request_clarification",["status = 'answered'","answer is not null","answered_by is not null","answered_at is not null"]);
  const phase2ActiveMeetingIndex=(await client.query("select indexdef from pg_indexes where schemaname='public' and indexname='ux_network_plus_request_meeting_active'")).rows[0];
  if(!phase2ActiveMeetingIndex||!phase2ActiveMeetingIndex.indexdef.toLowerCase().includes("where")||!phase2ActiveMeetingIndex.indexdef.includes("'proposed'")||!phase2ActiveMeetingIndex.indexdef.includes("'countered'"))throw new Error("The active meeting unique index must be partial and limited to proposed/countered meetings.");
  const phase2MeetingIdempotencyIndex=(await client.query("select indexdef from pg_indexes where schemaname='public' and indexname='ux_network_plus_request_meeting_idempotency'")).rows[0];
  if(!phase2MeetingIdempotencyIndex||!["request_id","proposer_user_id","idempotency_hash"].every(column=>phase2MeetingIdempotencyIndex.indexdef.includes(column)))throw new Error("The meeting idempotency index must be scoped to request, proposer and idempotency hash.");
  const phase2Indexes=[
    ["ix_network_plus_contact_consent_peer","network_plus_request_contact_consent",["recipient_user_id","request_id","field_code"]],
    ["ix_network_plus_request_meeting_history","network_plus_request_meeting",["request_id","created_at"]],
    ["ix_network_plus_request_clarification_open","network_plus_request_clarification",["request_id","status","created_at"]],
    ["ix_network_plus_request_requester_disposition","network_plus_request",["requester_user_id","requester_disposition","updated_at"]],
    ["ix_network_plus_request_review_due","network_plus_request",["review_due_at","id"]]
  ];
  for(const [name,table,columns] of phase2Indexes){
    const index=(await client.query("select indexdef from pg_indexes where schemaname='public' and tablename=$1 and indexname=$2",[table,name])).rows[0];
    if(!index||columns.some(column=>!index.indexdef.toLowerCase().includes(column)))throw new Error(`Network-Plus Phase 2 index ${name} is missing or has the wrong columns.`);
  }

  const serveRoles=await client.query("select role_code from app_role where role_code='serve_community_reviewer'");
  const servePermissions=await client.query("select permission_code,system_only from app_permission where permission_code=any($1::text[])",[["serve_community.initiatives.moderate","serve_community.legacy.classify"]]);
  if(!serveRoles.rowCount||servePermissions.rowCount!==2||servePermissions.rows.some(x=>x.system_only!==true))throw new Error("Serve-Community reviewer role and system-only permissions are missing.");
  const serveTriggers=await client.query("select count(*)::int count from pg_trigger where not tgisinternal and tgname=any($1::text[])",[["trg_serve_community_initiative_event_immutable","trg_serve_community_participation_event_immutable","trg_serve_community_consent_event_immutable","trg_serve_community_legacy_classification_event_immutable"]]);
  if(serveTriggers.rows[0].count!==4)throw new Error("Serve-Community append-only history triggers are missing.");
  const noLegacyBackfill=await client.query("select count(*)::int count from serve_community_legacy_classification");
  if(noLegacyBackfill.rows[0].count!==0)throw new Error("Fresh migration unexpectedly created legacy classification rows.");
  const requestChecks = [
    ["network_plus_request","network_plus_request_intent_check",["service_request","supplier_inquiry","referral","expertise_request","partnership_proposal","collaboration_request","business_opportunity"]],
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


  const referralTables=await client.query("select table_name from information_schema.tables where table_schema='public' and table_name=any($1::text[])",[["member_referral_code","member_referral_attribution","member_referral_event","member_referral_score_policy","member_referral_score_ledger"]]);
  if(referralTables.rowCount!==5)throw new Error("Member referral attribution, event, policy and score-ledger tables are incomplete.");
  const referralColumns=await client.query("select table_name,column_name from information_schema.columns where table_schema='public' and ((table_name='job_application' and column_name='referral_code') or (table_name='member_referral_attribution' and column_name='candidate_outcome_summary'))");
  if(referralColumns.rowCount!==2)throw new Error("Job application referral code and candidate outcome summary columns are missing.");
  const referralHistoryTriggers=await client.query("select count(*)::int count from pg_trigger where not tgisinternal and tgname=any($1::text[])",[["trg_member_referral_event_immutable","trg_member_referral_score_immutable"]]);
  if(referralHistoryTriggers.rows[0].count!==2)throw new Error("Referral event and score ledger append-only triggers are missing.");
  const impactTables=await client.query("select table_name from information_schema.tables where table_schema='public' and table_name=any($1::text[])",[["community_impact_identity_assurance_case","community_impact_identity_assurance_evidence","community_impact_identity_assurance_decision","community_impact_detection_policy_governance","community_impact_detection_policy_event","community_impact_offline_attribution","community_impact_offline_attribution_evidence","community_impact_claim_candidate_link","community_impact_reviewer_conflict","community_impact_contribution_assessment","community_impact_contribution_assessment_event","community_impact_retention_evaluation","community_impact_governance_event"]]);
  if(impactTables.rowCount!==13)throw new Error("Community Impact governance migration did not create all 13 required tables.");
  const impactTriggers=await client.query("select count(*)::int count from pg_trigger where not tgisinternal and tgname=any($1::text[])",[["trg_community_impact_block_conflicted_assignment","trg_community_impact_block_conflicted_decision","trg_community_impact_policy_event_immutable","trg_community_impact_assessment_event_immutable","trg_community_impact_governance_event_immutable","trg_community_impact_detection_policy_activation_guard","trg_community_impact_offline_attribution_guard","trg_community_impact_identity_decision_immutable","trg_community_impact_identity_evidence_immutable","trg_community_impact_retention_evaluation_immutable","trg_community_impact_assessment_guard"]]);
  if(impactTriggers.rows[0].count!==11)throw new Error("Community Impact governance safety/immutability triggers are incomplete.");
  const attributionConstraints=await client.query("select conname,pg_get_constraintdef(oid) definition from pg_constraint where conrelid='public.community_impact_claim_candidate_link'::regclass and contype='u'");
  if(attributionConstraints.rowCount!==1 || !/\(claim_id\)/i.test(attributionConstraints.rows[0]?.definition||"") || /\(candidate_id\)/i.test(attributionConstraints.rows[0]?.definition||""))throw new Error("Claim reconciliation must enforce one link per claim while permitting distinct claims/contributors to reference the same project candidate.");
  const impactPermissions=await client.query("select count(*)::int count from app_permission where permission_code=any($1::text[])",[["community_impact.identity.review","community_impact.offline_attribution.review","community_impact.detection_policy.manage","community_impact.detection_policy.approve","community_impact.claim.second_review","community_impact.retention.evaluate"]]);
  if(impactPermissions.rows[0].count!==6)throw new Error("Community Impact governance permission registration is incomplete.");

  const scoreTables=await client.query("select count(*)::int count from information_schema.tables where table_schema='public' and table_name=any($1::text[])",[["community_impact_score_policy_version","community_impact_score_active_policy","community_impact_score_policy_event","community_impact_score_ledger","community_impact_score_recalculation","community_impact_score_adjustment_event","community_impact_score_source_link","community_impact_score_source_link_event"]]);
  if(scoreTables.rows[0].count!==8)throw new Error("Unified score migration did not create all eight policy, ledger, recalculation and source-link tables.");
  const scoreTriggers=await client.query("select count(*)::int count from pg_trigger where not tgisinternal and tgname=any($1::text[])",[["trg_community_impact_score_ledger_immutable","trg_community_impact_score_policy_immutable","trg_community_impact_score_source_link_immutable","trg_community_impact_score_policy_event_immutable","trg_community_impact_score_recalculation_immutable","trg_community_impact_score_adjustment_event_immutable","trg_community_impact_score_source_link_event_immutable"]]);
  if(scoreTriggers.rows[0].count!==7)throw new Error("Unified score append-only and policy immutability triggers are incomplete.");
  const initialScorePolicy=await client.query("select p.version,p.status,p.evaluation_only,p.public_score_enabled,p.policy->'dimensions' dimensions from community_impact_score_active_policy a join community_impact_score_policy_version p on p.id=a.policy_version_id where a.singleton=true");
  if(initialScorePolicy.rowCount!==1||initialScorePolicy.rows[0].version!==6||initialScorePolicy.rows[0].status!=="active"||initialScorePolicy.rows[0].evaluation_only!==true||initialScorePolicy.rows[0].public_score_enabled!==false)throw new Error("The initial docs/62 score policy must be active for evaluation only and remain unpublished.");
  const weights=initialScorePolicy.rows[0].dimensions.map(x=>Number(x.weight)).sort((a,b)=>b-a).join(",");
  const scorePolicyConfig=await client.query("select policy->'calculation'->'evidenceQualityRank' evidence_ranks,policy->'calculation'->'outcomeMaturityRank' outcome_ranks,policy->'calculation'->>'rounding' rounding from community_impact_score_policy_version where version=6");
  if(!scorePolicyConfig.rows[0]?.evidence_ranks||!scorePolicyConfig.rows[0]?.outcome_ranks||scorePolicyConfig.rows[0]?.rounding!=="4dp")throw new Error("Initial active score policy must configure evidence quality, outcome maturity and rounding scales.");
  const scoreRubrics=await client.query("select policy->'dimensions'->0->'criteria' criteria,policy->'calculation'->'modifiers' modifiers,policy->'calculation'->'decayRules' decay_rules from community_impact_score_policy_version where version=4");
  if(!Array.isArray(scoreRubrics.rows[0]?.criteria)||!Array.isArray(scoreRubrics.rows[0]?.modifiers)||!Array.isArray(scoreRubrics.rows[0]?.decay_rules))throw new Error("Initial score policy must store rubric criteria, modifiers and decay rules as policy data.");
  const outcomeRule=await client.query("select policy->'dimensions'->0->'measurementRules'->>'minimumOutcomeMaturity' minimum_outcome from community_impact_score_policy_version where version=4");
  if(outcomeRule.rows[0]?.minimum_outcome!=="outcome")throw new Error("Measurable outcomes dimension must require outcome-level maturity.");
  const recipientRules=await client.query("select policy->'dimensions'->4->'measurementRules'->'recipientConfirmationSourceTypes' source_types from community_impact_score_policy_version where version=6");
  if(!Array.isArray(recipientRules.rows[0]?.source_types)||recipientRules.rows[0].source_types.length!==5)throw new Error("Recipient confirmation must be scoped to the five source families with counterpart confirmation.");
  if(weights!=="30,25,20,15,10")throw new Error("Initial score policy weights must match docs/62: 30/25/20/15/10.");
  const reversalConstraint=await client.query("select count(*)::int count from pg_indexes where schemaname='public' and indexname='uq_community_impact_score_ledger_single_reversal'");
  if(reversalConstraint.rows[0].count!==1)throw new Error("A score award must have at most one compensating reversal.");
  const historicalFingerprint=await client.query("select count(*)::int count from information_schema.columns where table_schema='public' and table_name='community_impact_score_source_link' and column_name='source_fingerprint' and udt_name='text'");
  if(historicalFingerprint.rows[0].count!==1)throw new Error("Historical contribution source fingerprints are required for duplicate prevention.");
  const historicalFingerprintIndex=await client.query("select count(*)::int count from pg_indexes where schemaname='public' and indexname='uq_community_impact_score_historical_fingerprint'");
  if(historicalFingerprintIndex.rows[0].count!==1)throw new Error("Historical source fingerprint uniqueness index is missing.");
  const assessmentPolicyColumn=await client.query("select count(*)::int count from information_schema.columns where table_schema='public' and table_name='community_impact_contribution_assessment' and column_name='score_policy_version_id' and udt_name='uuid'");
  if(assessmentPolicyColumn.rows[0].count!==1)throw new Error("Reviewer assessments must persist the exact score policy version used for their ratings.");
  const scorePermissions=await client.query("select count(*)::int count from app_permission where permission_code=any($1::text[])",[["community_impact.score.policy.manage","community_impact.score.policy.approve","community_impact.score.recalculate","community_impact.score.reverse","community_impact.score.view_all"]]);
  if(scorePermissions.rows[0].count!==5)throw new Error("Unified score governance permissions are incomplete.");

  const referralPolicy=await client.query("select count(*)::int count from member_referral_score_policy where status='active'");
  const referralRetentionColumns=await client.query("select count(*)::int count from information_schema.columns where table_schema='public' and table_name=any($1::text[]) and column_name='retention_policy_snapshot'",[["member_referral_code","member_referral_attribution","member_referral_event","member_referral_score_ledger"]]);
  if(referralRetentionColumns.rows[0].count!==4)throw new Error("Referral records are missing their approved retention policy snapshots.");

  if(referralPolicy.rows[0].count!==0)throw new Error("Fresh referral migrations must not silently activate an unapproved scoring policy.");

  const taxonomyConstraints=await client.query("select count(*)::int count from pg_constraint where conname=any($1::text[])",[["community_impact_claim_category_code_check","community_impact_claim_contribution_type_code_check","community_impact_claim_contribution_role_code_check","community_impact_claim_evidence_type_code_check"]]);
  if(taxonomyConstraints.rows[0].count!==4)throw new Error("Community Impact claim classification columns must accept versioned taxonomy codes rather than fixed hard-coded lists.");
  const taxonomyRows=await client.query("select d.dataset_key,count(i.id)::int active_items from reference_dataset d join reference_dataset_version v on v.dataset_id=d.id and v.status='published' join reference_item i on i.dataset_version_id=v.id and i.active=true where d.dataset_key=any($1::text[]) group by d.dataset_key",[requiredCommunityImpactTaxonomyDatasets]);
   if(taxonomyRows.rowCount!==4||taxonomyRows.rows.some(row=>row.active_items<1))throw new Error("All four Community Impact governed taxonomies must contain active published reference values.");
  const pushTables=await client.query("select table_name from information_schema.tables where table_schema='public' and table_name=any($1::text[]) order by table_name",[pushTableNames]);
  if(pushTables.rowCount!==2)throw new Error("Web Push subscription and delivery outbox tables are incomplete.");
  const pushConstraints=await client.query("select conrelid::regclass::text relation,conname,contype,pg_get_constraintdef(oid) definition from pg_constraint where conrelid in ('public.notification_push_subscription'::regclass,'public.notification_push_delivery'::regclass)");
  const pushConstraintNames=new Set(pushConstraints.rows.map(row=>row.conname));
  for(const required of ["notification_push_subscription_endpoint_hash_unique","notification_push_subscription_https","notification_push_subscription_hash","notification_push_delivery_status_valid","notification_push_delivery_attempts_valid","notification_push_delivery_unique"]){
    if(!pushConstraintNames.has(required))throw new Error("Web Push schema is missing required constraint "+required+".");
  }
  const pushForeignKeys=await client.query("select source.relname source,target.relname target from pg_constraint constraint_row join pg_class source on source.oid=constraint_row.conrelid join pg_class target on target.oid=constraint_row.confrelid where constraint_row.contype='f' and constraint_row.conrelid in ('public.notification_push_subscription'::regclass,'public.notification_push_delivery'::regclass)");
  const pushForeignKeyTargets=new Set(pushForeignKeys.rows.map(row=>row.source+"->"+row.target));
  for(const required of ["notification_push_subscription->app_user","notification_push_delivery->notification_event","notification_push_delivery->notification_push_subscription"]){
    if(!pushForeignKeyTargets.has(required))throw new Error("Web Push schema is missing required ownership foreign key "+required+".");
  }
  const pushIndexes=await client.query("select indexname from pg_indexes where schemaname='public' and indexname=any($1::text[])",[["ix_notification_push_subscription_user_active","ix_notification_push_delivery_pending"]]);
  if(pushIndexes.rowCount!==2)throw new Error("Web Push subscription and delivery worker indexes are incomplete.");
  const pushPreferenceDefault=await client.query("select column_default from information_schema.columns where table_schema='public' and table_name='notification_preference' and column_name='push_enabled'");
  if(pushPreferenceDefault.rows[0]?.column_default!=="false")throw new Error("Web Push must remain opt-in by default.");

  const membershipTables=await client.query("select table_name from information_schema.tables where table_schema='public' and table_name=any($1::text[]) order by table_name",[["membership_geography_version","membership_geography_unit","member_residence","membership_fee_obligation","membership_fee_obligation_payment","membership_fee_balance_disposition","membership_fee_adjustment","membership_fee_reminder"]]);
  if(membershipTables.rowCount!==8)throw new Error("Membership geography and fee-obligation migrations did not create all eight required tables.");
  const feeBalanceView=await client.query("select pg_get_viewdef('public.membership_fee_obligation_balance'::regclass,true) definition");
  if(!/pt\.currency\s*=\s*o\.currency/i.test(feeBalanceView.rows[0]?.definition||""))throw new Error("Membership fee balance view must exclude cross-currency receipts.");
  const membershipIndexes=await client.query("select count(*)::int count from pg_indexes where schemaname='public' and indexname=any($1::text[])",[["membership_fee_balance_disposition_idempotency_idx","membership_geography_country_iso3_uq","membership_geography_country_m49_uq"]]);
  if(membershipIndexes.rows[0].count!==3)throw new Error("Membership payment/geography idempotency and country uniqueness indexes are incomplete.");
  const zeroAmountConstraint=await client.query("select pg_get_constraintdef(oid) definition from pg_constraint where conrelid='public.membership_import_row'::regclass and conname='membership_import_row_paid_amount_nonnegative'");
  if(zeroAmountConstraint.rowCount!==1||!/paid_amount.*>=/i.test(zeroAmountConstraint.rows[0].definition))throw new Error("Member import must permit a zero declared amount without allowing negative amounts.");
  const membershipPermissions=await client.query("select count(*)::int count from app_permission where permission_code=any($1::text[])",[["members.geography.manage","finance.payment.record","finance.payment.adjust","finance.payment.import"]]);
  if(membershipPermissions.rows[0].count!==4)throw new Error("Membership geography and Finance fee permissions are incomplete.");

   await client.query("rollback");
  transactionOpen = false;
  const networkPlusPhase2TablesAfterRollback=await client.query("select table_name from information_schema.tables where table_schema='public' and table_name=any($1::text[]) order by table_name",[networkPlusPhase2TableNames]);
  if(JSON.stringify(networkPlusPhase2TablesAfterRollback.rows)!==JSON.stringify(networkPlusPhase2TableBaseline.rows))throw new Error("Rollback rehearsal did not restore the Network-Plus Phase 2 table baseline exactly.");
  const networkPlusPhase2ColumnsAfterRollback=await client.query(
    "select table_name,column_name,udt_name,is_nullable,column_default from information_schema.columns where table_schema='public' and (table_name=any($1::text[]) or (table_name='network_plus_request' and column_name=any($2::text[]))) order by table_name,column_name",
    [networkPlusPhase2TableNames,["recipient_response","recipient_response_by","recipient_response_at"]]
  );
  if(JSON.stringify(networkPlusPhase2ColumnsAfterRollback.rows)!==JSON.stringify(networkPlusPhase2ColumnBaseline.rows))throw new Error("Rollback rehearsal did not restore the Network-Plus Phase 2 column baseline exactly. Baseline: "+JSON.stringify(networkPlusPhase2ColumnBaseline.rows)+"; after rollback: "+JSON.stringify(networkPlusPhase2ColumnsAfterRollback.rows));
  const networkPlusPhase2ConstraintsAfterRollback=await client.query(
    "select conrelid::regclass::text relation,conname,pg_get_constraintdef(oid) definition,convalidated from pg_constraint where conrelid=any(array['public.network_plus_request'::regclass,'public.network_plus_request_contact_consent'::regclass,'public.network_plus_request_meeting'::regclass,'public.network_plus_request_clarification'::regclass]) order by relation,conname"
  );
  if(JSON.stringify(networkPlusPhase2ConstraintsAfterRollback.rows)!==JSON.stringify(networkPlusPhase2ConstraintBaseline.rows))throw new Error("Rollback rehearsal did not restore the Network-Plus Phase 2 constraint baseline exactly.");
  const networkPlusPhase2IndexesAfterRollback=await client.query(
    "select tablename,indexname,indexdef from pg_indexes where schemaname='public' and tablename=any($1::text[]) order by tablename,indexname",
    [["network_plus_request","network_plus_request_contact_consent","network_plus_request_meeting","network_plus_request_clarification"]]
  );
  if(JSON.stringify(networkPlusPhase2IndexesAfterRollback.rows)!==JSON.stringify(networkPlusPhase2IndexBaseline.rows))throw new Error("Rollback rehearsal did not restore the Network-Plus Phase 2 index baseline exactly.");
  const taxonomyConstraintRollback=await client.query(
    "select conrelid::regclass::text relation,conname,pg_get_constraintdef(oid) definition,convalidated from pg_constraint where conname=any($1::text[]) order by conrelid::regclass::text,conname",
    [taxonomyConstraintNames]
  );
  if(JSON.stringify(taxonomyConstraintRollback.rows)!==JSON.stringify(taxonomyConstraintBaseline.rows))throw new Error("Rollback rehearsal did not restore the pre-existing dynamic taxonomy constraints exactly.");
  const taxonomyRollback = await client.query(
    `select entity,row_data
       from (
         select 'dataset'::text entity,to_jsonb(d) row_data
           from reference_dataset d
          where d.dataset_key=any($1::text[])
         union all
         select 'version'::text entity,to_jsonb(v) row_data
           from reference_dataset_version v
           join reference_dataset d on d.id=v.dataset_id
          where d.dataset_key=any($1::text[])
         union all
         select 'item'::text entity,to_jsonb(i) row_data
           from reference_item i
           join reference_dataset_version v on v.id=i.dataset_version_id
           join reference_dataset d on d.id=v.dataset_id
          where d.dataset_key=any($1::text[])
       ) taxonomy_rows
      order by entity,row_data::text`,
    [requiredCommunityImpactTaxonomyDatasets]
  );
  if (JSON.stringify(taxonomyRollback.rows) !== JSON.stringify(taxonomyDataBaseline.rows)) {
    throw new Error("Rollback rehearsal did not restore the pre-existing Community Impact taxonomy datasets, versions and items exactly.");
  }
  const governanceTablesAfterRollback = await client.query("select table_name from information_schema.tables where table_schema='public' and table_name=any($1::text[]) order by table_name",[communityImpactGovernanceTableNames]);
  if(JSON.stringify(governanceTablesAfterRollback.rows)!==JSON.stringify(governanceTableBaseline.rows))throw new Error("Rollback rehearsal did not restore the pre-existing Community Impact governance table baseline exactly.");
  const governanceTriggersAfterRollback = await client.query("select t.tgname trigger_name,t.tgrelid::regclass::text relation,pg_get_triggerdef(t.oid) definition from pg_trigger t where not t.tgisinternal and t.tgname=any($1::text[]) order by t.tgname,t.tgrelid::regclass::text",[communityImpactGovernanceTriggerNames]);
  if(JSON.stringify(governanceTriggersAfterRollback.rows)!==JSON.stringify(governanceTriggerBaseline.rows))throw new Error("Rollback rehearsal did not restore the pre-existing Community Impact governance trigger baseline exactly.");
  const scoreTablesAfterRollback = await client.query("select table_name from information_schema.tables where table_schema='public' and table_name=any($1::text[]) order by table_name",[scoreTableNames]);
  if(JSON.stringify(scoreTablesAfterRollback.rows)!==JSON.stringify(scoreTableBaseline.rows))throw new Error("Rollback rehearsal did not restore the pre-existing unified score table baseline exactly.");
  const scoreColumnsAfterRollback = await client.query("select table_name,column_name,udt_name,is_nullable,column_default from information_schema.columns where table_schema='public' and ((table_name='community_impact_score_source_link' and column_name='source_fingerprint') or (table_name='community_impact_contribution_assessment' and column_name='score_policy_version_id')) order by table_name,column_name");
  if(JSON.stringify(scoreColumnsAfterRollback.rows)!==JSON.stringify(scoreColumnBaseline.rows))throw new Error("Rollback rehearsal did not restore the pre-existing unified score column baseline exactly.");
  const scoreIndexesAfterRollback = await client.query("select indexname,indexdef from pg_indexes where schemaname='public' and indexname=any($1::text[]) order by indexname",[scoreIndexNames]);
  if(JSON.stringify(scoreIndexesAfterRollback.rows)!==JSON.stringify(scoreIndexBaseline.rows))throw new Error("Rollback rehearsal did not restore the pre-existing unified score index baseline exactly.");
  const scoreTriggersAfterRollback = await client.query("select t.tgname trigger_name,t.tgrelid::regclass::text relation,pg_get_triggerdef(t.oid) definition from pg_trigger t where not t.tgisinternal and t.tgname=any($1::text[]) order by t.tgname,t.tgrelid::regclass::text",[scoreTriggerNames]);
  if(JSON.stringify(scoreTriggersAfterRollback.rows)!==JSON.stringify(scoreTriggerBaseline.rows))throw new Error("Rollback rehearsal did not restore the pre-existing unified score trigger baseline exactly.");
  const pushTablesAfterRollback = await client.query("select table_name from information_schema.tables where table_schema='public' and table_name=any($1::text[]) order by table_name",[pushTableNames]);
  if(JSON.stringify(pushTablesAfterRollback.rows)!==JSON.stringify(pushTableBaseline.rows))throw new Error("Rollback rehearsal did not restore the pre-existing Web Push table baseline exactly.");
  const pushPreferenceDefaultAfterRollback=await client.query("select column_default from information_schema.columns where table_schema='public' and table_name='notification_preference' and column_name='push_enabled'");
  if(JSON.stringify(pushPreferenceDefaultAfterRollback.rows)!==JSON.stringify(pushPreferenceDefaultBaseline.rows))throw new Error("Rollback rehearsal did not restore the pre-existing notification push preference default exactly.");
  console.log("PASS: all listed migrations and post-migration assertions succeeded; rollback restored the exact pre-rehearsal taxonomy, governance, score and Web Push baselines.");
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
