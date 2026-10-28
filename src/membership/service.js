import { createHash, randomUUID } from "node:crypto";
import { hashSessionToken, newSessionToken, sessionTokenPayload, signToken } from "../platform/auth.js";
import { toChapaMinorUnits } from "../platform/chapa-money.js";
import { isValidChapaWebhookSignature } from "../platform/chapa-signature.js";
import { loadConfig } from "../platform/config.js";
import { getPool, withTransaction } from "../platform/db.js";
import { displayReference } from "../platform/display-reference.js";
import { assertEmailDeliveryConfigured, createEmailVerification, deliverEmailVerification } from "../platform/email-verification.js";
import { assertProfessionalProfileCapability } from "../platform/identity-policy.js";
import { membershipEndDate } from "../platform/membership-duration.js";
import { createInAppNotification } from "../platform/notifications.js";
import { consumeHumanChallenge } from "../platform/security-controls.js";
import { nextTrackingReference } from "../platform/tracking-reference.js";
import { hashPassword, normalizeEmail, validatePersonInput, verifyPassword } from "./identity.js";
import { applicationStatusAfterPaymentVerification, applicationStatusAfterReview, canSubmitMembershipPayment, missingRequiredMembershipEvidence, requiresMembershipPaymentEvidence } from "./payment-policy.js";

export function generateMembershipNumber(date=new Date()) { return `MPA-${date.getUTCFullYear()}-${randomUUID().slice(0,8).toUpperCase()}`; }

function httpError(status,message,code="BUSINESS_RULE"){
  const e=new Error(message); e.statusCode=status; e.code=code; return e;
}
async function tokenFor(db,user,roles,requestMeta={}){
  const raw=newSessionToken(); const ttl=Number(process.env.AUTH_SESSION_DAYS||7);
  const row=(await db.query("insert into auth_session(user_id,token_hash,expires_at,ip_address,user_agent) values($1,$2,now()+make_interval(days=>$3),$4,$5) returning id",[user.id,hashSessionToken(raw),ttl,requestMeta.ip||null,requestMeta.userAgent||null])).rows[0];
  return signToken(sessionTokenPayload(user,roles,row.id),loadConfig().jwtSecret);
}
function audit(db,actor,action,type,id,requestId,metadata={}){
  return db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,$2,$3,$4,$5,'success',$6)",[actor||null,action,type,id||null,requestId||null,metadata]);
}
function membershipNotificationCopy(eventCode,payload={}){
 const code=String(eventCode||"").toLowerCase();
 const defaults=code==="account_registered"?{message:"Your MPA Network account has been created.",nextAction:"Complete your professional profile and review membership options.",actionUrl:"/profile"}:
  code.includes("application_submitted")?{message:"Your membership application has been submitted.",nextAction:"Track the application and respond if a reviewer requests corrections.",actionUrl:"/membership"}:
  code.includes("application_approved")?{message:"Your membership application was approved and is ready for payment.",nextAction:"Review the approved fee and submit payment evidence through the membership workspace.",actionUrl:"/membership",actionRequired:true,priority:"high"}:
  code.includes("application_rejected")?{message:"Your membership application was not approved.",nextAction:"Review the decision note and contact membership support if you need clarification.",actionUrl:"/membership"}:
  code.includes("correction")?{message:"Your membership application has a correction update.",nextAction:"Review the correction request, update the requested information, and resubmit.",actionUrl:"/membership",actionRequired:true,priority:"high"}:
  code.includes("payment_submitted")?{message:"Your membership payment evidence was submitted for verification.",nextAction:"Wait for the finance review; membership is not active until payment is verified and activation is completed.",actionUrl:"/membership"}:
  (code.includes("payment_succeeded")||code.includes("payment_approved"))?{message:"Your membership payment was verified.",nextAction:"Check your membership status and await or review activation.",actionUrl:"/membership",actionRequired:true}:
  (code.includes("payment_failed")||code.includes("payment_rejected"))?{message:"Your membership payment was not verified.",nextAction:"Review the finance note and submit corrected payment evidence if requested.",actionUrl:"/membership",actionRequired:true,priority:"high"}:
  code.includes("payment_needs_correction")?{message:"Finance needs additional information about your membership payment.",nextAction:"Review the finance note and provide corrected evidence.",actionUrl:"/membership",actionRequired:true,priority:"high"}:
  code.includes("payment_reversed")?{message:"A membership payment reversal was recorded and membership access may be affected.",nextAction:"Review the reversal reason and contact membership support to resolve the account status.",actionUrl:"/membership",actionRequired:true,priority:"urgent"}:
  code.includes("activated")?{message:"Your MPA membership is active.",nextAction:"Open your membership card and continue your professional journey.",actionUrl:"/membership/card"}:
  {message:"There is an update to your MPA membership record.",nextAction:"Review your membership application, payment or membership history for the next required step.",actionUrl:"/membership"};
 return {...defaults,...payload};
}
async function notify(db,userId,eventCode,resourceType,resourceId,payload={}){
  const user=(await db.query("select u.email,coalesce(np.email_enabled,true) email_enabled from app_user u left join notification_preference np on np.user_id=u.id where u.id=$1",[userId])).rows[0];
  if(!user)return;
  const details=membershipNotificationCopy(eventCode,payload);
  await createInAppNotification(db,userId,eventCode,resourceType,resourceId,details);
  if(user.email&&user.email_enabled)await db.query("insert into notification_outbox(channel,recipient,template_code,payload) values('email',$1,$2,$3)",[user.email,eventCode,details]);
}
async function roles(db,userId){
  const r=await db.query("select r.role_code from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1",[userId]);
  return r.rows.map(x=>x.role_code);
}

async function assertProfessionalProfileAccess(db,userId,options={}){
  try { await assertProfessionalProfileCapability(db,userId,options); }
  catch (error) { throw httpError(error.statusCode||403,error.message,error.code||"BUSINESS_RULE"); }
}
function amountFromProduct(product){ return Number(product.price); }

export async function bootstrapAdmin(input){
  const email=normalizeEmail(input.email); const password=String(input.password||"");
  if(!email||password.length<14) throw httpError(400,"Bootstrap admin email and a password of at least 14 characters are required.","BOOTSTRAP_INVALID");
  return withTransaction(async db=>{
    const existing=await db.query("select id,email,status from app_user where lower(email)=lower($1)",[email]);
    let user=existing.rows[0];
    if(user) await db.query("update app_user set status='active',email_verified_at=coalesce(email_verified_at,now()),updated_at=now() where id=$1",[user.id]);
    if(!user) user=(await db.query("insert into app_user(username,email,password_hash,status,email_verified_at) values($1,$1,$2,'active',now()) returning id,email,status,email_verified_at",[email, hashPassword(password)])).rows[0];
    const role=(await db.query("select id from app_role where role_code='system_admin'")).rows[0];
    if(!role) throw httpError(500,"System administrator role is unavailable.","BOOTSTRAP_ROLE_MISSING");
    await db.query("insert into app_user_role(user_id,role_id) values($1,$2) on conflict do nothing",[user.id,role.id]);
    await db.query("insert into admin_bootstrap_event(user_id,source,metadata) values($1,'environment_bootstrap',$2)",[user.id,{email}]);
    await audit(db,user.id,"admin.bootstrap","account",user.id,null,{source:"environment"});
    return {userId:user.id,email:user.email};
  });
}

export async function register(input,requestId){
  const email=normalizeEmail(input.email);
  if(!email || !String(input.password||"")) throw httpError(400,"email and password are required.","VALIDATION_ERROR");
  const person=validatePersonInput(input);
  if(input.passwordConfirmation!==undefined&&String(input.passwordConfirmation)!==String(input.password||"")) throw httpError(400,"Password confirmation does not match.","PASSWORD_CONFIRMATION_MISMATCH");
  const accountType=input.accountType==="organization"||input.accountType==="organization_representative"?"organization_representative":"professional";
  const roleCode=accountType==="organization_representative"?"organization_representative":"member";
  const verificationRequired=true;
  const humanChallengeRequired=String(process.env.HUMAN_CHALLENGE_REQUIRED||"false").toLowerCase()==="true"||loadConfig().nodeEnv==="production";
  let verificationMessage=null;
  const registered=await withTransaction(async db=>{
    if(humanChallengeRequired || input.humanCheckToken) await consumeHumanChallenge(db,input.humanCheckToken);
    assertEmailDeliveryConfigured();
    const identity=await db.query(`
      select u.id from app_user u where lower(u.email)=lower($1)
      union
      select p.user_id from person p where p.phone=$2
      union
      select p.user_id from person p where lower(regexp_replace(coalesce(p.display_name,''),'[^[:alnum:]]','','g'))=
        lower(regexp_replace($3,'[^[:alnum:]]','','g')) limit 3`,[email,person.phone,person.displayName]);
    if(identity.rows.length) throw httpError(409,"An existing account or identity matches these details. Sign in or contact membership support instead of creating a duplicate.","IDENTITY_CONFLICT");
    const registrationReference=await nextTrackingReference(db,"membership");
    const user=(await db.query("insert into app_user(username,email,password_hash,status,registration_reference,account_type) values($1,$2,$3,'active',$4,$5) returning id,email,username,registration_reference,account_type",[email,email,hashPassword(input.password),registrationReference,accountType])).rows[0];
    const p=(await db.query(`insert into person(user_id,first_name,middle_name,last_name,display_name,phone,date_of_birth,sex,nationality)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id,user_id,first_name,middle_name,last_name,display_name,phone,date_of_birth,sex,nationality`,
      [user.id,person.firstName,person.middleName,person.lastName,person.displayName,person.phone,person.dateOfBirth,person.sex,person.nationality])).rows[0];
    if(accountType==="professional") await db.query("insert into professional_profile(person_id,completion_percent) values($1,20)",[p.id]);
    await db.query("insert into app_user_role(user_id,role_id) select $1,id from app_role where role_code=$2 on conflict do nothing",[user.id,roleCode]);
    await db.query("insert into notification_preference(user_id) values($1) on conflict do nothing",[user.id]);
    await audit(db,user.id,"account.registered","account",user.id,requestId,{identityPolicy:"email_phone_exact_name",registrationReference});
    await notify(db,user.id,"account_registered","account",user.id,{displayName:p.display_name,registrationReference});
    if(verificationRequired){
      verificationMessage=await createEmailVerification(db,user.id,user.email,registrationReference,p.first_name||"");
    }
    return {user:{id:user.id,email:user.email,accountType:user.account_type},person:p,registrationReference,accountType,roles:[roleCode],token:verificationRequired?null:await tokenFor(db,user,[roleCode])};
  });
  if(verificationRequired){
    const delivery=await deliverEmailVerification(verificationMessage);
    return {user:registered.user,person:registered.person,registrationReference:registered.registrationReference,accountType:registered.accountType,roles:registered.roles,verificationRequired:true,verificationSent:Boolean(delivery.sent),developmentVerificationUrl:delivery.developmentVerificationUrl||undefined};
  }
  return {...registered,verificationRequired:false};
}

