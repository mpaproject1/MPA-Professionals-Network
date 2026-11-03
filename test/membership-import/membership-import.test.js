import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import {applyMemberImport, claimMemberInvitation, exportMembers, memberImportTemplate, memberImportXlsxTemplate, previewMemberImport} from "../../src/membership/admin-bulk.js";
import * as membership from "../../src/membership/service.js";
import {classifyMatch, normalizeLegacyMember} from "../../src/membership-import/contract.js";
import {getPool} from "../../src/platform/db.js";
import {assertPaymentTransition, createManualPayment,verifyManualPayment} from "../../src/platform/payment-workflow.js";
import {createXlsx, parseXlsxRows} from "../../src/platform/xlsx.js";

test("legacy membership rows normalize into a stable contract",()=>{
  const row=normalizeLegacyMember({legacy_member_id:" OLD-1 ",email:" A@EXAMPLE.COM ",paid_amount:"1200",paid_currency:"etb"});
  assert.equal(row.legacyMemberId,"OLD-1"); assert.equal(row.email,"a@example.com"); assert.equal(row.paidAmount,1200); assert.equal(row.paidCurrency,"etb");
});
test("ambiguous membership matches require review",()=>{
  assert.equal(classifyMatch([{userId:"u1",score:96},{userId:"u2",score:94}]).status,"conflict");
  assert.equal(classifyMatch([{userId:"u1",score:99}]).status,"matched");
  assert.equal(classifyMatch([]).status,"new");
});
test("manual payment is provider-neutral and evidence-aware",()=>{
  const p=createManualPayment({amount:1200,currency:"ETB",purpose:"membership",purposeReference:"M-1",idempotencyKey:"manual:M-1",submittedBy:"u1"});
  assert.equal(p.provider,"manual"); assert.equal(p.source,"manual_entry"); assert.equal(p.currency,"ETB");
  const result=verifyManualPayment({...p,id:"p1"},"approved","reviewer"); assert.equal(result.paymentId,"p1"); assert.equal(result.decision,"approved"); assert.equal(result.verifierUserId,"reviewer"); assert.ok(result.verifiedAt);
});
test("payment transitions reject invalid states",()=>{assert.throws(()=>assertPaymentTransition("pending","refunded"),/Invalid payment transition/);});


test("member CSV and XLSX templates round-trip with the same governed import columns",()=>{
 const identity={sub:"00000000-0000-4000-8000-000000000001",roles:["system_admin"],permissions:[]};
 const csv=memberImportTemplate(identity);
 assert.ok(csv.endsWith("\r\n"));
 const xlsx=memberImportXlsxTemplate(identity);
 assert.equal(xlsx.subarray(0,2).toString("ascii"),"PK");
 assert.deepEqual(parseXlsxRows(xlsx).headers,csv.trim().split(","));
 const excelDate=parseXlsxRows(createXlsx([{received_date:"45200"}],["received_date"])).rows[0].received_date;
 assert.equal(excelDate,"2023-10-01","Excel serial dates must round-trip to ISO civil dates before validation");
});

