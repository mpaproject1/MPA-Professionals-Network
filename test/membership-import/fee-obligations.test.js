import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  applyMembershipPaymentImport,
  decideBalanceDisposition,
  listFeeObligations,
  listSponsoringOrganizations,
  membershipPaymentImportTemplate,
  membershipPaymentImportCsvTemplate,
  previewMembershipPaymentImport,
  recordBalanceDisposition,
  recordMembershipReceipt,
  scheduleMembershipFeeReminders,
  reverseMembershipRecordReceipt,
  verifyMembershipReceipt,
} from "../../src/membership/fee-obligations.js";
import * as membership from "../../src/membership/service.js";
import * as organizationJobs from "../../src/organization-jobs/service.js";
import { getPool } from "../../src/platform/db.js";
import { authorizePrivateUpload, receivePrivateUpload, confirmPrivateUpload, readAuthorizedPrivateFile } from "../../src/platform/private-file-storage.js";
import { runReport } from "../../src/platform/reports.js";
import { createXlsx, parseXlsxRows } from "../../src/platform/xlsx.js";

const admin={sub:"system-admin",roles:["system_admin"],permissions:[]};
const member={sub:"member-user",roles:["member"],permissions:[]};
const finance={sub:"finance-officer",roles:["finance_officer"],permissions:[]};
const requestId="00000000-0000-4000-8000-000000000001";
const paymentId="00000000-0000-4000-8000-000000000002";

test("system administrator role alone cannot create a Finance membership receipt",async()=>{
 await assert.rejects(recordMembershipReceipt(admin,{amount:500,currency:"ETB",paymentMethodCode:"cash",reference:"cash-1234",receivedDate:"2026-11-02",idempotencyKey:"finance-receipt-key-0001"},requestId),error=>error.statusCode===403&&error.code==="FORBIDDEN");
});

test("Finance cannot record a zero or negative receipt",async()=>{
 await assert.rejects(recordMembershipReceipt(finance,{amount:0,currency:"ETB",paymentMethodCode:"cash",reference:"cash-1234",receivedDate:"2026-11-02",idempotencyKey:"finance-receipt-key-0001"},requestId),error=>error.statusCode===400&&error.code==="INVALID_AMOUNT");
});

test("system administrator role alone cannot verify a Finance receipt",async()=>{
 await assert.rejects(verifyMembershipReceipt(admin,paymentId,{decision:"approved"},requestId),error=>error.statusCode===403&&error.code==="FORBIDDEN");
});

test("receipt verification rejects unknown decisions before database access",async()=>{
 await assert.rejects(verifyMembershipReceipt(finance,paymentId,{decision:"auto_approve"},requestId),error=>error.statusCode===400&&error.code==="INVALID_DECISION");
});

test("system administrator role alone cannot reverse a Finance receipt",async()=>{
 await assert.rejects(reverseMembershipRecordReceipt(admin,paymentId,{reason:"documented reversal"},requestId),error=>error.statusCode===403&&error.code==="FORBIDDEN");
});

test("Finance reversal requires a meaningful reason before database access",async()=>{
 await assert.rejects(reverseMembershipRecordReceipt(finance,paymentId,{reason:"short"},requestId),error=>error.statusCode===400&&error.code==="REVERSAL_REASON_REQUIRED");
});

test("system administrator role alone cannot approve a non-cash fee disposition",async()=>{
 await assert.rejects(decideBalanceDisposition(admin,paymentId,{decision:"approved"},requestId),error=>error.statusCode===403&&error.code==="FORBIDDEN");
});

test("non-cash dispositions require a supported reason and idempotency key",async()=>{
 await assert.rejects(recordBalanceDisposition(finance,{dispositionType:"unknown",amount:500,currency:"ETB",remark:"A sufficiently detailed note",idempotencyKey:"disposition-key-0001",applicationId:paymentId},requestId),error=>error.statusCode===400&&error.code==="INVALID_DISPOSITION");
});

test("non-cash settlements require confirmed private supporting evidence",async()=>{
 await assert.rejects(recordBalanceDisposition(finance,{dispositionType:"sponsored",amount:500,currency:"ETB",remark:"A documented sponsor contribution",details:{sponsorName:"Test sponsor"},idempotencyKey:"disposition-evidence-0001",applicationId:paymentId},requestId),error=>error.statusCode===400&&error.code==="EVIDENCE_REQUIRED");
});