export async function login(email,password,requestId,requestMeta={}){
  const db=getPool(); const identityKey=normalizeEmail(email);
  const recent=await db.query("select count(*)::int count from auth_login_attempt where identity_key=$1 and attempted_at>now()-interval '15 minutes' and succeeded=false",[identityKey]);
  if(recent.rows[0].count>=8) throw httpError(429,"Too many unsuccessful sign-in attempts. Try again later.","AUTH_RATE_LIMIT");
  const e=normalizeEmail(email);
  const r=await db.query("select id,email,username,password_hash,status,email_verified_at,admin_passkey_enforced_at from app_user where lower(email)=lower($1) or lower(username)=lower($1) order by case when lower(email)=lower($1) then 0 else 1 end limit 2",[e]);
  const user=r.rows.length===1?r.rows[0]:null;
  if(!user || user.status!=="active" || !verifyPassword(password,user.password_hash)){
    await db.query("insert into auth_login_attempt(identity_key,ip_address,succeeded) values($1,$2,false)",[identityKey,requestMeta.ip||null]);
    // Keep credential failures distinct from expired/revoked bearer sessions.
    // Both remain 401s, but the client can give a useful sign-in message.
    throw httpError(401,"Email/username or password is incorrect.","INVALID_CREDENTIALS");
  }
  if(!user.email_verified_at) throw httpError(403,"Verify your email before signing in. Request a new verification link if needed.","EMAIL_VERIFICATION_REQUIRED");
  const rs=await roles(db,user.id);
  if(user.admin_passkey_enforced_at && rs.some(role=>["system_admin","admin"].includes(role))){
    await audit(db,user.id,"account.login.passkey_required","account",user.id,requestId,{authMethod:"password"});
    throw httpError(403,"This administrator account requires a passkey. Use administrator passkey sign-in or a single-use recovery code.","PASSKEY_REQUIRED");
  }
  await db.query("insert into auth_login_attempt(identity_key,ip_address,succeeded) values($1,$2,true)",[identityKey,requestMeta.ip||null]);
  await audit(db,user.id,"account.login","account",user.id,requestId);
  return {token:await tokenFor(db,user,rs,requestMeta),user:{id:user.id,email:user.email,roles:rs}};
}

export async function getMe(userId){
  const db=getPool();
  const r=await db.query(`select u.id user_id,u.username,u.email,u.status,u.account_type,p.id person_id,p.first_name,p.middle_name,p.last_name,p.display_name,p.phone,p.date_of_birth,p.sex,p.nationality,
    pr.id profile_id,pr.headline,pr.bio,pr.visibility,pr.completion_percent,pr.profile_picture_file_id,
    coalesce((select jsonb_agg(r.role_code order by r.role_code) from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=u.id),'[]'::jsonb) roles,
    exists(select 1 from membership_record mr where mr.user_id=u.id and mr.status='active' and mr.start_date<=current_date and (mr.end_date is null or mr.end_date>=current_date)) has_active_membership
    from app_user u left join person p on p.user_id=u.id left join professional_profile pr on pr.person_id=p.id where u.id=$1`,[userId]);
  if(!r.rows[0]) throw httpError(404,"Account not found.","NOT_FOUND");
  const row=r.rows[0];
  row.gender=row.sex||null;
  const userRoles=Array.isArray(row.roles)?row.roles:[];
  if(!userRoles.some(role=>["member","professional"].includes(role))){
    row.profile_id=null; row.headline=null; row.bio=null; row.visibility=null; row.completion_percent=null; row.profile_picture_file_id=null;
  }
  return row;
}

export async function updateProfile(userId,input,requestId){
  await withTransaction(async db=>{
    await assertProfessionalProfileAccess(db,userId);
    // Applicants may edit their own profile before membership, but public visibility is a member-only capability.
    if (input.visibility === "public") await assertProfessionalProfileCapability(db, userId, { requireActiveMembership: true });
    const person=validatePersonInput(input);
    const current=await db.query("select id from person where user_id=$1 for update",[userId]);
    if(!current.rows[0]) throw httpError(404,"Person profile not found.","NOT_FOUND");
    const duplicate=await db.query("select user_id from person where phone=$1 and user_id<>$2",[person.phone,userId]);
    if(person.phone && duplicate.rows.length) throw httpError(409,"Phone number is already associated with another identity.","IDENTITY_CONFLICT");
    const p=(await db.query(`update person set first_name=$1,middle_name=$2,last_name=$3,display_name=$4,phone=$5,date_of_birth=$6,sex=$7,nationality=$8,updated_at=now() where user_id=$9 returning *`,
      [person.firstName,person.middleName,person.lastName,person.displayName,person.phone,person.dateOfBirth,person.sex,person.nationality,userId])).rows[0];
    await db.query(`update professional_profile set headline=coalesce($1,headline),bio=coalesce($2,bio),visibility=coalesce($3,visibility),completion_percent=greatest(completion_percent,$4),updated_at=now() where person_id=$5`,
      [input.headline||null,input.bio||null,input.visibility||null,(input.headline||input.bio)?40:20,p.id]);
    await audit(db,userId,"profile.updated","person",p.id,requestId);
  });
  return getMe(userId);
}

export async function listMyApplications(userId){
  const db=getPool();
  const rows=(await db.query(`select a.id,a.tracking_reference,a.application_type,a.status,a.submitted_at,a.reviewed_at,a.approved_at,a.created_at,a.updated_at,
      a.data_snapshot,a.fee_snapshot,
      (select jsonb_build_object('id',p.id,'status',p.status,'amount',p.amount,'currency',p.currency,'channel',p.channel,'reference',coalesce(p.request_payload->>'reference',p.purpose_reference),'payment_method_code',p.payment_method_code,'payer_bank_name',p.request_payload->>'payerBankName','checkout_url',p.request_payload->>'checkoutUrl','created_at',p.created_at,'verified_at',p.verified_at,'verification_note',p.verification_note)
       from membership_application_payment ap join payment_transaction p on p.id=ap.payment_transaction_id
       where ap.application_id=a.id order by p.created_at desc limit 1) as payment,
      (select jsonb_build_object('id',c.id,'requested_fields',c.requested_fields,'reviewer_note',c.reviewer_note,'status',c.status,'applicant_response',c.applicant_response,'created_at',c.created_at)
       from membership_correction c where c.application_id=a.id order by c.created_at desc limit 1) as latest_correction,
      coalesce((select jsonb_agg(jsonb_build_object('id',aa.id,'fileObjectId',f.id,'fileName',f.original_name,'attachmentType',aa.attachment_type,'createdAt',aa.created_at) order by aa.created_at desc)
       from membership_application_attachment aa join file_object f on f.id=aa.file_object_id where aa.application_id=a.id),'[]'::jsonb) attachments,
      coalesce((select jsonb_agg(jsonb_build_object('decision',r.decision,'note',r.note,'createdAt',r.created_at) order by r.created_at desc)
       from membership_application_review r where r.application_id=a.id),'[]'::jsonb) review_history
    from membership_application a where a.user_id=$1 order by a.created_at desc`,[userId])).rows;
  return rows.map(row=>({...row,tracking_reference:row.tracking_reference||displayReference({type:"membership",id:row.id,createdAt:row.created_at})}));
}

export async function listMembershipProducts(){
  const db=getPool();
  return (await db.query(`select p.product_code,coalesce(r.plan_name,p.name) name,
    coalesce(r.plan_description,p.description) description,
    coalesce(r.billing_model,p.billing_model) billing_model,
    (coalesce(r.base_amount,p.price)+coalesce(r.tax_amount,0)+coalesce(r.service_fee,0)) price,
    coalesce(r.base_amount,p.price) base_amount,coalesce(r.tax_amount,0) tax_amount,coalesce(r.service_fee,0) service_fee,
    coalesce(r.currency,p.currency) currency,case when r.terms_snapshot_complete then r.duration_days else p.duration_days end duration_days,
    coalesce(r.renewal_required,p.renewal_required) renewal_required,
    coalesce(r.benefits,p.benefits) benefits,coalesce(r.grace_period_days,p.grace_period_days) grace_period_days,
    coalesce(r.eligibility,p.eligibility) eligibility,coalesce(r.effective_from,p.effective_from) effective_from,
    coalesce(r.effective_to,p.effective_to) effective_to,r.version fee_rule_version
    from membership_product p
    left join lateral (select fr.* from membership_fee_rule fr where fr.membership_product_id=p.id
      and fr.effective_from<=current_date and (fr.effective_to is null or fr.effective_to>=current_date)
      order by fr.effective_from desc,fr.version desc limit 1) r on true
    where p.active=true and (p.effective_from is null or p.effective_from<=current_date)
      and (p.effective_to is null or p.effective_to>=current_date)
    order by (coalesce(r.base_amount,p.price)+coalesce(r.tax_amount,0)+coalesce(r.service_fee,0)) asc,coalesce(r.plan_name,p.name) asc`)).rows;
}

export async function listMembershipProductsForAdmin(){
  const db=getPool();
  return (await db.query(`select p.*,
    coalesce((select fr.base_amount+fr.tax_amount+fr.service_fee from membership_fee_rule fr
      where fr.membership_product_id=p.id and fr.effective_from<=current_date and (fr.effective_to is null or fr.effective_to>=current_date)
      order by fr.effective_from desc,fr.version desc limit 1),p.price) current_fee_amount,
    coalesce((select fr.currency from membership_fee_rule fr
      where fr.membership_product_id=p.id and fr.effective_from<=current_date and (fr.effective_to is null or fr.effective_to>=current_date)
      order by fr.effective_from desc,fr.version desc limit 1),p.currency) current_fee_currency,
    (select fr.version from membership_fee_rule fr
      where fr.membership_product_id=p.id and fr.effective_from<=current_date and (fr.effective_to is null or fr.effective_to>=current_date)
      order by fr.effective_from desc,fr.version desc limit 1) current_fee_version,
    coalesce(jsonb_agg(jsonb_build_object(
      'id',r.id,'version',r.version,'baseAmount',r.base_amount,'currency',r.currency,
      'taxAmount',r.tax_amount,'serviceFee',r.service_fee,'effectiveFrom',r.effective_from,
      'effectiveTo',r.effective_to,'billingModel',r.billing_model,'durationDays',r.duration_days,
      'renewalRequired',r.renewal_required,'gracePeriodDays',r.grace_period_days,'plan_name',r.plan_name,'plan_description',r.plan_description,
      'benefits',r.benefits,'eligibility',r.eligibility,'termsSnapshotComplete',r.terms_snapshot_complete,'createdAt',r.created_at
    ) order by r.version desc) filter(where r.id is not null),'[]'::jsonb) fee_rule_history
    from membership_product p left join membership_fee_rule r on r.membership_product_id=p.id
    group by p.id order by p.created_at desc`)).rows;
}

