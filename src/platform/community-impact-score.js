import {createHash} from "node:crypto";
import {getPool,withTransaction} from "./db.js";
import {policyError} from "./identity-policy.js";

const fail=(status,message,code="COMMUNITY_IMPACT_SCORE_ERROR")=>{throw policyError(status,message,code)};
const clean=(value,min,max,label)=>{const v=String(value??"").trim();if(v.length<min||v.length>max)fail(400,label+" must be between "+min+" and "+max+" characters.","VALIDATION_ERROR");return v};
async function permission(db,userId,code){const q=await db.query("select exists(select 1 from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1 and r.role_code='system_admin') or exists(select 1 from app_user_permission where user_id=$1 and permission_code=$2) allowed",[userId,code]);if(!q.rows[0]?.allowed)fail(403,"The required Community Impact score permission is required.","FORBIDDEN")}
const hash=value=>createHash("sha256").update(value).digest("hex");
function sourceType(claim){
 const t=claim.contribution_type,c=claim.category;
 if(t==="initiative_participation")return "serve_community_participation";
 if(t==="project_delivery")return "offline_completed_project";
 if(t==="mentoring"||c==="mentorship_knowledge_sharing")return "mentorship";
 if(t==="professional_service"||c==="professional_pro_bono_services")return "professional_service";
 if(t==="referral"||c==="employment_referrals")return "employment_referral";
 if(t==="partnership"&&c==="partnerships_organizational_capacity")return "network_plus_partnership";
 if(t==="partnership"||c==="partnerships_organizational_capacity")return "network_plus_collaboration";
 return "historical_contribution";
}
function validatePolicy(policy){
 if(!policy||typeof policy!=="object"||!Array.isArray(policy.dimensions)||policy.dimensions.length!==5)fail(400,"A score policy must define exactly the five approved dimensions.","SCORE_POLICY_INVALID");
 const keys=["measurable_community_outcomes","quality_and_significance","verified_contribution_responsibility","sustainability","collaboration_knowledge_sharing"];
 const actual=policy.dimensions.map(x=>x.key);if(keys.some(k=>!actual.includes(k))||new Set(actual).size!==5)fail(400,"All five approved score dimensions must be present exactly once.","SCORE_POLICY_INVALID");
 const sum=policy.dimensions.reduce((n,x)=>n+Number(x.weight),0);if(!Number.isFinite(sum)||Math.abs(sum-100)>0.0001)fail(400,"Score dimension weights must total exactly 100%.","SCORE_POLICY_INVALID");
 const calc=policy.calculation;if(!calc||!Number.isFinite(Number(calc.basePoints))||Number(calc.basePoints)<=0||!calc.roleFactors||!Array.isArray(calc.eligibleSourceTypes))fail(400,"Score policy calculation settings are incomplete.","SCORE_POLICY_INVALID");
 for(const d of policy.dimensions){if(!Number.isFinite(Number(d.weight))||Number(d.weight)<0||!d.ratings||!Number.isFinite(Number(d.ratings.min))||!Number.isFinite(Number(d.ratings.max))||Number(d.ratings.max)<=Number(d.ratings.min))fail(400,"Each dimension needs a valid weight and rating range.","SCORE_POLICY_INVALID")}
 return policy;
}
async function activePolicy(db){const row=(await db.query("select p.* from community_impact_score_active_policy a join community_impact_score_policy_version p on p.id=a.policy_version_id where a.singleton=true")).rows[0];if(!row)fail(409,"No active Community Impact score policy is configured.","SCORE_POLICY_MISSING");return row}
async function scoreClaim(tx,actorUserId,claimId,rationale,policy,recalcId){
 const claim=(await tx.query("select * from community_impact_claim where id=$1 for update",[claimId])).rows[0];if(!claim)fail(404,"Contribution claim not found.","NOT_FOUND");
 if(claim.status!=="verified"||claim.current_decision_code!=="verified")fail(409,"Only a reviewer-verified contribution can be scored.","SCORE_SOURCE_NOT_VERIFIED");
 const assessment=(await tx.query("select * from community_impact_contribution_assessment where claim_id=$1 and status='approved' order by approved_at desc nulls last,created_at desc limit 1 for update",[claimId])).rows[0];
 if(!assessment||!assessment.approved_at)fail(409,"An approved reviewer assessment is required before scoring.","SCORE_ASSESSMENT_REQUIRED");
 const source=sourceType(claim),calc=policy.policy.calculation;
 if(!calc.eligibleSourceTypes.includes(source))fail(409,"This contribution source is not enabled by the active scoring policy.","SCORE_SOURCE_NOT_ELIGIBLE");
 if(!["adequate","strong","exceptional"].includes(assessment.evidence_quality))fail(409,"Evidence quality does not meet the active score policy threshold.","SCORE_EVIDENCE_THRESHOLD");
 if(assessment.outcome_maturity==="activity")fail(409,"Raw activity without a verified output or outcome is not score eligible.","SCORE_OUTCOME_THRESHOLD");
 const candidateLink=(await tx.query("select c.* from community_impact_claim_candidate_link l join community_impact_detection_candidate c on c.id=l.candidate_id where l.claim_id=$1 order by l.created_at desc limit 1",[claimId])).rows[0];
 if(candidateLink&&(candidateLink.detection_status!=="detected"||candidateLink.attribution_status!=="confirmed"))fail(409,"The linked detected source is reversed or its contributor attribution is not confirmed.","SCORE_ATTRIBUTION_UNCONFIRMED");
 if(candidateLink&&candidateLink.contributor_user_id&&candidateLink.contributor_user_id!==claim.claimant_user_id)fail(409,"The claim claimant does not match the verified source contributor.","SCORE_ATTRIBUTION_MISMATCH");
 const rubric=assessment.rubric||{},ratings=rubric.dimensions||rubric;
 const explanations=[];let weighted=0;
 for(const d of policy.policy.dimensions){
  const rating=Number(ratings[d.key]);if(!Number.isFinite(rating)||rating<Number(d.ratings.min)||rating>Number(d.ratings.max))fail(409,"Assessment is missing a valid reviewer rating for "+d.label+".","SCORE_RUBRIC_INCOMPLETE");
  const normalized=(rating-Number(d.ratings.min))/(Number(d.ratings.max)-Number(d.ratings.min));
  weighted+=normalized*Number(d.weight)/100;
  explanations.push({dimension:d.key,label:d.label,rating,minimum:Number(d.ratings.min),maximum:Number(d.ratings.max),weight:Number(d.weight),weightedContribution:Number((normalized*Number(d.weight)/100).toFixed(6))});
 }
 const role=assessment.contribution_role||claim.contribution_role||"other",roleFactor=Number(calc.roleFactors[role]);
 if(!Number.isFinite(roleFactor)||roleFactor<0)fail(409,"The active policy has no valid role factor for this contribution.","SCORE_ROLE_FACTOR_MISSING");
 const share=Number(assessment.attribution_share);if(!Number.isFinite(share)||share<=0||share>100)fail(409,"The reviewer attribution share is invalid.","SCORE_ATTRIBUTION_SHARE_INVALID");
 let points=weighted*Number(calc.basePoints)*roleFactor*(share/100);
 const categoryCap=calc.categoryCaps?.[assessment.category],sourceCap=calc.sourceCaps?.[source];
 if(Number.isFinite(Number(categoryCap)))points=Math.min(points,Number(categoryCap));
 if(Number.isFinite(Number(sourceCap)))points=Math.min(points,Number(sourceCap));
 if(!Number.isFinite(points)||points<=0)fail(409,"The calculated score is not a positive eligible value.","SCORE_CALCULATION_INVALID");
 points=Number(points.toFixed(4));
 const sourceRecord=candidateLink?.source_record_id||claim.id,sourceSystem=candidateLink?.source_system||"community_impact_claim";
 const idempotency=hash(["award",claim.claimant_user_id,source,sourceRecord,policy.id].join(":"));
 const existing=(await tx.query("select id,points from community_impact_score_ledger where idempotency_key=$1",[idempotency])).rows[0];if(existing)return {ledgerEntryId:existing.id,points:Number(existing.points),status:"already_recorded"};
 const explanation={sourceType:source,sourceSystem,sourceRecordId:sourceRecord,claimId,assessmentId:assessment.id,assessmentStatus:assessment.status,evidenceQuality:assessment.evidence_quality,outcomeMaturity:assessment.outcome_maturity,category:assessment.category,contributionRole:role,roleFactor,attributionShare:share,dimensions:explanations,weightedDimensionScore:Number(weighted.toFixed(6)),basePoints:Number(calc.basePoints),categoryCap:categoryCap??null,sourceCap:sourceCap??null,points,policyVersion:policy.version,policyVersionId:policy.id,evaluationOnly:policy.evaluation_only,publicScoreEnabled:policy.public_score_enabled===true,rationale};
 const entry=(await tx.query("insert into community_impact_score_ledger(subject_user_id,source_system,source_type,source_record_id,claim_id,assessment_id,policy_version_id,entry_type,points,idempotency_key,explanation,created_by) values($1,$2,$3,$4,$5,$6,$7,'award',$8,$9,$10,$11) returning id,points",[claim.claimant_user_id,sourceSystem,source,sourceRecord,claimId,assessment.id,policy.id,points,idempotency,explanation,actorUserId])).rows[0];
 return {ledgerEntryId:entry.id,points:Number(entry.points),status:"awarded",evaluationOnly:policy.evaluation_only};
}
export async function getMyScore(userId){
 const db=getPool(),policy=await activePolicy(db);
 const totals=(await db.query("select coalesce(sum(points),0)::numeric(14,4) total,count(*) filter(where points>0)::int awards,count(*) filter(where points<0)::int reversals from community_impact_score_ledger where subject_user_id=$1",[userId])).rows[0];
 const rows=(await db.query("select id,source_type,source_record_id,entry_type,points,explanation,created_at from community_impact_score_ledger where subject_user_id=$1 order by created_at desc limit 100",[userId])).rows;
 return {score:Number(totals.total),awards:totals.awards,reversals:totals.reversals,policyVersion:policy.version,evaluationOnly:policy.evaluation_only,publicScoreEnabled:policy.public_score_enabled,publicationStatus:"private_evaluation",items:rows};
}
export async function listScorePolicies(actor){await permission(getPool(),actor,"community_impact.score.policy.manage");const rows=await getPool().query("select id,version,status,evaluation_only,public_score_enabled,rationale,change_summary,created_by,approved_by,approval_reference,effective_at,created_at,policy from community_impact_score_policy_version order by version desc");return {items:rows.rows}}
export async function proposeScorePolicy(actor,input){
 await permission(getPool(),actor,"community_impact.score.policy.manage");
 const policy=validatePolicy(input?.policy),rationale=clean(input?.rationale,12,2000,"Policy rationale"),summary=clean(input?.changeSummary,8,1000,"Change summary");
 return withTransaction(async tx=>{
  const current=await tx.query("select coalesce(max(version),0)::int version from community_impact_score_policy_version");
  const version=current.rows[0].version+1,serialized=JSON.stringify(policy),digest=hash(serialized);
  const row=(await tx.query("insert into community_impact_score_policy_version(version,schema_version,policy_hash,policy,status,evaluation_only,public_score_enabled,rationale,change_summary,created_by) values($1,1,$2,$3,'in_review',true,false,$4,$5,$6) returning id,version,status",[version,digest,policy,rationale,summary,actor])).rows[0];
  await tx.query("insert into community_impact_score_policy_event(policy_version_id,actor_user_id,event_code,rationale,metadata) values($1,$2,'proposed',$3,$4)",[row.id,actor,rationale,{version,policyHash:digest}]);
  return row;
 });
}
export async function approveScorePolicy(actor,id,input){
 await permission(getPool(),actor,"community_impact.score.policy.approve");
 const reference=clean(input?.approvalReference,8,240,"Approval reference"),rationale=clean(input?.rationale,12,2000,"Approval rationale");
 return withTransaction(async tx=>{
  const row=(await tx.query("select * from community_impact_score_policy_version where id=$1 for update",[id])).rows[0];if(!row||row.status!=="in_review")fail(409,"Only a policy under review can be approved.","INVALID_STATE");if(row.created_by===actor)fail(403,"The policy proposer cannot approve their own policy.","SELF_APPROVAL");
  await tx.query("update community_impact_score_policy_version set status='approved',approved_by=$2,approval_reference=$3,approved_at=now() where id=$1",[id,actor,reference]);
  await tx.query("insert into community_impact_score_policy_event(policy_version_id,actor_user_id,event_code,rationale,metadata) values($1,$2,'approved',$3,$4)",[id,actor,rationale,{approvalReference:reference}]);
  return {id,status:"approved"};
 });
}
export async function activateScorePolicy(actor,id,rationale){
 await permission(getPool(),actor,"community_impact.score.policy.approve");
 const why=clean(rationale,12,2000,"Activation rationale");
 return withTransaction(async tx=>{
  const row=(await tx.query("select * from community_impact_score_policy_version where id=$1 for update",[id])).rows[0];if(!row||row.status!=="approved")fail(409,"Only an independently approved score policy can be activated.","INVALID_STATE");if(row.created_by===actor)fail(403,"The policy proposer cannot activate their own policy.","SELF_ACTIVATION");
  const active=(await tx.query("select policy_version_id from community_impact_score_active_policy where singleton=true for update")).rows[0];
  if(active)await tx.query("update community_impact_score_policy_version set status='superseded' where id=$1",[active.policy_version_id]);
  await tx.query("update community_impact_score_policy_version set status='active' where id=$1",[id]);
  await tx.query("update community_impact_score_active_policy set policy_version_id=$1,activated_by=$2,activated_at=now() where singleton=true",[id,actor]);
  await tx.query("insert into community_impact_score_policy_event(policy_version_id,actor_user_id,event_code,rationale,metadata) values($1,$2,'activated',$3,$4)",[id,actor,why,{version:row.version}]);
  return {id,status:"active",version:row.version};
 });
}
export async function scoreVerifiedClaim(actor,claimId,rationale){
 await permission(getPool(),actor,"community_impact.score.recalculate");
 const why=clean(rationale,12,2000,"Scoring rationale");
 return withTransaction(async tx=>{const policy=await activePolicy(tx);return scoreClaim(tx,actor,claimId,why,policy,null)});
}
async function reverseEntry(tx,actor,entry,reason,reasonCode){
 const idempotency=hash(["reversal",entry.id,reasonCode,reason].join(":"));
 const exists=(await tx.query("select id from community_impact_score_ledger where idempotency_key=$1",[idempotency])).rows[0];if(exists)return exists;
 const row=(await tx.query("insert into community_impact_score_ledger(subject_user_id,source_system,source_type,source_record_id,claim_id,assessment_id,policy_version_id,entry_type,points,reverses_entry_id,idempotency_key,explanation,created_by) values($1,$2,$3,$4,$5,$6,$7,'reversal',$8,$9,$10,$11,$12) returning id",[entry.subject_user_id,entry.source_system,entry.source_type,entry.source_record_id,entry.claim_id,entry.assessment_id,entry.policy_version_id,-Math.abs(Number(entry.points)),entry.id,idempotency,{reversesEntryId:entry.id,originalPoints:Number(entry.points),reasonCode,rationale:reason},actor])).rows[0];
 await tx.query("insert into community_impact_score_adjustment_event(ledger_entry_id,actor_user_id,event_code,reason_code,rationale,before_snapshot,after_snapshot) values($1,$2,'reversed',$3,$4,$5,$6)",[row.id,actor,reasonCode,reason,{originalEntryId:entry.id,points:Number(entry.points)},{reversalEntryId:row.id,points:-Math.abs(Number(entry.points))}]);
 return row;
}
export async function reverseScoreEntry(actor,entryId,input){
 await permission(getPool(),actor,"community_impact.score.reverse");
 const reason=clean(input?.rationale,12,2000,"Reversal rationale"),code=clean(input?.reasonCode,3,80,"Reversal reason code");
 return withTransaction(async tx=>{
  const entry=(await tx.query("select * from community_impact_score_ledger where id=$1 for update",[entryId])).rows[0];if(!entry||entry.entry_type==="reversal")fail(404,"Award ledger entry not found.","NOT_FOUND");
  const prior=(await tx.query("select 1 from community_impact_score_ledger where reverses_entry_id=$1",[entryId])).rowCount;if(prior)fail(409,"This ledger award has already been reversed.","ALREADY_REVERSED");
  const reversal=await reverseEntry(tx,actor,entry,reason,code);return {originalEntryId:entryId,reversalEntryId:reversal.id,reversedPoints:Math.abs(Number(entry.points))};
 });
}
export async function recalculateVerifiedClaim(actor,claimId,input){
 await permission(getPool(),actor,"community_impact.score.recalculate");
 const rationale=clean(input?.rationale,12,2000,"Recalculation rationale");
 return withTransaction(async tx=>{
  const policy=await activePolicy(tx);
  const prior=(await tx.query("select * from community_impact_score_ledger where claim_id=$1 and entry_type='award' and not exists(select 1 from community_impact_score_ledger r where r.reverses_entry_id=community_impact_score_ledger.id) order by created_at desc for update",[claimId])).rows;
  for(const entry of prior)await reverseEntry(tx,actor,entry,rationale,"policy_recalculation");
  let result;try{result=await scoreClaim(tx,actor,claimId,rationale,policy,null)}catch(error){if(prior.length===0)throw error;result={status:"blocked",reason:error.code||"SCORE_RECALCULATION_BLOCKED"}}
  const log=(await tx.query("insert into community_impact_score_recalculation(subject_user_id,source_type,source_record_id,prior_policy_version_id,target_policy_version_id,initiated_by,rationale,status,summary) select c.claimant_user_id,$2,$3,$4,$5,$6,$7,$8,$9 from community_impact_claim c where c.id=$1 returning id",[claimId,prior[0]?.source_type||sourceType((await tx.query("select * from community_impact_claim where id=$1",[claimId])).rows[0]),prior[0]?.source_record_id||claimId,prior[0]?.policy_version_id||null,policy.id,actor,rationale,result?.status==="blocked"?"blocked":prior.length?"completed":result?.status==="already_recorded"?"no_change":"completed",{reversed:prior.length,newEntry:result||null}])).rows[0];
  return {recalculationId:log.id,...(result||{})};
 });
}
export async function listScoreLedger(actor,filters={}){
 await permission(getPool(),actor,"community_impact.score.view_all");
 const values=[],where=[];if(filters.userId){values.push(filters.userId);where.push("l.subject_user_id=$"+values.length)}if(filters.sourceType){values.push(filters.sourceType);where.push("l.source_type=$"+values.length)}
 const rows=await getPool().query("select l.*,u.email subject_email from community_impact_score_ledger l join app_user u on u.id=l.subject_user_id "+(where.length?"where "+where.join(" and "):"")+" order by l.created_at desc limit 200",values);return {items:rows.rows};
}
