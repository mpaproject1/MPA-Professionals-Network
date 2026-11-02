import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  applyMembershipPaymentImport,
  decideBalanceDisposition,
  listFeeObligations,
  membershipPaymentImportTemplate,
  previewMembershipPaymentImport,
  recordBalanceDisposition,
  recordMembershipReceipt,
  reverseMembershipRecordReceipt,
  verifyMembershipReceipt,
} from "../../src/membership/fee-obligations.js";
import { parseXlsxRows } from "../../src/platform/xlsx.js";
import * as membership from "../../src/membership/service.js";
import { getPool } from "../../src/platform/db.js";
import { authorizePrivateUpload, receivePrivateUpload, confirmPrivateUpload } from "../../src/platform/private-file-storage.js";

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

test("bulk payment import cannot be applied by a system administrator without Finance import authority",async()=>{
 await assert.rejects(applyMembershipPaymentImport(admin,paymentId,{reason:"test import apply"},requestId),error=>error.statusCode===403&&error.code==="FORBIDDEN");
});

test("bulk payment preview requires an XLSX workbook",async()=>{
 await assert.rejects(previewMembershipPaymentImport(finance,{xlsxBase64:""},requestId),error=>error.statusCode===400&&error.code==="XLSX_REQUIRED");
});

test("Finance payment template contains only pending-intake fields and requires member, amount, currency, date, method and reference",()=>{
 const workbook=membershipPaymentImportTemplate(finance);
 const {headers,rows}=parseXlsxRows(workbook);
 assert.deepEqual(headers,["application_id","membership_number","amount","currency","received_date","payment_method_code","payment_reference","evidence_reference","evidence_file_id","payer_note"]);
 assert.equal(rows.length,0);
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

 const disposition=await recordBalanceDisposition(applicantFinance,{applicationId:app.id,dispositionType:"sponsored",amount:700,currency:"ETB",remark:"Test sponsor covers remaining fee",details:{sponsorName:"Disposable test sponsor"},evidenceFileId:evidence.id,idempotencyKey:"fee_sponsor_"+suffix.slice(0,32)},"fee-sponsor-record-"+suffix);
 assert.equal(disposition.disposition.status,"pending");
 await assert.rejects(decideBalanceDisposition(applicantFinance,disposition.disposition.id,{decision:"approved",note:"Self approval attempt"},"fee-sponsor-self-approve-"+suffix),error=>error.code==="MAKER_CHECKER_REQUIRED");
 await decideBalanceDisposition(approverFinance,disposition.disposition.id,{decision:"approved",note:"Independent Finance approval"},"fee-sponsor-approve-"+suffix);
 const adjustment=(await db.query("select id from membership_fee_adjustment where obligation_id=(select id from membership_fee_obligation where application_id=$1) and status='approved' order by created_at desc limit 1",[app.id])).rows[0];
 assert.ok(adjustment?.id,"approval must create an immutable approved adjustment");
 await assert.rejects(db.query("update membership_fee_adjustment set status='reversed' where id=$1",[adjustment.id]),/approved membership fee adjustments are immutable/i);
 balance=(await db.query("select * from membership_fee_obligation_balance where application_id=$1",[app.id])).rows[0];
 assert.equal(Number(balance.verified_cash),500,"non-cash sponsorship must not be counted as cash");
 assert.equal(Number(balance.approved_non_cash),700);
 assert.equal(Number(balance.outstanding_balance),0);
 const after=(await db.query("select fee_snapshot,amount_due,currency from membership_fee_obligation where application_id=$1",[app.id])).rows[0];
 assert.deepEqual(after.fee_snapshot,before.fee_snapshot,"settlement must not mutate the immutable application fee snapshot");
 assert.equal(Number(after.amount_due),1200);

 const settledApplication=(await db.query("select status from membership_application where id=$1",[app.id])).rows[0];
 assert.equal(settledApplication.status,"paid","independent non-cash approval should settle the balance without pretending cash was received");
 const activated=await membership.activateApplication(app.id,reviewer,"fee-lifecycle-activate-"+suffix);
 assert.equal(activated.status,"active");

 await membership.reverseMembershipPayment(receipt.payment.id,financeId,{reason:"Test reversal reopens the remaining fee obligation."},"fee-lifecycle-reverse-"+suffix);
 balance=(await db.query("select * from membership_fee_obligation_balance where application_id=$1",[app.id])).rows[0];
 assert.equal(Number(balance.verified_cash),0);
 assert.equal(Number(balance.approved_non_cash),700);
 assert.equal(Number(balance.outstanding_balance),500);
 const member=(await db.query("select status from membership_record where application_id=$1",[app.id])).rows[0];
 assert.equal(member.status,"suspended","reversal of a verified cash receipt must suspend active membership while a balance remains due");
 const appStatus=(await db.query("select status from membership_application where id=$1",[app.id])).rows[0].status;
 assert.equal(appStatus,"activated","reversal must not rewrite the historical activation event/status; membership access is suspended");
 const rejected=await recordBalanceDisposition(applicantFinance,{applicationId:app.id,dispositionType:"sponsored",amount:100,currency:"ETB",remark:"Rejected test sponsor proposal",details:{sponsorName:"Rejected test sponsor"},evidenceFileId:evidence.id,idempotencyKey:"fee_reject_"+suffix.slice(0,32)},"fee-rejected-record-"+suffix);
 await decideBalanceDisposition(approverFinance,rejected.disposition.id,{decision:"rejected",note:"Supporting approval was not provided."},"fee-rejected-decision-"+suffix);
 balance=(await db.query("select * from membership_fee_obligation_balance where application_id=$1",[app.id])).rows[0];
 assert.equal(Number(balance.outstanding_balance),500,"a rejected non-cash disposition must not reduce the outstanding balance");
});