export async function saveMembershipProduct(actorId,productCode,input,requestId){
  return withTransaction(async db=>{
    const code=String(productCode||input.productCode||"").trim().toUpperCase();
    const name=String(input.name||"").trim();
    const billingModel=String(input.billingModel||"recurring");
    const currency=String(input.currency||"ETB").trim().toUpperCase();
    const amount=Number(input.amount);
    const taxAmount=Number(input.taxAmount||0),serviceFee=Number(input.serviceFee||0);
    const effectiveFrom=String(input.effectiveFrom||new Date().toISOString().slice(0,10)).slice(0,10);
    const planEffectiveFrom=String(input.planEffectiveFrom||"").slice(0,10)||null;
    const planEffectiveTo=String(input.planEffectiveTo||"").slice(0,10)||null;
    const durationDays=input.durationDays===null||input.durationDays===""||input.durationDays===undefined?null:Number(input.durationDays);
    const gracePeriodDays=input.gracePeriodDays===undefined?0:Number(input.gracePeriodDays);
    const renewalRequired=billingModel==="lifetime"?false:Boolean(input.renewalRequired);
    if(!/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(code)) throw httpError(400,"Plan code must use 2–40 letters, numbers, dashes or underscores.","VALIDATION_ERROR");
    if(!name||name.length>120) throw httpError(400,"Enter a plan name up to 120 characters.","VALIDATION_ERROR");
    if(!["recurring","one_time","lifetime"].includes(billingModel)) throw httpError(400,"Choose a supported billing model.","VALIDATION_ERROR");
    if(!Number.isFinite(amount)||amount<0||!/^([A-Z]{3})$/.test(currency)) throw httpError(400,"Enter a valid non-negative fee and three-letter currency.","VALIDATION_ERROR");
    if(!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)||Number.isNaN(Date.parse(effectiveFrom))) throw httpError(400,"Choose a valid effective date.","VALIDATION_ERROR");
    if(billingModel==="lifetime"&&durationDays!==null) throw httpError(400,"Lifetime plans cannot have an expiry duration.","VALIDATION_ERROR");
    if(billingModel==="recurring"&&(!Number.isInteger(durationDays)||durationDays<1||durationDays>3650)) throw httpError(400,"Choose a validity duration from 1 to 3,650 days for recurring plans.","VALIDATION_ERROR");
    if(billingModel==="one_time"&&durationDays!==null&&(!Number.isInteger(durationDays)||durationDays<1||durationDays>3650)) throw httpError(400,"A one-time plan duration must be between 1 and 3,650 days, or left blank for no expiry.","VALIDATION_ERROR");
    if(!Number.isInteger(gracePeriodDays)||gracePeriodDays<0||gracePeriodDays>365) throw httpError(400,"Grace period must be between 0 and 365 days.","VALIDATION_ERROR");
    if(!Number.isFinite(taxAmount)||taxAmount<0||!Number.isFinite(serviceFee)||serviceFee<0) throw httpError(400,"Tax and service fees must be valid non-negative amounts.","VALIDATION_ERROR");
    const benefits=Array.isArray(input.benefits)?input.benefits.map(x=>String(x).trim()).filter(Boolean).slice(0,40):[];
    const eligibility=input.eligibility&&typeof input.eligibility==="object"&&!Array.isArray(input.eligibility)?input.eligibility:{};
    if(eligibility.requiredEvidence!==undefined&&!Array.isArray(eligibility.requiredEvidence))throw httpError(400,"Required evidence must be a list of supported evidence type codes.","VALIDATION_ERROR");
    try{missingRequiredMembershipEvidence(eligibility.requiredEvidence||[],[]);}catch(error){throw httpError(400,error.message||"Invalid required evidence configuration.","VALIDATION_ERROR");}
    const existing=(await db.query("select * from membership_product where product_code=$1 for update",[code])).rows[0];
    if(!existing&&productCode) throw httpError(404,"Membership plan not found.","NOT_FOUND");
    if(existing&&!productCode) throw httpError(409,"A plan with this code already exists. Choose a different code or edit the existing plan.","PLAN_CODE_EXISTS");
    if(existing&&String(input.expectedVersion||"")&&String(input.expectedVersion)!==String((await db.query("select coalesce(max(version),0) version from membership_fee_rule where membership_product_id=$1",[existing.id])).rows[0].version)) {
      throw httpError(409,"This plan changed while you were editing it. Refresh the plan history before saving again.","PLAN_VERSION_CONFLICT");
    }
    let product;
    if(existing){
      product=(await db.query(`update membership_product set
        name=case when $15::date<=current_date then $1 else name end,
        description=case when $15::date<=current_date then $2 else description end,
        billing_model=case when $15::date<=current_date then $3 else billing_model end,
        price=case when $15::date<=current_date then $4 else price end,
        currency=case when $15::date<=current_date then $5 else currency end,
        duration_days=case when $15::date<=current_date then $6 else duration_days end,
        renewal_required=case when $15::date<=current_date then $7 else renewal_required end,
        grace_period_days=case when $15::date<=current_date then $8 else grace_period_days end,
        benefits=case when $15::date<=current_date then $9::jsonb else benefits end,
        eligibility=case when $15::date<=current_date then $10::jsonb else eligibility end,
        active=$11,effective_from=$12,effective_to=$13,updated_at=now() where id=$14 returning *`,[
        name,String(input.description||"").trim()||null,billingModel,amount,currency,durationDays,renewalRequired,
        gracePeriodDays,JSON.stringify(benefits),JSON.stringify(eligibility),input.active!==false,planEffectiveFrom,planEffectiveTo,existing.id,effectiveFrom
      ])).rows[0];
    }else{
      const productEffectiveFrom=planEffectiveFrom&&planEffectiveFrom>effectiveFrom?planEffectiveFrom:effectiveFrom;
      product=(await db.query(`insert into membership_product(product_code,name,description,billing_model,price,currency,duration_days,renewal_required,grace_period_days,benefits,eligibility,active,effective_from,effective_to)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14) returning *`,[
        code,name,String(input.description||"").trim()||null,billingModel,amount,currency,durationDays,renewalRequired,
        gracePeriodDays,JSON.stringify(benefits),JSON.stringify(eligibility),input.active!==false,productEffectiveFrom,planEffectiveTo
      ])).rows[0];
    }
    const nextVersion=Number((await db.query("select coalesce(max(version),0)+1 version from membership_fee_rule where membership_product_id=$1",[product.id])).rows[0].version);
    // Close the previously open rule at the day before the new rule takes effect.
    await db.query("update membership_fee_rule set effective_to=case when effective_from=$1::date then $1::date else ($1::date-1) end where membership_product_id=$2 and effective_from<=$1::date and (effective_to is null or effective_to >= $1::date)",[effectiveFrom,product.id]);
    const rule=(await db.query(`insert into membership_fee_rule(membership_product_id,version,base_amount,currency,billing_period,tax_amount,service_fee,eligibility_rules,effective_from,created_by,plan_name,plan_description,billing_model,duration_days,renewal_required,grace_period_days,benefits,eligibility,terms_snapshot_complete)
      values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb,true) returning *`,[
      product.id,nextVersion,amount,currency,billingModel,taxAmount,serviceFee,
      JSON.stringify(eligibility),effectiveFrom,actorId,name,String(input.description||"").trim()||null,billingModel,
      durationDays,renewalRequired,gracePeriodDays,JSON.stringify(benefits),JSON.stringify(eligibility)
    ])).rows[0];
    await audit(db,actorId,existing?"membership.plan_version_created":"membership.plan_created","membership_product",product.id,requestId,{
      productCode:code,version:nextVersion,effectiveFrom,active:product.active
    });
    return {product,feeRule:rule};
  });
}

async function product(db,code){
  const r=await db.query("select * from membership_product where product_code=$1 and active=true and (effective_from is null or effective_from<=current_date) and (effective_to is null or effective_to>=current_date)",[String(code||"").toUpperCase()]);
  if(!r.rows[0]) throw httpError(400,"Unknown or inactive membership product.","INVALID_PRODUCT");
  return r.rows[0];
}

function validateMembershipProfessionalDetails(value){
  if(value===undefined||value===null)return null;
  if(typeof value!=="object"||Array.isArray(value))throw httpError(400,"Professional details must be an object.","APPLICATION_DETAILS_INVALID");
  const field=(name,max)=>String(value[name]||"").trim().slice(0,max);
  const fullName=field("fullName",160);
  const sector=field("sector",120);
  const institutionalAffiliation=field("institutionalAffiliation",180);
  const linkedinOrCvUrl=field("linkedinOrCvUrl",500);
  if(!fullName||!sector)throw httpError(400,"Full name and professional sector are required.","APPLICATION_DETAILS_REQUIRED");
  if(value.fullName&&String(value.fullName).trim().length>160||value.sector&&String(value.sector).trim().length>120||value.institutionalAffiliation&&String(value.institutionalAffiliation).trim().length>180||value.linkedinOrCvUrl&&String(value.linkedinOrCvUrl).trim().length>500)throw httpError(400,"One or more professional details exceed the allowed length.","APPLICATION_DETAILS_INVALID");
  if(linkedinOrCvUrl){
    let parsed;
    try{parsed=new URL(linkedinOrCvUrl);}catch{throw httpError(400,"Enter a valid HTTPS LinkedIn or CV link.","APPLICATION_LINK_INVALID");}
    if(parsed.protocol!=="https:"||!parsed.hostname||parsed.username||parsed.password)throw httpError(400,"Enter a valid HTTPS LinkedIn or CV link.","APPLICATION_LINK_INVALID");
  }
  return {fullName,sector,institutionalAffiliation:institutionalAffiliation||null,linkedinOrCvUrl:linkedinOrCvUrl||null};
}

