import { readFile } from "node:fs/promises";
import { Client } from "pg";

const connectionString=process.env.DATABASE_URL;
const expectedDatabase=process.env.MIGRATION_CHECK_EXPECTED_DATABASE;
if(!connectionString)throw new Error("DATABASE_URL must point to a disposable test database.");
if(!expectedDatabase)throw new Error("MIGRATION_CHECK_EXPECTED_DATABASE must name the disposable database.");
if(process.env.MIGRATION_CHECK_ALLOW_ROLLBACK!=="YES")throw new Error("MIGRATION_CHECK_ALLOW_ROLLBACK=YES is required for the rollback-only rehearsal.");
if(/(^|[_-])(prod|production|live)([_-]|$)/i.test(expectedDatabase)||!/(test|sandbox|ci|verify)/i.test(expectedDatabase))throw new Error("Refusing to rehearse email migration outside an explicitly named disposable database.");

const sql=await readFile(new URL("../db/migrations/20261103190000_email_delivery_hardening.sql",import.meta.url),"utf8");
const templateSql=await readFile(new URL("../db/migrations/20261103200000_email_workflow_template_coverage.sql",import.meta.url),"utf8");
const client=new Client({connectionString,connectionTimeoutMillis:10000});
let open=false;
try{
 await client.connect();
 const identity=(await client.query("select current_database() database_name,current_schema() schema_name")).rows[0];
 if(identity.database_name!==expectedDatabase||identity.schema_name!=="public")throw new Error("Connected database/schema does not match the explicitly approved disposable target.");
 const templateCoverageBefore=Number((await client.query("select count(*)::int count from email_notification_template where template_code=any($1::text[])",[["organization.registration_received","organization.review_queue_item","organization.review_update"]])).rows[0].count);
 const before=(await client.query(`select
  exists(select 1 from pg_constraint where conname='email_verification_token_delivery_status_check' and pg_get_constraintdef(oid) like '%captured%') has_verification_capture,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_outbox' and column_name='email_event_key') has_event_key,
  to_regclass('public.email_delivery_event') is not null has_events,
  to_regclass('public.email_recipient_suppression') is not null has_holds,
  to_regclass('public.email_template_version') is not null has_versions`)).rows[0];
 await client.query("begin");open=true;
 await client.query("set local lock_timeout='5s'");
 await client.query("set local statement_timeout='30s'");
 await client.query(sql);
 await client.query(templateSql);
 const templateCoverage=(await client.query("select count(*)::int count from email_notification_template where template_code=any($1::text[])",[["organization.registration_received","organization.review_queue_item","organization.review_update"]])).rows[0].count;
 if(templateCoverage!==3)throw new Error("Organization email audience templates were not seeded.");
 const after=(await client.query(`select
  exists(select 1 from pg_constraint where conname='email_verification_token_delivery_status_check' and pg_get_constraintdef(oid) like '%captured%') has_verification_capture,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_outbox' and column_name='email_event_key') has_event_key,
  to_regclass('public.email_delivery_event') is not null has_events,
  to_regclass('public.email_recipient_suppression') is not null has_holds,
  to_regclass('public.email_template_version') is not null has_versions`)).rows[0];
 if(!after.has_verification_capture||!after.has_event_key||!after.has_events||!after.has_holds||!after.has_versions)throw new Error("Email hardening migration did not create all expected schema objects.");
 await client.query("rollback");open=false;
 const restored=(await client.query(`select
  exists(select 1 from pg_constraint where conname='email_verification_token_delivery_status_check' and pg_get_constraintdef(oid) like '%captured%') has_verification_capture,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_outbox' and column_name='email_event_key') has_event_key,
  to_regclass('public.email_delivery_event') is not null has_events,
  to_regclass('public.email_recipient_suppression') is not null has_holds,
  to_regclass('public.email_template_version') is not null has_versions`)).rows[0];
 for(const key of ["has_verification_capture","has_event_key","has_events","has_holds","has_versions"])if(Boolean(restored[key])!==Boolean(before[key]))throw new Error("Email migration rollback did not restore the original disposable schema baseline: "+key);
 const templateCoverageAfter=Number((await client.query("select count(*)::int count from email_notification_template where template_code=any($1::text[])",[["organization.registration_received","organization.review_queue_item","organization.review_update"]])).rows[0].count);
 if(templateCoverageAfter!==templateCoverageBefore)throw new Error("Email template coverage migration rollback did not restore the original template baseline.");
 process.stdout.write("Email hardening migration apply/rollback compatibility passed.\n");
}catch(error){
 if(open)await client.query("rollback").catch(()=>{});
 throw error;
}finally{await client.end().catch(()=>{});}
