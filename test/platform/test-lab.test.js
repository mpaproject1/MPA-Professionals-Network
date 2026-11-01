import assert from "node:assert/strict";
import test from "node:test";
import { createXlsx, parseXlsxRows } from "../../src/platform/xlsx.js";
import { testLabConfiguration } from "../../src/platform/test-lab.js";

test("Test Lab reports capture mode only when explicitly configured",()=>{
 const before={nodeEnv:process.env.NODE_ENV,enabled:process.env.TEST_LAB_ENABLED,delivery:process.env.TEST_DELIVERY_MODE};
 try{
  process.env.NODE_ENV="development";process.env.TEST_LAB_ENABLED="true";process.env.TEST_DELIVERY_MODE="capture";
  assert.deepEqual(testLabConfiguration(),{enabled:true,environment:"development",databaseAllowlistConfigured:Boolean(process.env.TEST_LAB_DATABASE_NAME),credentialEncryptionConfigured:Boolean(process.env.TEST_LAB_CREDENTIAL_ENCRYPTION_KEY),deliveryMode:"capture"});
  process.env.TEST_DELIVERY_MODE="live";
  assert.equal(testLabConfiguration().deliveryMode,"blocked");
  process.env.NODE_ENV="production";
  assert.equal(testLabConfiguration().enabled,false);
 }finally{
  for(const [key,value] of [["NODE_ENV",before.nodeEnv],["TEST_LAB_ENABLED",before.enabled],["TEST_DELIVERY_MODE",before.delivery]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}
 }
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