export async function createApplication(userId,input,requestId){
  return withTransaction(async db=>{
    // Serialize applications for one account so concurrent submits cannot both
    // pass the pending-application check.
    const account=(await db.query("select id from app_user where id=$1 for update",[userId])).rows[0];
    if(!account) throw httpError(404,"Account not found.","NOT_FOUND");
    const type=input.applicationType||"new";
    const submissionKey=String(input.idempotencyKey||"").trim();
    if(submissionKey&&!/^[A-Za-z0-9_-]{16,128}$/.test(submissionKey))throw httpError(400,"A valid application idempotency key is required.","VALIDATION_ERROR");
    const submissionPayloadHash=createHash("sha256").update(JSON.stringify({productCode:String(input.productCode||""),applicationType:type,professionalDetails:input.professionalDetails||null})).digest("hex");
    if(submissionKey){
      const prior=(await db.query("select * from membership_application where user_id=$1 and submission_idempotency_key=$2 for update",[userId,submissionKey])).rows[0];
      if(prior){
        if(prior.submission_payload_sha256!==submissionPayloadHash)throw httpError(409,"This application retry key was already used with different application details. Refresh the current application before continuing.","IDEMPOTENCY_CONFLICT");
        return prior;
      }
    }
    const prod=await product(db,input.productCode);
    const activeFeeRule=(await db.query(`select * from membership_fee_rule
      where membership_product_id=$1 and effective_from<=current_date and (effective_to is null or effective_to>=current_date)
      order by effective_from desc,version desc limit 1`,[prod.id])).rows[0]||null;
    const feeTermsComplete=Boolean(activeFeeRule?.terms_snapshot_complete);
    const planBillingModel=feeTermsComplete?activeFeeRule.billing_model:prod.billing_model;
    const planRenewalRequired=feeTermsComplete?activeFeeRule.renewal_required:prod.renewal_required;
    const planDurationDays=feeTermsComplete?activeFeeRule.duration_days:prod.duration_days;
    if(planBillingModel==="recurring"&&(!Number.isInteger(Number(planDurationDays))||Number(planDurationDays)<1||Number(planDurationDays)>3650)) throw httpError(409,"This membership plan has no valid expiry duration configured. Contact membership support before applying.","PLAN_DURATION_INVALID");
    if(planBillingModel==="lifetime"&&planDurationDays!==null) throw httpError(409,"This lifetime plan has conflicting expiry settings. Contact membership support before applying.","PLAN_DURATION_INVALID");
    const active=await db.query("select mr.*,mp.billing_model current_billing_model,mp.renewal_required current_renewal_required from membership_record mr left join membership_product mp on mp.id=mr.membership_product_id where mr.user_id=$1 and mr.status='active' and mr.start_date<=current_date and (mr.end_date is null or mr.end_date>=current_date) order by mr.end_date desc nulls last limit 1",[userId]);
    if(type==="new" && active.rows[0]) throw httpError(409,"An active membership already exists. Use renewal.","ACTIVE_MEMBERSHIP");
    if(type==="renewal"){
      if(!active.rows[0]) throw httpError(400,"Renewal requires an existing active membership.","RENEWAL_NOT_ELIGIBLE");
      if(active.rows[0].current_billing_model==="lifetime"||active.rows[0].current_renewal_required===false) throw httpError(400,"Your current membership does not require renewal. Choose a new application only if membership support has advised you to change plans.","CURRENT_PLAN_NOT_RENEWABLE");
      if(planBillingModel==="lifetime" || !planRenewalRequired) throw httpError(400,"This membership product does not support renewal.","RENEWAL_NOT_SUPPORTED");
    }
    const pending=await db.query("select id from membership_application where user_id=$1 and status in ('submitted','in_review','correction_required','approved','payment_pending','paid') limit 1",[userId]);
    if(pending.rows[0]) throw httpError(409,"You already have an active membership application.","APPLICATION_EXISTS");
    const me=await getMe(userId);
    const professionalDetails=validateMembershipProfessionalDetails(input.professionalDetails);
    const snapshot={person:{firstName:me.first_name,middleName:me.middle_name,lastName:me.last_name,displayName:me.display_name,phone:me.phone,dateOfBirth:me.date_of_birth,sex:me.sex,gender:me.sex,nationality:me.nationality},profile:{headline:me.headline,bio:me.bio},...(professionalDetails?{professionalDetails}: {})};
    const feeAmount=activeFeeRule
      ? Number(activeFeeRule.base_amount)+Number(activeFeeRule.tax_amount||0)+Number(activeFeeRule.service_fee||0)
      : amountFromProduct(prod);
    const fee={
      productCode:prod.product_code,productName:activeFeeRule?.plan_name||prod.name,productDescription:activeFeeRule?.plan_description||prod.description||null,amount:feeAmount,
      currency:activeFeeRule?.currency||prod.currency,billingModel:planBillingModel,
      durationDays:planDurationDays,renewalRequired:planRenewalRequired,
      gracePeriodDays:feeTermsComplete?activeFeeRule.grace_period_days:prod.grace_period_days,
      benefits:feeTermsComplete?activeFeeRule.benefits:prod.benefits,eligibility:feeTermsComplete?activeFeeRule.eligibility:prod.eligibility,
      feeRuleId:activeFeeRule?.id||null,feeRuleVersion:activeFeeRule?.version??null,
      feeBreakdown:activeFeeRule?{baseAmount:Number(activeFeeRule.base_amount),taxAmount:Number(activeFeeRule.tax_amount||0),serviceFee:Number(activeFeeRule.service_fee||0)}:null,
      effectiveFrom:activeFeeRule?.effective_from||prod.effective_from||null,
      effectiveTo:activeFeeRule?.effective_to||prod.effective_to||null,
      durationPolicy:(planBillingModel==="recurring" && Number(planDurationDays)===365)?"calendar_year_inclusive":"fixed_days_inclusive"
    };
    const trackingReference=await nextTrackingReference(db,"membership");
    const row=(await db.query(`insert into membership_application(user_id,tracking_reference,submission_idempotency_key,submission_payload_sha256,application_type,previous_membership_id,membership_product_id,status,submitted_at,data_snapshot,fee_snapshot)
      values($1,$2,$3,$4,$5,$6,$7,'submitted',now(),$8,$9) returning *`,[userId,trackingReference,submissionKey||null,submissionKey?submissionPayloadHash:null,type,active.rows[0]?.id||null,prod.id,snapshot,fee])).rows[0];
    await audit(db,userId,"membership.application_submitted","membership_application",row.id,requestId,{applicationType:type,productCode:prod.product_code});
    await notify(db,userId,"membership_application_submitted","membership_application",row.id,{productCode:prod.product_code,eventVersion:row.submitted_at||row.updated_at||row.id});
    const reviewers=(await db.query("select distinct u.id user_id from app_user u where u.status='active' and (exists(select 1 from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=u.id and r.role_code in ('reviewer','system_admin')) or exists(select 1 from app_user_permission up where up.user_id=u.id and up.permission_code='members.manage'))")).rows;
    for(const reviewer of reviewers)await notify(db,reviewer.user_id,"membership_review_queue_item","membership_application",row.id,{category:"membership",message:"A membership application is ready for review.",nextAction:"Open the existing membership review queue, review required evidence, and record a reasoned decision.",actionUrl:"/membership",reviewerQueue:true,actionRequired:true,priority:"high",eventVersion:row.submitted_at||row.updated_at||row.id});
    return row;
  });
}

export async function reviewApplication(applicationId,reviewerId,input,requestId){
  return withTransaction(async db=>{
    const row=(await db.query("select * from membership_application where id=$1 for update",[applicationId])).rows[0];
    if(!row) throw httpError(404,"Application not found.","NOT_FOUND");
    if(!["submitted","in_review"].includes(row.status)) throw httpError(409,`Application cannot be reviewed from status ${row.status}.`,"INVALID_STATE");
    await db.query("update membership_application set status='in_review',reviewed_at=now(),updated_at=now() where id=$1",[applicationId]);
    const decision=input.decision;
    if(!["approved","rejected","correction_required"].includes(decision)) throw httpError(400,"Invalid review decision.","VALIDATION_ERROR");
    if(decision==="approved"){
      const fee=typeof row.fee_snapshot==="string"?JSON.parse(row.fee_snapshot):row.fee_snapshot;
      const submitted=(await db.query("select attachment_type from membership_application_attachment where application_id=$1 union select 'membership_evidence' where exists(select 1 from membership_application_payment ap join payment_transaction pt on pt.id=ap.payment_transaction_id where ap.application_id=$1 and pt.evidence_file_id is not null)",[applicationId])).rows.map(item=>item.attachment_type);
      let missing=[];
      try{missing=missingRequiredMembershipEvidence(fee?.eligibility?.requiredEvidence||[],submitted);}
      catch(error){throw httpError(409,error.message||"Required membership evidence configuration is invalid.","REQUIRED_EVIDENCE_CONFIGURATION_INVALID");}
      if(missing.length)throw httpError(409,"Cannot approve this application until the required private evidence is attached: "+missing.join(", ").replaceAll("_"," ")+".","REQUIRED_EVIDENCE_MISSING");
    }
    const review=(await db.query("insert into membership_application_review(application_id,reviewer_user_id,decision,note,checklist) values($1,$2,$3,$4,$5) returning *",[applicationId,reviewerId,decision,input.note||null,JSON.stringify(input.checklist||[])])).rows[0];
    const verifiedPayment=(decision==="approved"?(await db.query(`select 1 from membership_application_payment ap join payment_transaction pt on pt.id=ap.payment_transaction_id where ap.application_id=$1 and pt.status='succeeded' and not exists(select 1 from membership_payment_reversal rev where rev.payment_transaction_id=pt.id) limit 1`,[applicationId])).rowCount>0:false);
    const next=applicationStatusAfterReview(decision,verifiedPayment);
    await db.query("update membership_application set status=$1,approved_at=case when $2 then coalesce(approved_at,now()) else approved_at end,updated_at=now() where id=$3",[next,decision==="approved",applicationId]);
    if(decision==="correction_required") await db.query("insert into membership_correction(application_id,requested_by,requested_fields,reviewer_note) values($1,$2,$3,$4)",[applicationId,reviewerId,JSON.stringify(input.requestedFields||[]),input.note||"Correction required."]);
    await audit(db,reviewerId,"membership.application_reviewed","membership_application",applicationId,requestId,{decision});
    await notify(db,row.user_id,`membership_application_${decision}`,"membership_application",applicationId,{note:input.note||null,eventVersion:review.id});
    if(decision==="rejected"){
      const outstanding=(await db.query("select pt.id,pt.status from membership_application_payment ap join payment_transaction pt on pt.id=ap.payment_transaction_id where ap.application_id=$1 and pt.status in ('initiated','pending','succeeded') limit 1",[applicationId])).rows[0];
      if(outstanding){
        const financeUsers=(await db.query("select distinct ur.user_id from app_user_role ur join app_role r on r.id=ur.role_id where r.role_code in ('finance_officer','system_admin') union select distinct up.user_id from app_user_permission up where up.permission_code='finance.manage'")).rows;
        for(const finance of financeUsers)await notify(db,finance.user_id,"membership_payment_reconciliation_required","payment_transaction",outstanding.id,{category:"membership",message:"The membership application was rejected while a payment remains unverified or succeeded.",nextAction:"Verify any outstanding payment and reconcile/refund confirmed funds according to policy.",actionUrl:"/membership",reviewerQueue:true,actionRequired:true,priority:"high"});
      }
    }
    return review;
  });
}

export async function respondCorrection(applicationId,userId,input,requestId){
  return withTransaction(async db=>{
    const row=(await db.query("select * from membership_application where id=$1 and user_id=$2 for update",[applicationId,userId])).rows[0];
    if(!row || row.status!=="correction_required") throw httpError(409,"Application is not awaiting correction.","INVALID_STATE");
    const open=(await db.query("select * from membership_correction where application_id=$1 and status='open' order by created_at desc limit 1 for update",[applicationId])).rows[0];
    if(!open) throw httpError(409,"No open correction request exists.","CORRECTION_NOT_FOUND");
    await db.query("update membership_correction set status='responded',responded_by=$1,applicant_response=$2,responded_at=now() where id=$3",[userId,input.response||{},open.id]);
    const updated=(await db.query("update membership_application set status='submitted',data_snapshot=data_snapshot || $1::jsonb,updated_at=now() where id=$2 returning *",[JSON.stringify(input.response||{}),applicationId])).rows[0];
    await audit(db,userId,"membership.correction_responded","membership_application",applicationId,requestId,{correctionId:open.id});
    await notify(db,userId,"membership_correction_submitted","membership_application",applicationId,{message:"Your response to the membership correction request was submitted.",nextAction:"Wait for the reviewer to reassess the updated application.",actionUrl:"/membership",eventVersion:updated.updated_at||open.id});
    const reviewers=(await db.query("select distinct u.id user_id from app_user u where u.status='active' and (exists(select 1 from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=u.id and r.role_code in ('reviewer','system_admin')) or exists(select 1 from app_user_permission up where up.user_id=u.id and up.permission_code='members.manage'))")).rows;
    for(const reviewer of reviewers)await notify(db,reviewer.user_id,"membership_correction_received","membership_application",applicationId,{category:"membership",message:"A member responded to a requested correction.",nextAction:"Reopen the membership review queue and review the member's response.",actionUrl:"/membership",reviewerQueue:true,actionRequired:true,priority:"high",eventVersion:open.id});
    return updated;
  });
}

