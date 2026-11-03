import { randomUUID } from "node:crypto";
import { getPool, withTransaction } from "../platform/db.js";
import { createXlsx, parseXlsxRows } from "../platform/xlsx.js";

const SOURCE = "UNSD M49 / MPA Ethiopian administrative reference";
const COLUMNS = ["unit_code","label","unit_level","parent_code","country_iso3","country_m49","source_name","source_version","effective_from","effective_to","active","metadata"];
const LEVELS = new Set(["country","region","federal_city","zone","sub_city","district","town"]);
const ALLOWED = {
  region: new Set(["country:ETH"]),
  federal_city: new Set(["country:ETH"]),
  zone: new Set(["region"]),
  sub_city: new Set(["federal_city"]),
  district: new Set(["zone","sub_city"]),
  town: new Set(["zone","sub_city"]),
};
function fail(statusCode,message,code="BUSINESS_RULE"){return Object.assign(new Error(message),{statusCode,code});}
function clean(value,max=240){return String(value??"").trim().slice(0,max);}
function validDate(value){if(!value)return true;if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+"T00:00:00.000Z");return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;}
function authorized(identity){const roles=identity?.roles||[],permissions=identity?.permissions||[];if(roles.some(role=>["system_admin","admin","platform_admin"].includes(role))||permissions.includes("members.geography.manage"))return;throw fail(403,"Member geography management permission is required.","FORBIDDEN");}
function parseRows(rows){
 const seen=new Set();
 return rows.map((source,index)=>{
 const row={};for(const key of COLUMNS)row[key]=clean(source[key],key==="metadata"?2000:key==="label"?180:240);
  row.unit_code=row.unit_code.toUpperCase();row.unit_level=row.unit_level.toLowerCase();row.parent_code=row.parent_code.toUpperCase();
  row.country_iso3=row.country_iso3.toUpperCase();row.country_m49=row.country_m49?row.country_m49.padStart(3,"0"):"";
  row.active=row.active===""||row.active.toLowerCase()==="true"||row.active==="1"||row.active.toLowerCase()==="yes";
  row.rowNumber=index+2;row.errors=[];
  try{row.metadata=row.metadata?JSON.parse(row.metadata):{};if(!row.metadata||typeof row.metadata!=="object"||Array.isArray(row.metadata))throw new Error("metadata must be a JSON object.");}catch{row.errors.push("metadata must be a valid JSON object when supplied.");row.metadata={};}
  const rowSourceUrl=clean(row.metadata.sourceUrl,1000);if(!/^https:\/\//i.test(rowSourceUrl))row.errors.push("metadata.sourceUrl must be an HTTPS source URL for every reference row.");
  if(!/^[A-Z0-9][A-Z0-9._-]{1,79}$/.test(row.unit_code))row.errors.push("unit_code must be 2–80 letters, digits, dots, underscores or dashes.");
  if(!row.label)row.errors.push("label is required.");
  if(!LEVELS.has(row.unit_level))row.errors.push("unit_level must be country, region, federal_city, zone, sub_city, district or town.");
  if(seen.has(row.unit_code))row.errors.push("unit_code is duplicated in this workbook.");seen.add(row.unit_code);
  if(row.unit_level==="country"){
    if(row.parent_code)row.errors.push("A country cannot have a parent_code.");
    if(!/^[A-Z]{3}$/.test(row.country_iso3)||!/^[0-9]{3}$/.test(row.country_m49))row.errors.push("Country rows require ISO alpha-3 and UN M49 three-digit codes.");
  }else{
    if(!row.parent_code)row.errors.push("Administrative units require parent_code.");
    if(row.country_iso3||row.country_m49)row.errors.push("ISO/M49 country codes belong only on country rows.");
  }
  if(!row.source_name)row.errors.push("source_name is required.");
  if(!row.source_version)row.errors.push("source_version is required.");
  if(!validDate(row.effective_from)||!validDate(row.effective_to))row.errors.push("Effective dates must use YYYY-MM-DD.");
  if(row.effective_from&&row.effective_to&&row.effective_to<row.effective_from)row.errors.push("effective_to cannot precede effective_from.");
  return row;
 });
}
function validateHierarchy(rows){
 const byCode=new Map(rows.map(row=>[row.unit_code,row]));
 for(const row of rows){
  if(row.unit_level==="country")continue;
  const parent=byCode.get(row.parent_code);
  if(!parent){row.errors.push("parent_code must reference a row in this workbook; import a complete versioned hierarchy.");continue;}
  if(!ALLOWED[row.unit_level]?.has(parent.unit_level==="country"?"country:"+parent.country_iso3:parent.unit_level))row.errors.push("The selected parent level is not valid for "+row.unit_level+".");
  if(["region","federal_city"].includes(row.unit_level)&&parent.country_iso3!=="ETH")row.errors.push("Ethiopian regions and federal cities must belong to the Ethiopia country row (ETH).");
 }
}
export function memberGeographyImportTemplate(identity){
 authorized(identity);
 return createXlsx([],COLUMNS);
}
export async function listMemberGeography(identity){
 if(!identity?.sub)throw fail(401,"Sign in to view member residence reference data.","UNAUTHORIZED");
 const db=getPool();
 const version=(await db.query("select id,version_label,source_name,source_version,published_at from membership_geography_version where status='published' order by published_at desc limit 1")).rows[0];
 if(!version)return {version:null,countries:[],regions:[],federalCities:[],children:[]};
 const rows=(await db.query("select id,unit_code,label,unit_level,parent_id,country_iso3,country_m49,metadata from membership_geography_unit where version_id=$1 and active=true order by label",[version.id])).rows;
 return {version,countries:rows.filter(row=>row.unit_level==="country"&&row.metadata?.residenceSelectable!==false),regions:rows.filter(row=>row.unit_level==="region"),federalCities:rows.filter(row=>row.unit_level==="federal_city"),children:rows.filter(row=>!["country","region","federal_city"].includes(row.unit_level))};
}
export async function getMyResidence(userId){
 const row=(await getPool().query(`select r.*,c.country_iso3 country_code,c.label country_name,
  a1.unit_code admin_level_1_code,a1.label admin_level_1_label,a1.unit_level admin_level_1_type,
  a2.unit_code admin_level_2_code,a2.label admin_level_2_label,a2.unit_level admin_level_2_type,
  a3.unit_code admin_level_3_code,a3.label admin_level_3_label,a3.unit_level admin_level_3_type
  from member_residence r left join membership_geography_unit c on c.id=r.country_unit_id
  left join membership_geography_unit a1 on a1.id=r.admin_level_1_id
  left join membership_geography_unit a2 on a2.id=r.admin_level_2_id
  left join membership_geography_unit a3 on a3.id=r.admin_level_3_id where r.user_id=$1`,[userId])).rows[0];
 return row||null;
}
export async function saveMyResidence(userId,input={},requestId){
 const type=String(input.residenceType||"").toLowerCase();
 if(!["ethiopia","diaspora"].includes(type))throw fail(400,"Choose Ethiopia or Diaspora.","RESIDENCE_TYPE_REQUIRED");
 const countryCode=clean(input.countryCode,3).toUpperCase();
 const level1=clean(input.adminLevel1Code,80).toUpperCase()||null;
 const level2=clean(input.adminLevel2Code,80).toUpperCase()||null;
 const level3=clean(input.adminLevel3Code,80).toUpperCase()||null;
 const area=clean(input.diasporaArea,240)||null,street=clean(input.streetAddress,500)||null,locality=clean(input.localityNote,240)||null;
 if(!/^[A-Z]{3}$/.test(countryCode))throw fail(400,"Choose a country from the published reference list.","COUNTRY_REQUIRED");
 if(type==="ethiopia"&&(!level1||area))throw fail(400,"Choose a Region or Federal City for Ethiopian residence.","ETHIOPIA_LEVEL1_REQUIRED");
 if(type==="diaspora"&&(level1||level2||level3||street))throw fail(400,"Diaspora residence uses country and optional area only.","DIASPORA_HIERARCHY_INVALID");
 await withTransaction(async tx=>{
  const version=(await tx.query("select id from membership_geography_version where status='published' order by published_at desc limit 1")).rows[0];
  if(!version)throw fail(409,"Member geography reference data has not yet been published. Contact an administrator.","GEOGRAPHY_NOT_PUBLISHED");
  const country=(await tx.query("select id,unit_level,country_iso3 from membership_geography_unit where version_id=$1 and unit_level='country' and country_iso3=$2 and active=true and metadata->>'residenceSelectable' is distinct from 'false'",[version.id,countryCode])).rows[0];
  if(!country)throw fail(400,"The selected country is not in the current published reference version.","COUNTRY_NOT_FOUND");
  if(type==="ethiopia"&&country.country_iso3!=="ETH")throw fail(400,"Choose Ethiopia as the country for an Ethiopian residence.","COUNTRY_MISMATCH");
  if(type==="diaspora"&&country.country_iso3==="ETH")throw fail(400,"Choose Ethiopia as residence type for an Ethiopian location.","COUNTRY_MISMATCH");
  async function unit(code){if(!code)return null;const row=(await tx.query("select id,unit_level,parent_id from membership_geography_unit where version_id=$1 and unit_code=$2 and active=true",[version.id,code])).rows[0];if(!row)throw fail(400,"A selected administrative location is not in the current published reference version.","GEOGRAPHY_UNIT_NOT_FOUND");return row;}
  const a1=type==="ethiopia"?await unit(level1):null,a2=type==="ethiopia"?await unit(level2):null,a3=type==="ethiopia"?await unit(level3):null;
  if(a1&&(!["region","federal_city"].includes(a1.unit_level)||a1.parent_id!==country.id))throw fail(400,"Choose a Region or Federal City belonging to Ethiopia.","GEOGRAPHY_PARENT_MISMATCH");
  if(a2&&((a1.unit_level==="region"&&a2.unit_level!=="zone")||(a1.unit_level==="federal_city"&&a2.unit_level!=="sub_city")||a2.parent_id!==a1.id))throw fail(400,"Choose a Zone for a Region or a Sub-city for a Federal City.","GEOGRAPHY_PARENT_MISMATCH");
  if(a3&&(!a2||!["district","town"].includes(a3.unit_level)||a3.parent_id!==a2.id))throw fail(400,"Choose a District or Town belonging to the selected Zone or Sub-city.","GEOGRAPHY_PARENT_MISMATCH");
  if(a1){
   const expected=a1.unit_level==="region"?"zone":"sub_city";
   const available=(await tx.query("select 1 from membership_geography_unit where version_id=$1 and parent_id=$2 and unit_level=$3 and active=true limit 1",[version.id,a1.id,expected])).rowCount>0;
   if(available&&!a2)throw fail(400,"Choose a "+(expected==="zone"?"Zone":"Sub-city")+" from the published hierarchy.","GEOGRAPHY_LEVEL2_REQUIRED");
  }
  if(a2){
   const available=(await tx.query("select 1 from membership_geography_unit where version_id=$1 and parent_id=$2 and unit_level in ('district','town') and active=true limit 1",[version.id,a2.id])).rowCount>0;
   if(available&&!a3)throw fail(400,"Choose a District or Town from the published hierarchy.","GEOGRAPHY_LEVEL3_REQUIRED");
  }
  await tx.query(`insert into member_residence(user_id,residence_type,geography_version_id,country_unit_id,admin_level_1_id,admin_level_2_id,admin_level_3_id,diaspora_area,street_address,locality_note,updated_at)
   values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
   on conflict(user_id) do update set residence_type=excluded.residence_type,geography_version_id=excluded.geography_version_id,country_unit_id=excluded.country_unit_id,
   admin_level_1_id=excluded.admin_level_1_id,admin_level_2_id=excluded.admin_level_2_id,admin_level_3_id=excluded.admin_level_3_id,
   diaspora_area=excluded.diaspora_area,street_address=excluded.street_address,locality_note=excluded.locality_note,updated_at=now()`,
  [userId,type,version.id,country.id,a1?.id||null,a2?.id||null,a3?.id||null,area,street,locality]);
  await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'member.residence_updated','member_residence',$1,$2,'success',$3)",[userId,requestId,JSON.stringify({residenceType:type,countryCode,hasStreetAddress:Boolean(street)})]);
 });
 return getMyResidence(userId);
}
export async function previewMemberGeographyImport(identity,input={},requestId){
 authorized(identity);
 const base64=String(input.xlsxBase64||"");
 if(!base64||base64.length>12*1024*1024)throw fail(400,"Upload a valid geography XLSX workbook up to 9 MiB.","XLSX_REQUIRED");
 let parsed;try{parsed=parseXlsxRows(Buffer.from(base64,"base64"));}catch(error){throw fail(400,error.message||"The geography workbook could not be read.","XLSX_INVALID");}
 const sourceUrl=clean(input.sourceUrl,1000);if(!/^https:\/\//i.test(sourceUrl))throw fail(400,"Provide the HTTPS URL for the primary source used by this reference workbook.","SOURCE_URL_REQUIRED");
 const headers=parsed.headers.map(h=>h.trim());
 const missing=COLUMNS.filter(column=>!headers.includes(column));
 if(missing.length)throw fail(400,"The workbook is missing columns: "+missing.join(", "),"MISSING_COLUMNS");
 const rows=parseRows(parsed.rows);validateHierarchy(rows);
 const errors=rows.reduce((sum,row)=>sum+row.errors.length,0);
 const batchId=randomUUID();
 await withTransaction(async tx=>{
  await tx.query("insert into membership_geography_import_batch(id,filename,source_name,source_version,status,row_count,error_count,imported_by,metadata) values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
   [batchId,clean(input.filename||"member-geography.xlsx",255),clean(input.sourceName||SOURCE,180),clean(input.sourceVersion||"unspecified",120),errors?"previewed":"validated",rows.length,errors,identity.sub,JSON.stringify({requestId,columns:headers,sourceUrl,sourceUrls:[...new Set(rows.map(row=>clean(row.metadata?.sourceUrl,1000)).filter(Boolean))]})]);
  for(const row of rows)await tx.query("insert into membership_geography_import_row(batch_id,row_number,row_data,errors) values($1,$2,$3,$4)",[batchId,row.rowNumber,JSON.stringify(Object.fromEntries(COLUMNS.map(key=>[key,row[key]])),),JSON.stringify(row.errors)]);
 });
 return {batchId,rowCount:rows.length,errorCount:errors,canApply:errors===0,rows:rows.map(row=>({rowNumber:row.rowNumber,code:row.unit_code,label:row.label,level:row.unit_level,parentCode:row.parent_code,errors:row.errors}))};
}
export async function applyMemberGeographyImport(identity,batchId,input={},requestId){
 authorized(identity);const reason=clean(input.reason,500);if(reason.length<8)throw fail(400,"Enter an audit reason of at least eight characters.","AUDIT_REASON_REQUIRED");
 return withTransaction(async tx=>{
  const batch=(await tx.query("select * from membership_geography_import_batch where id=$1 for update",[batchId])).rows[0];
  if(!batch)throw fail(404,"Geography import batch not found.","NOT_FOUND");
  if(batch.status==="applied")return {batchId,alreadyApplied:true,versionId:batch.geography_version_id};
  if(batch.status!=="validated"||batch.error_count!==0)throw fail(409,"Only a validated, error-free geography workbook can be applied.","IMPORT_NOT_VALIDATED");
  const rows=(await tx.query("select row_number,row_data,errors from membership_geography_import_row where batch_id=$1 order by row_number for update",[batchId])).rows;
  const versionLabel=clean(input.versionLabel||("geo-"+new Date().toISOString().slice(0,10)+"-"+batchId.slice(0,8)),100);
  const version=(await tx.query("insert into membership_geography_version(version_label,source_name,source_url,source_version,status,created_by,metadata) values($1,$2,$3,$4,'draft',$5,$6) returning id",
   [versionLabel,batch.source_name,(typeof batch.metadata==="string"?JSON.parse(batch.metadata):batch.metadata||{}).sourceUrl,batch.source_version,identity.sub,JSON.stringify({batchId,reason,sourceUrls:(typeof batch.metadata==="string"?JSON.parse(batch.metadata):batch.metadata||{}).sourceUrls||[]})])).rows[0];
  const inserted=new Map();let remaining=[...rows];
  while(remaining.length){
   const ready=remaining.filter(row=>!row.row_data.parent_code||inserted.has(String(row.row_data.parent_code).toUpperCase()));
   if(!ready.length)throw fail(409,"The workbook contains a circular or unresolved parent hierarchy.","GEOGRAPHY_PARENT_CYCLE");
   for(const row of ready){
    const data=row.row_data,parentId=data.parent_code?inserted.get(String(data.parent_code).toUpperCase()):null;
    const created=(await tx.query(`insert into membership_geography_unit(version_id,unit_code,label,unit_level,parent_id,country_iso3,country_m49,source_name,source_version,effective_from,effective_to,active,metadata,created_at)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,nullif($10,'')::date,nullif($11,'')::date,$12,$13::jsonb,now()) returning id`,
    [version.id,data.unit_code,data.label,data.unit_level,parentId,data.country_iso3||null,data.country_m49||null,data.source_name||batch.source_name,data.source_version||batch.source_version,data.effective_from||"",data.effective_to||"",data.active!==false,JSON.stringify(data.metadata||{})])).rows[0];
    inserted.set(String(data.unit_code).toUpperCase(),created.id);
   }
   const done=new Set(ready.map(row=>row.row_number));remaining=remaining.filter(row=>!done.has(row.row_number));
  }
  await tx.query("update membership_geography_import_batch set status='applied',geography_version_id=$1,applied_at=now() where id=$2",[version.id,batchId]);
  await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'member.geography_import_applied','membership_geography_version',$2,$3,'success',$4)",[identity.sub,version.id,requestId,JSON.stringify({batchId,versionLabel,rowCount:rows.length,reason})]);
  return {batchId,versionId:version.id,versionLabel,status:"draft",rowCount:rows.length,publishRequired:true};
 });
}
export async function publishMemberGeographyVersion(identity,versionId,input={},requestId){
 authorized(identity);const reason=clean(input.reason,500);if(reason.length<8)throw fail(400,"Enter a publication reason of at least eight characters.","AUDIT_REASON_REQUIRED");
 return withTransaction(async tx=>{
  const version=(await tx.query("select * from membership_geography_version where id=$1 for update",[versionId])).rows[0];
  if(!version)throw fail(404,"Geography version not found.","NOT_FOUND");
  if(version.status==="published")return {versionId,status:"published",alreadyPublished:true};
  if(version.status!=="draft")throw fail(409,"Only a draft geography version can be published.","INVALID_VERSION_STATE");
  if(!/^https:\/\//i.test(String(version.source_url||"")))throw fail(409,"A published geography version must retain an HTTPS primary source URL.","GEOGRAPHY_SOURCE_REQUIRED");
  const provenance=(await tx.query("select count(*)::int total,count(*) filter(where coalesce(source_name,'')='' or coalesce(source_version,'')='' or not (metadata ? 'sourceUrl') or lower(coalesce(metadata->>'sourceUrl','')) not like 'https://%')::int incomplete from membership_geography_unit where version_id=$1 and active=true",[versionId])).rows[0];
  if(provenance.incomplete>0)throw fail(409,"Every active geography row must retain source name, source version and an HTTPS row-level source URL.","GEOGRAPHY_ROW_PROVENANCE_REQUIRED");
  const counts=(await tx.query("select count(*)::int total,count(*) filter(where unit_level='country')::int countries,count(*) filter(where unit_level in ('region','federal_city'))::int ethiopia_level1 from membership_geography_unit where version_id=$1 and active=true",[versionId])).rows[0];
  if(!counts.countries||!counts.ethiopia_level1)throw fail(409,"A publishable geography version must include country references and Ethiopian regions/federal cities.","GEOGRAPHY_VERSION_INCOMPLETE");
  await tx.query("update membership_geography_version set status='retired' where status='published'");
  await tx.query("update membership_geography_version set status='published',published_by=$1,published_at=now() where id=$2",[identity.sub,versionId]);
  await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'member.geography_version_published','membership_geography_version',$2,$3,'success',$4)",[identity.sub,versionId,requestId,JSON.stringify({reason,counts})]);
  return {versionId,status:"published",counts};
 });
}

