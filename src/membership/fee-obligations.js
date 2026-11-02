import { randomUUID } from "node:crypto";
import { getPool, withTransaction } from "../platform/db.js";
import { createInAppNotification } from "../platform/notifications.js";
import { createXlsx, parseXlsxRows } from "../platform/xlsx.js";
import { assertPaymentReversalAccess, assertPaymentVerificationAccess } from "../platform/workspace-authorization.js";
import { assertMembershipPaymentMethodAvailable, buildMembershipPaymentMethodSnapshot } from "./payment-method-policy.js";

function problem(statusCode,message,code="BUSINESS_RULE"){return Object.assign(new Error(message),{statusCode,code});}
function financeRecord(identity){if((identity?.roles||[]).includes("finance_officer")||(identity?.permissions||[]).includes("finance.payment.record")||(identity?.permissions||[]).includes("finance.manage"))return;throw problem(403,"Finance payment-record permission required.","FORBIDDEN");}
function financeAdjust(identity){if((identity?.roles||[]).includes("finance_officer")||(identity?.permissions||[]).includes("finance.payment.adjust")||(identity?.permissions||[]).includes("finance.manage"))return;throw problem(403,"Finance balance-adjustment permission required.","FORBIDDEN");}
function financeImport(identity){if((identity?.roles||[]).includes("finance_officer")||(identity?.permissions||[]).includes("finance.payment.import")||(identity?.permissions||[]).includes("finance.manage"))return;throw problem(403,"Finance bulk payment-import permission required.","FORBIDDEN");}
function clean(value,max=240){return String(value??"").trim().slice(0,max);}
function validDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+"T00:00:00Z");return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;}
function money(value){const n=Number(value);return Number.isFinite(n)?Math.round((n+Number.EPSILON)*100)/100:NaN;}
function currency(value){const c=clean(value,3).toUpperCase();return /^[A-Z]{3}$/.test(c)?c:null;}
async function ensureApplicationObligation(db,applicationId,actorId){
 const app=(await db.query("select id,user_id,fee_snapshot from membership_application where id=$1 for update",[applicationId])).rows[0];
 if(!app)throw problem(404,"Membership application not found.","NOT_FOUND");
 const fee=typeof app.fee_snapshot==="string"?JSON.parse(app.fee_snapshot):app.fee_snapshot;
 const amount=money(fee?.amount),code=currency(fee?.currency);
 if(!Number.isFinite(amount)||amount<0||!code)throw problem(409,"The saved application fee snapshot is incomplete; Finance must not infer or overwrite the fee.","FEE_SNAPSHOT_INVALID");
 const row=(await db.query("insert into membership_fee_obligation(application_id,fee_snapshot,amount_due,currency,created_by) values($1,$2,$3,$4,$5) on conflict(application_id) do update set updated_at=membership_fee_obligation.updated_at returning *",[applicationId,JSON.stringify(fee),amount,code,actorId])).rows[0];
 await db.query("insert into membership_fee_obligation_payment(obligation_id,payment_transaction_id,linked_by) select $1,ap.payment_transaction_id,$2 from membership_application_payment ap where ap.application_id=$3 on conflict(payment_transaction_id) do nothing",[row.id,actorId,applicationId]);
 return row;
}
async function ensureRecordObligation(db,membershipRecordId,input,actorId){
 const record=(await db.query("select id,application_id,membership_product_id from membership_record where id=$1 and status<>'merged' for update",[membershipRecordId])).rows[0];
 if(!record)throw problem(404,"Membership record not found.","NOT_FOUND");
 if(record.application_id)return ensureApplicationObligation(db,record.application_id,actorId);
 const existing=(await db.query("select * from membership_fee_obligation where membership_record_id=$1 for update",[membershipRecordId])).rows[0];
 if(existing)return existing;
 const amount=money(input.feeAmount),code=currency(input.currency);
 if(!Number.isFinite(amount)||amount<0||!code)throw problem(400,"For a historical membership without an application fee snapshot, Finance must enter the original fee amount and currency before recording receipts.","HISTORICAL_FEE_REQUIRED");
 const snapshot={amount,currency:code,source:"finance_confirmed_historical_fee",recordedAt:new Date().toISOString(),note:clean(input.feeNote,500)};
 return (await db.query("insert into membership_fee_obligation(membership_record_id,fee_snapshot,amount_due,currency,created_by) values($1,$2,$3,$4,$5) returning *",[membershipRecordId,JSON.stringify(snapshot),amount,code,actorId])).rows[0];
}
async function obligationFor(db,input,actorId){
 if(Boolean(input.applicationId)===Boolean(input.membershipRecordId))throw problem(400,"Provide exactly one application ID or membership record ID.","MEMBERSHIP_REFERENCE_REQUIRED");
 if(input.applicationId)return ensureApplicationObligation(db,clean(input.applicationId,64),actorId);
 if(input.membershipRecordId)return ensureRecordObligation(db,clean(input.membershipRecordId,64),input,actorId);
 throw problem(400,"Provide an application ID or membership record ID.","MEMBERSHIP_REFERENCE_REQUIRED");
}
async function balanceFor(db,obligationId){
 const result=await db.query("select * from membership_fee_obligation_balance where obligation_id=$1",[obligationId]);
 if(!result.rows[0])throw problem(404,"Membership fee obligation not found.","OBLIGATION_NOT_FOUND");
 return result.rows[0];
}
async function validateEvidence(db,userId,fileId){
 if(!fileId)return false;
 const file=await db.query("select f.id from file_object f join private_upload_session s on s.file_object_id=f.id where f.id=$1 and f.created_by=$2 and f.visibility='private' and s.user_id=$2 and s.status='confirmed' and s.actual_byte_size=f.byte_size and s.actual_checksum_sha256=f.checksum_sha256",[fileId,userId]);
 if(!file.rows[0])throw problem(400,"Payment evidence must be a confirmed private file uploaded by the Finance user recording this receipt.","INVALID_EVIDENCE");
 return true;
}
async function paymentMethod(db,methodCode,code){
 const method=(await db.query("select * from membership_payment_method where method_code=$1 and enabled=true for share",[methodCode])).rows[0];
 try{return assertMembershipPaymentMethodAvailable(method,code);}catch(error){throw problem(error.statusCode||400,error.message,error.code||"PAYMENT_METHOD_UNAVAILABLE");}
}
async function notifyFinance(db,eventCode,resourceType,resourceId,payload){
 const staff=(await db.query("select distinct ur.user_id from app_user_role ur join app_role r on r.id=ur.role_id where r.role_code='finance_officer' union select distinct up.user_id from app_user_permission up where up.permission_code in ('finance.payment.verify','finance.manage')")).rows;
 const ids=[];
 for(const user of staff){const notification=await createInAppNotification(db,user.user_id,eventCode,resourceType,resourceId,{category:"membership",reviewerQueue:true,actionRequired:true,priority:"high",...payload});if(notification?.id)ids.push(notification.id);}
 return ids;
}
export async function listFeeObligations(identity,filters={}){
 const roles=identity?.roles||[],permissions=identity?.permissions||[];
 if(!roles.includes("finance_officer")&&!roles.includes("system_admin")&&!permissions.some(p=>["finance.view","finance.payment.record","finance.payment.verify","finance.manage"].includes(p)))throw problem(403,"Finance obligation access required.","FORBIDDEN");
 const status=clean(filters.status,20),q=clean(filters.q,100);
 const db=getPool();
 const limit=Math.min(Math.max(Number(filters.limit)||500,1),50000);
 const rows=(await db.query(`select b.*,o.created_at,o.due_date,case when o.due_date<current_date then current_date-o.due_date else 0 end days_past_due,reminders.last_status reminder_status,reminders.last_sent_at,disp.summary disposition_summary,
  a.tracking_reference,a.status application_status,a.user_id,
  mr.membership_number,mr.status membership_status,
  coalesce(p.display_name,concat_ws(' ',p.first_name,p.last_name)) member_name,u.email,
  mp.product_code,mp.name product_name,pending.receipts,pending_dispositions.items
  from membership_fee_obligation_balance b join membership_fee_obligation o on o.id=b.obligation_id
  left join membership_application a on a.id=o.application_id
  left join membership_record mr on mr.id=o.membership_record_id or (o.application_id is not null and mr.application_id=o.application_id)
  left join app_user u on u.id=coalesce(a.user_id,mr.user_id)
  left join person p on p.user_id=u.id
  left join membership_product mp on mp.id=coalesce((select membership_product_id from membership_application where id=o.application_id),(select membership_product_id from membership_record where id=o.membership_record_id))
  left join lateral (select json_agg(json_build_object('id',pt.id,'amount',pt.amount,'currency',pt.currency,'reference',pt.purpose_reference,'createdAt',pt.created_at) order by pt.created_at) receipts from membership_fee_obligation_payment op join payment_transaction pt on pt.id=op.payment_transaction_id where op.obligation_id=o.id and pt.status='pending' and pt.source in ('finance_manual_record','finance_bulk_import')) pending on true
  left join lateral (select json_agg(json_build_object('id',d.id,'type',d.disposition_type,'amount',d.amount,'currency',d.currency,'remark',d.remark,'requestedBy',d.requested_by) order by d.created_at) items from membership_fee_balance_disposition d where d.obligation_id=o.id and d.status='pending') pending_dispositions on true
  left join lateral (select (array_agg(r.status order by r.created_at desc))[1] last_status,max(r.sent_at) last_sent_at from membership_fee_reminder r where r.obligation_id=o.id) reminders on true
  left join lateral (select string_agg(d.disposition_type||':'||d.status,', ' order by d.created_at desc) summary from membership_fee_balance_disposition d where d.obligation_id=o.id and d.status in ('active','pending','approved')) disp on true
  where ($1='' or o.status=$1) and ($2='' or lower(coalesce(p.display_name,'')||' '||coalesce(u.email,'')||' '||coalesce(mr.membership_number,'')||' '||coalesce(a.tracking_reference,'')) like lower('%'||$2||'%'))
  order by (b.outstanding_balance>0) desc,o.due_date nulls last,o.created_at desc limit $3`,[status,q,limit])).rows;
 const totalsByCurrency=(await db.query(`select b.currency,count(*)::int obligation_count,count(*) filter(where b.outstanding_balance>0)::int outstanding_count,
  coalesce(sum(b.amount_due),0)::numeric(14,2) amount_due,coalesce(sum(b.verified_cash),0)::numeric(14,2) verified_cash,
  coalesce(sum(b.approved_non_cash),0)::numeric(14,2) approved_non_cash,coalesce(sum(b.outstanding_balance),0)::numeric(14,2) outstanding_balance,coalesce(sum(b.outstanding_balance) filter(where o.due_date<current_date),0)::numeric(14,2) overdue_balance
  from membership_fee_obligation_balance b join membership_fee_obligation o on o.id=b.obligation_id
  left join membership_application a on a.id=o.application_id
  left join membership_record mr on mr.id=o.membership_record_id or (o.application_id is not null and mr.application_id=o.application_id)
  left join app_user u on u.id=coalesce(a.user_id,mr.user_id) left join person p on p.user_id=u.id
  where ($1='' or o.status=$1) and ($2='' or lower(coalesce(p.display_name,'')||' '||coalesce(u.email,'')||' '||coalesce(mr.membership_number,'')||' '||coalesce(a.tracking_reference,'')) like lower('%'||$2||'%'))
  group by b.currency order by b.currency`,[status,q])).rows;
 const ageingByCurrency=(await db.query(`select b.currency,case when o.due_date is null then 'no_due_date' when o.due_date>=current_date then 'not_due' when current_date-o.due_date<=30 then '1_30_days' when current_date-o.due_date<=60 then '31_60_days' when current_date-o.due_date<=90 then '61_90_days' else 'over_90_days' end ageing_bucket,count(*)::int obligation_count,coalesce(sum(b.outstanding_balance),0)::numeric(14,2) outstanding_balance
  from membership_fee_obligation_balance b join membership_fee_obligation o on o.id=b.obligation_id
  where b.outstanding_balance>0 group by b.currency,ageing_bucket order by b.currency,ageing_bucket`)).rows;
 const dispositionsByType=(await db.query(`select d.currency,d.disposition_type,d.status,count(*)::int record_count,coalesce(sum(d.amount),0)::numeric(14,2) amount
  from membership_fee_balance_disposition d group by d.currency,d.disposition_type,d.status order by d.currency,d.disposition_type,d.status`)).rows;
 const legacyRecords=(await db.query(`select mr.id membership_record_id,mr.membership_number,mr.status membership_status,mp.product_code,mp.name product_name,
  p.display_name member_name,u.email,mr.created_at
  from membership_record mr join membership_product mp on mp.id=mr.membership_product_id
  left join app_user u on u.id=mr.user_id left join person p on p.user_id=u.id
  where mr.source='legacy_import' and mr.status<>'merged'
  and not exists(select 1 from membership_fee_obligation o where o.membership_record_id=mr.id or o.application_id=mr.application_id)
  and ($1='' or lower(coalesce(p.display_name,'')||' '||coalesce(u.email,'')||' '||mr.membership_number) like lower('%'||$1||'%'))
  order by mr.created_at desc limit 200`,[q])).rows;
 return {rows:rows.map(row=>({...row,pending_receipts:row.receipts||[],pending_dispositions:row.items||[]})),legacyRecords,totalsByCurrency,ageingByCurrency,dispositionsByType,total:rows.length};
}
export async function exportFeeObligations(identity,filters={},requestId){
 const result=await listFeeObligations(identity,{...filters,limit:50000});
 const columns=["member_name","email","membership_number","tracking_reference","product_name","currency","amount_due","verified_cash","approved_non_cash","outstanding_balance","due_date","days_past_due","reminder_status","last_sent_at","disposition_summary","status"];
 const rows=result.rows.map(row=>Object.fromEntries(columns.map(key=>[key,row[key]??""])));
 const buffer=createXlsx(rows,columns);
 await getPool().query("insert into audit_log(actor_user_id,action,resource_type,request_id,outcome,metadata) values($1,'finance.membership_fee_obligations_exported','membership_fee_obligation',$2,'success',$3)",[identity.sub,requestId,JSON.stringify({rowCount:rows.length,filters:{status:filters.status||"",q:filters.q||""}})]);
 return {buffer,rowCount:rows.length,filename:"mpa-membership-fee-obligations-"+new Date().toISOString().slice(0,10)+".xlsx",contentType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"};
}
export async function recordMembershipReceipt(identity,input={},requestId){
 financeRecord(identity);
 const amount=money(input.amount),code=currency(input.currency),methodCode=clean(input.paymentMethodCode,40).toLowerCase(),reference=clean(input.reference,180),receivedDate=clean(input.receivedDate,10),idem=clean(input.idempotencyKey,100),evidenceFileId=clean(input.evidenceFileId,64)||null;
 if(!Number.isFinite(amount)||amount<=0)throw problem(400,"Enter the actual amount received; it must be greater than zero.","INVALID_AMOUNT");
 if(!code||!validDate(receivedDate))throw problem(400,"Choose a valid currency and received date.","INVALID_PAYMENT_DATE");
 if(reference.length<4)throw problem(400,"Enter a receipt, bank or transaction reference of at least four characters.","PAYMENT_REFERENCE_REQUIRED");
 if(!/^[A-Za-z0-9_-]{16,100}$/.test(idem))throw problem(400,"Provide a unique idempotency key of 16–100 letters, digits, underscores or dashes.","IDEMPOTENCY_KEY_REQUIRED");
 return withTransaction(async db=>{
  const obligation=await obligationFor(db,input,identity.sub),key="finance-membership:"+idem;
  const existing=(await db.query("select pt.id,pt.amount,pt.currency,pt.status,pt.purpose_reference,op.obligation_id from payment_transaction pt left join membership_fee_obligation_payment op on op.payment_transaction_id=pt.id where pt.idempotency_key=$1 for update of pt",[key])).rows[0];
  if(existing){
   if(Number(existing.amount)!==amount||existing.currency!==code||existing.purpose_reference!==reference||existing.obligation_id!==obligation.id)throw problem(409,"This idempotency key was used for a different receipt or obligation.","IDEMPOTENCY_CONFLICT");
   return {payment:existing,alreadyRecorded:true,obligationId:obligation.id};
  }
  const balance=await balanceFor(db,obligation.id);
  if(code!==obligation.currency)throw problem(400,"Receipt currency must match the fee obligation currency.","PAYMENT_CURRENCY_MISMATCH");
  if(amount>Number(balance.outstanding_balance))throw problem(409,"The receipt exceeds the current outstanding balance. Refresh the obligation before recording.","AMOUNT_EXCEEDS_BALANCE");
  const method=await paymentMethod(db,methodCode,code);
  if(method.method_type==="chapa")throw problem(400,"Hosted checkout cannot be recorded as a manual Finance receipt.","PAYMENT_METHOD_REQUIRES_CHECKOUT");
  if(method.requires_evidence&&!evidenceFileId)throw problem(400,"This payment method requires private receipt evidence.","PAYMENT_EVIDENCE_REQUIRED");
  if(evidenceFileId)await validateEvidence(db,identity.sub,evidenceFileId);
  const reused=(await db.query("select id from payment_transaction where lower(coalesce(purpose_reference,''))=lower($1) and status<>'cancelled' limit 1 for update",[reference])).rows[0];
  if(reused)throw problem(409,"This payment reference is already used by another payment record.","PAYMENT_REFERENCE_ALREADY_USED");
  const snapshot=buildMembershipPaymentMethodSnapshot(method),channel=method.method_type==="bank_transfer"?"bank_transfer":method.method_type==="cash"?"cash":"other";
  const payment=(await db.query(`insert into payment_transaction(provider,idempotency_key,purpose,amount,currency,status,request_payload,channel,submitted_by,purpose_reference,source,payment_method_code,payment_method_snapshot,evidence_file_id)
   values('manual',$1,'membership',$2,$3,'pending',$4::jsonb,$5,$6,$7,'finance_manual_record',$8,$9::jsonb,$10) returning id,status,amount,currency,purpose_reference,created_at`,
   [key,amount,code,JSON.stringify({receivedDate,reference,paymentMethodCode:methodCode,methodSnapshot:snapshot,recordedByFinance:true}),channel,identity.sub,reference,methodCode,JSON.stringify(snapshot),evidenceFileId])).rows[0];
  if(obligation.application_id)await db.query("insert into membership_application_payment(application_id,payment_transaction_id) values($1,$2) on conflict do nothing",[obligation.application_id,payment.id]);
  await db.query("insert into membership_fee_obligation_payment(obligation_id,payment_transaction_id,linked_by) values($1,$2,$3) on conflict(payment_transaction_id) do nothing",[obligation.id,payment.id,identity.sub]);
  await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'finance.membership_receipt_recorded','payment_transaction',$2,$3,'success',$4)",[identity.sub,payment.id,requestId,JSON.stringify({obligationId:obligation.id,amount,currency:code,reference,receivedDate,pendingVerification:true})]);
  await notifyFinance(db,"membership.payment_verification_required","payment_transaction",payment.id,{message:"A manually recorded membership receipt is awaiting individual Finance verification.",actionUrl:"/admin/finance"});
  return {payment,obligationId:obligation.id,verificationRequired:true};
 });
}
export async function verifyMembershipReceipt(identity,paymentId,input={},requestId){
 assertPaymentVerificationAccess(identity);
 const decision=String(input.decision||"approved"),note=clean(input.note,1000);
 if(!["approved","rejected","needs_correction"].includes(decision))throw problem(400,"Choose approved, rejected or needs correction.","INVALID_DECISION");
 return withTransaction(async db=>{
  const link=(await db.query("select obligation_id from membership_fee_obligation_payment where payment_transaction_id=$1 for update",[paymentId])).rows[0];
  if(!link)throw problem(404,"This payment is not linked to a membership fee obligation.","NOT_FOUND");
  const obligation=(await db.query("select * from membership_fee_obligation where id=$1 for update",[link.obligation_id])).rows[0];
  const payment=(await db.query("select * from payment_transaction where id=$1 for update",[paymentId])).rows[0];
  if(!obligation||!payment)throw problem(404,"Payment or fee obligation not found.","NOT_FOUND");
  if(payment.source!=="finance_manual_record"&&payment.source!=="finance_bulk_import")throw problem(409,"Only pending Finance-entered membership receipts can be verified here.","INVALID_PAYMENT_SOURCE");
  if(payment.status!=="pending")throw problem(409,"Only pending receipts can be verified; this record has already been decided.","PAYMENT_NOT_PENDING");
  if((await db.query("select 1 from membership_payment_reversal where payment_transaction_id=$1",[paymentId])).rowCount)throw problem(409,"A reversed receipt cannot be verified again.","PAYMENT_ALREADY_REVERSED");
  if(payment.currency!==obligation.currency)throw problem(409,"Payment currency no longer matches the fee obligation.","PAYMENT_CURRENCY_MISMATCH");
  const balance=await balanceFor(db,obligation.id);
  if(decision==="approved"&&Number(payment.amount)>Number(balance.outstanding_balance))throw problem(409,"The verified receipt would exceed the remaining fee balance. Review the obligation and other receipts.","AMOUNT_EXCEEDS_BALANCE");
  const next=decision==="approved"?"succeeded":decision==="rejected"?"failed":"pending";
  await db.query("insert into payment_verification(payment_transaction_id,verifier_user_id,decision,evidence_checked,note) values($1,$2,$3,$4,$5)",[paymentId,identity.sub,decision,JSON.stringify(input.evidenceChecked||[]),note||null]);
  await db.query("update payment_transaction set status=$1,verified_by=$2,verified_at=now(),verification_note=$3,completed_at=case when $1 in ('succeeded','failed') then now() else completed_at end,updated_at=now() where id=$4",[next,identity.sub,note||null,paymentId]);
  if(decision==="approved"){
   const membershipId=obligation.membership_record_id||(await db.query("select id from membership_record where application_id=$1 order by created_at desc limit 1",[obligation.application_id])).rows[0]?.id||null;
   await db.query("insert into payment_reconciliation(payment_transaction_id,membership_id,reconciliation_status,reconciled_by,reconciled_at,note) values($1,$2,'matched',$3,now(),$4)",[paymentId,membershipId,identity.sub,"Matched to membership fee obligation "+obligation.id]);
  }
  const updated=await balanceFor(db,obligation.id);
  await db.query("update membership_fee_obligation set status=case when $2::numeric=0 then 'settled' else 'open' end,updated_at=now() where id=$1",[obligation.id,updated.outstanding_balance]);
  if(obligation.application_id){
   const app=(await db.query("select user_id,approved_at,status from membership_application where id=$1 for update",[obligation.application_id])).rows[0];
   if(app?.approved_at&&["approved","payment_pending","paid"].includes(app.status)&&Number(updated.outstanding_balance)===0&&app.status!=="activated")await db.query("update membership_application set status='paid',updated_at=now() where id=$1",[obligation.application_id]);
   await createInAppNotification(db,app.user_id,"membership.payment_"+decision,"payment_transaction",paymentId,{category:"membership",message:decision==="approved"?"Finance verified a membership payment. Your remaining balance has been recalculated.":"Finance recorded a decision on your membership payment.",actionUrl:"/membership",eventVersion:requestId||paymentId});
  }else{
   const member=(await db.query("select user_id,source_import_id from membership_record where id=$1",[obligation.membership_record_id])).rows[0];
   if(member?.user_id&&Number(updated.outstanding_balance)===0)await db.query("update member_invitation set expires_at=greatest(expires_at,now()+interval '7 days') where user_id=$1 and import_id=$2 and consumed_at is null",[member.user_id,member.source_import_id]);
   if(member?.user_id)await createInAppNotification(db,member.user_id,"membership.payment_"+decision,"payment_transaction",paymentId,{category:"membership",message:Number(updated.outstanding_balance)>0?"Finance updated your membership payment record. Remaining balance: "+payment.currency+" "+Number(updated.outstanding_balance).toFixed(2)+".":"Finance verified the membership fee in full; your account invitation can now be claimed.",actionUrl:"/membership",eventVersion:requestId||paymentId});
  }
  await db.query("update membership_fee_reminder set status='cancelled' where obligation_id=$1 and status in ('scheduled','queued') and $2::numeric=0",[obligation.id,updated.outstanding_balance]);
  await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'finance.membership_receipt_verified','payment_transaction',$2,$3,'success',$4)",[identity.sub,paymentId,requestId,JSON.stringify({decision,obligationId:obligation.id,amount:payment.amount,currency:payment.currency,outstandingBalance:updated.outstanding_balance})]);
  return {paymentId,decision,balance:updated};
 });
}
export async function recordBalanceDisposition(identity,input={},requestId){
 financeAdjust(identity);
 const type=clean(input.dispositionType,40),remark=clean(input.remark,1000),amount=money(input.amount),code=currency(input.currency),dueDate=clean(input.dueDate,10),idem=clean(input.idempotencyKey,100);
 if(!["will_pay_later","sponsored","honored_member","volunteer_activity_valuated"].includes(type))throw problem(400,"Choose a supported balance disposition.","INVALID_DISPOSITION");
 if(!Number.isFinite(amount)||amount<=0||!code||remark.length<8||! /^[A-Za-z0-9_-]{16,100}$/.test(idem))throw problem(400,"Enter the balance amount, currency, meaningful remark and unique idempotency key.","DISPOSITION_DETAILS_REQUIRED");
 if(type==="will_pay_later"&&!validDate(dueDate))throw problem(400,"Will-pay-later requires a due date in YYYY-MM-DD format.","DUE_DATE_REQUIRED");
 const details=input.details&&typeof input.details==="object"?input.details:{};
 if(type==="sponsored"&&clean(details.sponsorName,180).length<2)throw problem(400,"Enter the sponsor name for sponsored balance coverage.","SPONSOR_REQUIRED");
 if(type==="honored_member"&&clean(details.approvalReference,180).length<4)throw problem(400,"Enter the honor approval reference.","HONOR_APPROVAL_REQUIRED");
 if(type==="volunteer_activity_valuated"&&(clean(details.activityReference,180).length<4||clean(details.valuationDescription,500).length<8))throw problem(400,"Enter the volunteer activity reference and valuation description.","VOLUNTEER_VALUATION_REQUIRED");
 return withTransaction(async db=>{
  const obligation=await obligationFor(db,input,identity.sub);
  const existing=(await db.query("select * from membership_fee_balance_disposition where idempotency_key=$1 for update",[idem])).rows[0];
  if(existing){if(existing.obligation_id!==obligation.id||existing.disposition_type!==type||Number(existing.amount)!==amount||existing.currency!==code)throw problem(409,"This disposition idempotency key was used for different details.","IDEMPOTENCY_CONFLICT");return {disposition:existing,alreadyRecorded:true,approvalRequired:type!=="will_pay_later",balance:await balanceFor(db,obligation.id)};}
  const balance=await balanceFor(db,obligation.id);
  if(code!==obligation.currency||amount>Number(balance.outstanding_balance))throw problem(409,"Disposition amount must use the obligation currency and cannot exceed its outstanding balance.","DISPOSITION_EXCEEDS_BALANCE");
  const status=type==="will_pay_later"?"active":"pending";
  const row=(await db.query("insert into membership_fee_balance_disposition(obligation_id,disposition_type,amount,currency,status,due_date,remark,details,requested_by,idempotency_key) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *",[obligation.id,type,amount,code,status,type==="will_pay_later"?dueDate:null,remark,JSON.stringify(details),identity.sub,idem])).rows[0];
  if(type==="will_pay_later"){await db.query("update membership_fee_obligation set due_date=$1,status='open',updated_at=now() where id=$2",[dueDate,obligation.id]);await db.query("update membership_fee_reminder set status='cancelled' where obligation_id=$1 and status in ('scheduled','queued')",[obligation.id]);}
  await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'finance.membership_balance_disposition_recorded','membership_fee_balance_disposition',$2,$3,'success',$4)",[identity.sub,row.id,requestId,JSON.stringify({obligationId:obligation.id,type,amount,currency:code,dueDate:dueDate||null,status,remark})]);
  return {disposition:row,approvalRequired:type!=="will_pay_later",balance};
 });
}
export async function decideBalanceDisposition(identity,dispositionId,input={},requestId){
 financeAdjust(identity);const decision=clean(input.decision,20),note=clean(input.note,1000);
 if(!["approved","rejected"].includes(decision))throw problem(400,"Choose approved or rejected.","INVALID_DECISION");
 return withTransaction(async db=>{
  const row=(await db.query("select * from membership_fee_balance_disposition where id=$1 for update",[dispositionId])).rows[0];
  if(!row)throw problem(404,"Balance disposition not found.","NOT_FOUND");
  if(row.disposition_type==="will_pay_later")throw problem(409,"Will-pay-later records do not waive or settle a balance and do not require approval.","DISPOSITION_NOT_APPROVABLE");
  if(row.status!=="pending")throw problem(409,"Only pending balance dispositions can be decided.","DISPOSITION_NOT_PENDING");
  if(row.requested_by===identity.sub)throw problem(403,"A different Finance officer must approve this non-cash settlement (maker/checker separation).","MAKER_CHECKER_REQUIRED");
  const obligation=(await db.query("select * from membership_fee_obligation where id=$1 for update",[row.obligation_id])).rows[0],balance=await balanceFor(db,row.obligation_id);
  if(decision==="approved"&&(row.currency!==obligation.currency||Number(row.amount)>Number(balance.outstanding_balance)))throw problem(409,"The proposed non-cash settlement now exceeds the outstanding balance or uses a different currency.","DISPOSITION_EXCEEDS_BALANCE");
  await db.query("update membership_fee_balance_disposition set status=$1,approved_by=$2,approved_at=now(),decision_note=$3,updated_at=now() where id=$4",[decision,identity.sub,note||null,dispositionId]);
  if(decision==="approved"){
   await db.query("insert into membership_fee_adjustment(obligation_id,adjustment_type,amount,currency,status,remark,details,requested_by,approved_by,approved_at,decision_note) values($1,$2,$3,$4,'approved',$5,$6,$7,$8,now(),$9)",[row.obligation_id,row.disposition_type,row.amount,row.currency,row.remark,row.details,row.requested_by,identity.sub,note||null]);
   const updated=await balanceFor(db,row.obligation_id);
   await db.query("update membership_fee_obligation set status=case when $2::numeric=0 then 'settled' else 'open' end,updated_at=now() where id=$1",[row.obligation_id,updated.outstanding_balance]);
   if(obligation.application_id&&Number(updated.outstanding_balance)===0){const app=(await db.query("select approved_at,status from membership_application where id=$1 for update",[obligation.application_id])).rows[0];if(app?.approved_at&&["approved","payment_pending","paid"].includes(app.status)&&app.status!=="activated")await db.query("update membership_application set status='paid',updated_at=now() where id=$1",[obligation.application_id]);}
   if(obligation.membership_record_id&&Number(updated.outstanding_balance)===0){const member=(await db.query("select user_id,source_import_id from membership_record where id=$1",[obligation.membership_record_id])).rows[0];if(member?.user_id)await db.query("update member_invitation set expires_at=greatest(expires_at,now()+interval '7 days') where user_id=$1 and import_id=$2 and consumed_at is null",[member.user_id,member.source_import_id]);}
   await db.query("update membership_fee_reminder set status='cancelled' where obligation_id=$1 and status in ('scheduled','queued') and $2::numeric=0",[row.obligation_id,updated.outstanding_balance]);
  }
  await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'finance.membership_balance_disposition_decided','membership_fee_balance_disposition',$2,$3,'success',$4)",[identity.sub,dispositionId,requestId,JSON.stringify({decision,obligationId:row.obligation_id,dispositionType:row.disposition_type,amount:row.amount,currency:row.currency,note})]);
  return {dispositionId,decision,balance:await balanceFor(db,row.obligation_id)};
 });
}
const PAYMENT_IMPORT_COLUMNS=["application_id","membership_number","amount","currency","received_date","payment_method_code","payment_reference","evidence_reference","evidence_file_id","payer_note"];
export function membershipPaymentImportTemplate(identity){financeImport(identity);return createXlsx([],PAYMENT_IMPORT_COLUMNS);}
function parsePaymentRows(base64){
 let parsed;try{parsed=parseXlsxRows(Buffer.from(String(base64||""),"base64"));}catch(error){throw problem(400,error.message||"The payment workbook could not be read.","INVALID_XLSX");}
 const missing=PAYMENT_IMPORT_COLUMNS.slice(0,7).filter(key=>!parsed.headers.includes(key));
 if(missing.length)throw problem(400,"The payment workbook is missing required columns: "+missing.join(", "),"MISSING_COLUMNS");
 return parsed.rows.map((raw,index)=>({rowNumber:index+2,raw:Object.fromEntries(PAYMENT_IMPORT_COLUMNS.map(key=>[key,clean(raw[key],500)])),errors:[]}));
}
export async function previewMembershipPaymentImport(identity,input={},requestId){
 financeImport(identity);const base64=String(input.xlsxBase64||"");if(!base64||base64.length>12*1024*1024)throw problem(400,"Upload an XLSX payment workbook up to 9 MiB.","XLSX_REQUIRED");
 const rows=parsePaymentRows(base64),db=getPool(),seen=new Set(),result=[];
 for(const row of rows){
  const x=row.raw,amount=money(x.amount),code=currency(x.currency),ref=clean(x.payment_reference,180),methodCode=clean(x.payment_method_code,40).toLowerCase();
  if(Boolean(x.application_id)===Boolean(x.membership_number))row.errors.push("Provide exactly one application_id or membership_number.");
  if(!Number.isFinite(amount)||amount<=0)row.errors.push("amount must be greater than zero.");
  if(!code)row.errors.push("currency must be a three-letter ISO code.");
  if(!validDate(x.received_date))row.errors.push("received_date must use YYYY-MM-DD.");
  if(ref.length<4)row.errors.push("payment_reference must contain at least four characters.");
  const key=ref.toLowerCase();if(key&&seen.has(key))row.errors.push("payment_reference is duplicated in this workbook.");if(key)seen.add(key);
  let obligation=null;
  if(!row.errors.length){
   const found=x.application_id
    ?await db.query("select o.id,o.currency,b.outstanding_balance,a.user_id from membership_fee_obligation o join membership_fee_obligation_balance b on b.obligation_id=o.id join membership_application a on a.id=o.application_id where o.application_id=$1",[x.application_id])
    :await db.query("select o.id,o.currency,b.outstanding_balance,mr.user_id from membership_fee_obligation o join membership_fee_obligation_balance b on b.obligation_id=o.id join membership_record mr on mr.id=o.membership_record_id where mr.membership_number=$1",[x.membership_number]);
   obligation=found.rows[0]||null;
   if(!obligation)row.errors.push("No matching fee obligation was found. Create/confirm the obligation before importing receipts.");
   else if(code!==obligation.currency)row.errors.push("currency does not match the fee obligation.");
   else if(amount>Number(obligation.outstanding_balance))row.errors.push("amount exceeds the current outstanding balance.");
   const method=(await db.query("select * from membership_payment_method where method_code=$1 and enabled=true",[methodCode])).rows[0];
   if(!method)row.errors.push("payment_method_code is not an enabled Finance payment method.");
   else{try{assertMembershipPaymentMethodAvailable(method,code);if(method.method_type==="chapa")row.errors.push("Hosted checkout cannot be imported as a manual receipt.");if(method.requires_evidence&&!x.evidence_file_id)row.errors.push("This method requires evidence_file_id.");}catch(error){row.errors.push(error.message);}}
   const reused=await db.query("select id from payment_transaction where lower(coalesce(purpose_reference,''))=lower($1) and status<>'cancelled' limit 1",[ref]);
   if(reused.rowCount)row.errors.push("Payment reference is already allocated to another payment.");
  }
  row.obligationId=obligation?.id||null;row.errors=[...new Set(row.errors)];result.push(row);
 }
 const batchId=randomUUID(),errorCount=result.filter(row=>row.errors.length).length;
 await withTransaction(async tx=>{
  await tx.query("insert into membership_payment_import_batch(id,filename,status,row_count,error_count,imported_by,metadata) values($1,$2,$3,$4,$5,$6,$7)",[batchId,clean(input.filename||"membership-payments.xlsx",255),errorCount?"previewed":"validated",result.length,errorCount,identity.sub,JSON.stringify({requestId})]);
  for(const row of result)await tx.query("insert into membership_payment_import_row(batch_id,row_number,row_data,status,errors) values($1,$2,$3,$4,$5)",[batchId,row.rowNumber,JSON.stringify({...row.raw,obligationId:row.obligationId}),row.errors.length?"error":"pending",JSON.stringify(row.errors)]);
 });
 return {batchId,rowCount:result.length,errorCount,canApply:errorCount===0,rows:result.map(row=>({rowNumber:row.rowNumber,memberReference:row.raw.application_id||row.raw.membership_number,amount:row.raw.amount,currency:row.raw.currency,reference:row.raw.payment_reference,errors:row.errors}))};
}
export async function applyMembershipPaymentImport(identity,batchId,input={},requestId){
 financeImport(identity);const reason=clean(input.reason,500);if(reason.length<8)throw problem(400,"Enter an audit reason of at least eight characters.","AUDIT_REASON_REQUIRED");
 return withTransaction(async db=>{
  const batch=(await db.query("select * from membership_payment_import_batch where id=$1 for update",[batchId])).rows[0];
  if(!batch)throw problem(404,"Payment import batch not found.","NOT_FOUND");
  if(batch.status==="applied")return {batchId,alreadyApplied:true,createdCount:0};
  if(batch.status!=="validated"||batch.error_count!==0)throw problem(409,"Only a validated, error-free payment batch can be applied.","IMPORT_NOT_VALIDATED");
  const rows=(await db.query("select * from membership_payment_import_row where batch_id=$1 order by row_number for update",[batchId])).rows;let createdCount=0;
  for(const row of rows){
   const x=row.row_data,obligation=(await db.query("select * from membership_fee_obligation where id=$1 for update",[x.obligationId])).rows[0];
   if(!obligation)throw problem(409,"A fee obligation changed after preview; no payment batch was applied.","OBLIGATION_CHANGED");
   const balance=await balanceFor(db,obligation.id);
   if(Number(x.amount)>Number(balance.outstanding_balance))throw problem(409,"A payment row now exceeds the outstanding balance; create a fresh preview.","AMOUNT_EXCEEDS_BALANCE");
   const method=(await db.query("select * from membership_payment_method where method_code=$1 and enabled=true for share",[x.payment_method_code])).rows[0];
   if(!method)throw problem(409,"A configured payment method changed after preview; create a fresh batch.","PAYMENT_METHOD_UNAVAILABLE");
   if(method.requires_evidence&&!x.evidence_file_id)throw problem(409,"Required payment evidence is missing from a bulk row.","PAYMENT_EVIDENCE_REQUIRED");
   if(x.evidence_file_id)await validateEvidence(db,identity.sub,x.evidence_file_id);
   const snapshot=buildMembershipPaymentMethodSnapshot(method),channel=method.method_type==="bank_transfer"?"bank_transfer":method.method_type==="cash"?"cash":"other";
   const idempotencyKey="bulk-membership:"+batchId+":"+row.row_number;
   const payment=(await db.query(`insert into payment_transaction(provider,idempotency_key,purpose,amount,currency,status,request_payload,channel,submitted_by,purpose_reference,source,payment_method_code,payment_method_snapshot,evidence_file_id)
    values('manual',$1,'membership',$2,$3,'pending',$4::jsonb,$5,$6,$7,'finance_bulk_import',$8,$9::jsonb,$10) returning id`,
    [idempotencyKey,money(x.amount),x.currency,JSON.stringify({receivedDate:x.received_date,reference:x.payment_reference,evidenceReference:x.evidence_reference,payerNote:x.payer_note,importBatchId:batchId,importRow:row.row_number,methodSnapshot:snapshot}),channel,identity.sub,x.payment_reference,x.payment_method_code,JSON.stringify(snapshot),x.evidence_file_id||null])).rows[0];
   if(obligation.application_id)await db.query("insert into membership_application_payment(application_id,payment_transaction_id) values($1,$2) on conflict do nothing",[obligation.application_id,payment.id]);
   await db.query("insert into membership_fee_obligation_payment(obligation_id,payment_transaction_id,linked_by) values($1,$2,$3) on conflict(payment_transaction_id) do nothing",[obligation.id,payment.id,identity.sub]);
   await db.query("update membership_payment_import_row set status='created',payment_transaction_id=$1 where id=$2",[payment.id,row.id]);
   await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'finance.membership_bulk_receipt_created','payment_transaction',$2,$3,'success',$4)",[identity.sub,payment.id,requestId,JSON.stringify({batchId,rowNumber:row.row_number,obligationId:obligation.id,amount:x.amount,currency:x.currency,verificationRequired:true,reason})]);
   createdCount++;
  }
  await db.query("update membership_payment_import_batch set status='applied',applied_at=now() where id=$1",[batchId]);
  await notifyFinance(db,"membership.bulk_payment_import_applied","membership_payment_import_batch",batchId,{message:createdCount+" pending membership receipts were created from a Finance import. Each receipt requires individual verification.",actionUrl:"/admin/finance"});
  return {batchId,status:"applied",createdCount,verificationRequired:true};
 });
}
export async function scheduleMembershipFeeReminders(batchSize=100){
 const limit=Math.min(Math.max(Number(batchSize)||100,1),500),db=getPool();
 return withTransaction(async tx=>{
  const obligations=(await tx.query(`select b.obligation_id,b.application_id,b.membership_record_id,b.outstanding_balance,b.currency,o.due_date,
   coalesce(a.user_id,mr.user_id) user_id,(o.due_date-current_date) days_until_due
   from membership_fee_obligation_balance b join membership_fee_obligation o on o.id=b.obligation_id
   left join membership_application a on a.id=o.application_id
   left join membership_record mr on mr.id=o.membership_record_id
   where b.outstanding_balance>0 and o.status='open' and o.due_date is not null and o.due_date<=current_date+3
   and exists(select 1 from membership_fee_balance_disposition d where d.obligation_id=o.id and d.disposition_type='will_pay_later' and d.status='active' and d.due_date<=current_date+3)
   order by o.due_date limit $1 for update of o skip locked`,[limit])).rows;
  let sent=0;
  for(const item of obligations){
   const key="membership-balance:"+item.obligation_id+":"+String(item.due_date)+":"+Number(item.outstanding_balance).toFixed(2);
   const reminder=(await tx.query("insert into membership_fee_reminder(obligation_id,reminder_key,due_balance,currency,scheduled_for,status) values($1,$2,$3,$4,now(),'queued') on conflict(reminder_key) do nothing returning id",[item.obligation_id,key,item.outstanding_balance,item.currency])).rows[0];
   if(!reminder)continue;
   const message="A membership balance of "+item.currency+" "+Number(item.outstanding_balance).toFixed(2)+" remains due"+(Number(item.days_until_due)>0?" in "+item.days_until_due+" day(s)":" (overdue)")+". Record or confirm your next payment to update the balance.";
   const memberNotification=item.user_id?await createInAppNotification(tx,item.user_id,"membership.balance_due","membership_fee_obligation",item.obligation_id,{category:"membership",title:"Membership balance reminder",message,actionRequired:true,priority:"normal",actionUrl:"/membership",dedupeKey:key}):null;
   const staffNotifications=await notifyFinance(tx,"membership.balance_due_staff","membership_fee_obligation",item.obligation_id,{message:"Member balance "+item.currency+" "+Number(item.outstanding_balance).toFixed(2)+" is due. Review the Finance obligation.",actionUrl:"/admin/finance",dedupeKey:key});
   await tx.query("update membership_fee_reminder set status='queued',member_outbox_id=$1,staff_outbox_id=$2 where id=$3",[memberNotification?.id||null,staffNotifications[0]||null,reminder.id]);sent++;
  }
  await tx.query("update membership_fee_reminder r set status='cancelled' from membership_fee_obligation_balance b where r.obligation_id=b.obligation_id and r.status in ('scheduled','queued') and b.outstanding_balance=0");
  return {processed:obligations.length,sent};
 });
}