export async function createManualPayment(applicationId,userId,input,requestId){
  return withTransaction(async db=>{
    const app=(await db.query("select a.*,p.product_code,p.currency from membership_application a join membership_product p on p.id=a.membership_product_id where a.id=$1 and a.user_id=$2 for update",[applicationId,userId])).rows[0];
    if(!app || !canSubmitMembershipPayment(app.status)) throw httpError(409,"Payment evidence can be submitted only for an active, non-rejected membership application.","INVALID_STATE");
    const fee=app.fee_snapshot;
    let method=null;
    if(input.paymentMethodCode){
      method=(await db.query("select * from membership_payment_method where method_code=$1 and enabled=true for share",[String(input.paymentMethodCode)])).rows[0]||null;
      if(!method) throw httpError(400,"This payment method is not currently available. Refresh the payment page and choose an enabled method.","PAYMENT_METHOD_UNAVAILABLE");
      if(method.method_type==="chapa") throw httpError(400,"Chapa payments must use the secure hosted checkout flow, not manual evidence submission.","PAYMENT_METHOD_REQUIRES_CHECKOUT");
      if(String(method.currency).trim().toUpperCase()!==String(fee.currency||"").trim().toUpperCase()) throw httpError(400,"This payment method does not support the application fee currency.","PAYMENT_CURRENCY_UNSUPPORTED");
      if(method.method_type==="chapa")throw httpError(400,"Online provider checkout must use the secure hosted checkout flow.","PAYMENT_METHOD_REQUIRES_CHECKOUT");
      if(requiresMembershipPaymentEvidence(method.method_type,method.requires_evidence)&&!input.evidenceFileId)throw httpError(400,"This payment method requires a receipt or supporting evidence before submission.","PAYMENT_EVIDENCE_REQUIRED");
    }
    if(input.currency&&String(input.currency).trim().toUpperCase()!==String(fee.currency||"").trim().toUpperCase())throw httpError(400,"Payment currency must match the saved application fee currency.","PAYMENT_CURRENCY_MISMATCH");
    if(input.purpose&&input.purpose!=="membership_fee")throw httpError(400,"Payment purpose must be the membership fee for this application.","PAYMENT_PURPOSE_INVALID");
    const amount=Number(input.amount);
    if(!Number.isFinite(amount) || amount!==Number(fee.amount)) throw httpError(400,"Payment amount must exactly match the fee snapshot shown on this application.","PAYMENT_AMOUNT_MISMATCH");
    const methodType=method?.method_type;
    const channel=methodType==="bank_transfer"?"bank_transfer":methodType==="cash"?"cash":methodType==="telebirr"?"other":methodType==="manual"?"manual":input.channel||"manual";
    const methodReference=String(input.reference||"").trim();
    if(methodType==="bank_transfer"&& !methodReference) throw httpError(400,"Enter the bank transfer or transaction reference.","PAYMENT_REFERENCE_REQUIRED");
    if(methodType==="telebirr"&& !methodReference) throw httpError(400,"Enter the Telebirr transaction reference.","PAYMENT_REFERENCE_REQUIRED");
    const payerBankName=String(input.payerBankName||"").trim();
    if(methodType==="bank_transfer"&&(!payerBankName||payerBankName.length>100))throw httpError(400,"Enter the name of the bank you used to send the transfer (maximum 100 characters).","PAYER_BANK_REQUIRED");
    const idem=String(input.idempotencyKey||"").trim();
    if(!/^[A-Za-z0-9_-]{16,128}$/.test(idem)) throw httpError(400,"idempotencyKey must be a unique token between 16 and 128 letters, digits, underscores or dashes.","VALIDATION_ERROR");
    const existing=await db.query(`select pt.*,ap.application_id,a.user_id as application_user_id
      from payment_transaction pt
      left join membership_application_payment ap on ap.payment_transaction_id=pt.id
      left join membership_application a on a.id=ap.application_id
      where pt.idempotency_key=$1 for update of pt`,[idem]);
    if(existing.rows[0]){
      const prior=existing.rows[0];
      if(prior.purpose!=="membership"||prior.application_id!==applicationId||prior.application_user_id!==userId||
         Number(prior.amount)!==amount||String(prior.currency).trim().toUpperCase()!==String(fee.currency).trim().toUpperCase()||
         prior.submitted_by!==userId||(input.paymentMethodCode&&prior.payment_method_code!==input.paymentMethodCode)){
        throw httpError(409,"This payment reference was already used for a different submission. Refresh the application and submit again with a new reference.","IDEMPOTENCY_CONFLICT");
      }
      return prior;
    }
    const activePayment=(await db.query("select pt.id,pt.status from membership_application_payment ap join payment_transaction pt on pt.id=ap.payment_transaction_id where ap.application_id=$1 and pt.status in ('initiated','pending','succeeded') and not (pt.status='pending' and pt.verification_note is not null) order by pt.created_at desc limit 1 for update of pt",[applicationId])).rows[0];
    if(activePayment)throw httpError(409,"A payment is already awaiting verification or has already succeeded for this application. Check its status before starting another payment.","PAYMENT_ALREADY_ACTIVE");
    await db.query("update payment_transaction pt set status='cancelled',completed_at=coalesce(completed_at,now()),updated_at=now(),verification_note=concat_ws(' | ',verification_note,'Superseded by a replacement payment submission.') from membership_application_payment ap where ap.payment_transaction_id=pt.id and ap.application_id=$1 and pt.status='pending' and pt.verification_note is not null",[applicationId]);
    const p=(await db.query(`insert into payment_transaction(provider,provider_transaction_id,idempotency_key,purpose,amount,currency,status,request_payload,channel,submitted_by,purpose_reference,source,payment_method_code)
      values('manual',null,$1,'membership', $2,$3,'pending',$4::jsonb,$5,$6,$7,'manual_entry',$8) returning *`,
      [idem,amount,fee.currency,JSON.stringify({purpose:"membership_fee",channel,reference:methodReference||null,paymentMethodCode:method?.method_code||null,payerBankName:payerBankName||null,methodSnapshot:method?{displayName:method.display_name,methodType:method.method_type,currency:method.currency,bankName:method.bank_name,accountName:method.account_name,accountNumber:method.account_number,providerCode:method.provider_code,requiresEvidence:method.requires_evidence===true}:null}),channel,userId,methodReference||applicationId,method?.method_code||null])).rows[0];
    await db.query("insert into membership_application_payment(application_id,payment_transaction_id) values($1,$2)",[applicationId,p.id]);
    if(input.evidenceFileId){
      const file=await db.query("select id from file_object where id=$1 and (created_by=$2 or created_by is null)",[input.evidenceFileId,userId]);
      if(!file.rows[0]) throw httpError(400,"Payment evidence file is not available to this account.","INVALID_EVIDENCE");
      await db.query("update payment_transaction set evidence_file_id=$1 where id=$2",[input.evidenceFileId,p.id]);
    }
    await audit(db,userId,"membership.payment_submitted","payment_transaction",p.id,requestId,{applicationId,channel,paymentMethodCode:method?.method_code||null});
    await notify(db,userId,"membership_payment_submitted","membership_application",applicationId,{paymentId:p.id,eventVersion:p.id});
    const financeUsers=(await db.query("select distinct ur.user_id from app_user_role ur join app_role r on r.id=ur.role_id where r.role_code in ('finance_officer','system_admin') union select distinct up.user_id from app_user_permission up where up.permission_code='finance.manage'")).rows;
    for(const finance of financeUsers)await notify(db,finance.user_id,"membership_payment_review_required","payment_transaction",p.id,{category:"membership",message:"A membership payment is awaiting finance verification.",nextAction:"Review the payment evidence and reconcile it against the application fee snapshot; application approval is a separate decision.",actionUrl:"/membership",reviewerQueue:true,actionRequired:true,priority:"high"});
    return p;
  });
}

export async function verifyPayment(paymentId,verifierId,input,requestId){
  return withTransaction(async db=>{
    const link=(await db.query("select application_id from membership_application_payment where payment_transaction_id=$1",[paymentId])).rows[0];
    if(!link) throw httpError(404,"Payment not found.","NOT_FOUND");
    // Lock application before payment to match submission, activation and reversal.
    const app=(await db.query("select id,user_id,status,fee_snapshot,approved_at from membership_application where id=$1 for update",[link.application_id])).rows[0];
    const payment=(await db.query("select * from payment_transaction where id=$1 for update",[paymentId])).rows[0];
    if(!app||!payment) throw httpError(404,"Payment not found.","NOT_FOUND");
    const p={...payment,application_id:link.application_id,user_id:app.user_id,application_status:app.status,fee_snapshot:app.fee_snapshot,approved_at:app.approved_at};
    // A reversal is the strongest terminal guard: report it explicitly even if
    // the application lifecycle has since advanced or the payment status changed.
    if((await db.query("select 1 from membership_payment_reversal where payment_transaction_id=$1",[paymentId])).rowCount) throw httpError(409,"A reversed or refunded payment cannot be verified again. Submit a new payment for this application if needed.","PAYMENT_ALREADY_REVERSED");
    if(p.status!=="pending") throw httpError(409,"Only a pending payment can be verified. This payment has already been decided or reversed.","PAYMENT_NOT_PENDING");
    if(!canSubmitMembershipPayment(p.application_status)) throw httpError(409,"Payment verification is permitted only for an eligible, non-rejected membership application.","APPLICATION_NOT_PAYABLE");
    const fee=typeof p.fee_snapshot==="string"?JSON.parse(p.fee_snapshot):p.fee_snapshot;
    if(!fee||Number(p.amount)!==Number(fee.amount)||String(p.currency||"").toUpperCase()!==String(fee.currency||"").toUpperCase()) throw httpError(409,"Payment amount or currency does not match the application fee snapshot.","PAYMENT_AMOUNT_MISMATCH");
    if(!["manual","bank_transfer","cash","other"].includes(p.channel) || p.source==="provider_webhook") throw httpError(400,"This payment is not eligible for manual verification.","INVALID_PAYMENT_CHANNEL");
    const decision=input.decision;
    if(!["approved","rejected","needs_correction"].includes(decision)) throw httpError(400,"Invalid payment verification decision.","VALIDATION_ERROR");
    const next=decision==="approved"?"succeeded":decision==="rejected"?"failed":"pending";
    await db.query("insert into payment_verification(payment_transaction_id,verifier_user_id,decision,evidence_checked,note) values($1,$2,$3,$4,$5)",[paymentId,verifierId,decision,JSON.stringify(input.evidenceChecked||[]),input.note||null]);
    await db.query("update payment_transaction set status=$1,verified_by=$2,verified_at=now(),verification_note=$3,completed_at=case when $1 in ('succeeded','failed') then now() else completed_at end,updated_at=now() where id=$4",[next,verifierId,input.note||null,paymentId]);
    // A verified early payment is independent of application approval. Preserve the
    // application lifecycle until a reviewer approves it; only an already-approved
    // application can advance to paid after finance verification.
    const appStatus=applicationStatusAfterPaymentVerification(p.application_status,p.approved_at,decision);
    if(appStatus!==p.application_status) await db.query("update membership_application set status=$1,updated_at=now() where id=$2",[appStatus,p.application_id]);
    if(decision==="approved") await db.query("insert into payment_reconciliation(payment_transaction_id,membership_id,reconciliation_status,reconciled_by,reconciled_at,note) values($1,null,'matched',$2,now(),$3)",[paymentId,verifierId,`Matched to membership application ${p.application_id}`]);
    await audit(db,verifierId,"membership.payment_verified","payment_transaction",paymentId,requestId,{decision,applicationId:p.application_id});
    await notify(db,p.user_id,`membership_payment_${decision}`,"payment_transaction",paymentId,{applicationId:p.application_id,eventVersion:requestId||paymentId});
    return (await db.query("select * from payment_transaction where id=$1",[paymentId])).rows[0];
  });
}

