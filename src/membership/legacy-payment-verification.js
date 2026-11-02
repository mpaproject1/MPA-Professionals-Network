import { createHash } from "node:crypto";
import { getPool, withTransaction } from "../platform/db.js";
import { createInAppNotification } from "../platform/notifications.js";
import { assertFinancePaymentQueueAccess, assertPaymentReversalAccess, assertPaymentVerificationAccess } from "../platform/workspace-authorization.js";

function problem(statusCode, message, code = "BUSINESS_RULE") {
  return Object.assign(new Error(message), { statusCode, code });
}

const METHODS = new Set(["bank_transfer", "telebirr", "cash", "mobile_money", "other"]);
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const verifiedLegacyPayment = `not exists (
  select 1 from membership_fee_obligation o
  join membership_fee_obligation_balance b on b.obligation_id=o.id
  where o.membership_record_id=mr.id and b.outstanding_balance=0
)`;

export async function listLegacyMembershipPaymentVerificationQueue(identity) {
  assertFinancePaymentQueueAccess(identity);
  const result = await getPool().query(`
    select mr.id membership_id, mr.membership_number, mr.status membership_status,
      mr.start_date, mr.end_date, mr.created_at imported_at,
      mp.name product_name, mp.product_code,
      p.display_name member_name, u.email,
      mr.legacy_payload->>'payment_reference' imported_payment_reference,
      mr.legacy_payload->>'payment_amount' imported_payment_amount,
      mr.legacy_payload->>'payment_currency' imported_payment_currency,
      mr.legacy_payload->>'payment_date' imported_payment_date,
      mr.legacy_payload->>'payment_method' imported_payment_method,
      mr.legacy_payload->>'payment_evidence_reference' imported_evidence_reference,
      o.amount_due confirmed_fee_amount,o.currency fee_currency,b.verified_cash,b.approved_non_cash,b.outstanding_balance,
      inv.expires_at invitation_expires_at, inv.consumed_at invitation_claimed_at
    from membership_record mr
    join membership_product mp on mp.id=mr.membership_product_id
    left join app_user u on u.id=mr.user_id
    left join person p on p.user_id=mr.user_id
    left join membership_fee_obligation o on o.membership_record_id=mr.id or o.application_id=mr.application_id
    left join membership_fee_obligation_balance b on b.obligation_id=o.id
    left join lateral (
      select expires_at,consumed_at from member_invitation
      where user_id=mr.user_id and import_id=mr.source_import_id
      order by created_at desc limit 1
    ) inv on true
    where mr.source='legacy_import' and mr.status<>'merged'
      and ${verifiedLegacyPayment}
    order by mr.created_at desc
    limit 500
  `);
  return { rows: result.rows, total: result.rows.length };
}