export async function getMemberGeographySummary(identity){
 const roles=identity?.roles||[],permissions=identity?.permissions||[];
 if(!roles.some(role=>["system_admin","admin","membership_reviewer","reviewer"].includes(role))&&!permissions.some(permission=>["members.view","members.manage","reports.view","members.geography.manage"].includes(permission)))throw fail(403,"Membership geography reporting permission is required.","FORBIDDEN");
 const db=getPool(),publishedVersion=(await db.query("select id,version_label,published_at from membership_geography_version where status='published' order by published_at desc limit 1")).rows[0]||null;
 if(!publishedVersion)return {publishedVersion:null,residenceTypes:[],countries:[],ethiopiaLevel1:[],ethiopiaLevel2:[],ethiopiaLevel3:[],residencesOutsidePublishedVersion:0,generatedAt:new Date().toISOString()};
 const versionId=publishedVersion.id;
 const [residenceTypes,countries,level1,level2,level3,stale]=await Promise.all([
  db.query("select residence_type,count(*)::int member_count from member_residence where geography_version_id=$1 group by residence_type order by residence_type",[versionId]),
  db.query("select c.country_iso3 country_code,c.country_m49 m49_code,c.label country_name,count(*)::int member_count from member_residence r join membership_geography_unit c on c.id=r.country_unit_id and c.version_id=r.geography_version_id where r.geography_version_id=$1 group by c.country_iso3,c.country_m49,c.label order by member_count desc,c.label",[versionId]),
  db.query("select u.unit_level,u.unit_code,u.label,count(*)::int member_count from member_residence r join membership_geography_unit u on u.id=r.admin_level_1_id and u.version_id=r.geography_version_id where r.geography_version_id=$1 group by u.unit_level,u.unit_code,u.label order by member_count desc,u.label",[versionId]),
  db.query("select u.unit_level,u.unit_code,u.label,p.label parent_label,count(*)::int member_count from member_residence r join membership_geography_unit u on u.id=r.admin_level_2_id and u.version_id=r.geography_version_id left join membership_geography_unit p on p.id=u.parent_id and p.version_id=u.version_id where r.geography_version_id=$1 group by u.unit_level,u.unit_code,u.label,p.label order by member_count desc,u.label",[versionId]),
  db.query("select u.unit_level,u.unit_code,u.label,p.label parent_label,count(*)::int member_count from member_residence r join membership_geography_unit u on u.id=r.admin_level_3_id and u.version_id=r.geography_version_id left join membership_geography_unit p on p.id=u.parent_id and p.version_id=u.version_id where r.geography_version_id=$1 group by u.unit_level,u.unit_code,u.label,p.label order by member_count desc,u.label",[versionId]),
  db.query("select count(*)::int count from member_residence where geography_version_id is distinct from $1",[versionId])
 ]);
 return {publishedVersion,residenceTypes:residenceTypes.rows,countries:countries.rows,ethiopiaLevel1:level1.rows,ethiopiaLevel2:level2.rows,ethiopiaLevel3:level3.rows,residencesOutsidePublishedVersion:Number(stale.rows[0]?.count||0),generatedAt:new Date().toISOString()};
}