export async function activateApplication(applicationId,actorId,requestId){
  return withTransaction(async db=>{
    const app=(await db.query("select a.*,p.product_code,p.name,p.billing_model,p.renewal_required from membership_application a join membership_product p on p.id=a.membership_product_id where a.id=$1 for update of a",[applicationId])).rows[0];
    if(!app) throw httpError(404,"Membership application not found.","NOT_FOUND");
    if(app.status==="activated"){
      const current=(await db.query("select * from membership_record where application_id=$1 and status='active' and start_date<=current_date and (end_date is null or end_date>=current_date) order by created_at desc limit 1",[applicationId])).rows[0];
      if(current) return current;
      const historical=(await db.query("select id from membership_record where application_id=$1 order by created_at desc limit 1",[applicationId])).rows[0];
      throw httpError(409,historical?"This application was activated previously, but its membership is no longer current. Review its status before taking further action.":"This application is marked activated but its membership record is missing. Contact membership support before retrying.",historical?"MEMBERSHIP_NOT_CURRENT":"ACTIVATION_RECORD_MISSING");
    }
    if(app.status!=="paid" || !app.approved_at) throw httpError(409,"Application must be approved and have a verified payment before activation.","ACTIVATION_NOT_READY");
    const fee=typeof app.fee_snapshot==="string"?JSON.parse(app.fee_snapshot):app.fee_snapshot;
    const pay=(await db.query(`select pt.* from payment_transaction pt
      join membership_application_payment ap on ap.payment_transaction_id=pt.id
      where ap.application_id=$1 and pt.status='succeeded'
        and not exists (select 1 from membership_payment_reversal mr where mr.payment_transaction_id=pt.id)
      order by pt.created_at desc limit 1 for update of pt`,[applicationId])).rows[0];
    if(!pay) throw httpError(409,"No unreversed successful payment is linked to this application.","PAYMENT_NOT_CONFIRMED");
    if(!fee||!Number.isFinite(Number(fee.amount))||!fee.currency||fee.durationDays===undefined||(fee.billingModel==="recurring"&&(!Number.isInteger(Number(fee.durationDays))||Number(fee.durationDays)<1||Number(fee.durationDays)>3650))||(fee.billingModel==="lifetime"&&fee.durationDays!==null)||Number(pay.amount)!==Number(fee.amount)||String(pay.currency||"").trim().toUpperCase()!==String(fee.currency||"").trim().toUpperCase()){
      throw httpError(409,"The payment no longer matches the application’s saved fee terms. Membership has not been activated.","PAYMENT_AMOUNT_MISMATCH");
    }
    const previous=app.previous_membership_id ? (await db.query("select * from membership_record where id=$1 for update",[app.previous_membership_id])).rows[0] : null;
    const start=new Date(); start.setUTCHours(0,0,0,0);
    if(previous?.status==="active" && previous.end_date && new Date(previous.end_date)>=start) start.setTime(new Date(previous.end_date).getTime()+86400000);
    const todayUtc=new Date();todayUtc.setUTCHours(0,0,0,0);
    if(app.application_type==="renewal"&&start.getTime()>todayUtc.getTime()){
      throw httpError(409,`Your current membership remains active through ${previous?.end_date?new Date(previous.end_date).toISOString().slice(0,10):"its recorded end date"}. Activate the paid renewal on or after ${start.toISOString().slice(0,10)}; your current access has not been changed.`,"RENEWAL_NOT_DUE");
    }
    // Retire stale active rows before inserting a replacement. Authorization
    // already checks dates, but the database's one-active-row constraint also
    // requires stale records to be transitioned out of the active state.
    await db.query("update membership_record set status='expired',updated_at=now() where user_id=$1 and status='active' and end_date is not null and end_date<current_date",[app.user_id]);
    const currentActive=(await db.query("select * from membership_record where user_id=$1 and status='active' and start_date<=current_date and (end_date is null or end_date>=current_date) order by end_date desc nulls last limit 1 for update",[app.user_id])).rows[0];
    if(currentActive && currentActive.id!==app.previous_membership_id){
      throw httpError(409,"An active membership already exists. Review the current membership before activating this application.","ACTIVE_MEMBERSHIP");
    }
    let end=null;
    if(fee.durationDays!==null && fee.durationDays!==undefined) end=membershipEndDate(start,fee);
    const number=generateMembershipNumber(start);
    if(previous?.status==="active") await db.query("update membership_record set status='expired',end_date=coalesce(end_date,$1),updated_at=now() where id=$2",[new Date(start.getTime()-86400000).toISOString().slice(0,10),previous.id]);
    const membership=(await db.query(`insert into membership_record(user_id,membership_product_id,membership_number,status,start_date,end_date,source,application_id)
      values($1,$2,$3,'active',$4,$5,'online',$6) returning *`,[app.user_id,app.membership_product_id,number,start.toISOString().slice(0,10),end?.toISOString().slice(0,10)||null,applicationId])).rows[0];
    await db.query("update membership_application set status='activated',activated_at=now(),updated_at=now() where id=$1",[applicationId]);
    await db.query("update payment_reconciliation set membership_id=$1,reconciled_at=coalesce(reconciled_at,now()) where payment_transaction_id=$2 and reconciliation_status='matched'",[membership.id,pay.id]);
    await db.query("insert into membership_event(membership_id,event_type,effective_at,actor_user_id,source,details) values($1,'activated',now(),$2,'membership_application',$3)",[membership.id,actorId,JSON.stringify({applicationId,paymentId:pay.id,productCode:app.product_code,durationDays:fee.durationDays,durationPolicy:fee.durationPolicy||"fixed_days_inclusive",feeRuleId:fee.feeRuleId||null,feeRuleVersion:fee.feeRuleVersion??null})]);
    await audit(db,actorId,"membership.activated","membership_record",membership.id,requestId,{applicationId,paymentId:pay.id});
    await notify(db,app.user_id,"membership_activated","membership_record",membership.id,{membershipNumber:number,productCode:app.product_code});
    return membership;
  });
}

export async function reverseMembershipPayment(paymentId,actorId,input,requestId){
  return withTransaction(async db=>{
    const reason=String(input.reason||"").trim();
    if(reason.length<8) throw httpError(400,"Provide a clear reason of at least 8 characters for the refund or reversal.","REVERSAL_REASON_REQUIRED");
    const link=(await db.query("select application_id from membership_application_payment where payment_transaction_id=$1",[paymentId])).rows[0];
    if(!link) throw httpError(404,"Membership payment not found.","NOT_FOUND");
    // Keep lock order consistent with activation: application first, then payment.
    const app=(await db.query("select id,user_id,status from membership_application where id=$1 for update",[link.application_id])).rows[0];
    const payment=(await db.query("select * from payment_transaction where id=$1 for update",[paymentId])).rows[0];
    if(!app||!payment) throw httpError(404,"Membership payment not found.","NOT_FOUND");
    const row={...payment,application_id:link.application_id,user_id:app.user_id,application_status:app.status};
    const prior=(await db.query("select * from membership_payment_reversal where payment_transaction_id=$1",[paymentId])).rows[0];
    if(prior) return prior;
    if(row.status!=="succeeded") throw httpError(409,"Only a successfully verified membership payment can be refunded or reversed.","PAYMENT_NOT_REVERSIBLE");
    const reversalType=input.type==="reversal"?"reversal":"refund";
    const record=(await db.query(`insert into membership_payment_reversal(payment_transaction_id,application_id,reversal_type,reason,evidence_reference,reversed_by,metadata)
      values($1,$2,$3,$4,$5,$6,$7::jsonb) returning *`,[
      paymentId,row.application_id,reversalType,reason,String(input.evidenceReference||"").trim()||null,actorId,
      JSON.stringify({requestId:requestId||null,previousStatus:row.status,applicationStatus:row.application_status})
    ])).rows[0];
    await db.query("update payment_transaction set status='refunded',updated_at=now(),completed_at=coalesce(completed_at,now()),verification_note=$1 where id=$2",[reason,paymentId]);
    await db.query("update payment_reconciliation set reconciliation_status='disputed',reconciled_by=$1,reconciled_at=now(),note=concat_ws(' | ',note,$2::text) where payment_transaction_id=$3",[actorId,`Refund/reversal recorded: ${reason}`,paymentId]);
    const suspended=(await db.query("update membership_record set status='suspended',updated_at=now() where application_id=$1 and status='active' returning id,user_id",[row.application_id])).rows;
    if(row.application_status==="paid"){
      await db.query("update membership_application set status='payment_pending',updated_at=now() where id=$1",[row.application_id]);
    }
    await audit(db,actorId,"membership.payment_reversed","membership_payment_reversal",record.id,requestId,{
      applicationId:row.application_id,paymentId,reversalType,suspendedMembershipIds:suspended.map(item=>item.id)
    });
    await notify(db,row.user_id,"membership_payment_reversed","membership_application",row.application_id,{
      reversalType,reason,membershipAccessChanged:suspended.length>0
    });
    return record;
  });
}

export async function expireDueMemberships(batchSize=500){
 const size=Math.max(1,Math.min(5000,Number.parseInt(batchSize,10)||500));
 return withTransaction(async db=>{
  const result=await db.query(`with due as (
    select id,user_id,end_date from membership_record
    where status='active' and end_date is not null and end_date<current_date
    order by end_date asc,id asc
    limit $1
    for update skip locked
  ), expired as (
    update membership_record mr set status='expired',updated_at=now()
    from due where mr.id=due.id
    returning mr.id,mr.user_id,mr.end_date
  ), logged as (
    insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata)
    select null,'membership.expired','membership_record',e.id,null,'success',
      jsonb_build_object('reason','end_date_elapsed','endDate',e.end_date,'source','expiry_batch')
    from expired e
    returning resource_id
  )
  select e.id,e.user_id,e.end_date from expired e
  order by e.end_date asc`,[size]);
  return {expiredCount:result.rowCount,items:result.rows};
 });
}

export async function renew(userId,productCode,requestId){
  return createApplication(userId,{productCode,applicationType:"renewal"},requestId);
}

export async function history(userId){
  const db=getPool();
  const [memberships,applications,payments,events,notifications]=await Promise.all([
    db.query("select m.*,p.product_code,p.name from membership_record m join membership_product p on p.id=m.membership_product_id where m.user_id=$1 order by m.start_date desc nulls last,m.created_at desc",[userId]),
    db.query("select id,application_type,status,membership_product_id,submitted_at,reviewed_at,approved_at,activated_at,created_at,updated_at from membership_application where user_id=$1 order by created_at desc",[userId]),
    db.query("select p.*,ap.application_id from payment_transaction p join membership_application_payment ap on ap.payment_transaction_id=p.id join membership_application a on a.id=ap.application_id where a.user_id=$1 order by p.created_at desc",[userId]),
    db.query("select e.* from membership_event e join membership_record m on m.id=e.membership_id where m.user_id=$1 order by e.effective_at desc",[userId]),
    db.query("select * from notification_event where user_id=$1 order by created_at desc limit 100",[userId])
  ]);
  return {memberships:memberships.rows,applications:applications.rows,payments:payments.rows,events:events.rows,notifications:notifications.rows};
}

