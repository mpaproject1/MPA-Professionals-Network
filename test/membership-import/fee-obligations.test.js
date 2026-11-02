import assert from "node:assert/strict";
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

const admin={sub:"system-admin",roles:["system_admin"],permissions:[]};
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

test("member fee queue does not grant Finance access from a system administrator role alone",async()=>{
 await assert.rejects(listFeeObligations(admin,{}),error=>error.statusCode===403&&error.code==="FORBIDDEN");
});