test("PostgreSQL historical member XLSX import preserves approval and payment safeguards",async t=>{
 if(!process.env.DATABASE_URL){t.skip("requires the disposable PostgreSQL database configured by PR Quality");return;}
 const db=getPool(),suffix=randomUUID().replace(/-/g,"").slice(0,12).toUpperCase(),digits=suffix.replace(/\D/g,"").slice(0,8).padEnd(8,"7");
 const admin=await membership.register({email:"member-import-admin-"+suffix+"@example.test",password:"MemberImportAdminSecure!2026",firstName:"Import",lastName:"Admin",phone:"09"+digits},"member-import-admin-"+suffix);
 const adminId=admin.user.id;
 await db.query("insert into app_user_role(user_id,role_id) select $1,id from app_role where role_code='system_admin' on conflict do nothing",[adminId]);
 const identity={sub:adminId,roles:["system_admin"],permissions:[]},headers=parseXlsxRows(memberImportXlsxTemplate(identity)).headers;
 const membershipNumber="LEG-"+suffix,legacyId="LEGACY-"+suffix;
 const row={legacy_member_id:legacyId,email:"  LEGACY-"+suffix.toLowerCase()+"@EXAMPLE.TEST  ",phone:"07"+digits,full_name:"  Legacy   Fixture  ",gender:"male",membership_number:membershipNumber,membership_type:"BASIC",product_code:"BASIC",amount_paid:"1200.50",payment_currency:"ETB",status:"active",registered_date:"2024-01-10",start_date:"2024-01-10",end_date:"2027-01-09",approved_membership:"yes",approval_reference:"MPA-APPROVAL-"+suffix,payment_reference:"HIST-PAY-"+suffix,payment_date:"2024-01-10",payment_method:"bank_transfer",payment_evidence_reference:"ARCHIVE-EVIDENCE-"+suffix,education_background:"",location_or_address:"",residence_type:"",country_iso3:"",region_or_federal_city:"",zone_or_sub_city:"",district_or_town:"",street_address:"",diaspora_area:"",qualification:"",field_of_study:"",department:"",volunteer_pledge:"",volunteer_services:"",volunteer_hours_per_week:"",notes:"Historical amount, evidence context only"};
 const invalid={...row,legacy_member_id:"BAD-"+suffix,email:"not-an-email",membership_number:"BAD-"+suffix,product_code:"NOT-A-PRODUCT",membership_type:"NOT-A-PRODUCT",approved_membership:"no",approval_reference:""};
 const csvHeaders=memberImportTemplate(identity).trim().split(",");
 const csv=[csvHeaders,...[row,invalid].map(item=>csvHeaders.map(header=>item[header]??""))].map(record=>record.map(value=>{const text=String(value??"");return /[",\r\n]/.test(text)?'"'+text.replace(/"/g,'""')+'"':text;}).join(",")).join("\r\n")+"\r\n";
 const csvPreview=await previewMemberImport(identity,{filename:"historical-members.csv",csv,sourceSystem:"MPA approved historical register"},"member-import-csv-preview-"+suffix);
 assert.equal(csvPreview.rowCount,2);
 assert.equal(csvPreview.newCount,1);
 assert.equal(csvPreview.conflictCount,1,"CSV and XLSX previews must apply the same approval/product rules");
 assert.equal(csvPreview.rows[0].fullName,"Legacy Fixture","CSV parser collapses repeated whitespace in member names");
 assert.equal(csvPreview.rows[0].errors.length,0,"CSV parser accepts normalized case-insensitive email addresses");
 const workbook=createXlsx([row,invalid],headers);
 const preview=await previewMemberImport(identity,{filename:"historical-members.xlsx",xlsxBase64:workbook.toString("base64"),sourceSystem:"MPA approved historical register"},"member-import-preview-"+suffix);
 assert.equal(preview.rowCount,2);
 assert.equal(preview.newCount,1);
 assert.equal(preview.conflictCount,1);
 assert.ok(preview.rows[1].errors.some(error=>/Unknown or inactive membership product code/i.test(error)));
 assert.ok(preview.rows[1].errors.some(error=>/already approved/i.test(error)));
 assert.ok(preview.rows[1].errors.some(error=>/valid email address/i.test(error)),"malformed email values must fail the same CSV/XLSX row validator");
 const applied=await applyMemberImport(identity,preview.importId,{reason:"Import approved historical member register"},"member-import-apply-"+suffix);
 assert.equal(applied.appliedCount,1);
 assert.equal(applied.conflictCount,1);
 const member=(await db.query("select id,status,membership_number,source,membership_product_id from membership_record where source='legacy_import' and legacy_member_id=$1",[legacyId])).rows[0];
 assert.ok(member);
 assert.equal(member.status,"active","the source register status is retained as historical data, not treated as payment verification");
 assert.equal(member.membership_number,membershipNumber);
 assert.equal(member.source,"legacy_import");
 const paymentRows=await db.query("select pt.id,pt.status from payment_transaction pt join payment_reconciliation pr on pr.payment_transaction_id=pt.id where pr.membership_id=$1",[member.id]);
 assert.equal(paymentRows.rowCount,0,"historical amount_paid and payment references must never create verified payment transactions");
 const event=(await db.query("select details from membership_event where membership_id=$1 and event_type='legacy_member_imported' order by created_at desc limit 1",[member.id])).rows[0];
 assert.equal(event.details.paymentImported,false);
 assert.equal(event.details.approvalConfirmed,true);
 const exported=await exportMembers(identity,{q:membershipNumber,format:"csv"},"member-import-export-"+suffix);
 assert.match(exported.buffer.toString("utf8"),/payment_verification_required/i,"an imported Active source status is surfaced as payment verification required until Finance confirms the historical fee");
 const invitationToken=(await db.query("select payload->>'invitationToken' token from notification_outbox where template_code='mpa_member_invitation' and payload->>'importBatchId'=$1 order by created_at desc limit 1",[preview.importId])).rows[0]?.token;
 assert.ok(invitationToken);
 await assert.rejects(claimMemberInvitation({token:invitationToken,password:"ClaimSecurePassword!2026"}),error=>error.code==="PAYMENT_VERIFICATION_REQUIRED");
 const duplicate=await previewMemberImport(identity,{filename:"historical-members-duplicate.xlsx",xlsxBase64:createXlsx([row],headers).toString("base64")},"member-import-duplicate-"+suffix);
 assert.ok(duplicate.rows[0].errors.some(error=>/membership number already exists/i.test(error)));
});