export async function listApplicationsForReview(){
  const db=getPool();
  const r=await db.query(`select a.id,a.user_id,a.tracking_reference,a.application_type,a.status,a.submitted_at,a.created_at,a.updated_at,a.data_snapshot,a.fee_snapshot,p.product_code,p.name,u.email,pe.display_name,
      (select mr.end_date from membership_record mr where mr.id=a.previous_membership_id) previous_membership_end_date,
      (select jsonb_build_object('id',pt.id,'status',pt.status,'amount',pt.amount,'currency',pt.currency,'channel',pt.channel,'reference',coalesce(pt.request_payload->>'reference',pt.purpose_reference),'payment_method_code',pt.payment_method_code,'payer_bank_name',pt.request_payload->>'payerBankName','evidence_file_id',pt.evidence_file_id,'created_at',pt.created_at,'verified_at',pt.verified_at,'verification_note',pt.verification_note,'reconciliation_status',pr.reconciliation_status,'reconciliation_note',pr.note,'reversal',(select jsonb_build_object('type',rev.reversal_type,'reason',rev.reason,'evidence_reference',rev.evidence_reference,'created_at',rev.created_at) from membership_payment_reversal rev where rev.payment_transaction_id=pt.id))
       from membership_application_payment ap join payment_transaction pt on pt.id=ap.payment_transaction_id left join payment_reconciliation pr on pr.payment_transaction_id=pt.id
       where ap.application_id=a.id order by pt.created_at desc limit 1) payment,
      coalesce((select jsonb_agg(jsonb_build_object('decision',rv.decision,'note',rv.note,'createdAt',rv.created_at) order by rv.created_at desc) from membership_application_review rv where rv.application_id=a.id),'[]'::jsonb) review_history,
      coalesce((select jsonb_agg(jsonb_build_object('id',aa.id,'fileObjectId',f.id,'fileName',f.original_name,'attachmentType',aa.attachment_type,'createdAt',aa.created_at) order by aa.created_at desc) from membership_application_attachment aa join file_object f on f.id=aa.file_object_id where aa.application_id=a.id),'[]'::jsonb) attachments
    from membership_application a join membership_product p on p.id=a.membership_product_id join app_user u on u.id=a.user_id left join person pe on pe.user_id=a.user_id
    where a.status in ('submitted','in_review','correction_required','approved','payment_pending','paid')
      or (a.status='rejected' and exists(select 1 from membership_application_payment apr join payment_transaction ptr on ptr.id=apr.payment_transaction_id where apr.application_id=a.id and ptr.status in ('initiated','pending','succeeded') and not exists(select 1 from membership_payment_reversal rpr where rpr.payment_transaction_id=ptr.id)))
      or (a.status='activated' and exists(select 1 from membership_application_payment apx join payment_transaction ptx on ptx.id=apx.payment_transaction_id where apx.application_id=a.id and ptx.status='succeeded' and not exists(select 1 from membership_payment_reversal rtx where rtx.payment_transaction_id=ptx.id)))
    order by a.created_at asc`);
  return r.rows;
}

export async function attachApplicationFile(applicationId,userId,input,requestId){
  return withTransaction(async db=>{
    const app=(await db.query("select id from membership_application where id=$1 and user_id=$2",[applicationId,userId])).rows[0];
    if(!app) throw httpError(404,"Application not found.","NOT_FOUND");
    const file=(await db.query("select id,original_name,content_type,byte_size,visibility from file_object where id=$1 and (created_by=$2 or created_by is null)",[input.fileObjectId,userId])).rows[0];
    if(!file) throw httpError(400,"File is not available to this account.","INVALID_FILE");
    const row=(await db.query("insert into membership_application_attachment(application_id,file_object_id,attachment_type,created_by) values($1,$2,$3,$4) on conflict(application_id,file_object_id) do update set attachment_type=excluded.attachment_type returning *",[applicationId,input.fileObjectId,input.attachmentType||"supporting_document",userId])).rows[0];
    await audit(db,userId,"membership.application_attachment_added","membership_application_attachment",row.id,requestId,{applicationId,fileObjectId:input.fileObjectId});
    return {...row,file};
  });
}

