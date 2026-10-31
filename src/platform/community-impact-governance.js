import {createHash} from "node:crypto";
import {getPool,withTransaction} from "./db.js";
import {policyError} from "./identity-policy.js";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function fail(status,message,code="COMMUNITY_IMPACT_GOVERNANCE_ERROR"){throw policyError(status,message,code)}
function clean(value,min,max,label){const s=String(value??"").trim();if(s.length<min||s.length>max)fail(400,label+" must be between "+min+" and "+max+" characters.","VALIDATION_ERROR");return s}
async function permission(db,userId,code){const q=await db.query("select exists(select 1 from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1 and r.role_code='system_admin') or exists(select 1 from app_user_permission where user_id=$1 and permission_code=$2) allowed",[userId,code]);if(!q.rows[0]?.allowed)fail(403,"The required Community Impact governance permission is required.","FORBIDDEN")}
async function retention(db,dataClass){const r=await db.query("select p.id,p.policy->'dataClasses'->$1 rule from community_impact_retention_active_policy a join community_impact_retention_policy_version p on p.id=a.policy_version_id where a.singleton=true and p.status='active'",[dataClass]);if(!r.rows[0]?.id||!r.rows[0]?.rule)fail(409,"MPA must approve and activate the relevant retention rule before collecting this information.","COMMUNITY_IMPACT_RETENTION_POLICY_REQUIRED");return r.rows[0]}
async function event(db,actor,aggregateType,aggregateId,eventCode,rationale,metadata={}){await db.query("insert into community_impact_governance_event(aggregate_type,aggregate_id,actor_user_id,event_code,rationale,metadata) values($1,$2,$3,$4,$5,$6)",[aggregateType,aggregateId,actor,eventCode,clean(rationale,4,2000,"Rationale"),metadata])}
async function activeMember(db,userId){return (await db.query("select 1 from membership_record where user_id=$1 and status='active' and start_date<=current_date and (end_date is null or end_date>=current_date) limit 1",[userId])).rowCount>0}

