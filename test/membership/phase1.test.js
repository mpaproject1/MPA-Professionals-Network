import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import * as membership from "../../src/membership/service.js";
import { closePool, getPool } from "../../src/platform/db.js";

const suffix=randomUUID().slice(0,8);
const email=`phase1-${suffix}@example.test`;
let userId;
let applicationId;
let paymentId;
let membershipId;
let renewalApplicationId;
let paymentMethodCode;
let evidenceFileId;

test("Phase 1 completes registration, profile and application identity flow",async()=>{
  const phone=`09${String(Date.now()).slice(-8)}`;
  const registered=await membership.register({
    email,password:"Phase1SecurePassword!",
    firstName:"Phase",lastName:`Member${suffix}`,phone,
    headline:"Professional",bio:"Phase 1 test profile"
  },"phase1-test-register");
  userId=registered.user.id;
  assert.equal(registered.person.first_name,"Phase");
  assert.equal(registered.verificationRequired,true);
  assert.equal(registered.token,undefined,"registration must not issue a session before email verification");
  assert.equal((await getPool().query("select id from auth_session where user_id=$1",[userId])).rowCount,0);

  const me=await membership.getMe(userId);
  assert.equal(me.email,email);
  assert.equal(me.has_active_membership,false);
  const beforeMembership=await membership.updateProfile(userId,{
    firstName:"Phase",lastName:`Member${suffix}`,phone,
    headline:"Updated Professional",bio:"Applicant can prepare a basic profile before membership."
  },"phase1-test-profile-before-membership");
  assert.equal(beforeMembership.first_name,"Phase");
  assert.equal(beforeMembership.headline,"Updated Professional");
  assert.equal(beforeMembership.has_active_membership,false,"editing a basic profile must not activate membership");

  await assert.rejects(membership.createApplication(userId,{productCode:"BASIC",termsAcknowledged:true},"phase1-no-idempotency"),e=>e.code==="IDEMPOTENCY_KEY_REQUIRED");
  await assert.rejects(membership.createApplication(userId,{productCode:"BASIC",idempotencyKey:"phase1_no_terms_"+suffix},"phase1-terms-not-acknowledged"),e=>e.code==="TERMS_ACKNOWLEDGEMENT_REQUIRED");
  const applicationKey=`phase1_app_${suffix}`;
  const app=await membership.createApplication(userId,{productCode:"BASIC",termsAcknowledged:true,idempotencyKey:applicationKey},"phase1-test-application");
  applicationId=app.id;
  assert.equal(app.status,"submitted");
  const termsRecord=(await getPool().query("select terms_acknowledged_at,terms_snapshot_sha256 from membership_application where id=$1",[app.id])).rows[0];
  assert.ok(termsRecord.terms_acknowledged_at,"server records when the applicant accepted the saved terms");
  assert.match(termsRecord.terms_snapshot_sha256,/^[a-f0-9]{64}$/,"the acknowledged fee/terms snapshot is auditable");
  const replay=await membership.createApplication(userId,{productCode:"BASIC",termsAcknowledged:true,idempotencyKey:applicationKey},"phase1-test-application-retry");
  assert.equal(replay.id,app.id,"a retry with the same account, key and payload returns the original application");
  await assert.rejects(membership.createApplication(userId,{productCode:"BASIC",applicationType:"renewal",termsAcknowledged:true,idempotencyKey:applicationKey},"phase1-test-key-conflict"),e=>e.code==="IDEMPOTENCY_CONFLICT");
  const reviewQueueRow=(await membership.listApplicationsForReview()).find(row=>row.id===applicationId);
  assert.ok(reviewQueueRow,"submitted application should appear in the administrator queue");
  assert.ok(Array.isArray(reviewQueueRow.review_history),"administrator queue should include prior review decisions");
  assert.equal(app.fee_snapshot.amount,1200);
  paymentMethodCode="bank_test_"+suffix;
  await getPool().query("insert into membership_payment_method(method_code,method_type,display_name,enabled,currency,instructions,bank_name,account_name,account_number,requires_evidence) values($1,'bank_transfer','Test bank transfer',true,'ETB','Test-only payment method','Test Bank','Test Association','123456789',true) on conflict(method_code) do update set enabled=true,requires_evidence=true,bank_name=excluded.bank_name,account_name=excluded.account_name,account_number=excluded.account_number,instructions=excluded.instructions",[paymentMethodCode]);
  const receiptBytes=Buffer.from("%PDF-1.7\nprivate membership receipt");
  const receiptChecksum=createHash("sha256").update(receiptBytes).digest("hex");
  const receiptObjectKey="private-test/"+randomUUID()+".pdf";
  const receipt=(await getPool().query("insert into file_object(storage_provider,object_key,original_name,content_type,byte_size,checksum_sha256,visibility,created_by) values('private-local',$1,'membership-receipt.pdf','application/pdf',$2,$3,'private',$4) returning id",[receiptObjectKey,receiptBytes.length,receiptChecksum,userId])).rows[0];
  evidenceFileId=receipt.id;
  await getPool().query("insert into private_upload_session(user_id,object_key,original_name,content_type,expected_byte_size,expected_checksum_sha256,upload_token_sha256,status,actual_byte_size,actual_checksum_sha256,file_object_id,expires_at,uploaded_at,confirmed_at) values($1,$2,'membership-receipt.pdf','application/pdf',$3,$4,repeat('b',64),'confirmed',$3,$4,$5,now()+interval '1 day',now(),now())",[userId,receiptObjectKey,receiptBytes.length,receiptChecksum,evidenceFileId]);
  await assert.rejects(membership.createManualPayment(applicationId,userId,{amount:1200,currency:"ETB",channel:"bank_transfer",reference:"NO-EVIDENCE-"+suffix,payerBankName:"Test Bank",paymentMethodCode,idempotencyKey:"phase1_evidence_required_"+suffix},"phase1-required-evidence"),e=>e.code==="PAYMENT_EVIDENCE_REQUIRED");
  const unconfirmedFile=(await getPool().query("insert into file_object(storage_provider,object_key,original_name,content_type,byte_size,checksum_sha256,visibility,created_by) values('local',$1,'unconfirmed-receipt.pdf','application/pdf',$2,$3,'public',$4) returning id",["public-test/"+randomUUID()+".pdf",receiptBytes.length,receiptChecksum,userId])).rows[0];
  await assert.rejects(membership.createManualPayment(applicationId,userId,{amount:1200,currency:"ETB",channel:"bank_transfer",reference:"UNCONFIRMED-"+suffix,payerBankName:"Test Bank",paymentMethodCode,evidenceFileId:unconfirmedFile.id,idempotencyKey:"phase1_unconfirmed_evidence_"+suffix},"phase1-unconfirmed-evidence"),e=>e.code==="INVALID_EVIDENCE");
  await assert.rejects(membership.createManualPayment(applicationId,userId,{amount:1200,currency:"ETB",channel:"cash",reference:"CHANNEL-MISMATCH-"+suffix,payerBankName:"Test Bank",paymentMethodCode,evidenceFileId,idempotencyKey:"phase1_channel_mismatch_"+suffix},"phase1-channel-mismatch"),e=>e.code==="PAYMENT_CHANNEL_MISMATCH");
  await assert.rejects(membership.createManualPayment(applicationId,userId,{amount:1200,currency:"ETB",channel:"bank_transfer",reference:"NO-METHOD-"+suffix,payerBankName:"Test Bank",idempotencyKey:"phase1_missing_method_"+suffix},"phase1-missing-method"),e=>e.code==="PAYMENT_METHOD_REQUIRED");
  const prematurePayment=await membership.createManualPayment(applicationId,userId,{
    amount:1200,currency:"ETB",channel:"bank_transfer",reference:`EARLY-BANK-${suffix}`,payerBankName:"Test Bank",paymentMethodCode,evidenceFileId,
    idempotencyKey:`phase1_early_${suffix}`
  },"phase1-early-payment");
  paymentId=prematurePayment.id;
  assert.equal(prematurePayment.status,"pending");
  const linkedEvidence=(await getPool().query("select p.evidence_file_id,f.visibility,f.created_by,s.status upload_status from payment_transaction p join file_object f on f.id=p.evidence_file_id join private_upload_session s on s.file_object_id=f.id where p.id=$1",[paymentId])).rows[0];
  assert.equal(linkedEvidence.evidence_file_id,evidenceFileId);
  assert.equal(linkedEvidence.visibility,"private");
  assert.equal(linkedEvidence.created_by,userId);
  assert.equal(linkedEvidence.upload_status,"confirmed");
  const applicantPaymentView=(await membership.listMyApplications(userId)).find(item=>item.id===applicationId).payment;
  assert.equal(applicantPaymentView.retryable,false);
  assert.equal(Object.hasOwn(applicantPaymentView,"verification_note"),false,"private finance notes are not exposed in the applicant response");
  await getPool().query("update membership_payment_method set requires_evidence=false where method_code=$1",[paymentMethodCode]);
  const paymentReplay=await membership.createManualPayment(applicationId,userId,{amount:1200,currency:"ETB",channel:"bank_transfer",reference:`EARLY-BANK-${suffix}`,payerBankName:"Test Bank",paymentMethodCode,evidenceFileId,idempotencyKey:`phase1_early_${suffix}`},"phase1-early-payment-retry");
  assert.equal(paymentReplay.id,prematurePayment.id,"repeated payment requests with the same idempotency key return the original transaction");
  await assert.rejects(membership.createManualPayment(applicationId,userId,{amount:1200,currency:"ETB",channel:"bank_transfer",reference:"CHANGED-"+suffix,payerBankName:"Test Bank",paymentMethodCode,evidenceFileId,idempotencyKey:`phase1_early_${suffix}`},"phase1-payment-key-conflict"),e=>e.code==="IDEMPOTENCY_CONFLICT");
  const earlyVerified=await membership.verifyPayment(prematurePayment.id,userId,{
    decision:"approved",evidenceChecked:[{type:"bank_reference",valid:true}],note:"Early payment verified independently of application review."
  },"phase1-early-payment-verification");
  assert.equal(earlyVerified.status,"succeeded");
  const stillPending=(await getPool().query("select status from membership_application where id=$1",[applicationId])).rows[0];
  assert.equal(stillPending.status,"submitted","payment verification must not approve or advance the application");
  const verifiedPayment=(await getPool().query("select status from payment_transaction where id=$1",[prematurePayment.id])).rows[0];
  assert.equal(verifiedPayment.status,"succeeded","finance verification is recorded separately from application approval");

  const duplicate=membership.createApplication(userId,{productCode:"BASIC",termsAcknowledged:true,idempotencyKey:"phase1_duplicate_"+suffix},"phase1-test-duplicate");
  await assert.rejects(duplicate,e=>e.code==="APPLICATION_EXISTS");
});