export async function verifyLegacyMembershipPayment(identity, membershipId, input = {}, requestId) {
  assertPaymentVerificationAccess(identity);
  const amountText=String(input.amount??"").trim(),amount=Number(amountText);
  const feeAmountText=String(input.feeAmount??"").trim(),feeAmount=feeAmountText?Number(feeAmountText):null;
  const currency=String(input.currency||"").trim().toUpperCase();
  const paymentReference=String(input.paymentReference||"").trim().slice(0,180);
  const paymentDate=String(input.paymentDate||"").trim();
  const paymentMethod=String(input.paymentMethod||"").trim();
  const evidenceReference=String(input.evidenceReference||"").trim().slice(0,300);
  const financeNote=String(input.financeNote||"").trim().slice(0,1000)||null;
  if(!Number.isFinite(amount)||amount<=0||!/^(?:0|[1-9]\\d{0,11})(?:\\.\\d{1,2})?$/.test(amountText))throw problem(400,"Enter the actual amount confirmed against historical payment evidence.","INVALID_AMOUNT");
  if(!/^[A-Z]{3}$/.test(currency))throw problem(400,"Currency must be a three-letter ISO code.","INVALID_CURRENCY");
  if(paymentReference.length<4)throw problem(400,"Enter the bank, cash or provider payment reference.","PAYMENT_REFERENCE_REQUIRED");
  if(!validDate(paymentDate))throw problem(400,"Payment date must use YYYY-MM-DD.","INVALID_PAYMENT_DATE");
  if(!METHODS.has(paymentMethod))throw problem(400,"Choose a supported historical payment method.","INVALID_PAYMENT_METHOD");
  if(evidenceReference.length<4)throw problem(400,"Record the evidence reference checked by Finance.","EVIDENCE_REFERENCE_REQUIRED");
  if(feeAmountText&&(!Number.isFinite(feeAmount)||feeAmount<0||!/^(?:0|[1-9]\\d{0,11})(?:\\.\\d{1,2})?$/.test(feeAmountText)))throw problem(400,"Original fee amount must be zero or a positive amount with up to two decimal places.","INVALID_FEE_AMOUNT");

  return withTransaction(async tx=>{
    const membership=(await tx.query(`
      select mr.id,mr.user_id,mr.source_import_id,mr.membership_number,mr.status,mr.legacy_payload,mr.application_id,
        mp.name product_name
      from membership_record mr join membership_product mp on mp.id=mr.membership_product_id
      where mr.id=$1 and mr.source='legacy_import' for update of mr
    `,[membershipId])).rows[0];
    if(!membership)throw problem(404,"Imported membership record was not found.","NOT_FOUND");
    if(membership.status==="merged")throw problem(409,"Merged duplicate membership records cannot receive independent payment verification.","MEMBERSHIP_MERGED");

    let obligation=(await tx.query("select * from membership_fee_obligation where membership_record_id=$1 for update",[membershipId])).rows[0];
    if(!obligation&&membership.application_id){
      obligation=(await tx.query("select * from membership_fee_obligation where application_id=$1 for update",[membership.application_id])).rows[0];
    }
    if(!obligation){
      if(feeAmount===null)throw problem(400,"Finance must confirm the original fee amount before verifying a historical installment; today's product price is not assumed.","HISTORICAL_FEE_REQUIRED");
      if(feeAmount<amount)throw problem(400,"Original fee amount cannot be lower than the actual receipt amount.","FEE_AMOUNT_BELOW_RECEIPT");
      const snapshot={amount:feeAmount,currency,source:"finance_confirmed_historical_fee",recordedAt:new Date().toISOString(),note:financeNote};
      obligation=(await tx.query("insert into membership_fee_obligation(membership_record_id,fee_snapshot,amount_due,currency,created_by) values($1,$2,$3,$4,$5) returning *",[membershipId,JSON.stringify(snapshot),feeAmount,currency,identity.sub])).rows[0];
    }
    if(obligation.currency!==currency)throw problem(409,"Receipt currency does not match the confirmed historical fee obligation.","PAYMENT_CURRENCY_MISMATCH");
    await tx.query(`insert into membership_fee_obligation_payment(obligation_id,payment_transaction_id,linked_by)
      select $1,pr.payment_transaction_id,$2 from payment_reconciliation pr join payment_transaction pt on pt.id=pr.payment_transaction_id
      where pr.membership_id=$3 and pr.reconciliation_status='matched' and pt.status='succeeded' and pt.currency=$4
        and not exists(select 1 from membership_payment_reversal rev where rev.payment_transaction_id=pt.id)
      on conflict(payment_transaction_id) do nothing`,[obligation.id,identity.sub,membershipId,obligation.currency]);
    let balance=(await tx.query("select * from membership_fee_obligation_balance where obligation_id=$1",[obligation.id])).rows[0];

    const existing=(await tx.query(`
      select pt.id,pt.purpose_reference,pt.verified_at
      from payment_reconciliation pr join payment_transaction pt on pt.id=pr.payment_transaction_id
      where pr.membership_id=$1 and pr.reconciliation_status='matched' and pt.source='legacy_import'
        and pt.status='succeeded' and lower(coalesce(pt.purpose_reference,''))=lower($2)
        and not exists(select 1 from membership_payment_reversal rev where rev.payment_transaction_id=pt.id)
      order by pt.created_at desc limit 1 for update of pt
    `,[membershipId,paymentReference])).rows[0];
    if(existing){
      balance=(await tx.query("select * from membership_fee_obligation_balance where obligation_id=$1",[obligation.id])).rows[0];
      if(Number(balance.outstanding_balance)===0)await tx.query("update member_invitation set expires_at=greatest(expires_at,now()+interval '7 days') where user_id=$1 and import_id=$2 and consumed_at is null",[membership.user_id,membership.source_import_id]);
      const invitation=(await tx.query("select id from member_invitation where user_id=$1 and import_id=$2 and consumed_at is null",[membership.user_id,membership.source_import_id])).rows[0];
      return {membershipId,alreadyVerified:true,paymentTransactionId:existing.id,verifiedAt:existing.verified_at,outstandingBalance:balance.outstanding_balance,claimUnlocked:Boolean(invitation)&&Number(balance.outstanding_balance)===0};
    }
    if(!balance||amount>Number(balance.outstanding_balance))throw problem(409,"The receipt exceeds the remaining historical membership balance. Refresh the Finance queue.","AMOUNT_EXCEEDS_BALANCE");
    const reused=(await tx.query("select id from payment_transaction where lower(coalesce(purpose_reference,''))=lower($1) for update",[paymentReference])).rows[0];
    if(reused)throw problem(409,"This payment reference is already allocated to another imported payment.","PAYMENT_REFERENCE_ALREADY_USED");

    const channel=paymentMethod==="bank_transfer"?"bank_transfer":paymentMethod==="cash"?"cash":"other";
    const idempotencyKey="legacy-membership-payment:"+createHash("sha256").update(membershipId+":"+paymentReference.toLowerCase()).digest("hex");
    const payload={reference:paymentReference,paymentMethod,paymentDate,evidenceReference,legacyMembershipId:membershipId,membershipNumber:membership.membership_number,feeObligationId:obligation.id};
    const payment=(await tx.query(`
      insert into payment_transaction
        (provider,idempotency_key,purpose,amount,currency,status,request_payload,channel,submitted_by,
         verified_by,verified_at,verification_note,purpose_reference,source,completed_at)
      values('manual',$1,'membership_fee',$2,$3,'succeeded',$4,$5,$6,$6,now(),$7,$8,'legacy_import',now())
      returning id,verified_at
    `,[idempotencyKey,amount,currency,JSON.stringify(payload),channel,identity.sub,financeNote||evidenceReference,paymentReference])).rows[0];
    await tx.query("insert into membership_fee_obligation_payment(obligation_id,payment_transaction_id,linked_by) values($1,$2,$3) on conflict(payment_transaction_id) do nothing",[obligation.id,payment.id,identity.sub]);
    if(membership.application_id&&obligation.application_id)await tx.query("insert into membership_application_payment(application_id,payment_transaction_id) values($1,$2) on conflict do nothing",[membership.application_id,payment.id]);
    await tx.query("insert into payment_verification(payment_transaction_id,verifier_user_id,decision,evidence_checked,note) values($1,$2,'approved',$3,$4)",[payment.id,identity.sub,JSON.stringify([{type:"historical_payment_reference",reference:paymentReference,evidenceReference,paymentDate,paymentMethod}]),financeNote||evidenceReference]);
    await tx.query("insert into payment_reconciliation(payment_transaction_id,membership_id,reconciliation_status,reconciled_by,reconciled_at,note) values($1,$2,'matched',$3,now(),$4)",[payment.id,membershipId,identity.sub,"Finance verified a historical membership installment for "+membership.membership_number]);
    const updatedBalance=(await tx.query("select * from membership_fee_obligation_balance where obligation_id=$1",[obligation.id])).rows[0];
    await tx.query("update membership_fee_obligation set status=case when $2::numeric=0 then 'settled' else 'open' end,updated_at=now() where id=$1",[obligation.id,updatedBalance.outstanding_balance]);
    if(membership.application_id&&Number(updatedBalance.outstanding_balance)===0)await tx.query("update membership_application set status='paid',updated_at=now() where id=$1 and approved_at is not null and status in ('approved','payment_pending','paid')",[membership.application_id]);
    let outstandingInvitation={rowCount:0};
    if(Number(updatedBalance.outstanding_balance)===0){
      await tx.query("update member_invitation set expires_at=greatest(expires_at,now()+interval '7 days') where user_id=$1 and import_id=$2 and consumed_at is null",[membership.user_id,membership.source_import_id]);
      outstandingInvitation=await tx.query("select id from member_invitation where user_id=$1 and import_id=$2 and consumed_at is null",[membership.user_id,membership.source_import_id]);
    }
    await tx.query("insert into membership_event(membership_id,event_type,effective_at,actor_user_id,source,details) values($1,'legacy_payment_verified',now(),$2,'legacy_import',$3)",[membershipId,identity.sub,JSON.stringify({paymentTransactionId:payment.id,paymentReference,amount,currency,paymentDate,paymentMethod,evidenceReference,feeAmount:updatedBalance.amount_due,verifiedCash:updatedBalance.verified_cash,approvedNonCash:updatedBalance.approved_non_cash,outstandingBalance:updatedBalance.outstanding_balance})]);
    await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'membership.legacy_payment_verified','membership_record',$2,$3,'success',$4)",[identity.sub,membershipId,requestId,JSON.stringify({paymentTransactionId:payment.id,membershipNumber:membership.membership_number,paymentReference,amount,currency,paymentDate,paymentMethod,evidenceReference,feeAmount:updatedBalance.amount_due,outstandingBalance:updatedBalance.outstanding_balance,claimUnlocked:outstandingInvitation.rowCount>0})]);
    if(membership.user_id)await createInAppNotification(tx,membership.user_id,Number(updatedBalance.outstanding_balance)>0?"membership.balance_due":"membership.payment_verified","membership_record",membershipId,{category:"membership",message:Number(updatedBalance.outstanding_balance)>0?"Finance verified a partial payment. The remaining membership balance is "+currency+" "+Number(updatedBalance.outstanding_balance).toFixed(2)+".":"Finance verified the membership fee in full. Your account invitation can now be claimed.",actionUrl:"/membership",actionRequired:Number(updatedBalance.outstanding_balance)>0,eventVersion:payment.id});
    return {membershipId,paymentTransactionId:payment.id,verifiedAt:payment.verified_at,claimUnlocked:outstandingInvitation.rowCount>0,feeAmount:updatedBalance.amount_due,verifiedCash:updatedBalance.verified_cash,approvedNonCash:updatedBalance.approved_non_cash,outstandingBalance:updatedBalance.outstanding_balance};
  });
}

