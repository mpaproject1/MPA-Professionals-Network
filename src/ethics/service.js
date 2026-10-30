import crypto from "node:crypto";
import { getPool, withTransaction } from "../platform/db.js";

function fail(status,message,code="ETHICS_CASE_ERROR"){const error=new Error(message);error.statusCode=status;error.code=code;return error;}
const CATEGORIES=new Set(["professional_conduct","integrity","conflict_of_interest","confidentiality","harassment","discrimination","safeguarding","misuse_of_resources","misrepresentation","governance_concern","shariah_governance_referral","other"]);
const SEVERITIES=new Set(["low","medium","high","critical"]);
const STATUSES=new Set(["submitted","triage","investigation","respondent_response","panel_review","decision_pending","decided","referred","closed","withdrawn"]);
const DECISIONS=new Set(["substantiated","partially_substantiated","not_substantiated","inconclusive","referred_to_authority","no_action"]);
const FRAMEWORKS=new Set(["AAOIFI_GS16","AAOIFI_CODE_OF_ETHICS_ISLAMIC_FINANCE_PROFESSIONALS","AAOIFI_GS1_2024","AAOIFI_GS19","AAOIFI_GS20","AAOIFI_GS21","UNESCO_BIOETHICS_DECLARATION","WHO_RESEARCH_ETHICS","MPA_POLICY","OTHER"]);
async function roles(db,userId){return (await db.query("select r.role_code from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1",[userId])).rows.map(row=>row.role_code);}
async function hasPermission(db,userId,permission){return (await db.query("select 1 from app_user_permission where user_id=$1 and permission_code=$2",[userId,permission])).rowCount>0;}
async function isEthicsReviewer(db,userId){const userRoles=await roles(db,userId);return userRoles.includes("system_admin")||userRoles.includes("ethics_reviewer")||await hasPermission(db,userId,"ethics.case.review");}
async function requireEthicsReviewer(db,userId){if(!(await isEthicsReviewer(db,userId)))throw fail(403,"Independent ethics reviewer access is required.","ETHICS_REVIEW_FORBIDDEN");}
async function requireSystemAdmin(db,userId){const userRoles=await roles(db,userId);if(!userRoles.includes("system_admin"))throw fail(403,"Only a system administrator may assign ethics reviewers and panel members.","SYSTEM_ADMIN_REQUIRED");}
async function event(db,caseId,actor,eventType,details={}){await db.query("insert into ethics_case_event(case_id,actor_user_id,event_type,details) values($1,$2,$3,$4)",[caseId,actor,eventType,JSON.stringify(details)]);await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,$2,'ethics_case',$3,$4,'success',$5)",[actor,"ethics."+eventType,caseId,details.requestId||null,JSON.stringify(details)]);}
async function caseForUpdate(db,caseId){const row=(await db.query("select * from ethics_case where id=$1 for update",[caseId])).rows[0];if(!row)throw fail(404,"Ethics case not found.","NOT_FOUND");return row;}
async function assertNoConflict(db,caseId,userId){const conflict=(await db.query("select resolution from ethics_case_conflict where case_id=$1 and reviewer_id=$2",[caseId,userId])).rows[0];if(conflict?.resolution!=="cleared")throw fail(403,"You have declared a conflict or have been recused from this case.","ETHICS_CONFLICT_OF_INTEREST");}
async function assertAssigned(db,row,userId,{panel=false}={}){await requireEthicsReviewer(db,userId);await assertNoConflict(db,row.id,userId);const assignment=panel?await db.query("select 1 from ethics_case_panel_member where case_id=$1 and reviewer_id=$2 and active=true",[row.id,userId]):{rowCount:row.assigned_reviewer_id===userId?1:0};const userRoles=await roles(db,userId);if(!userRoles.includes("system_admin")&&assignment.rowCount===0)throw fail(403,"This ethics case is not assigned to you.","ETHICS_CASE_NOT_ASSIGNED");if(row.reporter_user_id===userId||row.subject_user_id===userId)throw fail(403,"A reporter or respondent cannot review the same ethics case.","ETHICS_CONFLICT_OF_INTEREST");}
function text(value,max){return String(value??"").trim().slice(0,max);}
function cleanFrameworks(input){if(!Array.isArray(input))return [];const values=[...new Set(input.map(String))];if(values.length>12||values.some(value=>!FRAMEWORKS.has(value)))throw fail(400,"Select valid ethics review frameworks.","VALIDATION_ERROR");return values;}
export async function createEthicsCase(reporterId,input={},requestId){
 const title=text(input.title,160),summary=text(input.incidentSummary,6000),category=text(input.category,60),subjectId=input.subjectUserId||null,orgId=input.organizationId||null,subjectName=text(input.subjectName,160)||null,organizationName=text(input.organizationName,180)||null;
 if(title.length<5||summary.length<20||!CATEGORIES.has(category))throw fail(400,"Provide a case title, a clear factual summary and a valid concern category.","VALIDATION_ERROR");
 if(subjectId===reporterId)throw fail(400,"Use the confidential self-report route without naming yourself as the respondent.","VALIDATION_ERROR");
 const frameworks=cleanFrameworks(input.frameworkReferences);
 return withTransaction(async db=>{
  if(subjectId&&!(await db.query("select 1 from app_user where id=$1 and status='active'",[subjectId])).rowCount)throw fail(404,"The selected respondent account was not found.","NOT_FOUND");
  if(orgId&&!(await db.query("select 1 from organization where id=$1",[orgId])).rowCount)throw fail(404,"The selected organization was not found.","NOT_FOUND");
  const reference="ETH-"+new Date().toISOString().slice(0,10).replaceAll("-","")+"-"+crypto.randomBytes(4).toString("hex").toUpperCase();
  const row=(await db.query("insert into ethics_case(case_reference,reporter_user_id,subject_user_id,organization_id,subject_name,organization_name,title,category,severity,incident_summary,incident_date,location_text,framework_references,status) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'submitted') returning id,case_reference,status,category,severity,created_at",[reference,reporterId,subjectId,orgId,subjectName,organizationName,title,category,SEVERITIES.has(input.severity)?input.severity:"medium",summary,input.incidentDate||null,text(input.locationText,240)||null,JSON.stringify(frameworks)])).rows[0];
  await event(db,row.id,reporterId,"submitted",{requestId,category,severity:row.severity});
  return row;
 });
}
export async function listMyEthicsCases(userId){
 return (await getPool().query("select id,case_reference,title,category,status,created_at,updated_at,decision,decided_at,case when subject_user_id=$1 then 'respondent' else 'reporter' end relationship,incident_summary,incident_date,location_text,respondent_response_submitted_at from ethics_case where reporter_user_id=$1 or subject_user_id=$1 order by created_at desc limit 100",[userId])).rows;
}
export async function listEthicsCases(userId,filters={}){
 const db=getPool();await requireEthicsReviewer(db,userId);const userRoles=await roles(db,userId);const isAdmin=userRoles.includes("system_admin");
 const args=[userId],where=[isAdmin?"true":"(c.assigned_reviewer_id=$1 or exists(select 1 from ethics_case_panel_member pm where pm.case_id=c.id and pm.reviewer_id=$1 and pm.active=true))"];
 if(filters.status){args.push(text(filters.status,30));where.push("c.status=$"+args.length);}
 if(filters.severity){args.push(text(filters.severity,20));where.push("c.severity=$"+args.length);}
 const limit=Math.min(Math.max(Number(filters.limit)||50,1),100);
 const rows=(await db.query("select c.id,c.case_reference,c.title,c.category,c.severity,c.status,c.assigned_reviewer_id,c.created_at,c.updated_at,c.incident_date,(select count(*)::int from ethics_case_review r where r.case_id=c.id) review_count from ethics_case c where "+where.join(" and ")+" order by case when c.severity='critical' then 0 when c.severity='high' then 1 when c.severity='medium' then 2 else 3 end,c.created_at asc limit "+limit,args)).rows;
 return {items:rows,canAssign:isAdmin};
}
export async function getEthicsCase(caseId,userId){
 const db=getPool(),row=(await db.query("select c.*,coalesce(c.subject_name,p.display_name) subject_name,rp.display_name reporter_name,coalesce(c.organization_name,o.display_name) organization_name from ethics_case c left join person p on p.user_id=c.subject_user_id left join person rp on rp.user_id=c.reporter_user_id left join organization o on o.id=c.organization_id where c.id=$1",[caseId])).rows[0];
 if(!row)throw fail(404,"Ethics case not found.","NOT_FOUND");
 const reviewer=await isEthicsReviewer(db,userId),isReporter=row.reporter_user_id===userId,isSubject=row.subject_user_id===userId;
 if(!reviewer&&!isReporter&&!isSubject)throw fail(403,"You are not authorized to view this ethics case.","FORBIDDEN");
 if(reviewer){await assertNoConflict(db,caseId,userId);const userRoles=await roles(db,userId);if(!userRoles.includes("system_admin")&&row.assigned_reviewer_id!==userId&&!(await db.query("select 1 from ethics_case_panel_member where case_id=$1 and reviewer_id=$2 and active=true",[caseId,userId])).rowCount)throw fail(403,"This ethics case is not assigned to you.","ETHICS_CASE_NOT_ASSIGNED");}
 const [reviews,events,conflicts,panel]=await Promise.all([
  reviewer?db.query("select r.*,p.display_name reviewer_name from ethics_case_review r left join person p on p.user_id=r.reviewer_id where r.case_id=$1 order by r.created_at",[caseId]):Promise.resolve({rows:[]}),
  reviewer?db.query("select e.event_type,e.details,e.created_at,p.display_name actor_name from ethics_case_event e left join person p on p.user_id=e.actor_user_id where e.case_id=$1 order by e.created_at desc limit 100",[caseId]):Promise.resolve({rows:[]}),
  reviewer?db.query("select reviewer_id,reason,resolution,created_at from ethics_case_conflict where case_id=$1",[caseId]):Promise.resolve({rows:[]}),
  reviewer?db.query("select pm.reviewer_id,pm.active,p.display_name from ethics_case_panel_member pm left join person p on p.user_id=pm.reviewer_id where pm.case_id=$1 order by pm.created_at",[caseId]):Promise.resolve({rows:[]})
 ]);
 if(!reviewer){const safe={id:row.id,case_reference:row.case_reference,title:row.title,category:row.category,status:row.status,created_at:row.created_at,updated_at:row.updated_at,decision:row.decision,decision_reason:row.decision_reason,outcome_summary:row.outcome_summary};return isSubject?{...safe,incident_summary:row.incident_summary,incident_date:row.incident_date,location_text:row.location_text,respondent_response:row.respondent_response,respondent_response_submitted_at:row.respondent_response_submitted_at}:safe;}
 return {...row,reviews:reviews.rows,events:events.rows,conflicts:conflicts.rows,panel:panel.rows};
}
export async function submitEthicsRespondentResponse(caseId,userId,input={},requestId){
 return withTransaction(async db=>{
  const row=await caseForUpdate(db,caseId);
  if(row.subject_user_id!==userId)throw fail(403,"Only the named respondent may submit a response to this case.","FORBIDDEN");
  if(row.status!=="respondent_response")throw fail(409,"A respondent response has not been requested or the response window is closed.","INVALID_STATE");
  const response=text(input.response,6000);if(response.length<20)throw fail(400,"Provide a substantive response of at least 20 characters.","VALIDATION_ERROR");
  await db.query("update ethics_case set respondent_response=$1,respondent_response_submitted_at=now(),updated_at=now() where id=$2",[response,caseId]);
  await event(db,caseId,userId,"respondent_response_submitted",{requestId});
  return {caseId,status:"response_submitted",submittedAt:new Date().toISOString()};
 });
}
export async function assignEthicsCase(caseId,reviewerId,actorId,reason,requestId){
 return withTransaction(async db=>{
  await requireSystemAdmin(db,actorId);const row=await caseForUpdate(db,caseId);const cleanReason=text(reason,1000);
  if(cleanReason.length<8)throw fail(400,"An assignment reason of at least 8 characters is required.","AUDIT_REASON_REQUIRED");
  if(!reviewerId||reviewerId===row.reporter_user_id||reviewerId===row.subject_user_id)throw fail(409,"The reporter or respondent cannot be assigned to review this case.","ETHICS_CONFLICT_OF_INTEREST");
  if(!(await db.query("select 1 from app_user u join app_user_role ur on ur.user_id=u.id join app_role r on r.id=ur.role_id where u.id=$1 and u.status='active' and r.role_code='ethics_reviewer'",[reviewerId])).rowCount)throw fail(400,"Select an active account with the Ethics Reviewer platform role.","INVALID_REVIEWER");
  if((await db.query("select 1 from ethics_case_conflict where case_id=$1 and reviewer_id=$2 and resolution<>'cleared'",[caseId,reviewerId])).rowCount)throw fail(409,"This reviewer has a recorded conflict for this case.","ETHICS_CONFLICT_OF_INTEREST");
  await db.query("update ethics_case set assigned_reviewer_id=$1,assigned_at=now(),status=case when status in ('submitted','triage') then 'triage' else status end,updated_at=now() where id=$2",[reviewerId,caseId]);
  await db.query("insert into ethics_case_assignment_history(case_id,previous_reviewer_id,new_reviewer_id,changed_by,reason) values($1,$2,$3,$4,$5)",[caseId,row.assigned_reviewer_id,reviewerId,actorId,cleanReason]);
  await event(db,caseId,actorId,"assigned",{requestId,reviewerId,previousReviewerId:row.assigned_reviewer_id,reason:cleanReason});
  return {id:caseId,assignedReviewerId:reviewerId};
 });
}
export async function assignEthicsPanelMember(caseId,reviewerId,actorId,reason,requestId){
 return withTransaction(async db=>{
  await requireSystemAdmin(db,actorId);const row=await caseForUpdate(db,caseId);const cleanReason=text(reason,1000);
  if(cleanReason.length<8)throw fail(400,"A panel assignment reason of at least 8 characters is required.","AUDIT_REASON_REQUIRED");
  if(!reviewerId||reviewerId===row.assigned_reviewer_id||reviewerId===row.reporter_user_id||reviewerId===row.subject_user_id)throw fail(409,"Panel members must be independent from the reporter, respondent and lead reviewer.","ETHICS_CONFLICT_OF_INTEREST");
  if(!(await db.query("select 1 from app_user u join app_user_role ur on ur.user_id=u.id join app_role r on r.id=ur.role_id where u.id=$1 and u.status='active' and r.role_code='ethics_reviewer'",[reviewerId])).rowCount)throw fail(400,"Select an active Ethics Reviewer account.","INVALID_REVIEWER");
  await db.query("insert into ethics_case_panel_member(case_id,reviewer_id,assigned_by) values($1,$2,$3) on conflict(case_id,reviewer_id) do update set active=true",[caseId,reviewerId,actorId]);
  await event(db,caseId,actorId,"panel_member_assigned",{requestId,reviewerId,reason:cleanReason});
  return {caseId,reviewerId,assigned:true};
 });
}
export async function updateEthicsCase(caseId,input,actorId,requestId){
 return withTransaction(async db=>{
  const row=await caseForUpdate(db,caseId);await assertAssigned(db,row,actorId);
  if(["decided","referred","closed","withdrawn"].includes(row.status))throw fail(409,"This ethics case is closed to editing.","INVALID_STATE");
  const fields={title:input.title===undefined?row.title:text(input.title,160),category:input.category===undefined?row.category:text(input.category,60),severity:input.severity===undefined?row.severity:text(input.severity,20),incidentSummary:input.incidentSummary===undefined?row.incident_summary:text(input.incidentSummary,6000),incidentDate:input.incidentDate===undefined?row.incident_date:input.incidentDate,locationText:input.locationText===undefined?row.location_text:text(input.locationText,240),frameworks:input.frameworkReferences===undefined?row.framework_references:cleanFrameworks(input.frameworkReferences),triageNotes:input.triageNotes===undefined?row.triage_notes:text(input.triageNotes,6000),reviewerAssessment:input.reviewerAssessment===undefined?row.reviewer_assessment:text(input.reviewerAssessment,6000),findings:input.findings===undefined?row.findings:text(input.findings,6000)};
  if(fields.title.length<5||fields.incidentSummary.length<20||!CATEGORIES.has(fields.category)||!SEVERITIES.has(fields.severity))throw fail(400,"Check the case title, category, severity and factual summary.","VALIDATION_ERROR");
  const nextStatus=input.status===undefined?row.status:text(input.status,30);const transitions={submitted:["triage","withdrawn"],triage:["investigation","closed"],investigation:["respondent_response","panel_review","decision_pending","referred","closed"],respondent_response:["investigation","panel_review","decision_pending"],panel_review:["investigation","decision_pending"],decision_pending:["investigation"]};if(!STATUSES.has(nextStatus)||["decided","referred","closed","withdrawn"].includes(nextStatus)||(nextStatus!==row.status&&!(transitions[row.status]||[]).includes(nextStatus)))throw fail(400,"Choose a valid next workflow status; review stages cannot be skipped.","INVALID_STATE");
  const updated=(await db.query("update ethics_case set title=$1,category=$2,severity=$3,incident_summary=$4,incident_date=$5,location_text=$6,framework_references=$7,triage_notes=$8,reviewer_assessment=$9,findings=$10,status=$11,updated_at=now() where id=$12 returning id,case_reference,status,updated_at",[fields.title,fields.category,fields.severity,fields.incidentSummary,fields.incidentDate,fields.locationText,JSON.stringify(fields.frameworks),fields.triageNotes,fields.reviewerAssessment,fields.findings,nextStatus,caseId])).rows[0];
  await event(db,caseId,actorId,"reviewer_updated",{requestId,status:nextStatus,category:fields.category,severity:fields.severity});
  return updated;
 });
}
export async function declareEthicsConflict(caseId,actorId,reason,requestId){
 return withTransaction(async db=>{
  const row=await caseForUpdate(db,caseId);await requireEthicsReviewer(db,actorId);const why=text(reason,2000);
  if(why.length<8)throw fail(400,"Explain the conflict so an independent reviewer can be assigned.","VALIDATION_ERROR");
  if(row.reporter_user_id!==actorId&&row.subject_user_id!==actorId){
   const member=(await db.query("select 1 from ethics_case_panel_member where case_id=$1 and reviewer_id=$2 and active=true",[caseId,actorId])).rowCount>0;
   if(row.assigned_reviewer_id!==actorId&&!member&&!((await roles(db,actorId)).includes("system_admin")))throw fail(403,"You are not assigned to this ethics case.","ETHICS_CASE_NOT_ASSIGNED");
  }
  await db.query("insert into ethics_case_conflict(case_id,reviewer_id,reason,resolution) values($1,$2,$3,'recused') on conflict(case_id,reviewer_id) do update set reason=excluded.reason,resolution='recused',resolved_by=null",[caseId,actorId,why]);
  await db.query("update ethics_case_panel_member set active=false where case_id=$1 and reviewer_id=$2",[caseId,actorId]);
  if(row.assigned_reviewer_id===actorId)await db.query("update ethics_case set assigned_reviewer_id=null,assigned_at=null,status='triage',updated_at=now() where id=$1",[caseId]);
  await event(db,caseId,actorId,"reviewer_recused",{requestId,reason:why});
  return {caseId,recused:true};
 });
}
export async function recordEthicsReview(caseId,input,actorId,requestId){
 return withTransaction(async db=>{
  const row=await caseForUpdate(db,caseId);const panel=String(input.reviewType||"investigation")==="panel";await assertAssigned(db,row,actorId,{panel});if(panel&&!["panel_review","decision_pending"].includes(row.status))throw fail(409,"Panel recommendations are recorded only during the panel review stage.","INVALID_STATE");
  const recommendation=text(input.recommendation,40),assessment=text(input.assessment,6000);
  if(!new Set(["substantiated","partially_substantiated","not_substantiated","inconclusive","refer","no_action"]).has(recommendation)||assessment.length<20)throw fail(400,"Provide a supported recommendation and a substantive review assessment.","VALIDATION_ERROR");
  const saved=(await db.query("insert into ethics_case_review(case_id,reviewer_id,review_type,recommendation,assessment) values($1,$2,$3,$4,$5) on conflict(case_id,reviewer_id,review_type) do update set recommendation=excluded.recommendation,assessment=excluded.assessment,created_at=now() returning *",[caseId,actorId,panel?"panel":"investigation",recommendation,assessment])).rows[0];
  await event(db,caseId,actorId,panel?"panel_review_recorded":"investigation_review_recorded",{requestId,recommendation});
  return saved;
 });
}
export async function decideEthicsCase(caseId,input,actorId,requestId){
 return withTransaction(async db=>{
  const row=await caseForUpdate(db,caseId);await assertAssigned(db,row,actorId);
  const decision=text(input.decision,40),reason=text(input.reason,3000),outcome=text(input.outcomeSummary,3000);
  if(!DECISIONS.has(decision)||reason.length<8)throw fail(400,"Select a decision and record a reason of at least 8 characters.","VALIDATION_ERROR");
  if(!["panel_review","decision_pending"].includes(row.status))throw fail(409,"Complete investigation and panel review before recording an outcome.","INVALID_STATE");
  if(["high","critical"].includes(row.severity)){
   const second=(await db.query("select 1 from ethics_case_review r join ethics_case_panel_member pm on pm.case_id=r.case_id and pm.reviewer_id=r.reviewer_id and pm.active=true where r.case_id=$1 and r.review_type='panel' and r.reviewer_id<>$2 limit 1",[caseId,actorId])).rowCount>0;
   if(!second)throw fail(409,"High and critical cases require an independent panel recommendation before the lead reviewer can decide.","PANEL_REVIEW_REQUIRED");
  }
  const status=decision==="referred_to_authority"?"referred":"decided";
  const saved=(await db.query("update ethics_case set status=$1,decision=$2,decision_reason=$3,outcome_summary=$4,decided_by=$5,decided_at=now(),updated_at=now() where id=$6 returning id,case_reference,status,decision,decided_at",[status,decision,reason,outcome||null,actorId,caseId])).rows[0];
  await event(db,caseId,actorId,"decision_recorded",{requestId,decision,reason});
  return saved;
 });
}
export async function listEthicsReviewers(actorId){
 const db=getPool();await requireSystemAdmin(db,actorId);
 return (await db.query("select u.id,p.display_name,u.email from app_user u join app_user_role ur on ur.user_id=u.id join app_role r on r.id=ur.role_id left join person p on p.user_id=u.id where u.status='active' and r.role_code='ethics_reviewer' order by p.display_name,u.email")).rows;
}
