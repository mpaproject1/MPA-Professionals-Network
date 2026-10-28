import assert from "node:assert/strict";
import { execFileSync,spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync,rmSync,writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inflateRawSync } from "node:zlib";
import { memberImportTemplate } from "../../src/membership/admin-bulk.js";
import { register } from "../../src/membership/service.js";
import { closePool, getPool } from "../../src/platform/db.js";
import { listReportCatalogue, makePdf, makeXlsx, runReport } from "../../src/platform/reports.js";

const admin={sub:"admin",roles:["system_admin"],permissions:[]};
const readersAvailable=spawnSync("python3",["-c","import openpyxl,pypdf"],{encoding:"utf8"}).status===0;
async function createReportAdmin(){
 const suffix=randomUUID(),digits=suffix.replace(/[^0-9]/g,"").slice(0,8).padEnd(8,"7");
 const created=await register({email:`report-admin-${suffix}@example.test`,password:"ReportAdminP1Password!2026",firstName:"Report",lastName:"Test",phone:`07${digits}`},"report-export-test-admin");
 const db=getPool(),role=(await db.query("select id from app_role where role_code='system_admin'")).rows[0];
 assert.ok(role,"system_admin role must exist in the migrated test database");
 await db.query("insert into app_user_role(user_id,role_id) values($1,$2) on conflict do nothing",[created.user.id,role.id]);
 return {sub:created.user.id,roles:["system_admin"],permissions:[]};
}

test("report catalogue respects role scope and hides restricted personal/financial reports",()=>{
 const reports=listReportCatalogue(admin);
 assert.ok(reports.some(r=>r.id==="member-directory"));
 assert.ok(reports.some(r=>r.id==="payment-reconciliation"));
 assert.ok(reports.some(r=>r.id==="audit-activity"));
 const support=listReportCatalogue({sub:"support",roles:["supporting_staff"],permissions:[]});
 assert.ok(support.some(r=>r.id==="service-demand"));
 assert.equal(support.some(r=>r.id==="member-directory"),false);
 assert.equal(support.some(r=>r.id==="payment-reconciliation"),false);
});
test("the full catalogue contains all 18 required reports and preserves role boundaries",()=>{
 const reports=listReportCatalogue(admin),ids=new Set(reports.map(report=>report.id));
 assert.equal(reports.length,18,"all 18 report definitions must remain available to an administrator");
 for(const id of ["membership-status","membership-applications","member-directory","payment-reconciliation","job-seeker-demand","service-demand","job-application-funnel","service-listings","service-request-outcomes","mentorship-offers-requests-matches","mentorship-lifecycle","job-seeker-sharing-activity","professional-verification","organization-verification","support-demand-response","reference-import-quality","platform-usage","audit-activity"])assert.ok(ids.has(id),`missing agreed report: ${id}`);
 const support=listReportCatalogue({sub:"support",roles:["supporting_staff"],permissions:[]});
 assert.ok(support.some(report=>report.id==="support-demand-response"));
 assert.ok(support.some(report=>report.id==="job-seeker-demand"),"Support Desk may access only suppressed job-seeker demand aggregates");
 assert.ok(support.some(report=>report.id==="reference-import-quality"));
 assert.equal(support.some(report=>report.id==="member-directory"),false);
 assert.equal(support.some(report=>report.id==="payment-reconciliation"),false);
 assert.ok(listReportCatalogue({sub:"recruiter",roles:["recruiter"],permissions:[]}).some(report=>report.id==="job-application-funnel"));
});
test("every report query and every supported grouping executes with shared date, status and search filters",async()=>{
 const groupings={
  "service-listings":["default","category","status","moderation"],
  "service-request-outcomes":["default","status","category","month"],
  "mentorship-lifecycle":["default","status","month"],
  "job-seeker-sharing-activity":["default","organization","status","month"],
  "job-seeker-demand":["default","role","skill","location","workMode","availability","experience"]
 };
 const reports=listReportCatalogue(admin),identity=await createReportAdmin();
 for(const report of reports){
  for(const groupBy of groupings[report.id]||["default"]){
   const result=await runReport(identity,report.id,{from:"2026-01-01",to:"2026-12-31",status:"closed",q:"test",groupBy},"report-export-matrix-"+report.id+"-"+groupBy);
   assert.equal(result.report.id,report.id);
   assert.equal(result.filters.from,"2026-01-01");
   assert.equal(result.filters.to,"2026-12-31");
   assert.equal(result.filters.status,"closed");
   assert.equal(result.filters.q,"test");
   assert.equal(result.filters.groupBy,groupBy);
   assert.ok(Array.isArray(result.rows));
   assert.equal(result.totals.rows,result.rows.length);
  }
 }
});
test("direct report execution denies roles excluded from restricted reports",async()=>{
 const support={sub:"support",roles:["supporting_staff"],permissions:[]};
 await assert.rejects(()=>runReport(support,"member-directory",{},"report-auth-member"),error=>error.statusCode===403);
 await assert.rejects(()=>runReport(support,"payment-reconciliation",{},"report-auth-payment"),error=>error.statusCode===403);
 await assert.rejects(()=>runReport(support,"audit-activity",{},"report-auth-audit"),error=>error.statusCode===403);
});
function unzipEntries(buffer){
 const entries=new Map();let offset=0;
 while(offset+4<=buffer.length&&buffer.readUInt32LE(offset)===0x04034b50){
  const method=buffer.readUInt16LE(offset+8),compressedSize=buffer.readUInt32LE(offset+18),nameLength=buffer.readUInt16LE(offset+26),extraLength=buffer.readUInt16LE(offset+28);
  const nameStart=offset+30,name=buffer.subarray(nameStart,nameStart+nameLength).toString("utf8"),dataStart=nameStart+nameLength+extraLength,data=buffer.subarray(dataStart,dataStart+compressedSize);
  if(method!==8)throw new Error("Unexpected XLSX ZIP compression method "+method);
  entries.set(name,inflateRawSync(data).toString("utf8"));offset=dataStart+compressedSize;
 }
 return entries;
}
function resultFor(report,rows=[]){return {report:{...report,scope:report.scope||"Test scope",definition:report.definition||"Test report definition.",columns:report.columns||["Status","Count"]},filters:{from:"2026-01-01",to:"2026-01-31",status:"",q:"",groupBy:"default"},generatedAt:"2026-10-28T12:00:00.000Z",rows,totals:{rows:rows.length,Count:rows.length}};}

