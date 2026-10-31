import {createHash} from "node:crypto";
import {getPool,withTransaction} from "./db.js";
import {policyError} from "./identity-policy.js";

const DATA_CLASSES=["claim_metadata","identity_assurance_artifacts","raw_evidence","consent_and_rights_records","reviewer_notes","audit_events","score_ledger"];
const EXPIRY_ACTIONS=new Set(["hard_delete","anonymize","restrict_access","retain_minimal"]);
const RETENTION_STARTS=new Set(["created_at","last_activity_at","case_closed_at","decision_finalized_at","consent_withdrawn_at"]);
function fail(status,message,code="COMMUNITY_IMPACT_RETENTION_ERROR"){throw policyError(status,message,code)}
function stableJson(value){
 if(Array.isArray(value))return "["+value.map(stableJson).join(",")+"]";
 if(value&&typeof value==="object")return "{"+Object.keys(value).sort().map(key=>JSON.stringify(key)+":"+stableJson(value[key])).join(",")+"}";
 return JSON.stringify(value);
}
function cleanText(value,min,max,label){const text=String(value??"").trim();if(text.length<min||text.length>max)fail(400,label+" must be between "+min+" and "+max+" characters.","COMMUNITY_IMPACT_RETENTION_INVALID");return text}
function integer(value,min,max,label){if(!Number.isSafeInteger(value)||value<min||value>max)fail(400,label+" must be an integer between "+min+" and "+max+".","COMMUNITY_IMPACT_RETENTION_INVALID");return value}
function validatePolicy(input){
 if(!input||typeof input!=="object"||Array.isArray(input))fail(400,"A retention policy object is required.","COMMUNITY_IMPACT_RETENTION_INVALID");
 const keys=Object.keys(input.dataClasses||{});
 if(keys.length!==DATA_CLASSES.length||DATA_CLASSES.some(key=>!Object.hasOwn(input.dataClasses||{},key))||keys.some(key=>!DATA_CLASSES.includes(key)))fail(400,"The policy must define every required Community Impact data class exactly once.","COMMUNITY_IMPACT_RETENTION_CLASSES_INCOMPLETE");
 const dataClasses={};
 for(const key of DATA_CLASSES){
  const item=input.dataClasses[key];
  if(!item||typeof item!=="object"||Array.isArray(item))fail(400,"A retention rule is required for "+key+".","COMMUNITY_IMPACT_RETENTION_INVALID");
  const action=String(item.expiryAction||"");
  const start=String(item.retentionStart||"");
  if(!EXPIRY_ACTIONS.has(action))fail(400,"Choose a supported expiry action for "+key+".","COMMUNITY_IMPACT_RETENTION_INVALID");
  if((key==="audit_events"||key==="score_ledger")&&action==="hard_delete")fail(400,"Audit history and score-ledger provenance cannot be hard-deleted; choose anonymization or minimal retention.","COMMUNITY_IMPACT_RETENTION_AUDIT_PRESERVATION");
  if(!RETENTION_STARTS.has(start))fail(400,"Choose a supported retention start event for "+key+".","COMMUNITY_IMPACT_RETENTION_INVALID");
  dataClasses[key]={retentionDays:integer(item.retentionDays,1,Number.MAX_SAFE_INTEGER,key+" retentionDays"),graceDays:integer(item.graceDays,0,Number.MAX_SAFE_INTEGER,key+" graceDays"),retentionStart:start,expiryAction:action,legalHoldBehavior:"pause_and_preserve"};
 }
 return {schemaVersion:1,dataClasses};
}
async function assertPermission(db,userId,permission){
 const result=await db.query("select r.role_code from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1",[userId]);
 const grants=await db.query("select permission_code from app_user_permission where user_id=$1 and permission_code=$2",[userId,permission]);
 if(!result.rows.some(row=>row.role_code==="system_admin")&&!grants.rowCount)fail(403,"The required Community Impact retention-policy permission is required.","COMMUNITY_IMPACT_RETENTION_FORBIDDEN");
}
async function assertAnyPolicyPermission(db,userId){
 const roles=await db.query("select r.role_code from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1",[userId]);
 const grants=await db.query("select permission_code from app_user_permission where user_id=$1 and permission_code=any($2::text[])",[userId,["community_impact.retention.manage","community_impact.retention.approve"]]);
 if(!roles.rows.some(row=>row.role_code==="system_admin")&&!grants.rowCount)fail(403,"A Community Impact retention-policy permission is required.","COMMUNITY_IMPACT_RETENTION_FORBIDDEN");
}
async function audit(db,actor,action,id,requestId,metadata={}){
 await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,$2,'community_impact_retention_policy',$3,$4,'success',$5)",[actor,action,id,requestId,JSON.stringify(metadata)]);
}
export async function getRetentionPolicyGovernance(actorUserId){
 const db=getPool();await assertAnyPolicyPermission(db,actorUserId);
 const [active,proposals]=await Promise.all([
  db.query("select p.id,p.version,p.schema_version,p.policy_hash,p.policy,p.approval_reference,p.approved_by,p.approved_at,p.activated_at,a.activated_by,a.activated_at as pointer_activated_at from community_impact_retention_active_policy a join community_impact_retention_policy_version p on p.id=a.policy_version_id"),
  db.query("select id,version,schema_version,policy_hash,status,policy,rationale,change_summary,created_by,created_at,approved_by,approved_at,approval_reference,activated_at from community_impact_retention_policy_version order by version desc limit 50")
 ]);
 return {active:active.rows[0]||null,items:proposals.rows,dataClasses:DATA_CLASSES,expiryActions:[...EXPIRY_ACTIONS],retentionStarts:[...RETENTION_STARTS],enforcement:"inactive_until_approved_policy_and_evidence_integration"};
}
export async function proposeRetentionPolicy(actorUserId,input,requestId){
 const db=getPool();await assertPermission(db,actorUserId,"community_impact.retention.manage");
 const policy=validatePolicy(input?.policy),policyHash=createHash("sha256").update(stableJson(policy)).digest("hex"),rationale=cleanText(input?.rationale,12,2000,"Rationale"),changeSummary=cleanText(input?.changeSummary,8,1000,"Change summary");
 return withTransaction(async tx=>{
  await tx.query("select pg_advisory_xact_lock(hashtextextended('community_impact_retention_policy_version',0))");
  const next=await tx.query("select coalesce(max(version),0)+1 version from community_impact_retention_policy_version");
  const row=(await tx.query("insert into community_impact_retention_policy_version(version,schema_version,policy_hash,status,policy,rationale,change_summary,created_by) values($1,1,$2,'in_review',$3,$4,$5,$6) returning id,version,schema_version,policy_hash,status,policy,rationale,change_summary,created_by,created_at",[next.rows[0].version,policyHash,policy,rationale,changeSummary,actorUserId])).rows[0];
  await tx.query("insert into community_impact_retention_policy_event(policy_version_id,actor_user_id,event_code,reason,request_id,metadata) values($1,$2,'proposed',$3,$4,$5)",[row.id,actorUserId,rationale,requestId,{version:row.version,schemaVersion:row.schema_version,policyHash:row.policy_hash,dataClasses:DATA_CLASSES}]);
  await audit(tx,actorUserId,"community_impact.retention_policy_proposed",row.id,requestId,{version:row.version});
  return row;
 });
}
export async function approveRetentionPolicy(actorUserId,policyId,input,requestId){
 const db=getPool();await assertPermission(db,actorUserId,"community_impact.retention.approve");
 const approvalReference=cleanText(input?.approvalReference,8,240,"Approval reference"),reason=cleanText(input?.reason,12,2000,"Approval rationale");
 return withTransaction(async tx=>{
  const row=(await tx.query("select * from community_impact_retention_policy_version where id=$1 for update",[policyId])).rows[0];
  if(!row)fail(404,"Retention policy proposal was not found.","NOT_FOUND");
  if(row.status!=="in_review")fail(409,"Only a policy under review can be approved.","INVALID_STATE");
  if(row.created_by===actorUserId)fail(403,"The proposer cannot approve their own retention policy.","COMMUNITY_IMPACT_RETENTION_SELF_APPROVAL");
  const updated=(await tx.query("update community_impact_retention_policy_version set status='approved',approved_by=$2,approved_at=now(),approval_reference=$3 where id=$1 returning id,version,status,policy,created_by,approved_by,approved_at,approval_reference",[policyId,actorUserId,approvalReference])).rows[0];
  await tx.query("insert into community_impact_retention_policy_event(policy_version_id,actor_user_id,event_code,reason,request_id,metadata) values($1,$2,'approved',$3,$4,$5)",[policyId,actorUserId,reason,requestId,{approvalReference}]);
  await audit(tx,actorUserId,"community_impact.retention_policy_approved",policyId,requestId,{version:row.version,approvalReference});
  return updated;
 });
}
export async function activateRetentionPolicy(actorUserId,policyId,reason,requestId){
 const db=getPool();await assertPermission(db,actorUserId,"community_impact.retention.approve");
 const rationale=cleanText(reason,12,2000,"Activation rationale");
 return withTransaction(async tx=>{
  const row=(await tx.query("select * from community_impact_retention_policy_version where id=$1 for update",[policyId])).rows[0];
  if(!row)fail(404,"Retention policy was not found.","NOT_FOUND");
  if(row.status!=="approved")fail(409,"Only an independently approved policy can be activated.","INVALID_STATE");
  if(row.created_by===actorUserId)fail(403,"The policy proposer cannot activate their own retention policy.","COMMUNITY_IMPACT_RETENTION_SELF_ACTIVATION");
  const prior=(await tx.query("select policy_version_id from community_impact_retention_active_policy where singleton=true for update")).rows[0];
  if(prior){
   await tx.query("update community_impact_retention_policy_version set status='superseded' where id=$1 and status='active'",[prior.policy_version_id]);
   await tx.query("insert into community_impact_retention_policy_event(policy_version_id,actor_user_id,event_code,reason,request_id,metadata) values($1,$2,'superseded',$3,$4,$5)",[prior.policy_version_id,actorUserId,rationale,requestId,{replacedBy:policyId}]);
  }
  await tx.query("update community_impact_retention_policy_version set status='active',activated_at=now() where id=$1",[policyId]);
  await tx.query("insert into community_impact_retention_active_policy(singleton,policy_version_id,activated_by) values(true,$1,$2) on conflict(singleton) do update set policy_version_id=excluded.policy_version_id,activated_by=excluded.activated_by,activated_at=now()",[policyId,actorUserId]);
  await tx.query("insert into community_impact_retention_policy_event(policy_version_id,actor_user_id,event_code,reason,request_id,metadata) values($1,$2,'activated',$3,$4,$5)",[policyId,actorUserId,rationale,requestId,{version:row.version}]);
  await audit(tx,actorUserId,"community_impact.retention_policy_activated",policyId,requestId,{version:row.version});
  return {id:policyId,version:row.version,status:"active",enforcement:"not_enabled_until_evidence_integration"};
 });
}