export async function getMyIdentityAssurance(userId){
 const row=(await getPool().query("select c.id,c.status,c.legal_name,c.identity_country,c.assurance_level,c.submitted_at,c.current_decision,(select array_agg(e.file_object_id) from community_impact_identity_assurance_evidence e where e.case_id=c.id) evidence_file_ids from community_impact_identity_assurance_case c where c.user_id=$1 order by c.created_at desc limit 1",[userId])).rows[0];
 return {item:row||null};
}
export async function submitIdentityAssurance(userId,input,requestId){
 const legalName=clean(input?.legalName,2,180,"Legal name"),country=clean(input?.identityCountry,2,100,"Identity country"),level=input?.assuranceLevel==="enhanced"?"enhanced":"standard";
 const policy=await retention(getPool(),"identity_assurance_artifacts");
 return withTransaction(async tx=>{
  const existing=(await tx.query("select id,status from community_impact_identity_assurance_case where user_id=$1 and status in('draft','submitted','under_review') for update",[userId])).rows[0];
  if(existing)fail(409,"An identity-assurance case is already open for this account.","IDENTITY_ASSURANCE_ALREADY_OPEN");
  const row=(await tx.query("insert into community_impact_identity_assurance_case(user_id,legal_name,identity_country,assurance_level,status) values($1,$2,$3,$4,'draft') returning id,status,created_at",[userId,legalName,country,level])).rows[0];
  await event(tx,userId,"identity_assurance",row.id,"created","Identity assurance case created.",{requestId:requestId||null,retentionPolicyVersionId:policy.id});
  return row;
 });
}
export async function attachIdentityEvidence(userId,caseId,input,requestId){
 if(!UUID.test(String(caseId))||!UUID.test(String(input?.fileObjectId)))fail(400,"A valid identity case and private evidence file are required.","VALIDATION_ERROR");
 const kind=String(input?.evidenceKind||"");if(!["government_id","address_attestation","organization_attestation","other"].includes(kind))fail(400,"Choose a supported identity evidence type.","VALIDATION_ERROR");
 const policy=await retention(getPool(),"identity_assurance_artifacts");
 return withTransaction(async tx=>{
  const c=(await tx.query("select * from community_impact_identity_assurance_case where id=$1 and user_id=$2 for update",[caseId,userId])).rows[0];
  if(!c||!["draft","submitted"].includes(c.status))fail(404,"Editable identity-assurance case not found.","NOT_FOUND");
  const file=(await tx.query("select id from file_object where id=$1 and created_by=$2 and visibility='private'",[input.fileObjectId,userId])).rows[0];if(!file)fail(404,"Private identity evidence file not found.","NOT_FOUND");
  await tx.query("insert into community_impact_identity_assurance_evidence(case_id,file_object_id,evidence_kind,uploaded_by,retention_policy_version_id,retention_rule_snapshot) values($1,$2,$3,$4,$5,$6) on conflict(case_id,file_object_id) do nothing",[caseId,input.fileObjectId,kind,userId,policy.id,JSON.stringify(policy.rule)]);
  await event(tx,userId,"identity_assurance",caseId,"evidence_attached","Private identity evidence attached.",{evidenceKind:kind,requestId:requestId||null});
  return {caseId,evidenceAttached:true};
 });
}
export async function submitIdentityAssuranceCase(userId,caseId,requestId){
 return withTransaction(async tx=>{
  const c=(await tx.query("select * from community_impact_identity_assurance_case where id=$1 and user_id=$2 for update",[caseId,userId])).rows[0];
  if(!c||c.status!=="draft")fail(409,"Only your identity-assurance draft can be submitted.","INVALID_STATE");
  const count=(await tx.query("select count(*)::int n from community_impact_identity_assurance_evidence where case_id=$1",[caseId])).rows[0].n;
  if(count<1)fail(409,"Attach at least one private identity evidence item before submission.","IDENTITY_EVIDENCE_REQUIRED");
  await tx.query("update community_impact_identity_assurance_case set status='submitted',submitted_at=now(),updated_at=now() where id=$1",[caseId]);
  await event(tx,userId,"identity_assurance",caseId,"submitted","Identity assurance submitted for independent review.",{evidenceCount:count,requestId:requestId||null});
  return {caseId,status:"submitted"};
 });
}
export async function decideIdentityAssurance(actorUserId,caseId,input,requestId){
 await permission(getPool(),actorUserId,"community_impact.identity.review");
 const decision=String(input?.decision||"");if(!["verified","declined","clarification_requested"].includes(decision))fail(400,"Unsupported identity-assurance decision.","INVALID_DECISION");
 const reason=clean(input?.reasonCode,3,80,"Reason code"),rationale=clean(input?.rationale,12,2000,"Decision rationale");
 return withTransaction(async tx=>{
  const c=(await tx.query("select * from community_impact_identity_assurance_case where id=$1 for update",[caseId])).rows[0];
  if(!c||!["submitted","under_review"].includes(c.status))fail(409,"Identity case is not awaiting review.","INVALID_STATE");
  if(c.user_id===actorUserId)fail(403,"A claimant cannot verify their own identity.","CONFLICT_OF_INTEREST");
  const evidence=(await tx.query("select count(*)::int n from community_impact_identity_assurance_evidence where case_id=$1",[caseId])).rows[0].n;
  if(decision==="verified"&&evidence<1)fail(409,"Identity assurance requires evidence.","IDENTITY_EVIDENCE_REQUIRED");
  const p=await retention(tx,"reviewer_notes");
  await tx.query("insert into community_impact_identity_assurance_decision(case_id,reviewer_user_id,decision_code,reason_code,rationale,retention_policy_version_id,retention_rule_snapshot) values($1,$2,$3,$4,$5,$6,$7)",[caseId,actorUserId,decision,reason,rationale,p.id,JSON.stringify(p.rule)]);
  const status=decision==="clarification_requested"?"under_review":decision;
  await tx.query("update community_impact_identity_assurance_case set status=$2,current_reviewer_id=$3,current_decision=$4,decided_at=case when $2 in('verified','declined') then now() else null end,updated_at=now() where id=$1",[caseId,status,actorUserId,decision]);
  await event(tx,actorUserId,"identity_assurance",caseId,decision,rationale,{requestId:requestId||null});
  return {caseId,status,decision};
 });
}
export async function assertClaimantIdentityAssured(db,userId){
 if(await activeMember(db,userId))return;
 const c=(await db.query("select status from community_impact_identity_assurance_case where user_id=$1 order by created_at desc limit 1",[userId])).rows[0];
 if(c?.status!=="verified")fail(409,"Non-member claimants must complete MPA identity assurance before submitting a contribution claim. This does not create membership.","IDENTITY_ASSURANCE_REQUIRED");
}
export async function proposeOfflineAttribution(userId,candidateId,input,requestId){
 await permission(getPool(),userId,"community_impact.detection.manage");
 if(!UUID.test(String(candidateId))||!UUID.test(String(input?.contributorUserId)))fail(400,"A valid offline candidate and contributor account are required.","VALIDATION_ERROR");
 const role=String(input?.contributionRole||"");if(!["lead","co_lead","contributor","mentor","reviewer_organizer","partner_organization","other"].includes(role))fail(400,"Choose a supported contribution role.","VALIDATION_ERROR");
 const share=Number(input?.attributionShare);if(!Number.isFinite(share)||share<=0||share>100)fail(400,"Attribution share must be greater than zero and at most 100.","VALIDATION_ERROR");
 const rationale=clean(input?.rationale,12,2000,"Attribution rationale");
 return withTransaction(async tx=>{
  const candidate=(await tx.query("select * from community_impact_detection_candidate where id=$1 and source_type='offline_completed_project' and detection_status='detected' and attribution_status='unattributed' for update",[candidateId])).rows[0];
  if(!candidate)fail(404,"Unattributed offline-project candidate not found.","NOT_FOUND");
  if(!(await activeMember(tx,input.contributorUserId))){const assured=(await tx.query("select 1 from community_impact_identity_assurance_case where user_id=$1 and status='verified'",[input.contributorUserId])).rowCount;if(!assured)fail(409,"The proposed non-member contributor must pass MPA identity assurance first.","IDENTITY_ASSURANCE_REQUIRED");}
  const p=await retention(tx,"raw_evidence");
  const allocated=(await tx.query("select coalesce(sum(attribution_share),0)::numeric total from community_impact_offline_attribution where candidate_id=$1 and status in ('submitted','under_review','verified')",[candidateId])).rows[0].total;
  if(Number(allocated)+share>100)fail(409,"Combined contributor shares cannot exceed 100 percent.","ATTRIBUTION_SHARE_EXCEEDED");
  const row=(await tx.query("insert into community_impact_offline_attribution(candidate_id,contributor_user_id,proposed_by,contribution_role,attribution_share,rationale) values($1,$2,$3,$4,$5,$6) on conflict(candidate_id,contributor_user_id) do nothing returning id,status",[candidateId,input.contributorUserId,userId,role,share,rationale])).rows[0];
  if(!row)fail(409,"An attribution proposal already exists for this contributor and project.","ATTRIBUTION_ALREADY_EXISTS");
  const evidenceIds=Array.isArray(input.evidenceFileIds)?input.evidenceFileIds:[];
  if(!evidenceIds.length)fail(400,"At least one evidence file is required for individual offline attribution.","ATTRIBUTION_EVIDENCE_REQUIRED");
  for(const fileId of evidenceIds){if(!UUID.test(String(fileId)))fail(400,"Invalid evidence file reference.","VALIDATION_ERROR");const f=(await tx.query("select id from file_object where id=$1 and visibility='private' and created_by in($2,$3)",[fileId,userId,input.contributorUserId])).rows[0];if(!f)fail(404,"Private attribution evidence not found.","NOT_FOUND");await tx.query("insert into community_impact_offline_attribution_evidence(attribution_id,file_object_id,uploaded_by,retention_policy_version_id,retention_rule_snapshot) values($1,$2,$3,$4,$5)",[row.id,fileId,userId,p.id,JSON.stringify(p.rule)]);}
  await event(tx,userId,"offline_attribution",row.id,"submitted","Evidence-backed individual attribution submitted.",{candidateId,contributorUserId:input.contributorUserId,evidenceCount:evidenceIds.length,requestId:requestId||null});
  return row;
 });
}
export async function confirmOfflineAttribution(userId,attributionId,input,requestId){
 const note=clean(input?.confirmationNote,8,1000,"Contributor confirmation");
 return withTransaction(async tx=>{
  const a=(await tx.query("select * from community_impact_offline_attribution where id=$1 for update",[attributionId])).rows[0];
  if(!a||a.contributor_user_id!==userId)fail(404,"Offline attribution proposal not found.","NOT_FOUND");
  if(a.status!=="submitted"||a.contributor_confirmed_at)fail(409,"This attribution cannot be confirmed in its current state.","INVALID_STATE");
  await tx.query("update community_impact_offline_attribution set contributor_confirmed_at=now(),contributor_confirmation_note=$2 where id=$1",[attributionId,note]);
  await event(tx,userId,"offline_attribution",attributionId,"contributor_confirmed",note,{requestId:requestId||null});
  return {attributionId,contributorConfirmed:true};
 });
}
export async function assignOfflineAttribution(actorUserId,attributionId,reviewerUserId,rationale,requestId){
 await permission(getPool(),actorUserId,"community_impact.claim.assign");
 if(!UUID.test(String(reviewerUserId)))fail(400,"A valid reviewer account is required.","VALIDATION_ERROR");
 const why=clean(rationale,8,1000,"Assignment rationale");
 return withTransaction(async tx=>{
  const a=(await tx.query("select * from community_impact_offline_attribution where id=$1 for update",[attributionId])).rows[0];if(!a||a.status!=="submitted")fail(409,"Only a submitted attribution can be assigned.","INVALID_STATE");
  if(!a.contributor_confirmed_at)fail(409,"The contributor must confirm the attribution before reviewer assignment.","CONTRIBUTOR_CONFIRMATION_REQUIRED");
  if(reviewerUserId===a.proposed_by||reviewerUserId===a.contributor_user_id)fail(409,"The proposer and contributor cannot review this attribution.","CONFLICT_OF_INTEREST");
  const u=(await tx.query("select status from app_user where id=$1",[reviewerUserId])).rows[0];if(u?.status!=="active")fail(409,"Only an active reviewer can be assigned.","REVIEWER_INACTIVE");
  await permission(tx,reviewerUserId,"community_impact.offline_attribution.review");
  await tx.query("update community_impact_offline_attribution set assigned_reviewer_id=$2,status='under_review' where id=$1",[attributionId,reviewerUserId]);
  await event(tx,actorUserId,"offline_attribution",attributionId,"assigned",why,{reviewerUserId,requestId:requestId||null});
  return {attributionId,status:"under_review",reviewerUserId};
 });
}
export async function decideOfflineAttribution(actorUserId,attributionId,input,requestId){
 await permission(getPool(),actorUserId,"community_impact.offline_attribution.review");
 const decision=String(input?.decision||"");if(!["verified","declined"].includes(decision))fail(400,"Choose verified or declined.","INVALID_DECISION");
 const rationale=clean(input?.rationale,12,2000,"Decision rationale");
 return withTransaction(async tx=>{
  const a=(await tx.query("select a.*,c.source_record_id from community_impact_offline_attribution a join community_impact_detection_candidate c on c.id=a.candidate_id where a.id=$1 for update of a,c",[attributionId])).rows[0];
  if(!a||a.status!=="under_review"||a.assigned_reviewer_id!==actorUserId)fail(409,"Attribution must be assigned to this reviewer before a decision.","ASSIGNMENT_REQUIRED");
  if(a.proposed_by===actorUserId||a.contributor_user_id===actorUserId)fail(403,"A proposer or contributor cannot verify their own attribution.","CONFLICT_OF_INTEREST");
  if(!a.contributor_confirmed_at)fail(409,"The named contributor must confirm this attribution before reviewer verification.","CONTRIBUTOR_CONFIRMATION_REQUIRED");
  const n=(await tx.query("select count(*)::int n from community_impact_offline_attribution_evidence where attribution_id=$1",[attributionId])).rows[0].n;if(decision==="verified"&&n<1)fail(409,"Attribution requires private evidence.","ATTRIBUTION_EVIDENCE_REQUIRED");
  if(decision==="verified"){const identity=await activeMember(tx,a.contributor_user_id)?true:(await tx.query("select 1 from community_impact_identity_assurance_case where user_id=$1 and status='verified'",[a.contributor_user_id])).rowCount>0;if(!identity)fail(409,"Contributor identity assurance is not verified.","IDENTITY_ASSURANCE_REQUIRED");}
  await tx.query("update community_impact_offline_attribution set status=$2,decided_by=$3,decision_rationale=$4,decided_at=now() where id=$1",[attributionId,decision,actorUserId,rationale]);
  await event(tx,actorUserId,"offline_attribution",attributionId,decision,rationale,{requestId:requestId||null});
  return {attributionId,status:decision};
 });
}
export async function reconcileClaimCandidate(actorUserId,claimId,candidateId,rationale,requestId){
 await permission(getPool(),actorUserId,"community_impact.claim.assess");
 const why=clean(rationale,12,2000,"Reconciliation rationale");
 return withTransaction(async tx=>{
  const c=(await tx.query("select * from community_impact_claim where id=$1 for update",[claimId])).rows[0];
  const d=(await tx.query("select * from community_impact_detection_candidate where id=$1 for update",[candidateId])).rows[0];
  if(!c||!d)fail(404,"Claim or detected contribution not found.","NOT_FOUND");
  if(!["submitted","under_review","clarification_requested"].includes(c.status))fail(409,"Only an open claim can be reconciled.","INVALID_STATE");
  let attributedUser=d.contributor_user_id;
  if(d.source_type==="offline_completed_project"){const verified=(await tx.query("select contributor_user_id from community_impact_offline_attribution where candidate_id=$1 and contributor_user_id=$2 and status='verified' and contributor_confirmed_at is not null",[candidateId,c.claimant_user_id])).rows;if(verified.length!==1)fail(409,"The claimant must have an individually verified and contributor-confirmed offline attribution before reconciliation.","ATTRIBUTION_NOT_VERIFIED");attributedUser=verified[0].contributor_user_id;}
  if(d.detection_status!=="detected"||d.attribution_status==="disputed"||d.attribution_status==="unattributed"&&d.source_type!=="offline_completed_project"||attributedUser!==c.claimant_user_id)fail(409,"Claimant identity and verified source attribution must match; no fuzzy or cross-person merge is allowed.","RECONCILIATION_IDENTITY_MISMATCH");
  const assigned=(await tx.query("select 1 from community_impact_claim_assignment where claim_id=$1 and reviewer_user_id=$2 and active=true",[claimId,actorUserId])).rowCount;if(!assigned)fail(403,"Only the assigned impact reviewer may reconcile this claim.","ASSIGNMENT_REQUIRED");
  const row=(await tx.query("insert into community_impact_claim_candidate_link(claim_id,candidate_id,linked_by,rationale) values($1,$2,$3,$4) on conflict do nothing returning id",[claimId,candidateId,actorUserId,why])).rows[0];if(!row)fail(409,"This claim or source candidate has already been reconciled.","ALREADY_RECONCILED");
  await event(tx,actorUserId,"claim",claimId,"source_reconciled",why,{candidateId,requestId:requestId||null});
  return {claimId,candidateId,reconciled:true,scoreEffect:"none"};
 });
}
export async function proposeDetectionPolicy(actorUserId,input,requestId){
 await permission(getPool(),actorUserId,"community_impact.detection_policy.manage");
 const sourceType=String(input?.sourceType||"");if(!["initiative_participation","offline_completed_project"].includes(sourceType))fail(400,"Unsupported detection source type.","VALIDATION_ERROR");
 const rules=input?.rules;if(!rules||typeof rules!=="object"||Array.isArray(rules)||rules.enabled!==true||!Array.isArray(rules.sourceEventCodes)||!rules.sourceEventCodes.length||!rules.categoryMap||typeof rules.categoryMap!=="object")fail(400,"Policy must explicitly define enabled state, source event codes and category mapping.","INVALID_POLICY");
 const rationale=clean(input?.rationale,12,2000,"Policy rationale"),approvalReference="PENDING-"+Date.now();
 return withTransaction(async tx=>{
  await tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))",["community_impact_detection_policy:"+sourceType]);
  const v=(await tx.query("select coalesce(max(version),0)+1 version from community_impact_detection_policy_version where source_system='serve_community' and source_type=$1",[sourceType])).rows[0].version;
  const p=(await tx.query("insert into community_impact_detection_policy_version(source_system,source_type,version,rules,approval_reference,created_by) values('serve_community',$1,$2,$3,$4,$5) returning id,version,rules",[sourceType,v,rules,approvalReference,actorUserId])).rows[0];
  await tx.query("insert into community_impact_detection_policy_governance(policy_version_id,status,rationale,created_by) values($1,'in_review',$2,$3)",[p.id,rationale,actorUserId]);
  await tx.query("insert into community_impact_detection_policy_event(policy_version_id,actor_user_id,event_code,reason,metadata) values($1,$2,'proposed',$3,$4)",[p.id,actorUserId,rationale,{requestId:requestId||null,version:v,sourceType}]);
  return {id:p.id,version:p.version,status:"in_review",rules:p.rules};
 });
}
export async function approveDetectionPolicy(actorUserId,policyId,input,requestId){
 await permission(getPool(),actorUserId,"community_impact.detection_policy.approve");
 const reference=clean(input?.approvalReference,8,240,"Approval reference"),rationale=clean(input?.rationale,12,2000,"Approval rationale");
 return withTransaction(async tx=>{
  const g=(await tx.query("select g.*,p.version,p.source_type from community_impact_detection_policy_governance g join community_impact_detection_policy_version p on p.id=g.policy_version_id where p.id=$1 for update of g",[policyId])).rows[0];
  if(!g||g.status!=="in_review")fail(409,"Detection policy is not awaiting approval.","INVALID_STATE");
  if(g.created_by===actorUserId)fail(403,"The policy proposer cannot approve their own policy.","SELF_APPROVAL");
  // Immutable policy version; approval reference is stored in governance record.
  await tx.query("update community_impact_detection_policy_governance set status='approved',approved_by=$2,approved_at=now(),approval_reference=$3 where policy_version_id=$1",[policyId,actorUserId,reference]);
  await tx.query("insert into community_impact_detection_policy_event(policy_version_id,actor_user_id,event_code,reason,metadata) values($1,$2,'approved',$3,$4)",[policyId,actorUserId,rationale,{requestId:requestId||null,approvalReference:reference}]);
  return {id:policyId,status:"approved",version:g.version};
 });
}
export async function activateDetectionPolicy(actorUserId,policyId,rationale,requestId){
 await permission(getPool(),actorUserId,"community_impact.detection_policy.approve");
 const why=clean(rationale,12,2000,"Activation rationale");
 return withTransaction(async tx=>{
  const g=(await tx.query("select g.*,p.source_system,p.source_type,p.version from community_impact_detection_policy_governance g join community_impact_detection_policy_version p on p.id=g.policy_version_id where p.id=$1 for update of g,p",[policyId])).rows[0];
  if(!g||g.status!=="approved")fail(409,"Only an independently approved detection policy can be activated.","INVALID_STATE");
  if(g.created_by===actorUserId)fail(403,"The policy proposer cannot activate their own policy.","SELF_ACTIVATION");
  const prior=(await tx.query("select policy_version_id from community_impact_detection_active_policy where source_system=$1 and source_type=$2 for update",[g.source_system,g.source_type])).rows[0];
  if(prior){await tx.query("update community_impact_detection_policy_governance set status='superseded' where policy_version_id=$1",[prior.policy_version_id]);await tx.query("insert into community_impact_detection_policy_event(policy_version_id,actor_user_id,event_code,reason,metadata) values($1,$2,'superseded',$3,$4)",[prior.policy_version_id,actorUserId,why,{replacedBy:policyId}]);}
  await tx.query("insert into community_impact_detection_active_policy(source_system,source_type,policy_version_id) values($1,$2,$3) on conflict(source_system,source_type) do update set policy_version_id=excluded.policy_version_id,activated_at=now()",[g.source_system,g.source_type,policyId]);
  await tx.query("update community_impact_detection_policy_governance set status='active',activated_by=$2,activated_at=now() where policy_version_id=$1",[policyId,actorUserId]);
  await tx.query("insert into community_impact_detection_policy_event(policy_version_id,actor_user_id,event_code,reason,metadata) values($1,$2,'activated',$3,$4)",[policyId,actorUserId,why,{version:g.version,requestId:requestId||null}]);
  return {id:policyId,status:"active",version:g.version};
 });
}
export async function declareReviewerConflict(userId,claimId,input,requestId){
 await permission(getPool(),userId,"community_impact.claim.review");
 const type=String(input?.conflictType||"");if(!["personal_relationship","financial_interest","employment_affiliation","project_involvement","prior_decision","other"].includes(type))fail(400,"Choose a supported conflict type.","VALIDATION_ERROR");
 const declaration=clean(input?.declaration,12,2000,"Conflict declaration");
 return withTransaction(async tx=>{
  const c=(await tx.query("select id from community_impact_claim where id=$1",[claimId])).rows[0];if(!c)fail(404,"Claim not found.","NOT_FOUND");
  const assigned=(await tx.query("select 1 from community_impact_claim_assignment where claim_id=$1 and reviewer_user_id=$2 and active=true",[claimId,userId])).rowCount;if(!assigned)fail(403,"Only the assigned reviewer may declare a case conflict.","ASSIGNMENT_REQUIRED");
  const row=(await tx.query("insert into community_impact_reviewer_conflict(claim_id,reviewer_user_id,conflict_type,declaration,declared_by) values($1,$2,$3,$4,$5) returning id,status",[claimId,userId,type,declaration,userId])).rows[0];
  await event(tx,userId,"claim",claimId,"reviewer_conflict_declared",declaration,{conflictId:row.id,requestId:requestId||null});
  return row;
 });
}
export async function proposeContributionAssessment(userId,claimId,input,requestId){
 await permission(getPool(),userId,"community_impact.claim.assess");
 const evidence=Array.isArray(input?.evidenceReferences)?input.evidenceReferences:[];if(!evidence.length||evidence.some(x=>!UUID.test(String(x))))fail(400,"Assessment must reference at least one claim evidence item.","ASSESSMENT_EVIDENCE_REQUIRED");
 const share=Number(input?.attributionShare);if(!Number.isFinite(share)||share<=0||share>100)fail(400,"Attribution share must be between 0 and 100.","VALIDATION_ERROR");
 const category=clean(input?.category,3,80,"Category"),type=clean(input?.contributionType,3,80,"Contribution type"),role=clean(input?.contributionRole,3,80,"Contribution role");
 const quality=String(input?.evidenceQuality||""),maturity=String(input?.outcomeMaturity||"");if(!["insufficient","limited","adequate","strong","exceptional"].includes(quality)||!["activity","output","outcome","sustained_impact"].includes(maturity))fail(400,"Assessment quality or outcome maturity is invalid.","VALIDATION_ERROR");
 const rationale=clean(input?.rationale,12,2000,"Assessment rationale"),rubric=input?.rubric||{};if(typeof rubric!=="object"||Array.isArray(rubric))fail(400,"Rubric ratings must be an object.","VALIDATION_ERROR");
 return withTransaction(async tx=>{
  const c=(await tx.query("select * from community_impact_claim where id=$1 for update",[claimId])).rows[0];if(!c)fail(404,"Claim not found.","NOT_FOUND");
  const assigned=(await tx.query("select 1 from community_impact_claim_assignment where claim_id=$1 and reviewer_user_id=$2 and active=true",[claimId,userId])).rowCount;if(!assigned)fail(403,"Only the assigned reviewer may assess this claim.","ASSIGNMENT_REQUIRED");
  const conflict=(await tx.query("select 1 from community_impact_reviewer_conflict where claim_id=$1 and reviewer_user_id=$2 and status in('declared','confirmed','recused')",[claimId,userId])).rowCount;if(conflict)fail(403,"A reviewer with an active conflict cannot assess this claim.","CONFLICT_OF_INTEREST");
  const valid=(await tx.query("select count(*)::int n from community_impact_claim_evidence where claim_id=$1 and id=any($2::uuid[]) and removed_at is null",[claimId,evidence])).rows[0].n;if(valid!==new Set(evidence).size)fail(400,"Every assessment evidence reference must belong to this claim and remain attached.","INVALID_EVIDENCE_REFERENCE");
  const risk=String(input?.riskLevel||"standard");if(!["standard","elevated","high"].includes(risk))fail(400,"Choose standard, elevated or high risk.","VALIDATION_ERROR");
  const row=(await tx.query("insert into community_impact_contribution_assessment(claim_id,reviewer_user_id,category,contribution_type,contribution_role,evidence_quality,outcome_maturity,attribution_share,rubric,evidence_references,rationale,risk_level,status) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id,status,risk_level",[claimId,userId,category,type,role,quality,maturity,share,rubric,evidence,rationale,risk,risk==="standard"?"approved":"pending_second_review"])).rows[0];
  await tx.query("insert into community_impact_contribution_assessment_event(assessment_id,actor_user_id,event_code,rationale) values($1,$2,'proposed',$3)",[row.id,userId,rationale]);
  if(risk==="standard")await tx.query("update community_impact_contribution_assessment set approved_at=now() where id=$1",[row.id]);
  await event(tx,userId,"claim",claimId,"assessment_proposed",rationale,{assessmentId:row.id,riskLevel:risk,requestId:requestId||null});
  return row;
 });
}
export async function secondReviewAssessment(userId,assessmentId,input,requestId){
 await permission(getPool(),userId,"community_impact.claim.second_review");
 const decision=String(input?.decision||"");if(!["approved","rejected"].includes(decision))fail(400,"Choose approved or rejected.","INVALID_DECISION");
 const rationale=clean(input?.rationale,12,2000,"Second-review rationale");
 return withTransaction(async tx=>{
  const a=(await tx.query("select a.*,c.claimant_user_id from community_impact_contribution_assessment a join community_impact_claim c on c.id=a.claim_id where a.id=$1 for update of a",[assessmentId])).rows[0];
  if(!a||a.status!=="pending_second_review")fail(409,"Assessment is not awaiting second review.","INVALID_STATE");
  if(a.reviewer_user_id===userId||a.claimant_user_id===userId)fail(403,"The original reviewer and claimant cannot perform second review.","CONFLICT_OF_INTEREST");
  const conflict=(await tx.query("select 1 from community_impact_reviewer_conflict where claim_id=$1 and reviewer_user_id=$2 and status in('declared','confirmed','recused')",[a.claim_id,userId])).rowCount;if(conflict)fail(403,"A conflicted reviewer cannot approve the assessment.","CONFLICT_OF_INTEREST");
  const org=(await tx.query("select organization_name from community_impact_claim where id=$1",[a.claim_id])).rows[0]?.organization_name;
  if(org){const affiliation=await tx.query("select 1 from organization_membership om join organization o on o.id=om.organization_id where om.user_id=$1 and om.status='active' and lower(o.display_name)=lower($2) limit 1",[userId,org]);if(affiliation.rowCount)fail(403,"A reviewer affiliated with the named organization cannot perform second review.","CONFLICT_OF_INTEREST");}
  await tx.query("update community_impact_contribution_assessment set status=$2,second_reviewer_user_id=$3,second_review_rationale=$4,approved_at=case when $2='approved' then now() else null end where id=$1",[assessmentId,decision,userId,rationale]);
  await tx.query("insert into community_impact_contribution_assessment_event(assessment_id,actor_user_id,event_code,rationale) values($1,$2,$3,$4)",[assessmentId,userId,decision==="approved"?"second_review_approved":"second_review_rejected",rationale]);
  await event(tx,userId,"claim",a.claim_id,"assessment_second_review_"+decision,rationale,{assessmentId,requestId:requestId||null});
  return {assessmentId,status:decision};
 });
}
export async function listIdentityAssuranceQueue(actorUserId){
 await permission(getPool(),actorUserId,"community_impact.identity.review");
 const rows=await getPool().query("select c.id,c.user_id,c.status,c.legal_name,c.identity_country,c.assurance_level,c.submitted_at,c.created_at,(select count(*)::int from community_impact_identity_assurance_evidence e where e.case_id=c.id) evidence_count,(select array_agg(e.file_object_id) from community_impact_identity_assurance_evidence e where e.case_id=c.id) evidence_file_ids from community_impact_identity_assurance_case c where c.status in('submitted','under_review') order by c.submitted_at limit 100");
 return {items:rows.rows};
}
export async function listOfflineAttributions(actorUserId){
 await permission(getPool(),actorUserId,"community_impact.offline_attribution.review");
 const rows=await getPool().query("select a.id,a.candidate_id,a.contributor_user_id,a.proposed_by,a.assigned_reviewer_id,a.contribution_role,a.attribution_share,a.rationale,a.status,a.created_at,c.source_record_id,p.title project_title,(select count(*)::int from community_impact_offline_attribution_evidence e where e.attribution_id=a.id) evidence_count,(select array_agg(e.file_object_id) from community_impact_offline_attribution_evidence e where e.attribution_id=a.id) evidence_file_ids from community_impact_offline_attribution a join community_impact_detection_candidate c on c.id=a.candidate_id join serve_community_offline_project p on p.id=c.source_record_id where a.status in('submitted','under_review') order by a.created_at limit 100");
 return {items:rows.rows};
}
export async function listDetectionPolicies(actorUserId){
 const db=getPool();const q=await db.query("select exists(select 1 from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1 and r.role_code='system_admin') or exists(select 1 from app_user_permission where user_id=$1 and permission_code=any($2::text[])) allowed",[actorUserId,["community_impact.detection_policy.manage","community_impact.detection_policy.approve"]]);
 if(!q.rows[0]?.allowed)fail(403,"Detection policy governance permission is required.","FORBIDDEN");
 const rows=await db.query("select p.id,p.source_type,p.version,p.rules,p.created_by,p.created_at,g.status,g.rationale,g.approved_by,g.approval_reference,g.approved_at,g.activated_by,g.activated_at from community_impact_detection_policy_version p left join community_impact_detection_policy_governance g on g.policy_version_id=p.id order by p.source_type,p.version desc limit 100");
 return {items:rows.rows};
}
export async function evaluateRetention(actorUserId,options={}){
 await permission(getPool(),actorUserId,"community_impact.retention.evaluate");
 const db=getPool(),active=(await db.query("select p.id,p.policy from community_impact_retention_active_policy a join community_impact_retention_policy_version p on p.id=a.policy_version_id where a.singleton=true and p.status='active'")).rows[0];
 if(!active)return {evaluated:0,due:0,disposition:"no_active_policy",deletionExecuted:false};
 const limit=Math.max(1,Math.min(Number(options.limit)||100,500));let evaluated=0,due=0;
 const classes=[["claim_metadata","community_impact_claim"],["identity_assurance_artifacts","community_impact_identity_assurance_case"],["identity_assurance_artifacts","community_impact_identity_assurance_evidence"],["raw_evidence","community_impact_claim_evidence"],["raw_evidence","community_impact_offline_attribution_evidence"],["reviewer_notes","community_impact_claim_decision"],["reviewer_notes","community_impact_identity_assurance_decision"],["consent_and_rights_records","community_impact_claim_consent"],["audit_events","community_impact_claim_event"]];
 for(const [dataClass,table] of classes){
  const rule=active.policy?.dataClasses?.[dataClass];if(!rule)continue;
  const columns={
   community_impact_claim:{created_at:"created_at",last_activity_at:"last_activity_at",case_closed_at:"closed_at",decision_finalized_at:"closed_at"},
   community_impact_identity_assurance_case:{created_at:"created_at",last_activity_at:"updated_at",case_closed_at:"decided_at",decision_finalized_at:"decided_at"},
   community_impact_claim_decision:{created_at:"created_at",decision_finalized_at:"created_at"},
   community_impact_identity_assurance_decision:{created_at:"created_at",decision_finalized_at:"created_at"},
   community_impact_claim_event:{created_at:"created_at"},
   community_impact_claim_evidence:{created_at:"created_at"},
   community_impact_offline_attribution_evidence:{created_at:"created_at"},
   community_impact_identity_assurance_evidence:{created_at:"created_at"},
   community_impact_claim_consent:{created_at:"created_at",consent_withdrawn_at:"created_at"}
  };
  const startColumn=columns[table]?.[rule.retentionStart];if(!startColumn)continue;
  const rows=(await db.query("select id,"+startColumn+" started_at from "+table+" where "+startColumn+" is not null order by "+startColumn+" limit $1",[limit])).rows;
  for(const row of rows){const dueAt=new Date(new Date(row.started_at).getTime()+(Number(rule.retentionDays)+Number(rule.graceDays))*86400000);const isDue=dueAt.getTime()<=Date.now();await db.query("insert into community_impact_retention_evaluation(data_class,source_table,source_record_id,policy_version_id,due_at,expiry_action,disposition,metadata) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(data_class,source_table,source_record_id,policy_version_id) do nothing",[dataClass,table,row.id,active.id,dueAt,rule.expiryAction,isDue?"deletion_not_authorized":"not_due",{retentionStart:rule.retentionStart,retentionDays:rule.retentionDays,graceDays:rule.graceDays}]);evaluated++;if(isDue)due++;}
 }
 await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'community_impact.retention_evaluated','community_impact_retention_evaluation',null,null,'success',$2)",[actorUserId,{evaluated,due,policyVersionId:active.id,deletionExecuted:false}]);
 return {evaluated,due,policyVersionId:active.id,deletionExecuted:false,note:"This evaluation is non-destructive. Deletion, anonymization and storage-object purging remain disabled pending explicit MPA authorization and tested lifecycle integration."};
}