test("bulk payment import cannot be applied by a system administrator without Finance import authority",async()=>{
 await assert.rejects(applyMembershipPaymentImport(admin,paymentId,{reason:"test import apply"},requestId),error=>error.statusCode===403&&error.code==="FORBIDDEN");
});

test("bulk payment preview requires an XLSX workbook",async()=>{
 await assert.rejects(previewMembershipPaymentImport(finance,{xlsxBase64:""},requestId),error=>error.statusCode===400&&error.code==="XLSX_REQUIRED");
});

test("Finance CSV template matches the XLSX intake contract",()=>{
 const csv=membershipPaymentImportCsvTemplate(finance);
 const xlsx=parseXlsxRows(membershipPaymentImportTemplate(finance));
 assert.ok(csv.endsWith("\r\n"));
 assert.deepEqual(csv.trim().split(","),xlsx.headers);
});

test("Finance payment template contains only pending-intake fields and requires member, amount, currency, date, method and reference",()=>{
 const workbook=membershipPaymentImportTemplate(finance);
 const {headers,rows}=parseXlsxRows(workbook);
 assert.deepEqual(headers,["application_id","membership_number","amount","currency","received_date","payment_method_code","payment_reference","evidence_reference","evidence_file_id","payer_note"]);
 assert.equal(rows.length,0);
});