test("every report produces empty-state PDF and XLSX files with defined headings",()=>{
 const reports=listReportCatalogue(admin);assert.equal(reports.length,18);
 for(const report of reports){
  const result=resultFor(report),pdf=makePdf(result),xlsx=makeXlsx(result),entries=unzipEntries(xlsx),sheet=entries.get("xl/worksheets/sheet1.xml");
  assert.ok(pdf.toString("ascii").startsWith("%PDF-1.4"),report.id+" PDF signature");
  assert.ok(pdf.toString("ascii").includes("No records matched these filters."),report.id+" PDF empty-state message");
  assert.ok(pdf.toString("ascii").includes(report.columns[0]),report.id+" PDF first column heading");
  assert.ok(sheet,report.id+" worksheet can be decompressed");
  assert.ok(sheet.includes("No records matched these filters."),report.id+" XLSX empty-state message");
  assert.ok(sheet.includes(report.columns[0]),report.id+" XLSX first column heading");
  assert.ok(entries.get("xl/workbook.xml")?.includes("MPA Report"),report.id+" workbook metadata");
 }
});
test("PDF wraps long values, retains complete content and creates page breaks",()=>{
 const longValue="Long-value-"+("professional-detail-".repeat(18));
 const result=resultFor({id:"test",title:"Long report",scope:"Aggregate",definition:"Long-value report",columns:["Record","Details"]},Array.from({length:60},(_,i)=>({Record:"R-"+i,Details:longValue+"-"+i})));
 const pdf=makePdf(result),text=pdf.toString("ascii");
 assert.ok(text.includes("Page 2 of"),"large reports paginate");
 assert.ok(text.includes("professional-detail"),"long values are included rather than silently truncated");
 assert.ok(text.includes("R-59"),"later rows are not lost");
});
test("independent spreadsheet and PDF readers open generated files and read expected rows", {skip:!readersAvailable?"Python openpyxl and pypdf are installed in CI for independent file-open verification":false},()=>{
 const dir=mkdtempSync(join(tmpdir(),"mpa-report-reader-"));
 try{
  const report={id:"membership-status",title:"Membership status",scope:"Platform aggregate",definition:"Counts by membership status.",columns:["Status","Members"]};
  const populated=resultFor(report,[{"Status":"active","Members":3},{"Status":"expired","Members":2}]);
  const empty=resultFor(report,[]);
  writeFileSync(join(dir,"populated.xlsx"),makeXlsx(populated));writeFileSync(join(dir,"populated.pdf"),makePdf(populated));
  writeFileSync(join(dir,"empty.xlsx"),makeXlsx(empty));writeFileSync(join(dir,"empty.pdf"),makePdf(empty));
  const script=`import json,sys
from openpyxl import load_workbook
from pypdf import PdfReader
root=sys.argv[1]
book=load_workbook(root+"/populated.xlsx",read_only=True,data_only=True)
sheet=book["MPA Report"]
values=list(sheet.iter_rows(values_only=True))
assert values[8][0:2]==("Status","Members"),values[8]
assert values[9][0:2]==("active",3),values[9]
assert values[10][0:2]==("expired",2),values[10]
empty=load_workbook(root+"/empty.xlsx",read_only=True,data_only=True)["MPA Report"]
empty_values=list(empty.iter_rows(values_only=True))
assert empty_values[8][0:2]==("Status","Members"),empty_values[8]
assert "No records matched these filters." in str(empty_values[9]),empty_values[9]
pdf=PdfReader(root+"/populated.pdf")
assert len(pdf.pages)>=1
pdf_text="\\n".join(page.extract_text() or "" for page in pdf.pages)
assert "Membership status" in pdf_text and "active" in pdf_text and "expired" in pdf_text,pdf_text
empty_pdf=PdfReader(root+"/empty.pdf")
empty_text="\\n".join(page.extract_text() or "" for page in empty_pdf.pages)
assert "Status | Members" in empty_text and "No records matched these filters." in empty_text,empty_text
print(json.dumps({"xlsxRows":len(values)-9,"pdfPages":len(pdf.pages),"emptyState":"verified"}))
`;
  const output=execFileSync("python3",["-c",script,dir],{encoding:"utf8"});assert.match(output,/"xlsxRows":2/);assert.match(output,/"emptyState": "verified"/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test("approved-member CSV template includes required columns and no password field",()=>{
 const csv=memberImportTemplate(admin),header=csv.split("\r\n")[0].split(",");
 for(const key of ["email","full_name","membership_number","product_code","status","start_date","end_date","approved_membership","approval_reference"])assert.ok(header.includes(key));
 assert.equal(header.some(key=>/password/i.test(key)),false);
 assert.equal(csv.split("\r\n").filter(Boolean).length,1,"template must not include a placeholder member row");
});

