import {getPool,withTransaction} from "./db.js";
import {policyError} from "./identity-policy.js";

function fail(status,message,code="COMMUNITY_IMPACT_DETECTION_ERROR"){throw policyError(status,message,code)}
function bounded(value,min,max,fallback){const n=Number(value);return Number.isInteger(n)?Math.min(Math.max(n,min),max):fallback}
async function assertDetectionManager(db,userId){
 const [roles,permissions]=await Promise.all([
  db.query("select r.role_code from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1",[userId]),
  db.query("select permission_code from app_user_permission where user_id=$1",[userId])
 ]);
 if(!roles.rows.some(row=>row.role_code==="system_admin")&&!permissions.rows.some(row=>row.permission_code==="community_impact.detection.manage"))fail(403,"Community Impact detection-management permission is required.","COMMUNITY_IMPACT_DETECTION_FORBIDDEN");
}
async function activePolicy(db,sourceType){
 const result=await db.query("select p.id,p.version,p.rules from community_impact_detection_active_policy a join community_impact_detection_policy_version p on p.id=a.policy_version_id where a.source_system='serve_community' and a.source_type=$1",[sourceType]);
 return result.rows[0]||null;
}
function mappedCategory(policy,sourceCategory){
 const rules=policy?.rules||{},map=rules.categoryMap||{};
 return typeof map[sourceCategory]==="string"&&map[sourceCategory].trim()?map[sourceCategory]:null;
}
async function addCandidate(db,{sourceType,sourceRecordId,sourceEventId,sourceEventCode,sourceEventVersion,contributorUserId,sourceCategory,policy,attributionStatus}){
 const rules=policy.rules||{};
 if(rules.enabled!==true||!Array.isArray(rules.sourceEventCodes)||!rules.sourceEventCodes.includes(sourceEventCode))return null;
 const canonicalCategory=mappedCategory(policy,sourceCategory);
 if(!canonicalCategory)return null;
 const confidence=Number(rules.confidence);
 if(!Number.isFinite(confidence)||confidence<0||confidence>1)return null;
 const role=rules.defaultRole==null?null:String(rules.defaultRole);
 const inserted=await db.query(
  "insert into community_impact_detection_candidate(source_system,source_type,source_record_id,source_event_id,source_event_code,source_event_version,contributor_user_id,source_category,canonical_category,contribution_role,attribution_status,detection_status,confidence,policy_version_id,detection_metadata) values('serve_community',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'detected',$11,$12,$13) on conflict(source_system,source_type,source_event_id) do nothing returning id",
  [sourceType,sourceRecordId,sourceEventId,sourceEventCode,sourceEventVersion,contributorUserId,sourceCategory,canonicalCategory,role,attributionStatus,confidence,policy.id,{policyVersion:policy.version,adapter:"serve-community-impact-detection-v1"}]
 );
 if(!inserted.rowCount)return null;
 await db.query("insert into community_impact_detection_candidate_event(candidate_id,event_code,metadata) values($1,'detected',$2)",[inserted.rows[0].id,{sourceType,policyVersion:policy.version,attributionStatus}]);
 return inserted.rows[0].id;
}
export async function detectParticipationCompletion(db,participationId){
 const policy=await activePolicy(db,"initiative_participation");
 if(!policy)return null;
 const rules=policy.rules||{};
 const codes=Array.isArray(rules.sourceEventCodes)?rules.sourceEventCodes:[];
 const sourceStatuses=Array.isArray(rules.sourceStatuses)?rules.sourceStatuses:[];
 const parentStatuses=Array.isArray(rules.parentStatuses)?rules.parentStatuses:[];
 if(!rules.enabled||!codes.length||!sourceStatuses.length||!parentStatuses.length)return null;
 const row=(await db.query("select e.id source_event_id,e.event_code,e.created_at source_event_version,p.id source_record_id,p.participant_user_id,p.status source_status,i.status parent_status,i.category source_category from serve_community_participation_event e join serve_community_participation p on p.id=e.participation_id join serve_community_initiative i on i.id=p.initiative_id where p.id=$1 and e.event_code=any($2::text[]) and p.status=any($3::text[]) and i.status=any($4::text[]) order by e.created_at desc limit 1",[participationId,codes,sourceStatuses,parentStatuses])).rows[0];
 if(!row)return null;
 if(rules.attributionMode!=="authoritative_source_user"||rules.requireContributorConfirmation!==true)return null;
 return addCandidate(db,{sourceType:"initiative_participation",sourceRecordId:row.source_record_id,sourceEventId:row.source_event_id,sourceEventCode:row.event_code,sourceEventVersion:row.source_event_version,contributorUserId:row.participant_user_id,sourceCategory:row.source_category,policy,attributionStatus:"pending_confirmation"});
}
export async function detectOfflineProjectApproval(db,projectId){
 const policy=await activePolicy(db,"offline_completed_project");
 if(!policy)return null;
 const rules=policy.rules||{};
 const codes=Array.isArray(rules.sourceEventCodes)?rules.sourceEventCodes:[];
 const statuses=Array.isArray(rules.sourceStatuses)?rules.sourceStatuses:[];
 if(!rules.enabled||!codes.length||!statuses.length||rules.attributionMode!=="unattributed_until_evidenced")return null;
 const row=(await db.query("select e.id source_event_id,e.event_code,e.created_at source_event_version,p.id source_record_id,p.status source_status,p.category source_category from serve_community_offline_project_event e join serve_community_offline_project p on p.id=e.project_id where p.id=$1 and e.event_code=any($2::text[]) and p.status=any($3::text[]) order by e.created_at desc limit 1",[projectId,codes,statuses])).rows[0];
 if(!row)return null;
 return addCandidate(db,{sourceType:"offline_completed_project",sourceRecordId:row.source_record_id,sourceEventId:row.source_event_id,sourceEventCode:row.event_code,sourceEventVersion:row.source_event_version,contributorUserId:null,sourceCategory:row.source_category,policy,attributionStatus:"unattributed"});
}
async function reconcileCandidateReversals(db,limit){
 let reversed=0;
 const participation=(await db.query("select c.id,c.contributor_user_id,p.participant_user_id,p.status source_status,i.status parent_status,e.event_code,pv.rules from community_impact_detection_candidate c join community_impact_detection_policy_version pv on pv.id=c.policy_version_id join serve_community_participation p on p.id=c.source_record_id join serve_community_initiative i on i.id=p.initiative_id join serve_community_participation_event e on e.id=c.source_event_id where c.source_type='initiative_participation' and c.detection_status='detected' and (coalesce(pv.rules->'sourceStatuses' ? p.status,false)=false or coalesce(pv.rules->'parentStatuses' ? i.status,false)=false or coalesce(pv.rules->'sourceEventCodes' ? e.event_code,false)=false or p.participant_user_id is distinct from c.contributor_user_id) order by c.created_at limit $1",[limit])).rows;
 for(const row of participation){const rules=row.rules||{},eligible=Array.isArray(rules.sourceStatuses)&&rules.sourceStatuses.includes(row.source_status)&&Array.isArray(rules.parentStatuses)&&rules.parentStatuses.includes(row.parent_status)&&Array.isArray(rules.sourceEventCodes)&&rules.sourceEventCodes.includes(row.event_code)&&row.participant_user_id===row.contributor_user_id;if(!eligible){const changed=await db.query("update community_impact_detection_candidate set detection_status='source_reversed',updated_at=now() where id=$1 and detection_status='detected' returning id",[row.id]);if(changed.rowCount){reversed++;await db.query("insert into community_impact_detection_candidate_event(candidate_id,event_code,reason,metadata) values($1,'source_reversed','The authoritative participation or initiative source no longer satisfies its detection policy.',$2)",[row.id,{sourceType:"initiative_participation"}]);}}}
 const offline=(await db.query("select c.id,p.status source_status,e.event_code,pv.rules from community_impact_detection_candidate c join community_impact_detection_policy_version pv on pv.id=c.policy_version_id join serve_community_offline_project p on p.id=c.source_record_id join serve_community_offline_project_event e on e.id=c.source_event_id where c.source_type='offline_completed_project' and c.detection_status='detected' and (coalesce(pv.rules->'sourceStatuses' ? p.status,false)=false or coalesce(pv.rules->'sourceEventCodes' ? e.event_code,false)=false) order by c.created_at limit $1",[limit])).rows;
 for(const row of offline){const rules=row.rules||{},eligible=Array.isArray(rules.sourceStatuses)&&rules.sourceStatuses.includes(row.source_status)&&Array.isArray(rules.sourceEventCodes)&&rules.sourceEventCodes.includes(row.event_code);if(!eligible){const changed=await db.query("update community_impact_detection_candidate set detection_status='source_reversed',updated_at=now() where id=$1 and detection_status='detected' returning id",[row.id]);if(changed.rowCount){reversed++;await db.query("insert into community_impact_detection_candidate_event(candidate_id,event_code,reason,metadata) values($1,'source_reversed','The authoritative offline-project source no longer satisfies its detection policy.',$2)",[row.id,{sourceType:"offline_completed_project"}]);}}}
 return reversed;
}
export async function scanDetectionSources(actorUserId,requestId,options={}){
 const db=getPool();await assertDetectionManager(db,actorUserId);
 const limit=bounded(options.limit,1,500,200);
 return withTransaction(async tx=>{
  const participationPolicy=await activePolicy(tx,"initiative_participation");
  const offlinePolicy=await activePolicy(tx,"offline_completed_project");
  const sourceReversed=await reconcileCandidateReversals(tx,limit);
  let participationDetected=0,offlineDetected=0,examined=0;
  if(participationPolicy?.rules?.enabled===true){
   const rules=participationPolicy.rules,codes=Array.isArray(rules.sourceEventCodes)?rules.sourceEventCodes:[],sourceStatuses=Array.isArray(rules.sourceStatuses)?rules.sourceStatuses:[],parentStatuses=Array.isArray(rules.parentStatuses)?rules.parentStatuses:[];
   if(codes.length&&sourceStatuses.length&&parentStatuses.length){
    const rows=(await tx.query("select distinct p.id from serve_community_participation_event e join serve_community_participation p on p.id=e.participation_id join serve_community_initiative i on i.id=p.initiative_id where e.event_code=any($1::text[]) and p.status=any($2::text[]) and i.status=any($3::text[]) and not exists(select 1 from community_impact_detection_candidate c where c.source_type='initiative_participation' and c.source_record_id=p.id) order by p.id limit $4",[codes,sourceStatuses,parentStatuses,limit])).rows;
    for(const row of rows){examined++;if(await detectParticipationCompletion(tx,row.id))participationDetected++;}
   }
  }
  if(offlinePolicy?.rules?.enabled===true&&examined<limit){
   const rules=offlinePolicy.rules,codes=Array.isArray(rules.sourceEventCodes)?rules.sourceEventCodes:[],statuses=Array.isArray(rules.sourceStatuses)?rules.sourceStatuses:[];
   if(codes.length&&statuses.length){
    const rows=(await tx.query("select distinct p.id from serve_community_offline_project_event e join serve_community_offline_project p on p.id=e.project_id where e.event_code=any($1::text[]) and p.status=any($2::text[]) and not exists(select 1 from community_impact_detection_candidate c where c.source_type='offline_completed_project' and c.source_record_id=p.id) order by p.id limit $3",[codes,statuses,limit-examined])).rows;
    for(const row of rows){examined++;if(await detectOfflineProjectApproval(tx,row.id))offlineDetected++;}
   }
  }
  await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'community_impact.detection_scan','community_impact_detection_candidate',null,$2,'success',$3)",[actorUserId,requestId||null,{examined,participationDetected,offlineDetected,limit}]);
  return {examined,sourceReversed,created:{initiativeParticipations:participationDetected,offlineProjects:offlineDetected},limit,note:"Candidates remain private and unverified. Detection does not award points or publish profile data."};
 });
}
export async function listMyDetectedContributions(userId,options={}){
 const limit=bounded(options.limit,1,100,50);
 const rows=await getPool().query("select c.id,c.source_type,c.source_record_id,c.source_event_code,c.source_event_version,c.canonical_category,c.contribution_role,c.attribution_status,c.detection_status,c.confidence,c.created_at,case when c.source_type='initiative_participation' then (select i.title from serve_community_participation p join serve_community_initiative i on i.id=p.initiative_id where p.id=c.source_record_id) else null end source_title from community_impact_detection_candidate c where c.contributor_user_id=$1 order by c.created_at desc limit $2",[userId,limit]);
 return {items:rows.rows};
}
export async function confirmMyDetectedAttribution(candidateId,userId,requestId){
 return withTransaction(async tx=>{
  const row=(await tx.query("select c.*,pv.rules policy_rules from community_impact_detection_candidate c join community_impact_detection_policy_version pv on pv.id=c.policy_version_id where c.id=$1 for update of c",[candidateId])).rows[0];
  if(!row||row.contributor_user_id!==userId)fail(404,"Detected contribution not found.","NOT_FOUND");
  if(row.source_type!=="initiative_participation"||row.attribution_status!=="pending_confirmation"||row.detection_status!=="detected")fail(409,"This attribution cannot be confirmed in its current state.","INVALID_ATTRIBUTION_STATE");
  const current=(await tx.query("select p.participant_user_id,p.status source_status,i.status parent_status,e.event_code from serve_community_participation p join serve_community_initiative i on i.id=p.initiative_id join serve_community_participation_event e on e.participation_id=p.id where p.id=$1 and e.id=$2 limit 1",[row.source_record_id,row.source_event_id])).rows[0];
  const rules=row.policy_rules||{};
  const eligible=!!current&&current.participant_user_id===userId&&Array.isArray(rules.sourceStatuses)&&rules.sourceStatuses.includes(current.source_status)&&Array.isArray(rules.parentStatuses)&&rules.parentStatuses.includes(current.parent_status)&&Array.isArray(rules.sourceEventCodes)&&rules.sourceEventCodes.includes(current.event_code);
  if(!eligible)fail(409,"The source completion is no longer eligible; request reconciliation.","SOURCE_NO_LONGER_ELIGIBLE");
  const updated=(await tx.query("update community_impact_detection_candidate set attribution_status='confirmed',updated_at=now() where id=$1 and attribution_status='pending_confirmation' returning *",[candidateId])).rows[0];
  await tx.query("insert into community_impact_detection_candidate_event(candidate_id,actor_user_id,event_code,reason,metadata) values($1,$2,'attribution_confirmed','Contributor confirmed the proposed source attribution.',$3)",[candidateId,userId,{requestId:requestId||null}]);
  await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'community_impact.attribution_confirmed','community_impact_detection_candidate',$2,$3,'success',$4)",[userId,candidateId,requestId||null,{sourceType:row.source_type}]);
  return {id:updated.id,attributionStatus:updated.attribution_status,detectionStatus:updated.detection_status,note:"Attribution confirmation is not impact verification or score eligibility."};
 });
}
export async function disputeMyDetectedAttribution(candidateId,userId,reason,requestId){
 const why=String(reason||"").trim();if(why.length<8||why.length>1000)fail(400,"Explain the attribution dispute in 8 to 1000 characters.","VALIDATION_ERROR");
 return withTransaction(async tx=>{
  const row=(await tx.query("select * from community_impact_detection_candidate where id=$1 for update",[candidateId])).rows[0];
  if(!row||row.contributor_user_id!==userId)fail(404,"Detected contribution not found.","NOT_FOUND");
  if(row.attribution_status!=="pending_confirmation"||row.detection_status!=="detected")fail(409,"This attribution cannot be disputed in its current state.","INVALID_ATTRIBUTION_STATE");
  const updated=(await tx.query("update community_impact_detection_candidate set attribution_status='disputed',updated_at=now() where id=$1 and attribution_status='pending_confirmation' returning *",[candidateId])).rows[0];
  await tx.query("insert into community_impact_detection_candidate_event(candidate_id,actor_user_id,event_code,reason,metadata) values($1,$2,'attribution_disputed',$3,$4)",[candidateId,userId,why,{requestId:requestId||null}]);
  await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'community_impact.attribution_disputed','community_impact_detection_candidate',$2,$3,'success',$4)",[userId,candidateId,requestId||null,{sourceType:row.source_type}]);
  return {id:updated.id,attributionStatus:updated.attribution_status,detectionStatus:updated.detection_status,note:"Disputed attribution is excluded from verification and scoring."};
 });
}
export async function listDetectionCandidates(actorUserId,options={}){
 const db=getPool();await assertDetectionManager(db,actorUserId);
 const limit=bounded(options.limit,1,200,50),offset=bounded(options.offset,0,100000,0);
 const rows=await db.query("select c.id,c.source_type,c.source_record_id,c.source_event_id,c.source_event_code,c.canonical_category,c.contribution_role,c.attribution_status,c.detection_status,c.confidence,c.created_at,case when c.source_type='initiative_participation' then (select i.title from serve_community_participation p join serve_community_initiative i on i.id=p.initiative_id where p.id=c.source_record_id) when c.source_type='offline_completed_project' then (select p.title from serve_community_offline_project p where p.id=c.source_record_id) else null end source_title from community_impact_detection_candidate c order by c.created_at desc limit $1 offset $2",[limit,offset]);
 return {items:rows.rows,limit,offset};
}
