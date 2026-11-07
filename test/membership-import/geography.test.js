import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  applyMemberGeographyImport,
  getMemberGeographySummary,
  exportPublishedMemberGeography,
  getMyResidence,
  listMemberGeography,
  memberGeographyImportTemplate,
  previewMemberGeographyImport,
  publishMemberGeographyVersion,
  saveMyResidence,
} from "../../src/membership/geography.js";
import * as membership from "../../src/membership/service.js";
import { getPool } from "../../src/platform/db.js";
import { createXlsx, parseXlsxRows } from "../../src/platform/xlsx.js";

const admin={sub:"system-admin",roles:["system_admin"],permissions:[]};
const member={sub:"member-user",roles:["member"],permissions:[]};
const requestId="00000000-0000-4000-8000-000000000001";

test("geography reference workbook exposes a versioned parent-child import contract",()=>{
 const workbook=memberGeographyImportTemplate(admin);
 const {headers,rows}=parseXlsxRows(workbook);
 assert.deepEqual(headers,["unit_code","label","unit_level","parent_code","country_iso3","country_m49","source_name","source_version","effective_from","effective_to","active","metadata"]);
 assert.equal(rows.length,0);
});

test("ordinary members cannot preview administrative geography imports",async()=>{
 await assert.rejects(previewMemberGeographyImport(member,{xlsxBase64:"invalid"},requestId),error=>error.statusCode===403&&error.code==="FORBIDDEN");
});

test("ordinary members cannot export administrative geography workbooks",async()=>{
 await assert.rejects(exportPublishedMemberGeography(member),error=>error.statusCode===403&&error.code==="FORBIDDEN");
});


const GEO_COLUMNS=["unit_code","label","unit_level","parent_code","country_iso3","country_m49","source_name","source_version","effective_from","effective_to","active","metadata"];
const SOURCE_URL="https://unstats.un.org/unsd/methodology/m49/overview/";
function geographyRows(suffix){
 const metadata=JSON.stringify({sourceUrl:SOURCE_URL});
 return [
  {unit_code:"ETH",label:"Ethiopia",unit_level:"country",parent_code:"",country_iso3:"ETH",country_m49:"231",source_name:"UNSD M49",source_version:"current",effective_from:"",effective_to:"",active:"true",metadata:JSON.stringify({sourceUrl:SOURCE_URL,residenceSelectable:true})},
  {unit_code:"USA",label:"United States",unit_level:"country",parent_code:"",country_iso3:"USA",country_m49:"840",source_name:"UNSD M49",source_version:"current",effective_from:"",effective_to:"",active:"true",metadata:JSON.stringify({sourceUrl:SOURCE_URL,residenceSelectable:true})},
  {unit_code:"ET-REG-"+suffix,label:"Test Region "+suffix,unit_level:"region",parent_code:"ETH",country_iso3:"",country_m49:"",source_name:"MPA geography integration fixture",source_version:"test-1",effective_from:"",effective_to:"",active:"true",metadata},
 ];
}

test("geography XLSX round-trip preserves source fields and the complete parent-code contract",()=>{
 const rows=geographyRows("ROUNDTRIP");
 const parsed=parseXlsxRows(createXlsx(rows,GEO_COLUMNS));
 assert.deepEqual(parsed.headers,GEO_COLUMNS);
 assert.equal(parsed.rows.length,3);
 assert.equal(parsed.rows[2].parent_code,"ETH");
 assert.equal(JSON.parse(parsed.rows[2].metadata).sourceUrl,SOURCE_URL);
});

test("geography preview requires an HTTPS primary source before creating an import batch",async()=>{
 const workbook=createXlsx(geographyRows("NOURL"),GEO_COLUMNS);
 await assert.rejects(previewMemberGeographyImport(admin,{xlsxBase64:workbook.toString("base64"),sourceVersion:"test-1"},requestId),error=>error.statusCode===400&&error.code==="SOURCE_URL_REQUIRED");
});