test("Phase 1 correction and review workflow is auditable",async()=>{
  const db=getPool();
  await db.query("insert into app_user_role(user_id,role_id) select $1,id from app_role where role_code='reviewer' on conflict do nothing",[userId]);

  const correction=await membership.reviewApplication(applicationId,userId,{
    decision:"correction_required",note:"Please confirm your professional headline.",requestedFields:["profile.headline"]
  },"phase1-test-correction");
  assert.equal(correction.decision,"correction_required");

  const submitted=await membership.respondCorrection(applicationId,userId,{response:{profile:{headline:"Confirmed Headline"}}},"phase1-test-correction-response");
  assert.equal(submitted.status,"submitted");

  const approved=await membership.reviewApplication(applicationId,userId,{
    decision:"approved",note:"Application meets current membership requirements.",checklist:[{code:"identity",passed:true}]
  },"phase1-test-approval");
  assert.equal(approved.decision,"approved");

  const appRow=(await db.query("select status from membership_application where id=$1",[applicationId])).rows[0];
  assert.equal(appRow.status,"paid","application approval recognizes the previously verified payment, but remains a separate decision");
});

test("Phase 1 early payment verification cannot bypass approval or activation gates",async()=>{
  const db=getPool();
  assert.ok(paymentId,"the early payment should remain linked to the application across the workflow");
  const verified=(await db.query("select status from payment_transaction where id=$1",[paymentId])).rows[0];
  assert.equal(verified.status,"succeeded");
  const approvedApp=(await db.query("select status,approved_at from membership_application where id=$1",[applicationId])).rows[0];
  assert.equal(approvedApp.status,"paid");
  assert.ok(approvedApp.approved_at,"application approval must be recorded separately before activation");
  const paidReplay=await membership.createManualPayment(applicationId,userId,{amount:1200,currency:"ETB",channel:"bank_transfer",reference:`EARLY-BANK-${suffix}`,payerBankName:"Test Bank",paymentMethodCode,evidenceFileId,idempotencyKey:`phase1_early_${suffix}`},"phase1-paid-payment-retry");
  assert.equal(paidReplay.id,paymentId,"same-key payment retry must return the original transaction even after the application advances to paid");

  const activated=await membership.activateApplication(applicationId,userId,"phase1-test-activation");
  membershipId=activated.id;
  assert.equal(activated.status,"active");
  assert.ok(activated.membership_number);
  assert.equal((await membership.getMe(userId)).has_active_membership,true);
  const applicationReplayAfterActivation=await membership.createApplication(userId,{productCode:"BASIC",termsAcknowledged:true,idempotencyKey:`phase1_app_${suffix}`},"phase1-application-after-activation-retry");
  assert.equal(applicationReplayAfterActivation.id,applicationId,"same-key application retries return the original record after activation");
  const updated=await membership.updateProfile(userId,{firstName:"Phase",lastName:`Member${suffix}`,headline:"Updated Professional",visibility:"members"},"phase1-test-profile-after-membership");
  assert.equal(updated.headline,"Updated Professional");
  assert.equal(updated.visibility,"members","active members may choose a permitted directory visibility setting");

  const history=await membership.history(userId);
  assert.equal(history.memberships.length,1);
  assert.equal(history.payments[0].status,"succeeded");
  assert.equal(history.events[0].event_type,"activated");
  assert.ok(history.notifications.length>=4);
});