function chapaConfig(){
  const mode=String(process.env.CHAPA_EXPECTED_MODE||"test").trim().toLowerCase(),secret=String(process.env.CHAPA_SECRET_KEY||"").trim(),webhookSecret=String(process.env.CHAPA_WEBHOOK_SECRET||"").trim();
  if(!["test","live"].includes(mode))throw httpError(503,"CHAPA_EXPECTED_MODE must be test or live.","CHAPA_CONFIGURATION_INVALID");
  if(!secret)throw httpError(503,"Chapa checkout is not configured.","CHAPA_NOT_CONFIGURED");
  return {mode,secret,webhookSecret,callbackUrl:String(process.env.CHAPA_CALLBACK_URL||"").trim(),returnUrl:String(process.env.CHAPA_RETURN_URL||"").trim()};
}
async function chapaPayload(response){try{return await response.json();}catch{return {};}}
async function chapaVerifyAtProvider(ref,secret){
  const response=await fetch("https://api.chapa.co/v1/transaction/verify/"+encodeURIComponent(ref),{headers:{Authorization:"Bearer "+secret,Accept:"application/json"},signal:AbortSignal.timeout(12000)});
  const payload=await chapaPayload(response),data=payload&&payload.data;
  if(!response.ok||String(payload.status||"").toLowerCase()!=="success"||!data)throw httpError(502,"Chapa could not confirm this transaction; it remains unverified.","CHAPA_VERIFICATION_UNAVAILABLE");
  return {status:String(data.status||"").toLowerCase(),reference:String(data.tx_ref||data.reference||""),currency:String(data.currency||"").toUpperCase(),amount:Number(data.amount),providerId:String(data.id||data.reference||ref)};
}
export async function listMembershipPaymentMethods({admin=false}={}){
  const sql="select method_code,method_type,display_name,enabled,currency,instructions,bank_name,account_name,account_number,provider_code,qr_image_url,requires_evidence,updated_at from membership_payment_method "+(admin?"":"where enabled=true ")+"order by method_type,display_name,method_code";
  return (await getPool().query(sql)).rows;
}
export async function saveMembershipPaymentMethod(actorId,input,requestId){
  const code=String(input.methodCode||"").trim().toLowerCase(),type=String(input.methodType||"").trim().toLowerCase(),name=String(input.displayName||"").trim(),currency=String(input.currency||"ETB").trim().toUpperCase(),instructions=String(input.instructions||"").trim(),enabled=input.enabled===true;
  if(!/^[a-z][a-z0-9_]{1,39}$/.test(code)||!["chapa","telebirr","bank_transfer","cash","manual"].includes(type)||!name||name.length>120||!/^[A-Z]{3}$/.test(currency)||instructions.length>2000)throw httpError(400,"Enter a valid payment method code, type, display name, currency and instructions.","VALIDATION_ERROR");
  if(type==="chapa"&&enabled){try{chapaConfig();}catch{throw httpError(409,"Chapa cannot be enabled until server-side credentials and mode are configured.","CHAPA_NOT_CONFIGURED");}}
  const field=(v,n)=>{const s=String(v||"").trim();if(s.length>n)throw httpError(400,"A payment method field is too long.","VALIDATION_ERROR");return s||null;};
  const qr=field(input.qrImageUrl,500);if(qr){let u;try{u=new URL(qr);}catch{throw httpError(400,"QR image URL must be HTTPS.","VALIDATION_ERROR");}if(u.protocol!=="https:")throw httpError(400,"QR image URL must be HTTPS.","VALIDATION_ERROR");}
  const requiresEvidence=type==="chapa"?false:input.requiresEvidence!==false;
  return withTransaction(async db=>{
    const row=(await db.query("insert into membership_payment_method(method_code,method_type,display_name,enabled,currency,instructions,bank_name,account_name,account_number,provider_code,qr_image_url,requires_evidence,updated_by,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now()) on conflict(method_code) do update set method_type=excluded.method_type,display_name=excluded.display_name,enabled=excluded.enabled,currency=excluded.currency,instructions=excluded.instructions,bank_name=excluded.bank_name,account_name=excluded.account_name,account_number=excluded.account_number,provider_code=excluded.provider_code,qr_image_url=excluded.qr_image_url,requires_evidence=excluded.requires_evidence,updated_by=excluded.updated_by,updated_at=now() returning method_code,method_type,display_name,enabled,currency,instructions,bank_name,account_name,account_number,provider_code,qr_image_url,requires_evidence,updated_at",[code,type,name,enabled,currency,instructions,field(input.bankName,120),field(input.accountName,120),field(input.accountNumber,120),field(input.providerCode,120),qr,requiresEvidence,actorId])).rows[0];
    await audit(db,actorId,"membership.payment_method_saved","membership_payment_method",null,requestId,{methodCode:code,methodType:type,enabled,currency});return row;
  });
}
export async function initiateChapaMembershipPayment(applicationId,userId,input,requestId){
  const cfg=chapaConfig();if(!cfg.callbackUrl||!cfg.returnUrl)throw httpError(503,"Chapa callback and return URLs must be configured.","CHAPA_CONFIGURATION_INVALID");
  for(const value of [cfg.callbackUrl,cfg.returnUrl]){try{if(new URL(value).protocol!=="https:")throw new Error();}catch{throw httpError(503,"Chapa callback and return URLs must be valid HTTPS URLs.","CHAPA_CONFIGURATION_INVALID");}}
  const idem=String(input.idempotencyKey||"").trim();if(!/^[A-Za-z0-9_-]{16,128}$/.test(idem))throw httpError(400,"A valid checkout idempotency key is required.","VALIDATION_ERROR");
  const prepared=await withTransaction(async db=>{
    const app=(await db.query("select a.*,p.name product_name from membership_application a join membership_product p on p.id=a.membership_product_id where a.id=$1 and a.user_id=$2 for update of a",[applicationId,userId])).rows[0];
    if(!app||!canSubmitMembershipPayment(app.status))throw httpError(404,"Eligible membership application not found for this account.","APPLICATION_NOT_PAYABLE");
    const fee=typeof app.fee_snapshot==="string"?JSON.parse(app.fee_snapshot):app.fee_snapshot,method=(await db.query("select * from membership_payment_method where method_code=$1 and method_type='chapa' and enabled=true for share",[String(input.paymentMethodCode||"")])).rows[0];
    if(!method||String(method.currency).toUpperCase()!==String(fee.currency||"").toUpperCase())throw httpError(400,"Selected Chapa method is unavailable for this application currency.","PAYMENT_METHOD_UNAVAILABLE");
    toChapaMinorUnits(fee.amount,fee.currency);
    const prior=(await db.query("select pt.*,ap.application_id,a.user_id application_user_id from payment_transaction pt left join membership_application_payment ap on ap.payment_transaction_id=pt.id left join membership_application a on a.id=ap.application_id where pt.idempotency_key=$1 for update of pt",[idem])).rows[0];
    if(prior){if(prior.provider!=="chapa"||prior.application_id!==applicationId||prior.application_user_id!==userId)throw httpError(409,"Checkout key belongs to another payment.","IDEMPOTENCY_CONFLICT");if(prior.request_payload&&prior.request_payload.checkoutUrl&&["initiated","pending"].includes(prior.status))return {replay:true,checkoutUrl:prior.request_payload.checkoutUrl,ref:prior.request_payload.merchantReference,status:prior.status};throw httpError(409,"This checkout key has already been used; refresh payment status before retrying.","PAYMENT_ALREADY_DECIDED");}
    const active=(await db.query("select pt.id from membership_application_payment ap join payment_transaction pt on pt.id=ap.payment_transaction_id where ap.application_id=$1 and pt.provider='chapa' and pt.status in ('initiated','pending','succeeded') limit 1 for update of pt",[applicationId])).rows[0];if(active)throw httpError(409,"A hosted payment is already in progress or succeeded for this application.","PAYMENT_ALREADY_ACTIVE");
    const ref="MPA-MEM-"+randomUUID().replaceAll("-","").toUpperCase();
    const payment=(await db.query("insert into payment_transaction(provider,provider_transaction_id,idempotency_key,purpose,amount,currency,status,request_payload,channel,submitted_by,purpose_reference,source,payment_method_code) values('chapa',null,$1,'membership',$2,$3,'initiated',$4::jsonb,'other',$5,$6,'hosted_checkout',$7) returning *",[idem,Number(fee.amount),fee.currency,JSON.stringify({merchantReference:ref,mode:cfg.mode,methodCode:method.method_code}),userId,ref,method.method_code])).rows[0];
    await db.query("insert into membership_application_payment(application_id,payment_transaction_id) values($1,$2)",[applicationId,payment.id]);await audit(db,userId,"membership.chapa_checkout_started","payment_transaction",payment.id,requestId,{applicationId,merchantReference:ref,mode:cfg.mode});return {payment,ref,fee,app};
  });
  if(prepared.replay)return {checkoutUrl:prepared.checkoutUrl,merchantReference:prepared.ref,status:prepared.status,replayed:true};
  const payment=prepared.payment,ref=prepared.ref;
  try{
    const person=(await getPool().query("select p.first_name,p.last_name,u.email from person p join app_user u on u.id=p.user_id where p.user_id=$1",[userId])).rows[0];if(!person||!person.email)throw httpError(409,"A valid account email is required for hosted checkout.","CHECKOUT_EMAIL_REQUIRED");
    const response=await fetch("https://api.chapa.co/v1/transaction/initialize",{method:"POST",headers:{Authorization:"Bearer "+cfg.secret,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({amount:String(prepared.fee.amount),currency:String(prepared.fee.currency).toUpperCase(),email:person.email,first_name:person.first_name||"MPA",last_name:person.last_name||"Member",tx_ref:ref,callback_url:cfg.callbackUrl,return_url:cfg.returnUrl+"?merchant_reference="+encodeURIComponent(ref),customization:{title:"MPA membership",description:"Membership application payment"},meta:{application_id:applicationId,payment_id:payment.id,mode:cfg.mode}}),signal:AbortSignal.timeout(15000)});
    const payload=await chapaPayload(response),url=String(payload&&payload.data&&payload.data.checkout_url||"");if(!response.ok||String(payload.status||"").toLowerCase()!=="success"||!/^https:\/\/checkout\.chapa\.co\//i.test(url))throw httpError(502,"Chapa did not return a valid hosted checkout URL.","CHAPA_CHECKOUT_FAILED");
    await withTransaction(async db=>{await db.query("update payment_transaction set status='pending',request_payload=request_payload || $1::jsonb,updated_at=now() where id=$2 and status='initiated'",[JSON.stringify({checkoutUrl:url}),payment.id]);await audit(db,userId,"membership.chapa_checkout_initialized","payment_transaction",payment.id,requestId,{merchantReference:ref,mode:cfg.mode});});return {checkoutUrl:url,merchantReference:ref,status:"pending",replayed:false};
  }catch(error){await withTransaction(async db=>{await db.query("update payment_transaction set status='failed',completed_at=now(),verification_note=$1,updated_at=now() where id=$2 and status='initiated'",[String(error.message||"Checkout initialization failed").slice(0,500),payment.id]);await audit(db,userId,"membership.chapa_checkout_failed","payment_transaction",payment.id,requestId,{merchantReference:ref,code:error.code||"CHAPA_CHECKOUT_FAILED"});}).catch(()=>{});throw error;}
}
export async function verifyChapaMembershipPayment(merchantReference,requestId,userId=null){
  const ref=String(merchantReference||"").trim();if(!/^[A-Za-z0-9_-]{8,128}$/.test(ref))throw httpError(400,"A valid merchant reference is required.","VALIDATION_ERROR");const cfg=chapaConfig();
  const found=(await getPool().query("select pt.*,ap.application_id,a.user_id application_user_id,a.status application_status,a.approved_at,a.fee_snapshot from payment_transaction pt join membership_application_payment ap on ap.payment_transaction_id=pt.id join membership_application a on a.id=ap.application_id where pt.provider='chapa' and (pt.purpose_reference=$1 or pt.request_payload->>'merchantReference'=$1) limit 1",[ref])).rows[0];
  if(!found||(userId&&found.application_user_id!==userId))throw httpError(404,"No hosted membership payment was found for this reference on this account.","NOT_FOUND");if(found.status==="succeeded")return {status:"succeeded",verified:true,applicationStatus:found.application_status};if(!["initiated","pending"].includes(found.status))throw httpError(409,"Hosted payment is not eligible for verification.","PAYMENT_NOT_PENDING");
  const provider=await chapaVerifyAtProvider(ref,cfg.secret);if(provider.status!=="success"||provider.reference!==ref||provider.currency!==String(found.currency).toUpperCase()||provider.amount!==Number(found.amount)){await withTransaction(async db=>{await db.query("update payment_transaction set verification_note='Provider verification mismatch; payment remains unverified',updated_at=now() where id=$1 and status in ('initiated','pending')",[found.id]);await audit(db,userId||null,"membership.chapa_verification_mismatch","payment_transaction",found.id,requestId,{merchantReference:ref});});throw httpError(409,"Chapa verification did not match reference, amount and currency. Payment remains unverified.","CHAPA_VERIFICATION_MISMATCH");}
  return withTransaction(async db=>{const app=(await db.query("select * from membership_application where id=$1 for update",[found.application_id])).rows[0],p=(await db.query("select * from payment_transaction where id=$1 for update",[found.id])).rows[0];if(!app||!p)throw httpError(404,"Hosted payment not found.","NOT_FOUND");if(p.status==="succeeded")return {status:"succeeded",verified:true,applicationStatus:app.status};if(!["initiated","pending"].includes(p.status))throw httpError(409,"Payment status changed during verification.","PAYMENT_NOT_PENDING");
    const fee=typeof app.fee_snapshot==="string"?JSON.parse(app.fee_snapshot):app.fee_snapshot;if(Number(fee.amount)!==Number(p.amount)||String(fee.currency).toUpperCase()!==String(p.currency).toUpperCase())throw httpError(409,"Payment does not match the saved application fee.","PAYMENT_AMOUNT_MISMATCH");
    await db.query("update payment_transaction set status='succeeded',provider_transaction_id=$1,verified_at=now(),completed_at=now(),verification_note='Verified directly with Chapa API',updated_at=now() where id=$2",[provider.providerId,p.id]);const next=applicationStatusAfterPaymentVerification(app.status,app.approved_at,"approved");if(next!==app.status)await db.query("update membership_application set status=$1,updated_at=now() where id=$2",[next,app.id]);
    await db.query("insert into payment_reconciliation(payment_transaction_id,membership_id,reconciliation_status,reconciled_at,note) values($1,null,'matched',now(),$2) on conflict do nothing",[p.id,"Chapa verified transaction "+ref]);await audit(db,userId||null,"membership.chapa_payment_verified","payment_transaction",p.id,requestId,{applicationId:app.id,merchantReference:ref,mode:cfg.mode});await notify(db,app.user_id,"membership_payment_approved","payment_transaction",p.id,{applicationId:app.id,provider:"chapa",eventVersion:ref});return {status:"succeeded",verified:true,applicationStatus:next};
  });
}
export async function handleChapaMembershipWebhook(rawBody,receivedSignature,requestId){
  const cfg=chapaConfig();if(!cfg.webhookSecret)throw httpError(503,"Chapa webhook verification is not configured.","CHAPA_WEBHOOK_NOT_CONFIGURED");const raw=Buffer.isBuffer(rawBody)?rawBody:Buffer.from(rawBody||"");if(!isValidChapaWebhookSignature(raw,receivedSignature,cfg.webhookSecret))throw httpError(401,"Chapa webhook signature is invalid.","INVALID_WEBHOOK_SIGNATURE");
  let event;try{event=JSON.parse(raw.toString("utf8"));}catch{throw httpError(400,"Chapa webhook payload is invalid JSON.","INVALID_WEBHOOK_PAYLOAD");}const ref=String(event.tx_ref||event.data&&event.data.tx_ref||event.reference||event.data&&event.data.reference||"").trim();if(!ref)throw httpError(400,"Chapa webhook did not include a merchant reference.","INVALID_WEBHOOK_PAYLOAD");const digest=createHash("sha256").update(raw).digest("hex");
  const exists=(await getPool().query("select id from payment_transaction where provider='chapa' and (purpose_reference=$1 or request_payload->>'merchantReference'=$1) limit 1",[ref])).rows[0];if(!exists)return {accepted:true,processed:false,reason:"unknown_reference"};
  const first=await withTransaction(async db=>{const r=await db.query("insert into membership_payment_webhook_event(payload_sha256,environment_mode,event_type,merchant_reference,result_status) values($1,$2,$3,$4,'pending') on conflict(environment_mode,payload_sha256) do nothing returning payload_sha256",[digest,cfg.mode,String(event.event||event.type||"transaction.update").slice(0,100),ref]);return r.rowCount>0;});if(!first)return {accepted:true,processed:true,replayed:true};
  try{const result=await verifyChapaMembershipPayment(ref,requestId,null);await withTransaction(async db=>{await db.query("update membership_payment_webhook_event set result_status='processed',processed_at=now() where environment_mode=$1 and payload_sha256=$2",[cfg.mode,digest]);await audit(db,null,"membership.chapa_webhook_processed","membership_payment_webhook_event",null,requestId,{payloadSha256:digest,merchantReference:ref,verified:result.verified===true});});return {accepted:true,processed:true,verified:result.verified===true};}
  catch(error){await withTransaction(async db=>{await db.query("update membership_payment_webhook_event set result_status='pending',processed_at=null where environment_mode=$1 and payload_sha256=$2",[cfg.mode,digest]);await audit(db,null,"membership.chapa_webhook_verification_deferred","membership_payment_webhook_event",null,requestId,{payloadSha256:digest,merchantReference:ref,code:error.code||"VERIFICATION_DEFERRED"});});return {accepted:true,processed:false,reason:"verification_pending"};}
}
export async function notificationPreferences(userId,input=null){
  const db=getPool();
  if(input){
    const allowedCategories=new Set(["membership","verification","opportunities","recruitment","organizations","mentorship","services","events_learning","security","system"]);
    let categories=null;
    if(input.inAppCategories!==undefined){
      if(!input.inAppCategories||typeof input.inAppCategories!=="object"||Array.isArray(input.inAppCategories))throw httpError(400,"In-app category preferences must be an object.","VALIDATION_ERROR");
      categories={};
      for(const [key,value] of Object.entries(input.inAppCategories)){
        if(!allowedCategories.has(key)||typeof value!=="boolean")throw httpError(400,"Each in-app category preference must use a supported category and a boolean value.","VALIDATION_ERROR");
        categories[key]=value;
      }
    }
    if(input.digestEnabled!==undefined&&typeof input.digestEnabled!=="boolean")throw httpError(400,"Digest preference must be a boolean.","VALIDATION_ERROR");
    return (await db.query("insert into notification_preference(user_id,email_enabled,sms_enabled,push_enabled,in_app_enabled,in_app_categories,digest_enabled,updated_at) values($1,coalesce($2,true),coalesce($3,true),coalesce($4,true),coalesce($5,true),coalesce($6::jsonb,'{}'::jsonb),coalesce($7,false),now()) on conflict(user_id) do update set email_enabled=coalesce($2,notification_preference.email_enabled),sms_enabled=coalesce($3,notification_preference.sms_enabled),push_enabled=coalesce($4,notification_preference.push_enabled),in_app_enabled=coalesce($5,notification_preference.in_app_enabled),in_app_categories=coalesce($6::jsonb,notification_preference.in_app_categories),digest_enabled=coalesce($7,notification_preference.digest_enabled),updated_at=now() returning *",[
      userId,input.emailEnabled,input.smsEnabled,input.pushEnabled,input.inAppEnabled,categories===null?null:JSON.stringify(categories),input.digestEnabled??null
    ])).rows[0];
  }
  return (await db.query("select * from notification_preference where user_id=$1",[userId])).rows[0] ||
    (await db.query("insert into notification_preference(user_id) values($1) returning *",[userId])).rows[0];
}

