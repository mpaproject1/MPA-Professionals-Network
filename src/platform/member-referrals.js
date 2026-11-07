import { randomBytes } from "node:crypto";
import { getPool, withTransaction } from "./db.js";
import { queueWorkflowEmail } from "./email-operations.js";

const ALPHABET="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const fail=(status,message,code="REFERRAL_ERROR")=>{const e=new Error(message);e.statusCode=status;e.code=code;throw e;};
function makeCode(){const bytes=randomBytes(8);return "MPA-"+Array.from(bytes,b=>ALPHABET[b%ALPHABET.length]).join("");}
async function retentionSnapshot(db,dataClass){
 const row=(await db.query("select p.id,p.version,p.policy->'dataClasses'->($1::text) rule from community_impact_retention_active_policy a join community_impact_retention_policy_version p on p.id=a.policy_version_id where a.singleton=true",[dataClass])).rows[0];
 if(!row||!row.rule)return {versionId:null,snapshot:null};
 return {versionId:row.id,snapshot:{version:row.version,dataClass,rule:row.rule}};
}
async function activeMember(db,userId){
 const r=await db.query("select id from membership_record where user_id=$1 and status='active' and start_date<=current_date and (end_date is null or end_date>=current_date) order by end_date desc nulls last limit 1",[userId]);
 if(!r.rows[0])fail(403,"An active MPA membership is required to create or use a member referral code.","ACTIVE_MEMBERSHIP_REQUIRED");
 return r.rows[0];
}
async function codeRow(db,code){
 const value=String(code||"").trim().toUpperCase();
 if(!/^MPA-[A-HJ-NP-Z2-9]{8}$/.test(value))fail(400,"Enter a valid MPA member referral code.","INVALID_REFERRAL_CODE");
 const r=await db.query("select c.id,c.member_user_id,c.status from member_referral_code c where c.code=$1",[value]);
 if(!r.rows[0]||r.rows[0].status!=="active")fail(400,"This referral code is unavailable. Ask the member for a current code.","REFERRAL_CODE_UNAVAILABLE");
 await activeMember(db,r.rows[0].member_user_id);
 return r.rows[0];
}
async function event(db,attribution,eventCode,fromStatus,toStatus,actor,metadata={}){
 const retention=await retentionSnapshot(db,"referral_attribution_records");
 await db.query("insert into member_referral_event(attribution_id,actor_user_id,event_code,from_status,to_status,metadata,retention_policy_version_id,retention_policy_snapshot) values($1,$2,$3,$4,$5,$6,$7,$8)",[attribution,actor||null,eventCode,fromStatus,toStatus,JSON.stringify(metadata),retention.versionId,retention.snapshot?JSON.stringify(retention.snapshot):null]);
 const policy=(await db.query("select id,points from member_referral_score_policy where status='active' limit 1")).rows[0];
 const points=Number(policy?.points?.[eventCode]??0);
 if(policy&&Number.isInteger(points)&&points>=0){const scoreRetention=await retentionSnapshot(db,"score_ledger");await db.query("insert into member_referral_score_ledger(attribution_id,event_code,points,policy_id,retention_policy_version_id,retention_policy_snapshot) values($1,$2,$3,$4,$5,$6) on conflict(attribution_id,event_code) do nothing",[attribution,eventCode,points,policy.id,scoreRetention.versionId,scoreRetention.snapshot?JSON.stringify(scoreRetention.snapshot):null]);}
 const recipient=(await db.query("select referrer_user_id from member_referral_attribution where id=$1",[attribution])).rows[0];
 if(recipient)await queueWorkflowEmail(db,recipient.referrer_user_id,"professional.workflow_update",{notificationEventCode:"member.referral.progress",category:eventCode.startsWith("membership")||eventCode==="registered"?"membership":"recruitment",title:"Your referral has a progress update",status:toStatus,message:"Someone you invited has reached a new step. Their private details remain protected.",nextAction:"Open your referral dashboard to review the permitted status.",actionUrl:"/referrals"},"member_referral_attribution",attribution);

}
export async function ensureMyReferralCode(userId){
 const db=getPool();await activeMember(db,userId);
 const retention=await retentionSnapshot(db,"referral_attribution_records");
 const existing=(await db.query("select code,status,created_at from member_referral_code where member_user_id=$1",[userId])).rows[0];
 if(existing)return {...existing,shareUrl:"/register?ref="+encodeURIComponent(existing.code)};
 for(let attempt=0;attempt<5;attempt++){
  const code=makeCode();
  try{const row=(await db.query("insert into member_referral_code(member_user_id,code,retention_policy_version_id,retention_policy_snapshot) values($1,$2,$3,$4) on conflict(member_user_id) do nothing returning code,status,created_at",[userId,code,retention.versionId,retention.snapshot?JSON.stringify(retention.snapshot):null])).rows[0];if(row)return {...row,shareUrl:"/register?ref="+encodeURIComponent(row.code)};}catch(e){if(e.code!=="23505")throw e;}
  const raced=(await db.query("select code,status,created_at from member_referral_code where member_user_id=$1",[userId])).rows[0];if(raced)return {...raced,shareUrl:"/register?ref="+encodeURIComponent(raced.code)};
 }
 fail(503,"A referral code could not be generated. Please retry.","REFERRAL_CODE_GENERATION_FAILED");
}
export async function captureMembershipRegistration(db,referredUserId,code,statusVisibilityConsent=false){
 if(!code)return null;
 const ref=await codeRow(db,code);
 if(ref.member_user_id===referredUserId)fail(400,"You cannot use your own referral code.","SELF_REFERRAL");
 const retention=await retentionSnapshot(db,"referral_attribution_records");
 const row=(await db.query("insert into member_referral_attribution(referral_type,referrer_user_id,referred_user_id,referral_code_id,status,status_visibility_consent,retention_policy_version_id,retention_policy_snapshot) values('membership',$1,$2,$3,'registered',$4,$5,$6) on conflict(referred_user_id) where referral_type='membership' do nothing returning id,status",[ref.member_user_id,referredUserId,ref.id,statusVisibilityConsent===true,retention.versionId,retention.snapshot?JSON.stringify(retention.snapshot):null])).rows[0];
 if(row)await event(db,row.id,"registered","attributed","registered",referredUserId);
 return row;
}
export async function captureEmploymentApplication(db,jobId,referredUserId,applicationId,code,statusVisibilityConsent=false){
 if(!code)return null;
 const ref=await codeRow(db,code);
 if(ref.member_user_id===referredUserId)fail(400,"You cannot refer yourself to a job.","SELF_REFERRAL");
 const retention=await retentionSnapshot(db,"referral_attribution_records");
 const row=(await db.query("insert into member_referral_attribution(referral_type,referrer_user_id,referred_user_id,job_id,job_application_id,referral_code_id,status,status_visibility_consent,retention_policy_version_id,retention_policy_snapshot) values('employment',$1,$2,$3,$4,$5,'application_submitted',$6,$7,$8) on conflict(job_application_id) where referral_type='employment' and job_application_id is not null do nothing returning id,status",[ref.member_user_id,referredUserId,jobId,applicationId,ref.id,statusVisibilityConsent===true,retention.versionId,retention.snapshot?JSON.stringify(retention.snapshot):null])).rows[0];
 if(row)await event(db,row.id,"application_submitted","attributed","application_submitted",referredUserId,{jobId});
 return row;
}
export async function recordMembershipMilestone(db,referredUserId,eventCode,actorUserId){
 const allowed={membership_application_submitted:"membership_application_submitted",membership_approved:"membership_approved",membership_declined:"membership_declined"};
 const next=allowed[eventCode];if(!next)return;
 const rows=(await db.query("select id,status from member_referral_attribution where referral_type='membership' and referred_user_id=$1 for update",[referredUserId])).rows;
 for(const row of rows){if(row.status===next)continue;await db.query("update member_referral_attribution set status=$1,updated_at=now() where id=$2",[next,row.id]);await event(db,row.id,next,row.status,next,actorUserId);}
}
export async function recordMembershipActivated(db,referredUserId,actorUserId){
 const rows=(await db.query("select id,status from member_referral_attribution where referral_type='membership' and referred_user_id=$1 for update",[referredUserId])).rows;
 for(const row of rows){if(row.status==="membership_activated")continue;await db.query("update member_referral_attribution set status='membership_activated',updated_at=now() where id=$1",[row.id]);await event(db,row.id,"membership_activated",row.status,"membership_activated",actorUserId);}
}
export async function recordJobApplicationStage(db,applicationId,status,actorUserId){
 const mapping={shortlisted:"shortlisted",interview:"interview",accepted:"offer_accepted",hired:"employment_reported",rejected:"declined",withdrawn:"withdrawn"};
 const eventCode=mapping[status];if(!eventCode)return;
 const rows=(await db.query("select id,status from member_referral_attribution where referral_type='employment' and job_application_id=$1 for update",[applicationId])).rows;
 for(const row of rows){await db.query("update member_referral_attribution set status=$1,updated_at=now() where id=$2",[eventCode,row.id]);await event(db,row.id,eventCode,row.status,eventCode,actorUserId);}
}
export async function listMyReferralProgress(userId){
 const db=getPool();
 const items=(await db.query(`select a.id,a.referral_type,a.status,a.created_at,a.job_id,j.title job_title
 from member_referral_attribution a left join job j on j.id=a.job_id
 where a.referrer_user_id=$1 order by a.created_at desc limit 100`,[userId])).rows;
 return {items};
}
export async function listMyCandidateReferrals(userId){
 const db=getPool();
 const rows=(await db.query(`select a.id,a.status,a.created_at,a.candidate_consent_at,j.title job_title,j.id job_id
 from member_referral_attribution a join job j on j.id=a.job_id
 where a.referral_type='employment' and a.referred_user_id=$1 order by a.created_at desc limit 100`,[userId])).rows;
 return {items:rows};
}
export async function confirmEmploymentOutcome(userId,attributionId,input={}){
 return withTransaction(async db=>{
  const row=(await db.query("select * from member_referral_attribution where id=$1 and referral_type='employment' for update",[attributionId])).rows[0];
  if(!row)fail(404,"Referral record not found.","NOT_FOUND");
  if(row.referred_user_id!==userId)fail(403,"Only the referred candidate can confirm this outcome.","FORBIDDEN");
  if(row.status==="employment_verified")fail(409,"This employment outcome has already been verified.","ALREADY_VERIFIED");
  if(row.status!=="employment_reported")fail(409,"The employer must first record a hired outcome before you can confirm it.","EMPLOYER_OUTCOME_REQUIRED");
  if(row.candidate_consent_at)fail(409,"Your employment outcome confirmation has already been submitted for review.","CONFIRMATION_ALREADY_SUBMITTED");
  if(!input.consent)fail(400,"Confirm consent before asking MPA to verify this employment outcome.","CONSENT_REQUIRED");
  const reason=String(input.summary||"").trim();if(reason.length<20||reason.length>1000)fail(400,"Provide a short employment outcome summary (20–1000 characters).","VALIDATION_ERROR");
  await db.query("update member_referral_attribution set status='employment_reported',candidate_consent_at=now(),candidate_outcome_summary=$1,updated_at=now() where id=$2",[reason,row.id]);
  await event(db,row.id,"employment_reported",row.status,"employment_reported",userId,{candidateConfirmed:true});
  return {id:row.id,status:"employment_reported",message:"Your confirmation has been sent for MPA review. It is not yet a verified employment outcome."};
 });
}
export async function listMyReferrals(userId){
 await activeMember(getPool(),userId);
 const db=getPool();const code=await ensureMyReferralCode(userId);
 const counts=(await db.query("select referral_type,status,count(*)::int count from member_referral_attribution where referrer_user_id=$1 group by referral_type,status",[userId])).rows;
 const items=(await db.query(`select a.id,a.referral_type,a.status,a.created_at,a.job_id,j.title job_title,
 case when a.status_visibility_consent then coalesce(nullif(trim(p.display_name),''),'MPA member') else 'Private referral' end referred_person
 from member_referral_attribution a left join person p on p.user_id=a.referred_user_id left join job j on j.id=a.job_id
 where a.referrer_user_id=$1 order by a.created_at desc limit 100`,[userId])).rows;
 const score=(await db.query("select coalesce(sum(points),0)::int points from member_referral_score_ledger where attribution_id in(select id from member_referral_attribution where referrer_user_id=$1)",[userId])).rows[0].points;
 return {code,counts,items,score,scoringActive:Boolean((await db.query("select 1 from member_referral_score_policy where status='active' limit 1")).rows[0])};
}
export async function listReferralAdminQueue(identity,{status=null,limit=100}={}){
 if(!identity.roles?.some(x=>["system_admin","admin","supporting_staff"].includes(x))&&!identity.permissions?.includes("referral.manage"))fail(403,"Referral administration permission is required.","FORBIDDEN");
 const db=getPool();const values=[];const where=[];
 if(status){values.push(status);where.push("a.status=$1");}
 const rows=(await db.query(`select a.id,a.referral_type,a.status,a.created_at,a.job_id,j.title job_title,a.referrer_user_id,a.referred_user_id,a.candidate_consent_at,a.candidate_outcome_summary,a.verification_reference
 from member_referral_attribution a left join job j on j.id=a.job_id ${where.length?"where "+where.join(" and "):""}
 order by a.created_at desc limit ${Math.min(Math.max(Number(limit)||100,1),250)}`,values)).rows;
 return {items:rows};
}
export async function verifyEmploymentReferral(identity,attributionId,input,requestId){
 if(!identity.roles?.some(x=>["system_admin","admin"].includes(x))&&!identity.permissions?.includes("referral.manage"))fail(403,"Employment referral verification permission is required.","FORBIDDEN");
 const method=String(input.method||"");if(!["employer_confirmation","candidate_and_employer_confirmation","approved_private_evidence"].includes(method))fail(400,"Choose an approved independent verification method.","INVALID_VERIFICATION_METHOD");
 const reference=String(input.reference||"").trim();if(reference.length<4||reference.length>500)fail(400,"Record a verification reference or private evidence record ID.","VERIFICATION_REFERENCE_REQUIRED");
 return withTransaction(async db=>{
  const row=(await db.query("select * from member_referral_attribution where id=$1 and referral_type='employment' for update",[attributionId])).rows[0];
  if(!row)fail(404,"Referral not found.","NOT_FOUND");
  if(row.status!=="employment_reported"||!row.candidate_consent_at)fail(409,"The candidate must first confirm the outcome and consent to verification.","CANDIDATE_CONFIRMATION_REQUIRED");
  await db.query("update member_referral_attribution set status='employment_verified',employment_verified_at=now(),employment_verified_by=$1,verification_method=$2,verification_reference=$3,updated_at=now() where id=$4",[identity.sub,method,reference,row.id]);
  await event(db,row.id,"employment_verified",row.status,"employment_verified",identity.sub,{method,reference});
  await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'referral.employment_verified','member_referral_attribution',$2,$3,'success',$4)",[identity.sub,row.id,requestId,JSON.stringify({method})]);
  return {id:row.id,status:"employment_verified"};
 });
}
export async function proposeReferralScorePolicy(identity,points,reason){
 if(!identity.roles?.includes("system_admin"))fail(403,"Only a system administrator can propose a referral scoring policy.","FORBIDDEN");
 const allowed=["membership_application_submitted","membership_approved","membership_activated","shortlisted","interview","offer_accepted","employment_verified"];
 if(!points||typeof points!=="object"||Array.isArray(points)||Object.keys(points).some(k=>!allowed.includes(k))||Object.values(points).some(v=>!Number.isInteger(v)||v<0||v>10000))fail(400,"Provide non-negative integer points for supported referral milestones.","INVALID_SCORING_POLICY");
 if(String(reason||"").trim().length<12)fail(400,"Explain the policy reason (at least 12 characters).","POLICY_REASON_REQUIRED");
 return withTransaction(async db=>{
  const version=Number((await db.query("select coalesce(max(version),0)+1 version from member_referral_score_policy")).rows[0].version);
  const row=(await db.query("insert into member_referral_score_policy(version,points,created_by) values($1,$2,$3) returning *",[version,JSON.stringify(points),identity.sub])).rows[0];
  await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,outcome,metadata) values($1,'referral.score_policy_proposed','member_referral_score_policy',$2,'success',$3)",[identity.sub,row.id,JSON.stringify({version,reason})]);
  return row;
 });
}
export async function approveReferralScorePolicy(identity,policyId,activate,reason){
 if(!identity.roles?.includes("system_admin"))fail(403,"Only a system administrator can approve referral scoring.","FORBIDDEN");
 if(String(reason||"").trim().length<12)fail(400,"Explain the approval decision (at least 12 characters).","POLICY_REASON_REQUIRED");
 return withTransaction(async db=>{
  const row=(await db.query("select * from member_referral_score_policy where id=$1 for update",[policyId])).rows[0];
  if(!row||row.status!=="draft"||row.created_by===identity.sub)fail(409,"A different system administrator must approve a draft scoring policy.","POLICY_APPROVAL_SEPARATION_REQUIRED");
  await db.query("update member_referral_score_policy set status='approved',approved_by=$1,approved_at=now(),approval_reason=$2 where id=$3",[identity.sub,reason,policyId]);
  if(activate){await db.query("update member_referral_score_policy set status='retired' where status='active'");await db.query("update member_referral_score_policy set status='active',activated_at=now() where id=$1",[policyId]);}
  await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,outcome,metadata) values($1,'referral.score_policy_approved','member_referral_score_policy',$2,'success',$3)",[identity.sub,policyId,JSON.stringify({activate,reason})]);
  return (await db.query("select * from member_referral_score_policy where id=$1",[policyId])).rows[0];
 });
}