test("PostgreSQL Finance XLSX intake applies valid rows independently and preserves row failures",async t=>{
 if(!process.env.DATABASE_URL){t.skip("requires the disposable PostgreSQL database configured by PR Quality");return;}
 const db=getPool(),suffix=randomUUID(),digits=suffix.replace(/\D/g,"").slice(0,8).padEnd(8,"7");
 const applicant=await membership.register({email:"fee-bulk-app-"+suffix+"@example.test",password:"BulkApplicantSecurePassword!2026",firstName:"Bulk",lastName:"Applicant",phone:"09"+digits},"fee-bulk-app-"+suffix);
 const financeUser=await membership.register({email:"fee-bulk-finance-"+suffix+"@example.test",password:"BulkFinanceSecurePassword!2026",firstName:"Bulk",lastName:"Finance",phone:"07"+digits},"fee-bulk-finance-"+suffix);
 const app=await membership.createApplication(applicant.user.id,{productCode:"BASIC",termsAcknowledged:true,idempotencyKey:"fee_bulk_app_"+suffix.slice(0,32)},"fee-bulk-create-app-"+suffix);
 const identity={sub:financeUser.user.id,roles:["finance_officer"],permissions:[]},methodCode="bulk_"+suffix.slice(0,8);
 await db.query("insert into membership_payment_method(method_code,method_type,display_name,enabled,currency,instructions,requires_evidence) values($1,'cash','Bulk XLSX test',true,'ETB','Disposable Finance intake method',false) on conflict(method_code) do update set enabled=true,currency='ETB',requires_evidence=false",[methodCode]);
 const evidenceMethodCode="ev_"+suffix.slice(0,8);
 const staleMethodCode="st_"+suffix.slice(0,8);
 await db.query("insert into membership_payment_method(method_code,method_type,display_name,enabled,currency,instructions,requires_evidence) values($1,'cash','Stale method bulk test',true,'ETB','Will be disabled after preview',false) on conflict(method_code) do update set enabled=true,currency='ETB',requires_evidence=false",[staleMethodCode]);
 await db.query("insert into membership_payment_method(method_code,method_type,display_name,enabled,currency,instructions,requires_evidence) values($1,'bank_transfer','Evidence-required bulk test',true,'ETB','Evidence required',true) on conflict(method_code) do update set enabled=true,currency='ETB',requires_evidence=true",[evidenceMethodCode]);
 const headers=parseXlsxRows(membershipPaymentImportTemplate(identity)).headers;
 const reference="bulk-reference-"+suffix;
 const rows=[
  {application_id:app.id,membership_number:"",amount:"300",currency:"ETB",received_date:new Date().toISOString().slice(0,10),payment_method_code:methodCode,payment_reference:reference,evidence_reference:"",evidence_file_id:"",payer_note:"Valid, row"},
  {application_id:app.id,membership_number:"",amount:"200",currency:"ETB",received_date:new Date().toISOString().slice(0,10),payment_method_code:methodCode,payment_reference:reference,evidence_reference:"",evidence_file_id:"",payer_note:"Duplicate reference row"},
  {application_id:"",membership_number:"MISSING-"+suffix,amount:"100",currency:"ETB",received_date:new Date().toISOString().slice(0,10),payment_method_code:methodCode,payment_reference:"unmatched-"+suffix,evidence_reference:"",evidence_file_id:"",payer_note:"Unmatched member"},
  {application_id:app.id,membership_number:"",amount:"100",currency:"ETB",received_date:new Date().toISOString().slice(0,10),payment_method_code:evidenceMethodCode,payment_reference:"evidence-required-"+suffix,evidence_reference:"",evidence_file_id:"",payer_note:"Evidence missing"},
  {application_id:app.id,membership_number:"",amount:"100",currency:"ETB",received_date:new Date().toISOString().slice(0,10),payment_method_code:staleMethodCode,payment_reference:"stale-method-"+suffix,evidence_reference:"",evidence_file_id:"",payer_note:"Method disabled after preview"},
 ];
  const csvRows=[headers,...rows].map(record=>record.map(value=>{const text=String(value??"");return /[",\r\n]/.test(text)?'"'+text.replace(/"/g,'""')+'"':text;}).join(",")).join("\r\n")+"\r\n";
 const csvPreview=await previewMembershipPaymentImport(identity,{filename:"bulk-fee-test.csv",csv:csvRows},"fee-bulk-csv-preview-"+suffix);
 assert.equal(csvPreview.rowCount,5);
 assert.equal(csvPreview.errorCount,3);
 assert.ok(csvPreview.rows[2].errors.some(error=>/no matching fee obligation/i.test(error)));
 const workbook=createXlsx(rows,headers);
 const preview=await previewMembershipPaymentImport(identity,{filename:"bulk-fee-test.xlsx",xlsxBase64:workbook.toString("base64")},"fee-bulk-preview-"+suffix);
 assert.equal(preview.rowCount,5);
 assert.equal(preview.errorCount,3);
 assert.equal(preview.canApply,false);
 assert.equal(preview.rows[0].errors.length,0);
 assert.ok(preview.rows[1].errors.some(error=>/duplicated in this workbook/i.test(error)));
 assert.ok(preview.rows[2].errors.some(error=>/no matching fee obligation/i.test(error)));
 assert.ok(preview.rows[3].errors.some(error=>/requires evidence_file_id/i.test(error)));
 await assert.rejects(applyMembershipPaymentImport(identity,preview.batchId,{reason:"Apply test batch without partial option"},"fee-bulk-denied-"+suffix),error=>error.code==="IMPORT_NOT_VALIDATED");
 await db.query("update membership_payment_method set enabled=false where method_code=$1",[staleMethodCode]);
 const applied=await applyMembershipPaymentImport(identity,preview.batchId,{reason:"Apply valid rows and retain row failures",applyValidRows:true},"fee-bulk-apply-"+suffix);
 assert.equal(applied.createdCount,1);
 assert.equal(applied.errorCount,4);
 assert.equal(applied.skippedCount,3);
 assert.equal(applied.failedCount,1);
 assert.equal(applied.partial,true);
 assert.deepEqual(applied.createdRows,[2]);
 assert.deepEqual(applied.failedRows.map(row=>row.rowNumber),[3,4,5,6]);
 assert.ok(applied.failedRows[3].errors.some(error=>/payment method changed/i.test(error)));
 const pending=(await db.query("select pt.id,pt.status,pt.source from payment_transaction pt join membership_fee_obligation_payment op on op.payment_transaction_id=pt.id where op.obligation_id=(select id from membership_fee_obligation where application_id=$1)",[app.id])).rows;
 assert.equal(pending.length,1);
 assert.equal(pending[0].status,"pending");
 assert.equal(pending[0].source,"finance_bulk_import");
 assert.equal((await db.query("select 1 from payment_verification where payment_transaction_id=$1",[pending[0].id])).rowCount,0,"bulk import must not verify or auto-activate a receipt");
 await assert.rejects(verifyMembershipReceipt(identity,pending[0].id,{decision:"approved",note:"Self-verification must be rejected"},"fee-bulk-self-verify-"+suffix),error=>error.code==="MAKER_CHECKER_REQUIRED");
 await db.query("insert into app_user_role(user_id,role_id) select $1,id from app_role where role_code='finance_officer' on conflict do nothing",[applicant.user.id]);
 const checker={sub:applicant.user.id,roles:["finance_officer"],permissions:[]};
 await verifyMembershipReceipt(checker,pending[0].id,{decision:"approved",note:"Independent receipt verification"},"fee-bulk-independent-verify-"+suffix);
 const verified=(await db.query("select status,verified_by from payment_transaction where id=$1",[pending[0].id])).rows[0];
 assert.equal(verified.status,"succeeded");
 assert.equal(verified.verified_by,checker.sub,"receipt verification must be performed by a different Finance user");
 assert.equal((await db.query("select count(*)::int count from payment_verification where payment_transaction_id=$1",[pending[0].id])).rows[0].count,1);
 const replay=await applyMembershipPaymentImport(identity,preview.batchId,{reason:"Replay already applied batch",applyValidRows:true},"fee-bulk-replay-"+suffix);
 assert.equal(replay.alreadyApplied,true);
 assert.equal(replay.createdCount,1);
 const duplicateUpload=await previewMembershipPaymentImport(identity,{filename:"duplicate-reupload.xlsx",xlsxBase64:createXlsx([rows[0]],headers).toString("base64")},"fee-bulk-duplicate-"+suffix);
 assert.ok(duplicateUpload.rows[0].errors.some(error=>/already allocated/i.test(error)),"re-upload must detect the existing pending payment reference");
 const audits=await db.query("select action from audit_log where request_id::text=any($1::text[])",[["fee-bulk-apply-"+suffix,"fee-bulk-replay-"+suffix]]);
 assert.ok(audits.rows.some(row=>row.action==="finance.membership_bulk_receipt_created"));
});

test("ordinary members cannot access the Finance fee obligation queue",async()=>{
 await assert.rejects(listFeeObligations(member,{}),error=>error.statusCode===403&&error.code==="FORBIDDEN");
});


test("PostgreSQL fee obligation lifecycle preserves partial cash, maker-checker non-cash settlement and reversal reopening",async t=>{
 if(!process.env.DATABASE_URL){t.skip("requires the disposable PostgreSQL database configured by PR Quality");return;}
 const db=getPool(),suffix=randomUUID(),digits=suffix.replace(/\D/g,"").slice(0,8).padEnd(8,"7");
 const applicantEmail="fee-lifecycle-"+suffix+"@example.test";
 const financeEmail="fee-approver-"+suffix+"@example.test";
 const applicant=await membership.register({email:applicantEmail,password:"FeeLifecycleSecurePassword!2026",firstName:"Fee",lastName:"Lifecycle",phone:"09"+digits},"fee-lifecycle-register-"+suffix);
 const financeUser=await membership.register({email:financeEmail,password:"FeeApproverSecurePassword!2026",firstName:"Finance",lastName:"Approver",phone:"07"+digits},"fee-approver-register-"+suffix);
 const applicantId=applicant.user.id,financeId=financeUser.user.id;
 const applicantFinance={sub:applicantId,roles:["finance_officer"],permissions:[]};
 const approverFinance={sub:financeId,roles:["finance_officer"],permissions:[]};
 const reviewer=applicantId;
 const methodCode="fee_cash_"+suffix.slice(0,8);
 const evidenceBytes=Buffer.from("Approved sponsor letter and supporting membership fee coverage evidence.");
 const upload=await authorizePrivateUpload(applicantId,{fileName:"sponsor-evidence.txt",contentType:"text/plain",byteSize:evidenceBytes.length});
 await receivePrivateUpload(applicantId,upload.uploadId,upload.uploadToken,evidenceBytes);
 const evidence=await confirmPrivateUpload(applicantId,upload.uploadId);
 const app=await membership.createApplication(applicantId,{productCode:"BASIC",termsAcknowledged:true,idempotencyKey:"fee_app_"+suffix.slice(0,32)},"fee-lifecycle-application-"+suffix);
 await db.query("insert into app_user_role(user_id,role_id) select $1,id from app_role where role_code='reviewer' on conflict do nothing",[reviewer]);
 await db.query("insert into membership_payment_method(method_code,method_type,display_name,enabled,currency,instructions,requires_evidence) values($1,'cash','Fee lifecycle cash test',true,'ETB','Disposable PostgreSQL test method',false) on conflict(method_code) do update set enabled=true,currency='ETB',requires_evidence=false",[methodCode]);

 const before=(await db.query("select fee_snapshot,amount_due,currency from membership_fee_obligation where application_id=$1",[app.id])).rows[0];
 assert.equal(Number(before.amount_due),1200);
 assert.equal(before.currency,"ETB");
 const receipt=await recordMembershipReceipt(applicantFinance,{applicationId:app.id,amount:500,currency:"ETB",paymentMethodCode:methodCode,reference:"fee-partial-"+suffix,receivedDate:new Date().toISOString().slice(0,10),idempotencyKey:"fee_receipt_"+suffix.slice(0,32)},"fee-partial-record-"+suffix);
 assert.equal(receipt.payment.status,"pending");
 const replay=await recordMembershipReceipt(applicantFinance,{applicationId:app.id,amount:500,currency:"ETB",paymentMethodCode:methodCode,reference:"fee-partial-"+suffix,receivedDate:new Date().toISOString().slice(0,10),idempotencyKey:"fee_receipt_"+suffix.slice(0,32)},"fee-partial-replay-"+suffix);
 assert.equal(replay.payment.id,receipt.payment.id);
 assert.equal(replay.alreadyRecorded,true);
 await assert.rejects(recordMembershipReceipt(applicantFinance,{applicationId:app.id,amount:701,currency:"ETB",paymentMethodCode:methodCode,reference:"fee-overpay-"+suffix,receivedDate:new Date().toISOString().slice(0,10),idempotencyKey:"fee_overpay_"+suffix.slice(0,32)}),error=>error.code==="AMOUNT_EXCEEDS_BALANCE");
 await assert.rejects(recordMembershipReceipt(applicantFinance,{applicationId:app.id,amount:100,currency:"USD",paymentMethodCode:methodCode,reference:"fee-wrong-currency-"+suffix,receivedDate:new Date().toISOString().slice(0,10),idempotencyKey:"fee_wrong_currency_"+suffix.slice(0,32)}),error=>error.code==="PAYMENT_CURRENCY_MISMATCH");
 await verifyMembershipReceipt(approverFinance,receipt.payment.id,{decision:"approved",note:"Verified test cash receipt"},"fee-partial-verify-"+suffix);
 let balance=(await db.query("select * from membership_fee_obligation_balance where application_id=$1",[app.id])).rows[0];
 assert.equal(Number(balance.verified_cash),500);
 assert.equal(Number(balance.approved_non_cash),0);
 assert.equal(Number(balance.outstanding_balance),700);
 await membership.reviewApplication(app.id,reviewer,{decision:"approved",note:"Test application approved while a fee balance remains due."},"fee-lifecycle-review-"+suffix);
 const pendingApplication=(await db.query("select status from membership_application where id=$1",[app.id])).rows[0];
 assert.equal(pendingApplication.status,"payment_pending","application approval must not make a partially paid application ready to activate");
 assert.equal((await db.query("select id from membership_record where application_id=$1",[app.id])).rowCount,0,"no membership record may be activated while the fee balance remains due");

 const dueDate=(await db.query("select ((now() at time zone 'Africa/Addis_Ababa')::date+3)::text due_date")).rows[0].due_date;
 await db.query("insert into notification_preference(user_id,in_app_enabled,push_enabled,in_app_categories) values($1,false,false,$2::jsonb) on conflict(user_id) do update set in_app_enabled=false,push_enabled=false,in_app_categories=$2::jsonb",[applicantId,JSON.stringify({membership:false})]);
 const willPayLater=await recordBalanceDisposition(applicantFinance,{applicationId:app.id,dispositionType:"will_pay_later",amount:700,currency:"ETB",dueDate,remark:"Member requested a short payment extension",idempotencyKey:"fee_will_pay_"+suffix.slice(0,32)},"fee-will-pay-"+suffix);
 assert.equal(willPayLater.disposition.status,"active");
 const reminderRun=await scheduleMembershipFeeReminders(500);
 assert.ok(reminderRun.suppressed>=1,"a member who opted out of both in-app and push reminders must be suppressed");
 const queuedReminder=(await db.query("select status,member_delivery_status,member_delivery_note from membership_fee_reminder where obligation_id=(select id from membership_fee_obligation where application_id=$1)",[app.id])).rows[0];
 assert.equal(queuedReminder.status,"queued","Finance queue can retain its staff reminder even when the member opted out");
 assert.equal(queuedReminder.member_delivery_status,"suppressed");
 assert.match(queuedReminder.member_delivery_note,/opted|disabled/i);
 await scheduleMembershipFeeReminders(500);
 const reminderCount=(await db.query("select count(*)::int count from membership_fee_reminder where obligation_id=(select id from membership_fee_obligation where application_id=$1)",[app.id])).rows[0].count;
 assert.equal(reminderCount,1,"re-running the scheduler must not duplicate the same date/balance reminder");
 const disposition=await recordBalanceDisposition(applicantFinance,{applicationId:app.id,dispositionType:"sponsored",amount:700,currency:"ETB",remark:"Test sponsor covers remaining fee",details:{sponsorName:"Disposable test sponsor"},evidenceFileId:evidence.id,idempotencyKey:"fee_sponsor_"+suffix.slice(0,32)},"fee-sponsor-record-"+suffix);
 assert.equal(disposition.disposition.status,"pending");
 const dispositionReplay=await recordBalanceDisposition(applicantFinance,{applicationId:app.id,dispositionType:"sponsored",amount:700,currency:"ETB",remark:"Test sponsor covers remaining fee",details:{sponsorName:"Disposable test sponsor"},evidenceFileId:evidence.id,idempotencyKey:"fee_sponsor_"+suffix.slice(0,32)},"fee-sponsor-replay-"+suffix);
 assert.equal(dispositionReplay.disposition.id,disposition.disposition.id,"replaying the same evidenced non-cash request must not create another settlement");
 assert.equal(dispositionReplay.alreadyRecorded,true);
 const approverEvidence=await readAuthorizedPrivateFile(financeId,evidence.id,["finance_officer"]);
 assert.deepEqual(approverEvidence.bytes,evidenceBytes,"a separate Finance approver must be able to inspect the private evidence before deciding");
 await assert.rejects(decideBalanceDisposition(applicantFinance,disposition.disposition.id,{decision:"approved",note:"Self approval attempt"},"fee-sponsor-self-approve-"+suffix),error=>error.code==="MAKER_CHECKER_REQUIRED");
 await decideBalanceDisposition(approverFinance,disposition.disposition.id,{decision:"approved",note:"Independent Finance approval"},"fee-sponsor-approve-"+suffix);
 const cancelledReminder=(await db.query("select status from membership_fee_reminder where obligation_id=(select id from membership_fee_obligation where application_id=$1)",[app.id])).rows[0];
 assert.equal(cancelledReminder.status,"cancelled","full approved non-cash settlement must cancel outstanding reminders");
 const adjustment=(await db.query("select id,details from membership_fee_adjustment where obligation_id=(select id from membership_fee_obligation where application_id=$1) and status='approved' order by created_at desc limit 1",[app.id])).rows[0];
 assert.ok(adjustment?.id,"approval must create an immutable approved adjustment");
 assert.equal(adjustment.details.evidenceFileId,evidence.id,"approved adjustment must retain the private evidence reference");
 assert.equal(adjustment.details.sponsorSource,"manual","manual sponsor body must be retained as a clearly labelled snapshot");
 await assert.rejects(db.query("update membership_fee_adjustment set status='reversed' where id=$1",[adjustment.id]),/approved membership fee adjustments are immutable/i);
 await assert.rejects(db.query("update membership_fee_balance_disposition set status='rejected' where id=$1",[disposition.disposition.id]),/approved membership fee dispositions are immutable/i);
 balance=(await db.query("select * from membership_fee_obligation_balance where application_id=$1",[app.id])).rows[0];
 assert.equal(Number(balance.verified_cash),500,"non-cash sponsorship must not be counted as cash");
 assert.equal(Number(balance.approved_non_cash),700);
 assert.equal(Number(balance.outstanding_balance),0);
 const detailedReport=await runReport(approverFinance,"membership-fee-dispositions",{q:"Disposable test sponsor"},"fee-report-dispositions-"+suffix);
 assert.ok(detailedReport.rows.some(row=>row["Sponsor / reference"]==="Disposable test sponsor"&&Number(row.Amount)===700&&row.Status==="approved"),"Finance disposition report must expose the approved sponsor record and its remark");
 const appReference=(await db.query("select tracking_reference from membership_application where id=$1",[app.id])).rows[0].tracking_reference;
 const balanceReport=await runReport(approverFinance,"membership-fee-balance-by-currency",{q:appReference},"fee-report-balance-"+suffix);
 assert.ok(balanceReport.rows.some(row=>row.Currency==="ETB"&&Number(row["Verified cash"])===500&&Number(row["Approved non-cash"])===700&&Number(row.Outstanding)===0),"currency totals must keep verified cash and non-cash coverage separate");
 const after=(await db.query("select fee_snapshot,amount_due,currency from membership_fee_obligation where application_id=$1",[app.id])).rows[0];
 assert.deepEqual(after.fee_snapshot,before.fee_snapshot,"settlement must not mutate the immutable application fee snapshot");
 assert.equal(Number(after.amount_due),1200);

 const settledApplication=(await db.query("select status from membership_application where id=$1",[app.id])).rows[0];
 assert.equal(settledApplication.status,"paid","independent non-cash approval should settle the balance without pretending cash was received");
 const activated=await membership.activateApplication(app.id,reviewer,"fee-lifecycle-activate-"+suffix);
 assert.equal(activated.status,"active");

 const firstReversal=await membership.reverseMembershipPayment(receipt.payment.id,financeId,{reason:"Test reversal reopens the remaining fee obligation."},"fee-lifecycle-reverse-"+suffix);
 const repeatedReversal=await membership.reverseMembershipPayment(receipt.payment.id,financeId,{reason:"Repeated reversal must be idempotent."},"fee-lifecycle-reverse-repeat-"+suffix);
 assert.equal(repeatedReversal.id,firstReversal.id,"repeated payment reversal must return the original reversal record without creating another");
 balance=(await db.query("select * from membership_fee_obligation_balance where application_id=$1",[app.id])).rows[0];
 assert.equal(Number(balance.verified_cash),0);
 assert.equal(Number(balance.approved_non_cash),700);
 assert.equal(Number(balance.outstanding_balance),500);
 const member=(await db.query("select status from membership_record where application_id=$1",[app.id])).rows[0];
 assert.equal(member.status,"suspended","reversal of a verified cash receipt must suspend active membership while a balance remains due");
 const appStatus=(await db.query("select status from membership_application where id=$1",[app.id])).rows[0].status;
 assert.equal(appStatus,"activated","reversal must not rewrite the historical activation event/status; membership access is suspended");
 await scheduleMembershipFeeReminders(500);
 const reopenedReminder=(await db.query("select status,due_balance,member_delivery_status from membership_fee_reminder where obligation_id=(select id from membership_fee_obligation where application_id=$1) order by created_at desc limit 1",[app.id])).rows[0];
 assert.equal(reopenedReminder.status,"queued","cash reversal must reopen the reminder queue for the remaining balance");
 assert.equal(Number(reopenedReminder.due_balance),500);
 assert.equal(reopenedReminder.member_delivery_status,"suppressed","member reminder remains suppressed when the member opted out");
 const rejected=await recordBalanceDisposition(applicantFinance,{applicationId:app.id,dispositionType:"sponsored",amount:100,currency:"ETB",remark:"Rejected test sponsor proposal",details:{sponsorName:"Rejected test sponsor"},evidenceFileId:evidence.id,idempotencyKey:"fee_reject_"+suffix.slice(0,32)},"fee-rejected-record-"+suffix);
 await decideBalanceDisposition(approverFinance,rejected.disposition.id,{decision:"rejected",note:"Supporting approval was not provided."},"fee-rejected-decision-"+suffix);
 balance=(await db.query("select * from membership_fee_obligation_balance where application_id=$1",[app.id])).rows[0];
 assert.equal(Number(balance.outstanding_balance),500,"a rejected non-cash disposition must not reduce the outstanding balance");
 
 const zeroSuffix=randomUUID(),zeroDigits=zeroSuffix.replace(/\D/g,"").slice(0,8).padEnd(8,"7");
 const zeroApplicant=await membership.register({email:"fee-zero-"+suffix+"@example.test",password:"ZeroCashSecurePassword!2026",firstName:"Zero",lastName:"Cash",phone:"09"+zeroDigits},"fee-zero-register-"+suffix);
 const zeroApplicantId=zeroApplicant.user.id;
 const sponsorOrg=await organizationJobs.registerOrganization(zeroApplicantId,{legalName:"Fee Sponsor "+suffix,displayName:"Fee Sponsor "+suffix},"fee-sponsor-organization-"+suffix);
 await db.query("insert into app_user_role(user_id,role_id) select $1,id from app_role where role_code='reviewer' on conflict do nothing",[zeroApplicantId]);
 const zeroApp=await membership.createApplication(zeroApplicantId,{productCode:"BASIC",termsAcknowledged:true,idempotencyKey:"fee_zero_app_"+suffix.slice(0,32)},"fee-zero-application-"+suffix);
 const zeroEvidenceBytes=Buffer.from("Full sponsorship approval evidence for zero-cash membership settlement.");
 const zeroUpload=await authorizePrivateUpload(zeroApplicantId,{fileName:"full-sponsorship-evidence.txt",contentType:"text/plain",byteSize:zeroEvidenceBytes.length});
 await receivePrivateUpload(zeroApplicantId,zeroUpload.uploadId,zeroUpload.uploadToken,zeroEvidenceBytes);
 const zeroEvidence=await confirmPrivateUpload(zeroApplicantId,zeroUpload.uploadId);
 const zeroFinance={sub:zeroApplicantId,roles:["finance_officer"],permissions:[]};
 const sponsorChoices=await listSponsoringOrganizations(zeroFinance);
 assert.ok(sponsorChoices.some(item=>item.id===sponsorOrg.id),"registered sponsoring bodies must be available to Finance");
 const zeroDueDate=(await db.query("select ((now() at time zone 'Africa/Addis_Ababa')::date+2)::text due_date")).rows[0].due_date;
 await recordBalanceDisposition(zeroFinance,{applicationId:zeroApp.id,dispositionType:"will_pay_later",amount:1200,currency:"ETB",dueDate:zeroDueDate,remark:"Member requested a short extension",idempotencyKey:"fee_zero_willpay_"+suffix.slice(0,28)},"fee-zero-willpay-"+suffix);
 await scheduleMembershipFeeReminders(500);
 const inAppReminder=(await db.query("select member_delivery_status,member_delivery_note,member_outbox_id from membership_fee_reminder where obligation_id=(select id from membership_fee_obligation where application_id=$1)",[zeroApp.id])).rows[0];
 assert.equal(inAppReminder.member_delivery_status,"in_app","default member preference should place a reminder in the in-app inbox");
 assert.match(inAppReminder.member_delivery_note,/in the member inbox/i);
 const fullSponsorship=await recordBalanceDisposition(zeroFinance,{applicationId:zeroApp.id,dispositionType:"sponsored",amount:1200,currency:"ETB",remark:"Full product fee covered by sponsor",details:{sponsorOrganizationId:sponsorOrg.id},evidenceFileId:zeroEvidence.id,idempotencyKey:"fee_zero_sponsor_"+suffix.slice(0,32)},"fee-zero-sponsor-"+suffix);
 await decideBalanceDisposition(approverFinance,fullSponsorship.disposition.id,{decision:"approved",note:"Full fee sponsorship independently verified."},"fee-zero-sponsor-approve-"+suffix);
 const archivedReminderEvent=(await db.query("select archived_at from notification_event where id=$1",[inAppReminder.member_outbox_id])).rows[0];
 assert.ok(archivedReminderEvent?.archived_at,"full settlement must archive the stale in-app balance reminder");
 const settledReminder=(await db.query("select status,member_delivery_status from membership_fee_reminder where obligation_id=(select id from membership_fee_obligation where application_id=$1)",[zeroApp.id])).rows[0];
 assert.equal(settledReminder.status,"cancelled");
 assert.equal(settledReminder.member_delivery_status,"superseded");
 const zeroAdjustment=(await db.query("select details from membership_fee_adjustment where obligation_id=(select id from membership_fee_obligation where application_id=$1) and status='approved'",[zeroApp.id])).rows[0];
 assert.equal(zeroAdjustment.details.sponsorSource,"registered_organization");
 assert.equal(zeroAdjustment.details.sponsorOrganizationId,sponsorOrg.id);
 const zeroBalance=(await db.query("select * from membership_fee_obligation_balance where application_id=$1",[zeroApp.id])).rows[0];
 assert.equal(Number(zeroBalance.verified_cash),0,"full sponsorship must not create a cash receipt");
 assert.equal(Number(zeroBalance.approved_non_cash),1200);
 assert.equal(Number(zeroBalance.outstanding_balance),0,"approved full sponsorship must settle the fee with zero cash");
 await membership.reviewApplication(zeroApp.id,zeroApplicantId,{decision:"approved",note:"Approved after full sponsored settlement."},"fee-zero-review-"+suffix);
 const zeroActivated=await membership.activateApplication(zeroApp.id,zeroApplicantId,"fee-zero-activate-"+suffix);
 assert.equal(zeroActivated.status,"active");
});