test("Phase 1 renewal creates a linked renewal application without losing history",async()=>{
  const renewal=await membership.renew(userId,"BASIC","phase1-test-renewal",true,"phase1_renewal_"+suffix);
  renewalApplicationId=renewal.id;
  assert.equal(renewal.application_type,"renewal");
  assert.equal(renewal.previous_membership_id,membershipId);
  const history=await membership.history(userId);
  assert.equal(history.memberships.length,1);
  assert.equal(history.applications.length,2);
});

test("Phase 1 rejection after verified payment retains the transaction for reconciliation",async()=>{
  const db=getPool();
  assert.ok(renewalApplicationId,"renewal application should be available for the rejection-after-payment scenario");
  const app=(await db.query("select fee_snapshot,status from membership_application where id=$1 and user_id=$2",[renewalApplicationId,userId])).rows[0];
  assert.equal(app.status,"submitted");
  const fee=typeof app.fee_snapshot==="string"?JSON.parse(app.fee_snapshot):app.fee_snapshot;
  const payment=await membership.createManualPayment(renewalApplicationId,userId,{
    amount:Number(fee.amount),currency:fee.currency,channel:"bank_transfer",reference:`RECONCILE-${suffix}`,payerBankName:"Test Bank",paymentMethodCode,idempotencyKey:`phase1_reconcile_${suffix}`
  },"phase1-rejected-after-payment");
  const verified=await membership.verifyPayment(payment.id,userId,{decision:"approved",evidenceChecked:[{type:"cash_receipt",valid:true}],note:"Verified before application decision."},"phase1-rejected-payment-verification");
  assert.equal(verified.status,"succeeded");
  const rejected=await membership.reviewApplication(renewalApplicationId,userId,{decision:"rejected",note:"Eligibility requirements were not met."},"phase1-reject-after-payment");
  assert.equal(rejected.decision,"rejected");
  const after=(await db.query("select a.status application_status,p.status payment_status,pr.reconciliation_status from membership_application a join membership_application_payment ap on ap.application_id=a.id join payment_transaction p on p.id=ap.payment_transaction_id left join payment_reconciliation pr on pr.payment_transaction_id=p.id where a.id=$1 and p.id=$2",[renewalApplicationId,payment.id])).rows[0];
  assert.equal(after.application_status,"rejected");
  assert.equal(after.payment_status,"succeeded","rejection must not erase or silently reclassify verified funds");
  assert.ok(after.reconciliation_status,"verified payment remains in reconciliation history after application rejection");
  const rejectedReplay=await membership.createManualPayment(renewalApplicationId,userId,{amount:Number(fee.amount),currency:fee.currency,channel:"bank_transfer",reference:`RECONCILE-${suffix}`,payerBankName:"Test Bank",paymentMethodCode,idempotencyKey:`phase1_reconcile_${suffix}`},"phase1-rejected-payment-retry");
  assert.equal(rejectedReplay.id,payment.id,"retry after rejection returns the original payment and does not create another transaction");
});

test("Phase 1 notification preferences are persisted",async()=>{
  const saved=await membership.notificationPreferences(userId,{emailEnabled:true,smsEnabled:false,pushEnabled:true,inAppEnabled:true});
  assert.equal(saved.sms_enabled,false);
  const loaded=await membership.notificationPreferences(userId);
  assert.equal(loaded.sms_enabled,false);
});

test("Gate 5 me contract exposes the authenticated profile and current roles",async()=>{
  const me=await membership.getMe(userId);
  assert.equal(me.user_id,userId);
  assert.equal(me.email,email);
  assert.equal(me.status,"active");
  assert.ok(Array.isArray(me.roles));
  assert.ok(me.roles.includes("member"));
  assert.ok(me.person_id);
  assert.ok(me.profile_id);
  assert.ok(me.display_name);
  assert.equal(me.first_name,"Phase");
  assert.equal(me.headline,"Updated Professional");
  assert.equal(me.completion_percent >= 20,true);
});


test.after("close database pool",async()=>{ await closePool(); });
