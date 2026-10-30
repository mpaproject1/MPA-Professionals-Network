import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getPool, withTransaction } from "./db.js";

const fail=(status,message,code)=>Object.assign(new Error(message),{statusCode:status,code});
const hash=value=>createHash("sha256").update(value).digest("hex");
const clean=(value,max=500)=>String(value??"").trim().slice(0,max);
const allowedTypes=new Set(["member","organization","sponsor","donor","other"]);
const allowedMethods=new Set(["bank_transfer","cash","mobile_money","cheque","card","other"]);
const currencyPattern=/^[A-Z]{3}$/;

function assertFinance(identity, permission="finance.payment.record"){
  const roles=identity?.roles||[],permissions=identity?.permissions||[];
  if(roles.some(r=>["finance_officer","system_admin","admin"].includes(r))||permissions.includes("finance.manage")||permissions.includes(permission))return;
  throw fail(403,"You do not have permission to manage finance receipts.","FORBIDDEN");
}
function safeReceipt(row){
  return {id:row.id,receiptNumber:row.receipt_number,payerType:row.payer_type,payerName:row.payer_name,payerEmail:row.payer_email,
    payerUserId:row.payer_user_id,organizationName:row.organization_name,amount:row.amount,currency:row.currency,purpose:row.purpose,
    paymentMethod:row.payment_method,paymentDate:row.payment_date,bankName:row.bank_name,bankReference:row.bank_reference,
    status:row.status,notes:row.notes,recordedAt:row.created_at,verifiedAt:row.verified_at,verifiedBy:row.verified_by,
    verificationNote:row.verification_note,evidenceFileId:row.evidence_file_id,voucherId:row.voucher_id||null};
}
export async function recordManualFinancePayment(identity,input,requestId){
  assertFinance(identity);
  const payerType=clean(input?.payerType,30),payerName=clean(input?.payerName,180),amount=String(input?.amount??"").trim(),currency=clean(input?.currency,3).toUpperCase();
  const purpose=clean(input?.purpose,500),method=clean(input?.paymentMethod,40),paymentDate=clean(input?.paymentDate,30);
  if(!allowedTypes.has(payerType))throw fail(400,"Choose a supported payer type.","INVALID_PAYER_TYPE");
  if(!payerName)throw fail(400,"Payer name is required.","PAYER_NAME_REQUIRED");
  if(!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(amount)||Number(amount)<=0)throw fail(400,"Enter a positive amount with no more than two decimal places.","INVALID_AMOUNT");
  if(!currencyPattern.test(currency))throw fail(400,"Use a three-letter ISO currency code.","INVALID_CURRENCY");
  if(!purpose)throw fail(400,"Payment purpose is required.","PURPOSE_REQUIRED");
  if(!allowedMethods.has(method))throw fail(400,"Choose a supported payment method.","INVALID_PAYMENT_METHOD");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)||Number.isNaN(Date.parse(paymentDate)))throw fail(400,"Enter a valid payment date.","INVALID_PAYMENT_DATE");
  const payerUserId=input?.payerUserId?clean(input.payerUserId,64):null;
  const evidenceFileId=input?.evidenceFileId?clean(input.evidenceFileId,64):null;
  const db=getPool();
  return withTransaction(async tx=>{
    if(payerUserId){
      const user=await tx.query("select id from app_user where id=$1 and status='active'",[payerUserId]);
      if(!user.rows[0])throw fail(400,"The selected user account is not active or no longer exists.","PAYER_USER_NOT_FOUND");
    }
    if(evidenceFileId){
      const file=await tx.query("select id from file_object where id=$1 and created_by=$2 and visibility='private'",[evidenceFileId,identity.sub]);
      if(!file.rows[0])throw fail(403,"Attach a confirmed private receipt uploaded by your finance account.","EVIDENCE_FILE_NOT_OWNED");
    }
    const receiptNumber="MPA-FIN-"+new Date().getUTCFullYear()+"-"+randomUUID().replaceAll("-","").slice(0,12).toUpperCase();
    const row=(await tx.query(`insert into finance_payment_record
      (receipt_number,payer_type,payer_name,payer_email,payer_phone,payer_user_id,organization_name,amount,currency,purpose,payment_method,payment_date,bank_name,bank_reference,external_reference,evidence_file_id,notes,status,recorded_by,request_id)
      values($1,$2,$3,$4,$5,$6,$7,$8::numeric,$9,$10,$11,$12::date,$13,$14,$15,$16,$17,'recorded',$18,$19)
      returning *`,[receiptNumber,payerType,payerName,clean(input.payerEmail,254)||null,clean(input.payerPhone,60)||null,payerUserId,
      clean(input.organizationName,180)||null,amount,currency,purpose,method,paymentDate,clean(input.bankName,180)||null,
      clean(input.bankReference,120)||null,clean(input.externalReference,120)||null,evidenceFileId,clean(input.notes,4000)||null,identity.sub,requestId||null])).rows[0];
    await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'finance.manual_payment_recorded','finance_payment_record',$2,$3,'success',$4)",
      [identity.sub,row.id,requestId||null,JSON.stringify({receiptNumber,payerType,amount,currency,paymentMethod:method,evidenceAttached:Boolean(evidenceFileId),linkedUser:Boolean(payerUserId)})]);
    return safeReceipt(row);
  });
}
export async function listManualFinancePayments(identity,{q="",status="",limit=50,offset=0}={}){
  assertFinance(identity,"finance.view");
  const db=getPool(),search=clean(q,100),state=clean(status,30),take=Math.min(Math.max(Number(limit)||50,1),100),skip=Math.max(Number(offset)||0,0);
  const result=await db.query(`select p.*,v.id voucher_id from finance_payment_record p left join finance_payment_voucher v on v.payment_record_id=p.id and v.revoked_at is null
    where ($1='' or p.status=$1) and ($2='' or p.receipt_number ilike '%'||$2||'%' or p.payer_name ilike '%'||$2||'%' or p.bank_reference ilike '%'||$2||'%' or p.external_reference ilike '%'||$2||'%')
    order by (p.status='recorded') desc,p.payment_date desc,p.created_at desc limit $3 offset $4`,[state,search,take,skip]);
  const total=Number((await db.query("select count(*)::int total from finance_payment_record where ($1='' or status=$1) and ($2='' or receipt_number ilike '%'||$2||'%' or payer_name ilike '%'||$2||'%' or bank_reference ilike '%'||$2||'%' or external_reference ilike '%'||$2||'%')",[state,search])).rows[0]?.total||0);
  return {items:result.rows.map(safeReceipt),total,limit:take,offset:skip,hasMore:skip+result.rows.length<total};
}
export async function decideManualFinancePayment(identity,id,input,requestId){
  assertFinance(identity,"finance.payment.verify");
  const decision=clean(input?.decision,20),note=clean(input?.note,1000);
  if(!["verified","rejected"].includes(decision))throw fail(400,"Choose verified or rejected.","INVALID_PAYMENT_DECISION");
  if(decision==="rejected"&&note.length<8)throw fail(400,"A clear reason of at least eight characters is required when rejecting a payment.","REJECTION_REASON_REQUIRED");
  return withTransaction(async tx=>{
    const row=(await tx.query("select * from finance_payment_record where id=$1 for update",[id])).rows[0];
    if(!row)throw fail(404,"Finance payment record not found.","NOT_FOUND");
    if(row.status!=="recorded")throw fail(409,"Only a recorded payment can receive its first verification decision.","INVALID_STATE");
    const updated=(await tx.query("update finance_payment_record set status=$2,verified_at=case when $2='verified' then now() else null end,verified_by=$3,verification_note=$4,updated_at=now() where id=$1 returning *",[id,decision,identity.sub,note||null])).rows[0];
    await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,$2,'finance_payment_record',$3,$4,'success',$5)",
      [identity.sub,decision==="verified"?"finance.manual_payment_verified":"finance.manual_payment_rejected",id,requestId||null,JSON.stringify({receiptNumber:row.receipt_number,note})]);
    return safeReceipt(updated);
  });
}
export async function issueFinancePaymentVoucher(identity,id,requestId){
  assertFinance(identity,"finance.voucher.issue");
  return withTransaction(async tx=>{
    const row=(await tx.query("select * from finance_payment_record where id=$1 for update",[id])).rows[0];
    if(!row)throw fail(404,"Finance payment record not found.","NOT_FOUND");
    if(row.status!=="verified")throw fail(409,"A payment voucher can only be issued for a verified payment.","PAYMENT_NOT_VERIFIED");
    const active=(await tx.query("select id,voucher_number from finance_payment_voucher where payment_record_id=$1 and revoked_at is null",[id])).rows[0];
    if(active)return {voucherId:active.id,voucherNumber:active.voucher_number,verificationPath:"/finance/verify/"+active.id,alreadyIssued:true};
    const token=randomBytes(32).toString("base64url"),voucherNumber="MPA-VCH-"+new Date().getUTCFullYear()+"-"+randomUUID().replaceAll("-","").slice(0,12).toUpperCase();
    const voucher=(await tx.query("insert into finance_payment_voucher(payment_record_id,voucher_number,verification_token_sha256,issued_by) values($1,$2,$3,$4) returning id,voucher_number,issued_at",[id,voucherNumber,hash(token),identity.sub])).rows[0];
    await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'finance.payment_voucher_issued','finance_payment_voucher',$2,$3,'success',$4)",[identity.sub,voucher.id,requestId||null,JSON.stringify({voucherNumber,paymentRecordId:id})]);
    return {voucherId:voucher.id,voucherNumber:voucher.voucher_number,token,verificationPath:"/finance/verify/"+voucher.id+"?token="+encodeURIComponent(token),issuedAt:voucher.issued_at};
  });
}
export async function verifyFinancePaymentVoucher(voucherId,token){
  const result=await getPool().query(`select v.id,v.voucher_number,v.issued_at,v.revoked_at,p.receipt_number,p.payer_type,p.payer_name,p.organization_name,p.amount,p.currency,p.purpose,p.payment_date,p.payment_method,p.status,p.verified_at
    from finance_payment_voucher v join finance_payment_record p on p.id=v.payment_record_id where v.id=$1`,[voucherId]);
  const row=result.rows[0];
  if(!row||row.revoked_at||row.status!=="verified"||!token||hash(String(token))!==(await getPool().query("select verification_token_sha256 from finance_payment_voucher where id=$1",[voucherId])).rows[0]?.verification_token_sha256)
    throw fail(404,"This payment voucher is invalid, revoked or unavailable.","VOUCHER_INVALID");
  return {valid:true,status:"verified",voucherNumber:row.voucher_number,receiptNumber:row.receipt_number,payerName:row.payer_name,payerType:row.payer_type,organizationName:row.organization_name,amount:row.amount,currency:row.currency,purpose:row.purpose,paymentDate:row.payment_date,paymentMethod:row.payment_method,verifiedAt:row.verified_at,issuedAt:row.issued_at};
}
