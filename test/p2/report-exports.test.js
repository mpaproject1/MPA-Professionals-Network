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

test("report catalogue respects role scope and hides restricted personal/financial reports",async()=>{
 const reports=await listReportCatalogue(admin);
 assert.ok(reports.some(r=>r.id==="member-directory"));
 assert.ok(reports.some(r=>r.id==="payment-reconciliation"));
 assert.ok(reports.some(r=>r.id==="audit-activity"));
 const support=await listReportCatalogue({sub:"support",roles:["supporting_staff"],permissions:[]});
 assert.ok(support.some(r=>r.id==="service-demand"));
 assert.equal(support.some(r=>r.id==="member-directory"),false);
 assert.equal(support.some(r=>r.id==="payment-reconciliation"),false);
});
test("the full catalogue contains all 23 required reports and preserves role boundaries",async()=>{
 const reports=await listReportCatalogue(admin),ids=new Set(reports.map(report=>report.id));
 assert.equal(reports.length,23,"all 23 report definitions must remain available to an administrator");
 for(const id of ["membership-status","membership-applications","member-directory","payment-reconciliation","approved-payments","failed-reversed-payments","membership-collections","outstanding-membership-payments","finance-summary","job-seeker-demand","service-demand","job-application-funnel","service-listings","service-request-outcomes","mentorship-offers-requests-matches","mentorship-lifecycle","job-seeker-sharing-activity","professional-verification","organization-verification","support-demand-response","reference-import-quality","platform-usage","audit-activity"])assert.ok(ids.has(id),`missing agreed report: ${id}`);
 const support=await listReportCatalogue({sub:"support",roles:["supporting_staff"],permissions:[]});
 assert.ok(support.some(report=>report.id==="support-demand-response"));
 assert.ok(support.some(report=>report.id==="job-seeker-demand"),"Support Desk may access only suppressed job-seeker demand aggregates");
 assert.ok(support.some(report=>report.id==="reference-import-quality"));
 assert.equal(support.some(report=>report.id==="member-directory"),false);
 assert.equal(support.some(report=>report.id==="payment-reconciliation"),false);
 assert.equal((await listReportCatalogue({sub:null,roles:["recruiter"],permissions:[]})).some(report=>report.id==="job-application-funnel"),false,"a platform recruiter role without an active organization or job-team assignment is not sufficient");
});
test("finance reports are available to finance officers but not membership reviewers",async()=>{
 const identity=await createReportAdmin();
 const finance={...identity,roles:["finance_officer"],permissions:[]};
 const financeReports=await listReportCatalogue(finance);
 for(const id of ["payment-reconciliation","approved-payments","failed-reversed-payments","membership-collections","outstanding-membership-payments","finance-summary"])assert.ok(financeReports.some(report=>report.id===id),"finance officer must see "+id);
 assert.equal(financeReports.some(report=>report.id==="member-directory"),false,"finance role must not receive member contact directory access");
 const reviewer={...identity,roles:["membership_reviewer"],permissions:["reports.view"]};
 const reviewerReports=await listReportCatalogue(reviewer);
 assert.equal(reviewerReports.some(report=>report.category==="Finance"),false,"membership reviewer must not discover restricted finance reports");
 for(const id of ["approved-payments","failed-reversed-payments","membership-collections","outstanding-membership-payments","finance-summary"]){
  const result=await runReport(finance,id,{from:"2026-01-01",to:"2026-12-31"},"finance-report-auth-"+id);
  assert.equal(result.report.id,id);
  assert.ok(Array.isArray(result.rows));
  for(const row of result.rows)assert.equal(Object.keys(row).some(key=>/email|phone|applicant|user id/i.test(key)),false,"finance aggregate/detail reports must not expose applicant contact identity");
 }
 await assert.rejects(()=>runReport(reviewer,"finance-summary",{},"finance-report-denied"),error=>error.statusCode===403);
});
test("every report query and every supported grouping executes with shared date, status and search filters",async()=>{
 const groupings={
  "service-listings":["default","category","status","moderation"],
  "service-request-outcomes":["default","status","category","month"],
  "mentorship-lifecycle":["default","status","month"],
  "job-seeker-sharing-activity":["default","organization","status","month"],
  "job-seeker-demand":["default","role","skill","location","workMode","availability","experience"]
 };
 const reports=await listReportCatalogue(admin),identity=await createReportAdmin();
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

test("finance reports reconcile verified, failed, refunded and outstanding amounts by currency",async t=>{
 if(!process.env.DATABASE_URL){t.skip("requires the disposable PostgreSQL database configured by PR Quality");return;}
 const db=getPool(),suffix=randomUUID(),digits=suffix.replace(/[^0-9]/g,"").slice(0,8).padEnd(8,"7");
 const created=await register({email:"finance-fixture-"+suffix+"@example.test",password:"FinanceFixtureP1Password!2026",firstName:"Finance",lastName:"Fixture",phone:"07"+digits},"finance-report-fixture-"+suffix);
 const userId=created.user.id,product=(await db.query("select id from membership_product where product_code='BASIC'")).rows[0];
 assert.ok(product,"BASIC membership product must exist in migrated test database");
 const applicationIds=[],paymentIds=[],reversalIds=[];
 async function application(ref,status,amount,currency){
  const row=(await db.query("insert into membership_application(user_id,application_type,membership_product_id,status,approved_at,fee_snapshot) values($1,'new',$2,$3,now(),$4::jsonb) returning id",[userId,product.id,status,JSON.stringify({amount,currency})])).rows[0];
  applicationIds.push(row.id);
  return row.id;
 }
 async function payment(appId,status,amount,currency,reference){
  const row=(await db.query("insert into payment_transaction(provider,idempotency_key,purpose,amount,currency,status,request_payload,channel,source,submitted_by,verified_by,verified_at,completed_at,purpose_reference) values('finance-report-fixture',$1,'membership',$2,$3,$4,$5::jsonb,'manual','manual_entry',$6,$6,now(),now(),$7) returning id",[suffix+"-"+reference,amount,currency,status,JSON.stringify({reference}),userId,reference])).rows[0];
  paymentIds.push(row.id);
  await db.query("insert into membership_application_payment(application_id,payment_transaction_id) values($1,$2)",[appId,row.id]);
  return row.id;
 }
 const etbApproved=await application("ETB-APPROVED","approved",1000,"ETB");
 const etbFailed=await application("ETB-FAILED","payment_pending",200,"ETB");
 const etbRefunded=await application("ETB-REFUNDED","payment_pending",300,"ETB");
 const usdApproved=await application("USD-APPROVED","approved",50,"USD");
 const etbOutstanding=await application("ETB-OUTSTANDING","approved",1200,"ETB");
 try{
  const approvedEtbPayment=await payment(etbApproved,"succeeded",1000,"ETB","approved-etb");
  await db.query("insert into payment_reconciliation(payment_transaction_id,reconciliation_status,reconciled_by,reconciled_at,note) values($1,'matched',$2,now(),'Finance report fixture')",[approvedEtbPayment,userId]);
  await payment(etbFailed,"failed",200,"ETB","failed-etb");
  const refundedPayment=await payment(etbRefunded,"refunded",300,"ETB","refunded-etb");
  const reversal=(await db.query("insert into membership_payment_reversal(payment_transaction_id,application_id,reversal_type,reason,reversed_by) values($1,$2,'refund','Finance report test refund',$3) returning id",[refundedPayment,etbRefunded,userId])).rows[0];
  reversalIds.push(reversal.id);
  await payment(usdApproved,"succeeded",50,"USD","approved-usd");
  const finance={sub:userId,roles:["finance_officer"],permissions:[]};
  const from=new Date().toISOString().slice(0,10),to=from;
  const filters={from,to};
  const approved=await runReport(finance,"approved-payments",filters,randomUUID());
  assert.equal(approved.rows.length,2);
  assert.deepEqual(new Set(approved.rows.map(row=>row.Currency)),new Set(["ETB","USD"]));
  const exceptions=await runReport(finance,"failed-reversed-payments",filters,randomUUID());
  assert.equal(exceptions.rows.length,2);
  assert.ok(exceptions.rows.some(row=>row.Outcome==="Failed payment"));
  assert.ok(exceptions.rows.some(row=>row.Outcome==="Refunded"&&row["Reversal type"]==="refund"));
  const collections=await runReport(finance,"membership-collections",filters,randomUUID());
  const etbCollections=collections.rows.find(row=>row.Currency==="ETB");
  assert.equal(Number(etbCollections["Gross verified"]),1300);
  assert.equal(Number(etbCollections["Refunds and reversals"]),300);
  assert.equal(Number(etbCollections["Net collected"]),1000);
  const outstanding=await runReport(finance,"outstanding-membership-payments",filters,randomUUID());
  assert.equal(outstanding.rows.length,3,"failed and refunded applications remain outstanding until a new successful payment");
  assert.ok(outstanding.rows.some(row=>row["Application reference"]==="ETB-OUTSTANDING"));
  const summary=await runReport(finance,"finance-summary",filters,randomUUID());
  const etb=summary.rows.find(row=>row.Currency==="ETB"),usd=summary.rows.find(row=>row.Currency==="USD");
  assert.equal(Number(etb["Gross verified"]),1300);
  assert.equal(Number(etb["Refunds/reversals"]),300);
  assert.equal(Number(etb["Net collected"]),1000);
  assert.equal(Number(etb["Failed amount"]),200);
  assert.equal(Number(etb["Matched amount"]),1000);
  assert.equal(Number(etb["Unreconciled amount"]),0);
  assert.equal(Number(etb["Outstanding amount"]),1700);
  assert.equal(Number(etb["Approved payments"]),1);
  assert.equal(Number(etb["Failed payments"]),1);
  assert.equal(Number(etb["Refunded/reversed payments"]),1);
  assert.equal(Number(usd["Net collected"]),50);
  assert.equal(Number(usd["Unreconciled amount"]),50);
  assert.equal(Number(usd["Outstanding amount"]),0);
 }finally{
  if(paymentIds.length)await db.query("delete from payment_reconciliation where payment_transaction_id=any($1::uuid[])",[paymentIds]);
  if(reversalIds.length)await db.query("delete from membership_payment_reversal where id=any($1::uuid[])",[reversalIds]);
  if(applicationIds.length)await db.query("delete from membership_application_payment where application_id=any($1::uuid[])",[applicationIds]);
  if(paymentIds.length)await db.query("delete from payment_transaction where id=any($1::uuid[])",[paymentIds]);
  if(applicationIds.length)await db.query("delete from membership_application where id=any($1::uuid[])",[applicationIds]);
 }
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

test("every report produces empty-state PDF and XLSX files with defined headings",async()=>{
 const reports=await listReportCatalogue(admin);assert.equal(reports.length,23);
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
  const output=execFileSync("python3",["-c",script,dir],{encoding:"utf8"});assert.match(output,/"xlsxRows"\s*:\s*2/);assert.match(output,/"emptyState": "verified"/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test("approved-member CSV template includes required columns and no password field",()=>{
 const csv=memberImportTemplate(admin),header=csv.split("\r\n")[0].split(",");
 for(const key of ["email","full_name","membership_number","product_code","status","start_date","end_date","approved_membership","approval_reference"])assert.ok(header.includes(key));
 assert.equal(header.some(key=>/password/i.test(key)),false);
 assert.equal(csv.split("\r\n").filter(Boolean).length,1,"template must not include a placeholder member row");
});