export async function reverseLegacyMembershipPayment(identity, paymentId, input = {}, requestId) {
  assertPaymentReversalAccess(identity);
  const reason = String(input.reason || "").trim().slice(0, 1000);
  const reversalType = input.reversalType === "reversal" ? "reversal" : "refund";
  const evidenceReference = String(input.evidenceReference || "").trim().slice(0, 300) || null;
  if (reason.length < 8) throw problem(400, "Enter a reason of at least eight characters for the historical payment reversal.", "REVERSAL_REASON_REQUIRED");

  return withTransaction(async tx => {
    const row = (await tx.query(`
      select pt.id payment_id,pt.status payment_status,mr.membership_number,mr.id membership_id
      from payment_transaction pt
      join payment_reconciliation pr on pr.payment_transaction_id=pt.id
      join membership_record mr on mr.id=pr.membership_id
      where pt.id=$1 and pt.source='legacy_import' and mr.source='legacy_import'
      for update of pt,pr,mr
    `, [paymentId])).rows[0];
    if (!row) throw problem(404, "Historical membership payment was not found.", "NOT_FOUND");
    if (row.payment_status !== "succeeded") throw problem(409, "Only a Finance-verified historical payment can be reversed.", "PAYMENT_NOT_REVERSIBLE");
    const reversal = (await tx.query(`
      insert into membership_payment_reversal
        (payment_transaction_id,application_id,membership_record_id,reversal_type,reason,evidence_reference,reversed_by,metadata)
      values($1,null,$2,$3,$4,$5,$6,$7)
      returning id
    `, [paymentId, row.membership_id, reversalType, reason, evidenceReference, identity.sub, JSON.stringify({ source: "legacy_import" })])).rows[0];

    await tx.query("update payment_transaction set status='refunded',updated_at=now(),completed_at=coalesce(completed_at,now()),verification_note=$1 where id=$2", [reason, paymentId]);
    await tx.query("update payment_reconciliation set reconciliation_status='disputed',reconciled_by=$1,reconciled_at=now(),note=concat_ws(' | ',note,$2::text) where payment_transaction_id=$3", [identity.sub, `Historical ${reversalType} recorded: ${reason}`, paymentId]);
    await tx.query("update membership_fee_obligation set status='open',updated_at=now() where membership_record_id=$1",[row.membership_id]);
    const balance=(await tx.query("select b.outstanding_balance from membership_fee_obligation o join membership_fee_obligation_balance b on b.obligation_id=o.id where o.membership_record_id=$1",[row.membership_id])).rows[0];
    if(balance&&Number(balance.outstanding_balance)>0)await tx.query("update membership_record set status='suspended',updated_at=now() where id=$1 and status='active'",[row.membership_id]);
    await tx.query(
      "insert into membership_event(membership_id,event_type,effective_at,actor_user_id,source,details) values($1,'legacy_payment_reversed',now(),$2,'legacy_import',$3)",
      [row.membership_id, identity.sub, JSON.stringify({ paymentId, reversalId: reversal.id, reversalType, reason, evidenceReference })]
    );
    await tx.query(
      "insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'membership.legacy_payment_reversed','payment_transaction',$2,$3,'success',$4)",
      [identity.sub, paymentId, requestId, JSON.stringify({ membershipId: row.membership_id, membershipNumber: row.membership_number, reversalId: reversal.id, reversalType, reason, evidenceReference })]
    );
    return { paymentId, reversalId: reversal.id, membershipId: row.membership_id, status: "refunded", reconciliationStatus: "disputed" };
  });
}
