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
const verificationSql=await readFile(new URL("../db/migrations/20261103210000_email_verification_delivery_recovery.sql",import.meta.url),"utf8");
const workflowTemplateSql=await readFile(new URL("../db/migrations/20261103220000_email_workflow_template_complete.sql",import.meta.url),"utf8");
const supportTemplateSql=await readFile(new URL("../db/migrations/20261103230000_support_escalation_email_template.sql",import.meta.url),"utf8");
const client=new Client({connectionString,connectionTimeoutMillis:10000});
let open=false;
try{
 await client.connect();
 const identity=(await client.query("select current_database() database_name,current_schema() schema_name")).rows[0];
 if(identity.database_name!==expectedDatabase||identity.schema_name!=="public")throw new Error("Connected database/schema does not match the explicitly approved disposable target.");
 const templateCoverageBefore=Number((await client.query("select count(*)::int count from email_notification_template where template_code=any($1::text[])",[["organization.registration_received","organization.review_queue_item","organization.review_update"]])).rows[0].count);
 const workflowCoverageBefore=Number((await client.query("select count(*)::int count from email_notification_template where template_code=any($1::text[])",[["professional.workflow_update","employer.candidate_update","employer.offer_approval_required","employer.interview_scheduled","employer.interview_response","mentor.mentorship_update","organization.membership_added","organization.membership_updated"]])).rows[0].count);
 const supportTemplateBefore=(await client.query("select audience from email_notification_template where template_code='support.inquiry_escalated'")).rows[0]?.audience||null;
 const supportTemplateVersionsBefore=Number((await client.query("select count(*)::int count from email_template_version where template_code='support.inquiry_escalated'")).rows[0].count);
 const audienceConstraintsBefore=(await client.query("select conrelid::regclass::text relation_name,conname,pg_get_constraintdef(oid) definition from pg_constraint where contype='c' and conrelid in ('public.email_notification_template'::regclass,'public.email_template_version'::regclass) and pg_get_expr(conbin,conrelid) ilike '%audience%' order by relation_name,conname")).rows;
 const auditOutcomeConstraintBefore=(await client.query("select pg_get_constraintdef(oid) definition from pg_constraint where conrelid='public.audit_log'::regclass and conname='audit_log_outcome_check'")).rows[0]?.definition||null;

 const verificationBefore=(await client.query("select to_regclass('public.email_verification_delivery') is not null has_delivery_table, (select audience from email_notification_template where template_code='account.email_verification') audience")).rows[0];
 const before=(await client.query(`select
  exists(select 1 from pg_constraint where conname='email_verification_token_delivery_status_check' and pg_get_constraintdef(oid) like '%captured%') has_verification_capture,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_outbox' and column_name='delivery_status') has_delivery_status,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_outbox' and column_name='delivered_at') has_delivered_at,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_outbox' and column_name='delivery_event_at') has_delivery_event_at,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_outbox' and column_name='delivery_event_type') has_delivery_event_type,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_outbox' and column_name='email_event_key') has_event_key,
  to_regclass('public.email_delivery_event') is not null has_events,
  to_regclass('public.email_recipient_suppression') is not null has_holds,
  to_regclass('public.email_template_version') is not null has_versions`)).rows[0];
 await client.query("begin");open=true;
 await client.query("set local lock_timeout='5s'");
 await client.query("set local statement_timeout='30s'");
 await client.query(sql);
 await client.query(templateSql);
 await client.query(verificationSql);
 await client.query(workflowTemplateSql);
 await client.query(supportTemplateSql);
 const invalidWorkflowAudiences=await client.query(`with expected(template_code,audience) as (values
  ('professional.workflow_update','professional'),
  ('employer.candidate_update','employer'),
  ('employer.offer_approval_required','employer'),
  ('employer.interview_scheduled','employer'),
  ('employer.interview_response','employer'),
  ('mentor.mentorship_update','mentor'),
  ('organization.membership_added','all'),
  ('organization.membership_updated','all')
 )
 select e.template_code,t.audience actual_audience,e.audience expected_audience
 from expected e
 left join email_notification_template t using(template_code)
 where t.template_code is null or t.audience is distinct from e.audience`);
 if(invalidWorkflowAudiences.rowCount)throw new Error("Workflow email templates have missing or incorrect recipient audiences: "+JSON.stringify(invalidWorkflowAudiences.rows));
 const supportTemplate=(await client.query("select audience from email_notification_template where template_code='support.inquiry_escalated'")).rows[0];
 if(supportTemplate?.audience!=="support_manager")throw new Error("Support escalation template must target the support_manager audience.");
 const auditOutcomes=(await client.query("select pg_get_constraintdef(oid) definition from pg_constraint where conrelid='public.audit_log'::regclass and conname='audit_log_outcome_check'")).rows[0]?.definition||"";
 if(!auditOutcomes.includes("failure")||!auditOutcomes.includes("retry_scheduled"))throw new Error("Audit outcome constraint does not support the email dispatcher failure/retry audit events.");
 const audienceConstraintsAfter=(await client.query("select conrelid::regclass::text relation_name,conname,pg_get_constraintdef(oid) definition from pg_constraint where contype='c' and conrelid in ('public.email_notification_template'::regclass,'public.email_template_version'::regclass) and pg_get_expr(conbin,conrelid) ilike '%audience%' order by relation_name,conname")).rows;
 if(!audienceConstraintsAfter.some(row=>row.relation_name==="email_notification_template"&&row.definition.includes("support_manager")))throw new Error("Live email template audience constraint does not permit the new support_manager audience.");
 if(audienceConstraintsAfter.some(row=>row.relation_name==="email_template_version"&&!row.definition.includes("support_manager")))throw new Error("Email template version audience constraint was not extended consistently.");
 const templateCoverage=(await client.query("select count(*)::int count from email_notification_template where template_code=any($1::text[])",[["organization.registration_received","organization.review_queue_item","organization.review_update"]])).rows[0].count;
 if(templateCoverage!==3)throw new Error("Organization email audience templates were not seeded.");
 const verificationAfter=(await client.query("select to_regclass('public.email_verification_delivery') is not null has_delivery_table, exists(select 1 from information_schema.columns where table_schema='public' and table_name='email_delivery_event' and column_name='verification_delivery_id') event_link, (select audience from email_notification_template where template_code='account.email_verification') audience")).rows[0];
 if(!verificationAfter.has_delivery_table||!verificationAfter.event_link||verificationAfter.audience!=="all")throw new Error("Verification recovery migration did not create the encrypted job ledger, provider event link and universal verification audience.");
 const after=(await client.query(`select
  exists(select 1 from pg_constraint where conname='email_verification_token_delivery_status_check' and pg_get_constraintdef(oid) like '%captured%') has_verification_capture,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_outbox' and column_name='delivery_status') has_delivery_status,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_outbox' and column_name='delivered_at') has_delivered_at,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_outbox' and column_name='delivery_event_at') has_delivery_event_at,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_outbox' and column_name='delivery_event_type') has_delivery_event_type,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_outbox' and column_name='email_event_key') has_event_key,
  to_regclass('public.email_delivery_event') is not null has_events,
  to_regclass('public.email_recipient_suppression') is not null has_holds,
  to_regclass('public.email_template_version') is not null has_versions`)).rows[0];
 if(!after.has_verification_capture||!after.has_event_key||!after.has_delivery_status||!after.has_delivered_at||!after.has_delivery_event_at||!after.has_delivery_event_type||!after.has_events||!after.has_holds||!after.has_versions)throw new Error("Email hardening migration did not create all expected schema objects.");
 await client.query("rollback");open=false;
 const restored=(await client.query(`select
  exists(select 1 from pg_constraint where conname='email_verification_token_delivery_status_check' and pg_get_constraintdef(oid) like '%captured%') has_verification_capture,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_outbox' and column_name='delivery_status') has_delivery_status,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_outbox' and column_name='delivered_at') has_delivered_at,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_outbox' and column_name='delivery_event_at') has_delivery_event_at,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_outbox' and column_name='delivery_event_type') has_delivery_event_type,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_outbox' and column_name='email_event_key') has_event_key,
  to_regclass('public.email_delivery_event') is not null has_events,
  to_regclass('public.email_recipient_suppression') is not null has_holds,
  to_regclass('public.email_template_version') is not null has_versions`)).rows[0];
 for(const key of ["has_verification_capture","has_event_key","has_delivery_status","has_delivered_at","has_delivery_event_at","has_delivery_event_type","has_events","has_holds","has_versions"])if(Boolean(restored[key])!==Boolean(before[key]))throw new Error("Email migration rollback did not restore the original disposable schema baseline: "+key);
 const verificationRestored=(await client.query("select to_regclass('public.email_verification_delivery') is not null has_delivery_table, (select audience from email_notification_template where template_code='account.email_verification') audience")).rows[0];
 if(Boolean(verificationRestored.has_delivery_table)!==Boolean(verificationBefore.has_delivery_table)||verificationRestored.audience!==verificationBefore.audience)throw new Error("Verification recovery migration rollback did not restore the disposable schema/template baseline.");
 const templateCoverageAfter=Number((await client.query("select count(*)::int count from email_notification_template where template_code=any($1::text[])",[["organization.registration_received","organization.review_queue_item","organization.review_update"]])).rows[0].count);
 const supportTemplateAfter=(await client.query("select audience from email_notification_template where template_code='support.inquiry_escalated'")).rows[0]?.audience||null;
 const supportTemplateVersionsAfter=Number((await client.query("select count(*)::int count from email_template_version where template_code='support.inquiry_escalated'")).rows[0].count);
 if(supportTemplateAfter!==supportTemplateBefore||supportTemplateVersionsAfter!==supportTemplateVersionsBefore)throw new Error("Support escalation template migration rollback did not restore its prior template/version baseline.");
 const audienceConstraintsAfterRollback=(await client.query("select conrelid::regclass::text relation_name,conname,pg_get_constraintdef(oid) definition from pg_constraint where contype='c' and conrelid in ('public.email_notification_template'::regclass,'public.email_template_version'::regclass) and pg_get_expr(conbin,conrelid) ilike '%audience%' order by relation_name,conname")).rows;
 const auditOutcomeConstraintAfterRollback=(await client.query("select pg_get_constraintdef(oid) definition from pg_constraint where conrelid='public.audit_log'::regclass and conname='audit_log_outcome_check'")).rows[0]?.definition||null;
 if(JSON.stringify(audienceConstraintsAfterRollback)!==JSON.stringify(audienceConstraintsBefore)||auditOutcomeConstraintAfterRollback!==auditOutcomeConstraintBefore)throw new Error("Support email migration rollback did not restore the original audience and audit outcome constraints.");
 if(templateCoverageAfter!==templateCoverageBefore)throw new Error("Email template coverage migration rollback did not restore the original template baseline.");
 process.stdout.write("Email hardening migration apply/rollback compatibility passed.\n");
}catch(error){
 if(open)await client.query("rollback").catch(()=>{});
 throw error;
}finally{await client.end().catch(()=>{});}