test("PostgreSQL geography workbook preview, apply, publish, member selectors and aggregation use one published version",async t=>{
 if(!process.env.DATABASE_URL){t.skip("requires the disposable PostgreSQL database configured by PR Quality");return;}
 const db=getPool(),suffix=randomUUID().replace(/-/g,"").slice(0,10).toUpperCase(),digits=suffix.replace(/\D/g,"").slice(0,8).padEnd(8,"7");
 const created=await membership.register({email:"geography-"+suffix+"@example.test",password:"GeographySecurePassword!2026",firstName:"Geo",lastName:"Fixture",phone:"09"+digits},"geography-user-"+suffix);
 const userId=created.user.id,identity={sub:userId,roles:["system_admin"],permissions:[]};
 const previousPublished=(await db.query("select id from membership_geography_version where status='published' order by published_at desc limit 1")).rows[0]?.id||null;
 const batchIds=[],versionIds=[];
 try{
  const invalidRows=geographyRows("INVALID");
  invalidRows[2].parent_code="MISSING-PARENT";
  const invalid=await previewMemberGeographyImport(identity,{filename:"invalid-geography.xlsx",sourceName:"MPA test",sourceVersion:"test-1",sourceUrl:SOURCE_URL,xlsxBase64:createXlsx(invalidRows,GEO_COLUMNS).toString("base64")},randomUUID());
  batchIds.push(invalid.batchId);
  assert.equal(invalid.canApply,false);
  assert.ok(invalid.errorCount>0);
  await assert.rejects(applyMemberGeographyImport(identity,invalid.batchId,{reason:"Reject unresolved parent hierarchy"},randomUUID()),error=>error.code==="IMPORT_NOT_VALIDATED");

  const valid=await previewMemberGeographyImport(identity,{filename:"valid-geography.xlsx",sourceName:"MPA test",sourceVersion:"test-1",sourceUrl:SOURCE_URL,xlsxBase64:createXlsx(geographyRows(suffix),GEO_COLUMNS).toString("base64")},randomUUID());
  batchIds.push(valid.batchId);
  assert.equal(valid.canApply,true);
  const applied=await applyMemberGeographyImport(identity,valid.batchId,{reason:"Apply verified geography fixture",versionLabel:"geo-test-"+suffix},randomUUID());
  versionIds.push(applied.versionId);
  assert.equal(applied.status,"draft");
  await publishMemberGeographyVersion(identity,applied.versionId,{reason:"Publish verified geography fixture"},randomUUID());

  const exported=await exportPublishedMemberGeography(identity);
  const exportedWorkbook=parseXlsxRows(exported.workbook);
  assert.equal(exported.rowCount,3);
  assert.equal(exportedWorkbook.rows.length,3);
  assert.ok(exportedWorkbook.rows.some(row=>row.unit_code==="ETH"&&row.country_m49==="231"));
  assert.ok(exportedWorkbook.rows.some(row=>row.unit_code==="USA"&&row.country_m49==="840"));
  assert.ok(exportedWorkbook.rows.some(row=>row.unit_code==="ET-REG-"+suffix&&row.parent_code==="ETH"));

  const published=await listMemberGeography(identity);
  assert.equal(published.version.id,applied.versionId);
  assert.ok(published.countries.some(row=>row.country_iso3==="ETH"));
  assert.ok(published.regions.some(row=>row.unit_code==="ET-REG-"+suffix));
  await saveMyResidence(userId,{residenceType:"ethiopia",countryCode:"ETH",adminLevel1Code:"ET-REG-"+suffix,localityNote:"Geography integration fixture"},randomUUID());
  const residenceAudit=await db.query("select 1 from audit_log where actor_user_id=$1 and action='member.residence_updated' and resource_id=$1::uuid::text",[userId]);
  assert.equal(residenceAudit.rowCount,1,"residence changes must persist their audit event");
  const residence=await getMyResidence(userId);
  assert.equal(residence.admin_level_1_code,"ET-REG-"+suffix);
  assert.equal(residence.geography_version_id,applied.versionId);
  const summary=await getMemberGeographySummary(identity);
  assert.equal(summary.publishedVersion.id,applied.versionId,"aggregation must use the exact published geography version used by profile selectors");
  assert.ok(summary.ethiopiaLevel1.some(row=>row.unit_code==="ET-REG-"+suffix&&Number(row.member_count)>=1));
 }finally{
  await db.query("delete from member_residence where user_id=$1",[userId]);
  for(const batchId of batchIds)await db.query("delete from membership_geography_import_batch where id=$1",[batchId]);
  for(const versionId of versionIds){
   await db.query("delete from membership_geography_unit where version_id=$1",[versionId]);
   await db.query("delete from membership_geography_version where id=$1",[versionId]);
  }
  if(previousPublished)await db.query("update membership_geography_version set status='published',published_at=coalesce(published_at,now()) where id=$1",[previousPublished]);
  await db.query("delete from audit_log where actor_user_id=$1",[userId]);
  await db.query("delete from notification_preference where user_id=$1",[userId]);
  await db.query("delete from notification_event where user_id=$1",[userId]);
  await db.query("delete from app_user_role where user_id=$1",[userId]);
  await db.query("delete from professional_portfolio_item where profile_id in (select id from professional_profile where person_id in (select id from person where user_id=$1))",[userId]);
  await db.query("delete from professional_profile where person_id in (select id from person where user_id=$1)",[userId]);
  await db.query("delete from person where user_id=$1",[userId]);
  await db.query("delete from app_user where id=$1",[userId]);
 }
});
