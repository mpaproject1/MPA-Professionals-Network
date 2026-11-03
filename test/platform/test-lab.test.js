import assert from "node:assert/strict";
import test from "node:test";
import { testLabConfiguration } from "../../src/platform/test-lab.js";
import { createXlsx, parseXlsxRows } from "../../src/platform/xlsx.js";
import { TEST_LAB_PERSONAS, TEST_LAB_SCENARIOS } from "../../src/platform/test-lab-catalog.js";

test("Test Lab reports capture mode only when explicitly configured",()=>{
 const before={nodeEnv:process.env.NODE_ENV,enabled:process.env.TEST_LAB_ENABLED,disposable:process.env.TEST_LAB_DISPOSABLE_DATABASE,delivery:process.env.TEST_DELIVERY_MODE};
 try{
  process.env.NODE_ENV="development";process.env.TEST_LAB_ENABLED="true";process.env.TEST_LAB_DISPOSABLE_DATABASE="true";process.env.TEST_DELIVERY_MODE="capture";
  assert.deepEqual(testLabConfiguration(),{enabled:true,environment:"development",databaseSafetyConfigured:true,deliveryMode:"capture"});
  process.env.TEST_DELIVERY_MODE="live";
  assert.equal(testLabConfiguration().deliveryMode,"blocked");
  process.env.NODE_ENV="production";
  assert.equal(testLabConfiguration().enabled,false);
 }finally{
  for(const [key,value] of [["NODE_ENV",before.nodeEnv],["TEST_LAB_ENABLED",before.enabled],["TEST_LAB_DISPOSABLE_DATABASE",before.disposable],["TEST_DELIVERY_MODE",before.delivery]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}
 }
});

test("composite and non-UUID primary keys are captured and deleted only by their recorded key",async()=>{
 const {readFile}=await import("node:fs/promises");
 const migration=await readFile(new URL("../../db/migrations/20261102130000_test_lab_composite_key_capture.sql",import.meta.url),"utf8");
 const service=await readFile(new URL("../../src/platform/test-lab.js",import.meta.url),"utf8");
 assert.match(migration,/test_portfolio_composite_record/);
 assert.match(migration,/test_lab_capture_composite_owned_record/);
 assert.match(migration,/jsonb_object_agg\(a\.attname/);
 assert.match(migration,/after insert or update on public/);
 assert.match(service,/test_portfolio_composite_record where portfolio_id=\$1/);
 assert.match(service,/to_jsonb\(t\) @> \$1::jsonb/);
 assert.match(service,/delete from test_portfolio_composite_record where portfolio_id=\$1/);
});
 
test("domain fixtures create private synthetic evidence and cover the requested workflows",async()=>{
 const {readFile}=await import("node:fs/promises");
 const source=await readFile(new URL("../../src/platform/test-lab-domain-fixtures.js",import.meta.url),"utf8");
 for(const table of ["verification_case","verification_evidence","organization","organization_verification_case","organization_verification_evidence","job","job_application","service_listing","service_request","mentor_profile","mentorship_request","serve_community_initiative","serve_community_participation","serve_community_offline_project","finance_payment_record","community_campaign_delivery"])assert.match(source,new RegExp("insert into "+table+"\\b"));
 assert.match(source,/storage_provider,object_key,original_name,content_type,byte_size,checksum_sha256/);
 assert.match(source,/flag:"wx",mode:0o600/);
 assert.match(source,/insert into private_upload_session/);
 assert.match(source,/confirmed/);
 assert.match(source,/test_portfolio_only/);
 assert.match(source,/consent_at/);
 assert.match(source,/test-lab-v1/);
 assert.match(source,/Synthetic QA/);
});
 
test("credential workbook is a valid XLSX and preserves generated account credentials",()=>{
 const source=[{Email:"qa.member@example.test",Password:"random-secret-value!7",Persona:"Synthetic member",Role:"member"}];
 const workbook=createXlsx(source,Object.keys(source[0]));
 const parsed=parseXlsxRows(workbook);
 assert.deepEqual(parsed.headers,Object.keys(source[0]));
 assert.deepEqual(parsed.rows,source);
});

test("test portfolio migration installs ownership capture and portfolio-only registry",async()=>{
 const {readFile}=await import("node:fs/promises");
 const sql=await readFile(new URL("../../db/migrations/20261102120000_test_lab_portfolios.sql",import.meta.url),"utf8");
 assert.match(sql,/test_portfolio_record/);
 assert.match(sql,/test_lab_capture_owned_record/);
 assert.match(sql,/jsonb_each_text/);
 assert.match(sql,/test_portfolio_account/);
});

test("Test Lab never stores recoverable credentials and gates every operation on a disposable database acknowledgement",async()=>{
 const {readFile}=await import("node:fs/promises");
 const migration=await readFile(new URL("../../db/migrations/20261103100000_test_lab_no_recoverable_credentials.sql",import.meta.url),"utf8");
 const service=await readFile(new URL("../../src/platform/test-lab.js",import.meta.url),"utf8");
 const admin=await readFile(new URL("../../web/app/admin/test-lab/page.tsx",import.meta.url),"utf8");
 assert.match(migration,/drop column if exists password_ciphertext/i);
 assert.doesNotMatch(service,/password_ciphertext|encryptSecret|decryptSecret|TEST_LAB_CREDENTIAL_ENCRYPTION_KEY/);
 assert.match(service,/TEST_LAB_DISPOSABLE_DATABASE==="true"/);
 assert.match(service,/hashPassword\(account\.password\)/);
 assert.match(service,/sessionsRevoked:true/);
 assert.match(service,/credentialsWorkbookBase64/);
 assert.match(service,/accounts\.map\(\(\{userId,password/);
 assert.match(admin,/Delete entire test portfolio/);
 assert.match(admin,/method:"POST"/);
});


test("Test Lab catalogue contains 22 distinct role-based personas and 22 traceable scenarios",()=>{
 assert.equal(TEST_LAB_PERSONAS.length,22);
 assert.equal(new Set(TEST_LAB_PERSONAS.map(row=>row.persona)).size,22);
 assert.equal(new Set(TEST_LAB_PERSONAS.map(row=>row.personaKey)).size,22);
 assert.equal(TEST_LAB_SCENARIOS.length,22);
 assert.equal(new Set(TEST_LAB_SCENARIOS.map(row=>row.id)).size,22);
 const installedRoles=new Set(["member","reviewer","verification_reviewer","appeal_reviewer","finance_officer","supporting_staff"]);
 for(const persona of TEST_LAB_PERSONAS)assert.ok(installedRoles.has(persona.role),persona.role);
 for(const scenario of TEST_LAB_SCENARIOS){
  assert.ok(TEST_LAB_PERSONAS.some(persona=>persona.personaKey===scenario.personaKey),scenario.id);
  assert.ok(scenario.expected.length>10&&scenario.evidence.length>5,scenario.id);
 }
});

test("Test Lab membership payment fixtures use the real membership service lifecycle",async()=>{
 const {readFile}=await import("node:fs/promises");
 const service=await readFile(new URL("../../src/platform/test-lab.js",import.meta.url),"utf8");
 assert.match(service,/membership\.createApplication\(/);
 assert.match(service,/membership\.createManualPayment\(/);
 assert.match(service,/membership\.verifyPayment\(/);
 assert.match(service,/membership\.reverseMembershipPayment\(/);
 assert.match(service,/decision:"needs_correction"/);
 assert.match(service,/metadata->>'testLab'='true'/);
 assert.doesNotMatch(service,/insert into payment_transaction\(provider,provider_transaction_id,idempotency_key,purpose/);
 assert.match(service,/p\.provider='manual' and p\.purpose='membership'/);
});

test("scenario workbook exports execution and evidence capture columns",async()=>{
 const {readFile}=await import("node:fs/promises");
 const service=await readFile(new URL("../../src/platform/test-lab.js",import.meta.url),"utf8");
 assert.match(service,/exportTestPortfolioScenarioWorkbook/);
 for(const column of ["Execution status","Evidence reference","Actual result","Tester notes","Executed by","Executed at"])assert.ok(service.includes(column),column);
});

test("Test Lab API exposes the scenario workbook and portfolio operations monitoring",async()=>{
 const {readFile}=await import("node:fs/promises");
 const server=await readFile(new URL("../../server.js",import.meta.url),"utf8");
 const admin=await readFile(new URL("../../web/app/admin/test-lab/page.tsx",import.meta.url),"utf8");
 assert.match(server,/scenarios\.xlsx/);
 assert.match(server,/getTestPortfolioOperations/);
 assert.match(server,/simulateTestPayment/);
 assert.match(admin,/Operations/);
 assert.match(admin,/Captured delivery events/);
 assert.match(admin,/Simulate success/);
});


test("delivery capture is isolated from Test Lab membership service imports",async()=>{
 const {readFile}=await import("node:fs/promises");
 const lab=await readFile(new URL("../../src/platform/test-lab.js",import.meta.url),"utf8");
 const capture=await readFile(new URL("../../src/platform/test-lab-delivery.js",import.meta.url),"utf8");
 const email=await readFile(new URL("../../src/platform/email-operations.js",import.meta.url),"utf8");
 const push=await readFile(new URL("../../src/platform/web-push.js",import.meta.url),"utf8");
 assert.match(lab,/import \* as membership from "\.\.\/membership\/service\.js"/);
 assert.doesNotMatch(lab,/from "\.\/email-operations\.js"/);
 assert.match(capture,/export async function captureTestDelivery/);
 assert.match(email,/from "\.\/test-lab-delivery\.js"/);
 assert.match(push,/from "\.\/test-lab-delivery\.js"/);
 assert.doesNotMatch(email,/from "\.\/test-lab\.js"/);
 assert.doesNotMatch(push,/from "\.\/test-lab\.js"/);
});