export async function reverseMembershipRecordReceipt(identity,paymentId,input={},requestId){
 assertPaymentReversalAccess(identity);
 const reason=clean(input.reason,1000),type=input.reversalType==="reversal"?"reversal":"refund",evidenceReference=clean(input.evidenceReference,300)||null;
 if(reason.length<8)throw problem(400,"Enter a reversal reason of at least eight characters.","REVERSAL_REASON_REQUIRED");
 return withTransaction(async db=>{
  const link=(await db.query("select obligation_id from membership_fee_obligation_payment where payment_transaction_id=$1 for update",[paymentId])).rows[0];
  if(!link)throw problem(404,"Receipt is not linked to a fee obligation.","NOT_FOUND");
  const obligation=(await db.query("select * from membership_fee_obligation where id=$1 for update",[link.obligation_id])).rows[0];
  const payment=(await db.query("select * from payment_transaction where id=$1 for update",[paymentId])).rows[0];
  if(!obligation||!payment)throw problem(404,"Receipt or fee obligation not found.","NOT_FOUND");
  if(obligation.application_id)throw problem(409,"Application-linked receipts must use the existing membership payment reversal workflow.","USE_APPLICATION_REVERSAL");
  if(!["finance_manual_record","finance_bulk_import"].includes(payment.source)||payment.status!=="succeeded")throw problem(409,"Only individually verified Finance-entered receipts can be reversed here.","PAYMENT_NOT_REVERSIBLE");
  if((await db.query("select 1 from membership_payment_reversal where payment_transaction_id=$1",[paymentId])).rowCount)throw problem(409,"This receipt has already been reversed.","PAYMENT_ALREADY_REVERSED");
  const reversal=(await db.query("insert into membership_payment_reversal(payment_transaction_id,application_id,membership_record_id,reversal_type,reason,evidence_reference,reversed_by,metadata) values($1,null,$2,$3,$4,$5,$6,$7) returning id",[paymentId,obligation.membership_record_id,type,reason,evidenceReference,identity.sub,JSON.stringify({source:payment.source,obligationId:obligation.id})])).rows[0];
  await db.query("update payment_transaction set status='refunded',updated_at=now(),completed_at=coalesce(completed_at,now()),verification_note=$1 where id=$2",[reason,paymentId]);
  await db.query("update payment_reconciliation set reconciliation_status='disputed',reconciled_by=$1,reconciled_at=now(),note=concat_ws(' | ',note,$2::text) where payment_transaction_id=$3",[identity.sub,"Finance "+type+" recorded: "+reason,paymentId]);
  await db.query("update membership_fee_obligation set status='open',updated_at=now() where id=$1",[obligation.id]);
  const balance=await balanceFor(db,obligation.id);
  if(Number(balance.outstanding_balance)>0&&obligation.membership_record_id)await db.query("update membership_record set status='suspended',updated_at=now() where id=$1 and status='active'",[obligation.membership_record_id]);
  await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'finance.membership_receipt_reversed','payment_transaction',$2,$3,'success',$4)",[identity.sub,paymentId,requestId,JSON.stringify({obligationId:obligation.id,reversalId:reversal.id,type,reason,evidenceReference,outstandingBalance:balance.outstanding_balance})]);
  const user=(await db.query("select user_id from membership_record where id=$1",[obligation.membership_record_id])).rows[0];
  if(user?.user_id)await createInAppNotification(db,user.user_id,"membership.payment_reversed","payment_transaction",paymentId,{category:"membership",message:"A Finance-verified membership receipt was reversed. Your outstanding balance has been recalculated.",actionUrl:"/membership",eventVersion:reversal.id});
  return {paymentId,reversalId:reversal.id,balance};
 });
}
