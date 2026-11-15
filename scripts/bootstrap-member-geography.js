import {execFileSync} from "node:child_process";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {getPool,closePool} from "../src/platform/db.js";
import {previewMemberGeographyImport,applyMemberGeographyImport,publishMemberGeographyVersion} from "../src/membership/geography.js";

const SOURCE_NAME="UNSD M49 + Open Admin Data Ethiopia (CC BY 4.0)";
const SOURCE_URL="https://unstats.un.org/unsd/methodology/m49/overview/";
const SOURCE_COMMIT="418739e33760bf79661f3914e2d8c9cf33248437";
const VERSION_LABEL="bootstrap-ethiopia-"+SOURCE_COMMIT.slice(0,12);

async function main(){
 const db=getPool();
 const published=(await db.query("select v.id,v.version_label,count(u.id)::int row_count,count(*) filter(where u.unit_level='country')::int country_count,count(*) filter(where u.unit_level='region')::int region_count,count(*) filter(where u.unit_level='federal_city')::int federal_city_count,count(*) filter(where u.unit_level='zone')::int zone_count,count(*) filter(where u.unit_level='sub_city')::int sub_city_count,count(*) filter(where u.unit_level='woreda')::int woreda_count from membership_geography_version v left join membership_geography_unit u on u.version_id=v.id where v.status='published' group by v.id order by v.published_at desc limit 1")).rows[0];
 const baselineComplete=published&&published.country_count>=200&&published.region_count===12&&published.federal_city_count===2&&published.zone_count===101&&published.sub_city_count===13&&published.woreda_count===1119;
 if(baselineComplete){process.stdout.write("Member geography baseline already published: "+published.version_label+" ("+published.row_count+" rows).\\n");return;}
 const admin=(await db.query("select u.id from app_user u join app_user_role ur on ur.user_id=u.id join app_role r on r.id=ur.role_id where r.role_code='system_admin' and u.status='active' order by u.created_at limit 1")).rows[0];
 if(!admin){process.stdout.write("Member geography bootstrap deferred: create the initial active system administrator, then run npm run migrate again.\n");return;}
 const identity={sub:admin.id,roles:["system_admin"],permissions:["members.geography.manage"]};
 const existingDraft=(await db.query("select id from membership_geography_version where version_label=$1 and status='draft'",[VERSION_LABEL])).rows[0];
 let versionId=existingDraft?.id;
 if(!versionId){
  const directory=await mkdtemp(join(tmpdir(),"mpa-geography-bootstrap-"));
  try{
   const workbookPath=join(directory,"member-geography-reference.xlsx");
   execFileSync(process.execPath,["scripts/generate-member-geography-reference.js",workbookPath],{stdio:"inherit",timeout:180000});
   const manifest=JSON.parse(await readFile(workbookPath.replace(/\.xlsx$/i,".manifest.json"),"utf8"));
   const workbook=await readFile(workbookPath);
   const sourceVersion=String(manifest.ethiopiaSource?.version||"pinned-ethiopia-"+SOURCE_COMMIT);
   const preview=await previewMemberGeographyImport(identity,{xlsxBase64:workbook.toString("base64"),filename:"member-geography-reference.xlsx",sourceName:SOURCE_NAME,sourceVersion,sourceUrl:SOURCE_URL},randomUUID());
   if(!preview.canApply||preview.errorCount!==0)throw new Error("Generated geography baseline did not pass validation ("+preview.errorCount+" errors).");
   const applied=await applyMemberGeographyImport(identity,preview.batchId,{reason:"Install reviewed initial geography baseline",versionLabel:VERSION_LABEL},randomUUID());
   versionId=applied.versionId;
  }finally{await rm(directory,{recursive:true,force:true});}
 }
 if(!versionId)throw new Error("Geography bootstrap did not produce a draft version.");
 const result=await publishMemberGeographyVersion(identity,versionId,{reason:"Publish reviewed initial geography baseline"},randomUUID());
 process.stdout.write("Published member geography "+VERSION_LABEL+" with "+JSON.stringify(result.counts||{})+".\n");
}
main().catch(error=>{process.stderr.write((error.stack||error.message)+"\n");process.exitCode=1;}).finally(()=>closePool().catch(()=>{}));
