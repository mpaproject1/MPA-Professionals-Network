import { getPool, withTransaction } from "../platform/db.js";
import { hasCurrentActiveMembership, hasProfessionalIdentity } from "../platform/identity-policy.js";
import { createInAppNotification } from "../platform/notifications.js";
import { getMyMentorProfile } from "./service.js";

function fail(status,message,code="BUSINESS_RULE"){throw Object.assign(new Error(message),{statusCode:status,code});}
async function audit(db,actor,action,type,id,requestId,metadata={}){
 await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,$2,$3,$4,$5,'success',$6)",[actor,action,type,id,requestId,metadata]);
}
async function notify(db,userId,eventCode,type,id,payload={}){
 if(userId)await createInAppNotification(db,userId,eventCode,type,id,payload);
}
async function hasRole(db,userId,roles){
 return Boolean((await db.query("select 1 from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1 and r.role_code=any($2::text[]) limit 1",[userId,roles])).rowCount);
}
async function eligibleMentor(db,userId){
 const profile=await getMyMentorProfile(userId);
 if(!profile||profile.status!=="active"||profile.moderation_status!=="approved"||!(await hasCurrentActiveMembership(db,userId))||!(await hasProfessionalIdentity(db,userId)))
  fail(403,"Only an active, approved, verified mentor with current membership can use this workflow.","MENTOR_NOT_ELIGIBLE");
 const verified=(await db.query("select 1 from verification_claim vc join verification_case c on c.id=vc.case_id where c.subject_user_id=$1 and vc.status='verified' and lower(vc.claim_code_snapshot)=any($2::text[]) limit 1",[userId,["professional_certification","education","employment","experience","service_capability"]])).rowCount;
 if(!verified)fail(403,"A verified professional claim is required for this workflow.","PROFESSIONAL_VERIFICATION_REQUIRED");
 return profile;
}
export async function listMentorshipInterestPool(userId){
 const db=getPool();await eligibleMentor(db,userId);
 return (await db.query("select r.id request_id,r.goals,r.topics,r.preferred_modes,r.preferred_languages,r.preferred_days,r.created_at,(select count(*)::int from mentorship_match_interest mi where mi.request_id=r.id and mi.status='pending') interest_count from mentorship_request r where r.share_with_eligible_mentors=true and r.status in ('requested','matching') and (r.preferred_mentor_user_id is null or r.preferred_mentor_user_id=$1) and not exists(select 1 from mentorship_match mm where mm.request_id=r.id and mm.status in ('proposed','accepted') and mm.mentee_consent_status<>'declined') and not exists(select 1 from mentorship m where m.request_id=r.id) and not exists(select 1 from mentorship_match_interest mine where mine.request_id=r.id and mine.mentor_user_id=$1 and mine.status='pending') order by r.created_at asc limit 100",[userId])).rows;
}
export async function registerMentorshipInterest(requestId,mentorUserId,requestIdHeader){
 return withTransaction(async db=>{
  await eligibleMentor(db,mentorUserId);
  const request=(await db.query("select * from mentorship_request where id=$1 for update",[requestId])).rows[0];
  if(!request)fail(404,"Mentorship request not found.","NOT_FOUND");
  if(!request.share_with_eligible_mentors)fail(403,"This participant has not opted in to sharing a minimized request summary with eligible mentors.","REQUEST_SHARING_NOT_ALLOWED");
  if(!["requested","matching"].includes(request.status)||(request.preferred_mentor_user_id&&request.preferred_mentor_user_id!==mentorUserId))fail(409,"This request is no longer available for mentor interest.","REQUEST_NOT_AVAILABLE");
  if((await db.query("select 1 from mentorship_match where request_id=$1 and status in ('proposed','accepted') and mentee_consent_status<>'declined'",[requestId])).rowCount)fail(409,"A specific match proposal is already active.","MATCH_RESPONSE_PENDING");
  const result=await db.query("insert into mentorship_match_interest(request_id,mentor_user_id,status) values($1,$2,'pending') on conflict(request_id,mentor_user_id) do update set status='pending',updated_at=now() where mentorship_match_interest.status='withdrawn' returning id,request_id,status,created_at",[requestId,mentorUserId]);
  if(!result.rows[0])fail(409,"Your interest is already recorded for this request.","INTEREST_ALREADY_RECORDED");
  await audit(db,mentorUserId,"mentorship.interest_registered","mentorship_match_interest",result.rows[0].id,requestIdHeader,{requestId});
  const staff=(await db.query("select distinct ur.user_id from app_user_role ur join app_role ar on ar.id=ur.role_id join app_user u on u.id=ur.user_id where u.status='active' and ar.role_code=any($1::text[])",[["supporting_staff","system_admin"]])).rows;
  for(const row of staff)await notify(db,row.user_id,"mentorship.interest_needs_review","mentorship_match_interest",result.rows[0].id,{message:"An approved mentor expressed interest in a consented mentorship request.",nextAction:"Review the request and mentor eligibility, then propose a specific match if appropriate.",actionUrl:"/mentorship",actionRequired:true,priority:"high"});
  await notify(db,request.mentee_user_id,"mentorship.interest_received","mentorship_request",requestId,{message:"An eligible mentor expressed interest in your shared mentorship request.",nextAction:"The matching team will review the interest and may propose a specific mentor for your approval.",actionUrl:"/mentorship",actionRequired:true,priority:"normal"});
  return {...result.rows[0],nextAction:"Your interest is recorded for matching-team review. No contact details were shared and no match was created."};
 });
}
export async function getMentorshipOperationalReport(userId){
 const db=getPool();
 const row=(await db.query("select (select count(*)::int from mentorship_match where mentor_user_id=$1 and status='proposed') pending_invitations,(select count(*)::int from mentorship_match where mentor_user_id=$1 and status='proposed' and proposed_at<now()-interval '7 days') overdue_invitations,(select round(avg(extract(epoch from (responded_at-proposed_at))/60)::numeric,1) from mentorship_match where mentor_user_id=$1 and responded_at is not null and proposed_at is not null) average_response_minutes,(select count(*)::int from mentorship where mentor_user_id=$1 and status='active') active_relationships,(select count(*)::int from mentorship_session s join mentorship m on m.id=s.mentorship_id where (m.mentor_user_id=$1 or m.mentee_user_id=$1) and s.coordination_status='proposed') session_proposals_awaiting_confirmation,(select count(*)::int from mentorship_session s join mentorship m on m.id=s.mentorship_id where (m.mentor_user_id=$1 or m.mentee_user_id=$1) and s.status='scheduled' and s.coordination_status='accepted' and s.scheduled_start_at>=now()) confirmed_upcoming_sessions,(select count(*)::int from mentorship_feedback where reviewer_user_id=$1) feedback_submitted,(select count(*)::int from mentorship_match where mentor_user_id=$1 and mentor_notification_status='failed') failed_notifications,(select count(*)::int from mentorship_match where mentor_user_id=$1 and mentor_notification_status in ('queued','unknown')) notification_delivery_unconfirmed",[userId])).rows[0];
 return {...row,definitions:{overdueInvitationDays:7,notificationDelivery:"Queued or unknown means delivery is not confirmed; the platform does not infer delivery or reading."}};
}
export async function respondToSessionProposal(sessionId,userId,status,note,requestId){
 if(!["accepted","declined"].includes(status))fail(400,"Choose accept or decline for this session proposal.","VALIDATION_ERROR");
 return withTransaction(async db=>{
  const s=(await db.query("select s.*,m.mentor_user_id,m.mentee_user_id from mentorship_session s join mentorship m on m.id=s.mentorship_id where s.id=$1 for update",[sessionId])).rows[0];
  if(!s)fail(404,"Session proposal not found.","NOT_FOUND");
  if(s.mentor_user_id!==userId&&s.mentee_user_id!==userId)fail(403,"Only a mentorship participant can respond.","FORBIDDEN");
  if(s.proposed_by===userId)fail(403,"The person who proposed the session cannot confirm it on behalf of the other participant.","PROPOSER_CANNOT_CONFIRM");
  if(s.coordination_status===status)return {...s,idempotent:true,nextAction:status==="accepted"?"This session is already confirmed.":"This session proposal is already declined."};
  if(s.coordination_status!=="proposed")fail(409,"This session is no longer awaiting confirmation.","INVALID_STATE");
  const row=(await db.query("update mentorship_session set coordination_status=$1,responded_by=$2,responded_at=now(),proposal_note=coalesce($3,proposal_note),status=case when $1='declined' then 'cancelled' else status end,updated_at=now() where id=$4 returning *",[status,userId,String(note||"").trim().slice(0,1000)||null,sessionId])).rows[0];
  await audit(db,userId,"mentorship.session_proposal_responded","mentorship_session",sessionId,requestId,{status});
  if(s.proposed_by)await notify(db,s.proposed_by,"mentorship.session_proposal_responded","mentorship_session",sessionId,{message:status==="accepted"?"The other participant confirmed your session proposal.":"The other participant declined your session proposal.",nextAction:status==="accepted"?"Review the confirmed session details in the mentorship workspace.":"Propose a new time in the mentorship workspace if appropriate.",actionUrl:"/mentorship",actionRequired:status==="declined"});
  return {...row,nextAction:status==="accepted"?"Session confirmed by both participants.":"Session proposal declined; no private contact details were exchanged."};
 });
}
export async function joinMentorshipCircle(profileId,userId,requestId){
 const db=getPool();if(!(await hasCurrentActiveMembership(db,userId)))fail(403,"Active membership is required to join a mentor circle.","MEMBERSHIP_REQUIRED");
 return withTransaction(async tx=>{
  const p=(await tx.query("select * from mentor_profile where id=$1 for update",[profileId])).rows[0];
  if(!p||p.status!=="active"||p.moderation_status!=="approved"||!p.circle_enabled)fail(404,"This mentor circle is not available.","CIRCLE_NOT_AVAILABLE");
  if(p.user_id===userId)fail(400,"A mentor cannot join their own circle.","INVALID_ACTION");
  const row=(await tx.query("insert into mentorship_circle_membership(mentor_profile_id,participant_user_id) values($1,$2) on conflict(mentor_profile_id,participant_user_id) do update set joined_at=now(),left_at=null where mentorship_circle_membership.left_at is not null returning id,joined_at",[profileId,userId])).rows[0];
  if(!row)fail(409,"You have already joined this mentor circle.","ALREADY_JOINED");
  await audit(tx,userId,"mentorship.circle_joined","mentor_profile",profileId,requestId);
  return {joined:true,joinedAt:row.joined_at,nextAction:"Your participation is recorded. The mentor sees only an aggregate count, not participant identities."};
 });
}
export async function leaveMentorshipCircle(profileId,userId,requestId){
 const db=getPool();const row=(await db.query("update mentorship_circle_membership set left_at=now() where mentor_profile_id=$1 and participant_user_id=$2 and left_at is null returning id",[profileId,userId])).rows[0];
 if(!row)return {joined:false,nextAction:"You are not currently in this circle."};
 await audit(db,userId,"mentorship.circle_left","mentor_profile",profileId,requestId);
 return {joined:false,nextAction:"You left the circle; its active count updates from the saved membership record."};
}
export async function getMentorshipCircleSummary(profileId,userId){
 const db=getPool();const row=(await db.query("select mp.id,mp.circle_name,mp.user_id,(select count(*)::int from mentorship_circle_membership cm where cm.mentor_profile_id=mp.id and cm.left_at is null) joined_count,exists(select 1 from mentorship_circle_membership cm where cm.mentor_profile_id=mp.id and cm.participant_user_id=$2 and cm.left_at is null) joined_by_me from mentor_profile mp where mp.id=$1 and mp.status='active' and mp.moderation_status='approved' and mp.circle_enabled=true",[profileId,userId])).rows[0];
 if(!row)fail(404,"This mentor circle is not available.","CIRCLE_NOT_AVAILABLE");
 if(!(await hasCurrentActiveMembership(db,userId))&&row.user_id!==userId)fail(403,"Active membership is required to view mentor-circle participation.","MEMBERSHIP_REQUIRED");
 return {profileId:row.id,circleName:row.circle_name,joinedCount:row.joined_count,joinedByMe:row.joined_by_me,isOwner:row.user_id===userId};
}
export async function createMentorshipParticipantReport(mentorshipId,userId,input,requestId){
 return withTransaction(async db=>{
  const m=(await db.query("select id,mentor_user_id,mentee_user_id,status from mentorship where id=$1 for update",[mentorshipId])).rows[0];
  if(!m)fail(404,"Mentorship not found.","NOT_FOUND");
  if(m.mentor_user_id!==userId&&m.mentee_user_id!==userId)fail(403,"Only a participant can submit a report for this mentorship.","FORBIDDEN");
  const category=String(input.category||"other");
  if(!["safety_concern","boundary_concern","session_issue","conduct","other"].includes(category))fail(400,"Choose a supported report category.","VALIDATION_ERROR");
  const description=String(input.description||"").trim();
  if(description.length<10||description.length>4000)fail(400,"Describe the concern in 10 to 4,000 characters.","VALIDATION_ERROR");
  const sessionId=input.sessionId||null;
  if(sessionId&&!((await db.query("select 1 from mentorship_session where id=$1 and mentorship_id=$2",[sessionId,mentorshipId])).rowCount))fail(400,"Choose a session from this mentorship.","VALIDATION_ERROR");
  const row=(await db.query("insert into mentorship_participant_report(mentorship_id,session_id,reporter_user_id,category,description) values($1,$2,$3,$4,$5) returning id,mentorship_id,session_id,category,status,created_at",[mentorshipId,sessionId,userId,category,description])).rows[0];
  await audit(db,userId,"mentorship.participant_report_created","mentorship_participant_report",row.id,requestId,{category});
  const staff=(await db.query("select distinct ur.user_id from app_user_role ur join app_role ar on ar.id=ur.role_id join app_user u on u.id=ur.user_id where u.status='active' and ar.role_code=any($1::text[])",[["supporting_staff","system_admin"]])).rows;
  for(const item of staff)await notify(db,item.user_id,"mentorship.participant_report_received","mentorship_participant_report",row.id,{message:"A confidential participant report requires review.",nextAction:"Review the report in the authorized Support Desk queue.",actionUrl:"/admin/mentorship-reports",actionRequired:true,priority:"high"});
  return {...row,nextAction:"Your confidential report was recorded. Your signed-in account identifies the reporter; no contact address is requested."};
 });
}
export async function listMentorshipParticipantReports(actorId,filters={}){
 const db=getPool();if(!(await hasRole(db,actorId,["supporting_staff","system_admin"])))fail(403,"Authorized Support Desk access is required.","FORBIDDEN");
 const status=String(filters.status||"open");if(!["open","reviewing","resolved","closed","all"].includes(status))fail(400,"Unsupported report status filter.","VALIDATION_ERROR");
 const limit=Math.min(Math.max(Number(filters.limit)||25,1),100),offset=Math.max(Number(filters.offset)||0,0);
 return (await db.query("select r.id,r.mentorship_id,r.session_id,r.reporter_user_id,pr.display_name reporter_name,r.category,r.description,r.status,r.created_at,r.reviewed_at,r.reviewed_by,r.resolution_note from mentorship_participant_report r join person pr on pr.user_id=r.reporter_user_id where ($1='all' or r.status=$1) order by r.created_at asc limit $2 offset $3",[status,limit,offset])).rows;
}
export async function updateMentorshipParticipantReport(actorId,reportId,input,requestId){
 const db=getPool();if(!(await hasRole(db,actorId,["supporting_staff","system_admin"])))fail(403,"Authorized Support Desk access is required.","FORBIDDEN");
 const status=String(input.status||"");if(!["reviewing","resolved","closed"].includes(status))fail(400,"Choose a supported report review status.","VALIDATION_ERROR");
 const note=String(input.resolutionNote||"").trim();if(status==="resolved"&&note.length<4)fail(400,"A resolution note is required before resolving a report.","RESOLUTION_NOTE_REQUIRED");
 const row=(await db.query("update mentorship_participant_report set status=$1,reviewed_at=now(),reviewed_by=$2,resolution_note=$3 where id=$4 returning id,status,reviewed_at,reviewed_by,resolution_note",[status,actorId,note||null,reportId])).rows[0];
 if(!row)fail(404,"Participant report not found.","NOT_FOUND");
 await audit(db,actorId,"mentorship.participant_report_updated","mentorship_participant_report",reportId,requestId,{status});return row;
}
