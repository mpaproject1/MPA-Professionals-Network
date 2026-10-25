import { createHash } from "node:crypto";
import { getPool, withTransaction } from "../platform/db.js";
import { queueWorkflowEmail } from "../platform/email-operations.js";
import { assertCurrentActiveMembership, assertOrganizationCapability, assertProfessionalIdentity, hasCurrentActiveMembership, hasProfessionalIdentity } from "../platform/identity-policy.js";
import { createInAppNotification } from "../platform/notifications.js";

function hashValue(value){return createHash("sha256").update(value).digest("hex");}
function hashPayload(value){return hashValue(JSON.stringify(value));}
function error(status,message,code="BUSINESS_RULE"){ const e=new Error(message); e.statusCode=status; e.code=code; return e; }
const PROFESSIONAL_CLAIMS=["professional_certification","education","employment","experience","service_capability"];

async function audit(db,actor,action,type,id,requestId,metadata={}) {
  await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,$2,$3,$4,$5,'success',$6)",[actor,action,type,id,requestId,metadata]);
}
async function notify(db,userId,eventCode,type,id,payload={}) {
  if(!userId)return;
  await createInAppNotification(db,userId,eventCode,type,id,payload);
}
async function activeMember(db,userId){
  return hasCurrentActiveMembership(db,userId);
}
async function requirePersonalProfessionalCapability(db,userId){
  try {
    await assertProfessionalIdentity(db,userId);
    await assertCurrentActiveMembership(db,userId,"An active membership is required for this professional action. View membership options to continue.");
  } catch (cause) {
    throw error(cause.statusCode||403,cause.message,cause.code||"BUSINESS_RULE");
  }
}
async function serviceProviderRecipients(db,requestId){
 const request=(await db.query("select sr.provider_user_id,sl.organization_id,pu.status provider_status from service_request sr join service_listing sl on sl.id=sr.service_listing_id left join app_user pu on pu.id=sr.provider_user_id where sr.id=$1",[requestId])).rows[0];
 if(!request)return [];
 if(request.organization_id)return (await db.query("select om.user_id from organization_membership om join app_user u on u.id=om.user_id where om.organization_id=$1 and om.status='active' and u.status='active' and om.role_code=any($2::text[])",[request.organization_id,["owner","administrator","recruiter","project_manager"]])).rows.map(x=>x.user_id);
 return request.provider_user_id&&request.provider_status==="active"?[request.provider_user_id]:[];
}
async function isServiceProviderActor(db,requestId,userId){
 const request=(await db.query("select sr.provider_user_id,sl.organization_id,pu.status provider_status from service_request sr join service_listing sl on sl.id=sr.service_listing_id left join app_user pu on pu.id=sr.provider_user_id where sr.id=$1",[requestId])).rows[0];
 if(!request)return false;
 if(request.organization_id){
  return Boolean((await db.query("select 1 from organization_membership where organization_id=$1 and user_id=$2 and status='active' and role_code=any($3::text[]) limit 1",[request.organization_id,userId,["owner","administrator","recruiter","project_manager"]])).rowCount);
 }
 if(request.provider_user_id!==userId)return false;
 return Boolean(await activeMember(db,userId)) && await hasProfessionalIdentity(db,userId);
}
async function assertServiceListingAccess(db,row,userId){
 if(row.organization_id){
  let membership;
  try { membership=await assertOrganizationCapability(db,row.organization_id,userId); }
  catch (cause) { throw error(cause.statusCode||403,cause.message,cause.code||"ORGANIZATION_FORBIDDEN"); }
  return membership;
 }
 if(row.provider_user_id!==userId) throw error(403,"Only the service provider can manage this listing.","FORBIDDEN");
 await requirePersonalProfessionalCapability(db,userId);
 return null;
}
async function professionalVerified(db,userId){
  return (await db.query("select 1 from verification_claim vc join verification_case c on c.id=vc.case_id where c.subject_user_id=$1 and vc.status='verified' and lower(vc.claim_code_snapshot)=any($2::text[]) limit 1",[userId,PROFESSIONAL_CLAIMS])).rowCount>0;
}
function normalizeArray(v){
  // pg commonly decodes json/jsonb columns to arrays already. Accept legacy JSON text
  // too, but never JSON.parse an already-decoded array or let malformed text crash matching.
  if(typeof v==="string"){
    try { v=JSON.parse(v); } catch { return []; }
  }
  return Array.isArray(v)?v.map(x=>String(x).trim().toLowerCase()).filter(Boolean):[];
}
function overlap(a,b){ const set=new Set(normalizeArray(a)); return normalizeArray(b).filter(x=>set.has(x)).length; }
async function hasPlatformRole(db,userId,roles){
  const row=(await db.query("select 1 from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1 and r.role_code=any($2::text[]) limit 1",[userId,roles])).rows[0];
  return Boolean(row);
}
async function assertSessionFitsAvailability(db,mentorUserId,startAt,endAt){
  const profile=(await db.query("select id from mentor_profile where user_id=$1",[mentorUserId])).rows[0];
  if(!profile) throw error(409,"Mentor profile is unavailable.","MENTOR_UNAVAILABLE");
  const slot=(await db.query("select 1 from mentor_availability a where a.mentor_profile_id=$1 and a.active=true and a.day_of_week=extract(dow from ($2::timestamptz at time zone a.timezone))::int and a.start_time <= (($2::timestamptz at time zone a.timezone)::time) and a.end_time >= (($3::timestamptz at time zone a.timezone)::time) limit 1",[profile.id,startAt,endAt])).rows[0];
  if(!slot) throw error(409,"The requested session time is outside the mentor's published availability.","OUTSIDE_AVAILABILITY");
  const conflict=(await db.query("select 1 from mentor_time_off t where t.mentor_profile_id=$1 and t.starts_at < $3::timestamptz and t.ends_at > $2::timestamptz limit 1",[profile.id,startAt,endAt])).rows[0];
  if(conflict) throw error(409,"The mentor is unavailable during the requested time.","TIME_OFF_CONFLICT");
}

const SERVICE_TRANSITIONS={
 requested:["accepted","declined","cancelled"],
 accepted:["in_progress","cancelled"],
 in_progress:["disputed","cancelled"],
 disputed:["in_progress","cancelled"],
 completed:[],
 declined:[],
 cancelled:[]
};
export function allowedServiceRequestTransition(from,to){ return (SERVICE_TRANSITIONS[from]||[]).includes(to); }
export function canAcceptServiceCompletion({status,providerCompleted,paid=false,settled=false}){
  return status==="in_progress" && providerCompleted===true && (!paid || settled===true);
}

const MENTORSHIP_TRANSITIONS={
 active:["paused","completed","cancelled"],
 paused:["active","completed","cancelled"],
 completed:[],
 cancelled:[]
};
export function allowedMentorshipTransition(from,to){ return (MENTORSHIP_TRANSITIONS[from]||[]).includes(to); }

const MATCH_TRANSITIONS={proposed:["accepted","declined","expired","cancelled"],accepted:[],declined:[],expired:[],cancelled:[]};
export function allowedMatchTransition(from,to){ return (MATCH_TRANSITIONS[from]||[]).includes(to); }

const SESSION_TRANSITIONS={scheduled:["completed","cancelled","no_show"],completed:[],cancelled:[],no_show:[]};
export function allowedSessionTransition(from,to){ return (SESSION_TRANSITIONS[from]||[]).includes(to); }

export async function createServiceListing(userId,input,requestId,idempotencyKey=null){
 if(typeof idempotencyKey!=="string" || !/^[A-Za-z0-9_-]{32,200}$/.test(idempotencyKey))
  throw error(400,"This form needs a secure submission key. Reload the form and try again.","IDEMPOTENCY_KEY_REQUIRED");
 const organizationId=input.organizationId||null;
 const normalized={userId,organizationId,title:String(input.title||"").trim(),description:String(input.description||"").trim(),serviceCategory:String(input.serviceCategory||"").trim(),deliveryMode:input.deliveryMode||"remote",locationLabel:input.locationLabel||null,pricingModel:input.pricingModel||"quote",priceAmount:input.priceAmount??null,currency:input.currency||null,visibility:input.visibility||"members",maxActiveRequests:input.maxActiveRequests??null};
 if(!normalized.title||!normalized.description||!normalized.serviceCategory) throw error(400,"title, description and serviceCategory are required.","VALIDATION_ERROR");
 if(!["free","fixed","hourly","quote"].includes(normalized.pricingModel)) throw error(400,"Unsupported pricing model.","VALIDATION_ERROR");
 const fingerprint=hashPayload(normalized),keyHash=hashValue(idempotencyKey);
 return withTransaction(async db=>{
  const existing=(await db.query("select * from service_listing where request_idempotency_hash=$1 for update",[keyHash])).rows[0];
  if(existing){
   if(existing.request_fingerprint!==fingerprint)throw error(409,"This submission key was already used for different listing details. Start a new listing before changing the form.","IDEMPOTENCY_KEY_CONFLICT");
   return {...existing,idempotent:true,replayed:true,nextAction:existing.status==="published"?"Review the moderation decision before sharing this listing.":"Review the saved draft, then submit it for moderation."};
  }
  if(organizationId){
   let membership;
   try { membership=await assertOrganizationCapability(db,organizationId,userId); }
   catch(cause) { throw error(cause.statusCode||403,cause.message||"An active organization owner or authorized manager is required to create this listing.",cause.code||"ORGANIZATION_FORBIDDEN"); }
   if(membership.verification_status!=="verified") throw error(409,"The organization must be verified before it can publish a service listing.","ORGANIZATION_NOT_VERIFIED");
  } else {
   await requirePersonalProfessionalCapability(db,userId);
  }
  const row=(await db.query("insert into service_listing(provider_user_id,organization_id,title,description,service_category,delivery_mode,location_label,pricing_model,price_amount,currency,visibility,max_active_requests,request_idempotency_hash,request_fingerprint) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) on conflict do nothing returning *",[userId,organizationId,normalized.title,normalized.description,normalized.serviceCategory,normalized.deliveryMode,normalized.locationLabel,normalized.pricingModel,normalized.priceAmount,normalized.currency,normalized.visibility,normalized.maxActiveRequests,keyHash,fingerprint])).rows[0];
  if(!row){
   const raced=(await db.query("select * from service_listing where request_idempotency_hash=$1 for update",[keyHash])).rows[0];
   if(!raced||raced.request_fingerprint!==fingerprint)throw error(409,"This submission key was already used for different listing details. Start a new listing before changing the form.","IDEMPOTENCY_KEY_CONFLICT");
   return {...raced,idempotent:true,replayed:true,nextAction:"Review the saved draft, then submit it for moderation."};
  }
  await audit(db,userId,"service.listing_created","service_listing",row.id,requestId);
  return {...row,idempotent:false,replayed:false,nextAction:"Review the saved draft, then submit it for moderation."};
 });
}
export async function updateServiceListing(listingId,userId,input,requestId){
  return withTransaction(async db=>{
    const row=(await db.query("select * from service_listing where id=$1 for update",[listingId])).rows[0];
    if(!row) throw error(404,"Service listing not found.","NOT_FOUND");
    await assertServiceListingAccess(db,row,userId);
    if(row.status==="closed") throw error(409,"Closed service listings cannot be edited.","INVALID_STATE");
    const updated=(await db.query("update service_listing set status='draft',moderation_status='pending',moderation_note=null,moderated_by=null,moderated_at=null,title=coalesce($1,title),description=coalesce($2,description),service_category=coalesce($3,service_category),delivery_mode=coalesce($4,delivery_mode),location_label=coalesce($5,location_label),pricing_model=coalesce($6,pricing_model),price_amount=coalesce($7,price_amount),currency=coalesce($8,currency),visibility=coalesce($9,visibility),max_active_requests=coalesce($10,max_active_requests),updated_at=now() where id=$11 returning *",[input.title||null,input.description||null,input.serviceCategory||null,input.deliveryMode||null,input.locationLabel||null,input.pricingModel||null,input.priceAmount??null,input.currency||null,input.visibility||null,input.maxActiveRequests??null,listingId])).rows[0];
    await audit(db,userId,"service.listing_updated","service_listing",listingId,requestId);
    return updated;
  });
}

export async function changeServiceListingStatus(listingId,userId,status,requestId){
  if(!["draft","published","paused","closed"].includes(status)) throw error(400,"Unsupported service listing status.","VALIDATION_ERROR");
  return withTransaction(async db=>{
    const row=(await db.query("select * from service_listing where id=$1 for update",[listingId])).rows[0];
    if(!row) throw error(404,"Service listing not found.","NOT_FOUND");
    const organization=await assertServiceListingAccess(db,row,userId);
    if(row.status==="closed" && status!=="closed") throw error(409,"Closed service listings cannot be reopened.","INVALID_STATE");
    if(status==="published" && row.moderation_status!=="approved"){
      if(row.moderation_status==="rejected") throw error(409,"This listing was rejected and cannot be resubmitted. Create a new listing if the offer has materially changed.","LISTING_REJECTED");
      if(row.organization_id && organization?.verification_status!=="verified") throw error(409,"The organization must be verified before it can submit a service listing.","ORGANIZATION_NOT_VERIFIED");
      if(!row.organization_id && !(await activeMember(db,userId))) throw error(403,"A current active membership is required to submit a service listing.","MEMBERSHIP_REQUIRED");
      const submitted=(await db.query("update service_listing set status='draft',moderation_status='pending',moderation_note=null,moderated_by=null,moderated_at=null,updated_at=now() where id=$1 returning *",[listingId])).rows[0];
      await audit(db,userId,"service.listing_submitted_for_review","service_listing",listingId,requestId,{from:row.status,to:"draft"});
      await notify(db,userId,"service.listing_submitted_for_review","service_listing",listingId,{message:"Your service listing was submitted for moderation.",nextAction:"Monitor the listing for the moderator's decision or requested changes.",actionUrl:"/services",eventVersion:submitted.updated_at||requestId||listingId});
      const moderators=(await db.query("select distinct u.id user_id from app_user u where u.status='active' and (exists(select 1 from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=u.id and r.role_code in ('supporting_staff','system_admin')) or exists(select 1 from app_user_permission up where up.user_id=u.id and up.permission_code='marketplace.moderate'))")).rows;
      for(const moderator of moderators)await notify(db,moderator.user_id,"service.listing_review_required","service_listing",listingId,{message:"A professional service listing is awaiting moderation.",nextAction:"Review the listing in the existing marketplace moderation queue and approve or reject it with a reason.",actionUrl:"/admin/marketplace",reviewerQueue:true,actionRequired:true,priority:"high",from:row.status,to:"draft",eventVersion:submitted.updated_at||requestId||listingId});
      return submitted;
    }
    if(status==="published" && row.organization_id && organization?.verification_status!=="verified") throw error(409,"The organization must be verified before it can publish a service listing.","ORGANIZATION_NOT_VERIFIED");
    if(status==="published" && !row.organization_id && !(await activeMember(db,userId))) throw error(403,"A current active membership is required to publish a service.","MEMBERSHIP_REQUIRED");
    const updated=(await db.query("update service_listing set status=$1,updated_at=now() where id=$2 returning *",[status,listingId])).rows[0];
    await audit(db,userId,"service.listing_status_changed","service_listing",listingId,requestId,{from:row.status,to:status});
    return updated;
  });
}

export async function listServices(viewerId=null,filters={}){
  const db=getPool(); const args=[viewerId||null]; const where=["s.status='published'","s.moderation_status='approved'","((s.organization_id is not null and exists (select 1 from organization o where o.id=s.organization_id and o.verification_status='verified')) or (s.organization_id is null and exists (select 1 from membership_record m where m.user_id=s.provider_user_id and m.status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date))))","(s.visibility='public' or ($1::uuid is not null and s.visibility='members' and exists(select 1 from membership_record vm where vm.user_id=$1 and vm.status='active' and vm.start_date<=current_date and (vm.end_date is null or vm.end_date>=current_date))))"];
  if(filters.category){ args.push(String(filters.category)); where.push(`s.service_category=$${args.length}`); }
  if(filters.q){ args.push(`%${String(filters.q).trim()}%`); where.push(`(s.title ilike $${args.length} or s.description ilike $${args.length} or s.service_category ilike $${args.length})`); }
  const limit=Math.min(Math.max(Number(filters.limit)||25,1),100),offset=Math.max(Number(filters.offset)||0,0);
  const rows=(await db.query(`select s.id,s.provider_user_id,s.organization_id,s.title,s.description,s.service_category,s.delivery_mode,s.location_label,s.pricing_model,s.price_amount,s.currency,s.visibility,s.created_at,coalesce(o.display_name,p.display_name) display_name from service_listing s left join person p on p.user_id=s.provider_user_id left join organization o on o.id=s.organization_id where ${where.join(" and ")} order by s.created_at desc limit ${limit} offset ${offset}`,args)).rows;
  return {items:rows,limit,offset};
}

export async function getServiceListing(listingId,viewerId=null){
  const db=getPool();
  const row=(await db.query("select s.*,coalesce(o.display_name,p.display_name) provider_name from service_listing s left join person p on p.user_id=s.provider_user_id left join organization o on o.id=s.organization_id where s.id=$1 and s.status='published' and s.moderation_status='approved' and ((s.organization_id is not null and exists (select 1 from organization org where org.id=s.organization_id and org.verification_status='verified')) or (s.organization_id is null and exists (select 1 from membership_record m where m.user_id=s.provider_user_id and m.status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)))) and (s.visibility='public' or ($2::uuid is not null and s.visibility='members' and exists(select 1 from membership_record vm where vm.user_id=$2 and vm.status='active' and vm.start_date<=current_date and (vm.end_date is null or vm.end_date>=current_date))))",[listingId,viewerId||null])).rows[0];
  if(!row) throw error(404,"Service listing not found or not visible.","NOT_FOUND");
  return row;
}

export async function requestService(listingId,requesterId,input,requestId,idempotencyKey=null){
 if(typeof idempotencyKey!=="string" || !/^[A-Za-z0-9_-]{32,200}$/.test(idempotencyKey))
  throw error(400,"This form needs a secure submission key. Reload the form and try again.","IDEMPOTENCY_KEY_REQUIRED");
 const proposedPrice=input.proposedPrice===undefined||input.proposedPrice===null?null:Number(input.proposedPrice);
 if(proposedPrice!==null&&(!Number.isFinite(proposedPrice)||proposedPrice<0)) throw error(400,"proposedPrice must be a non-negative number.","VALIDATION_ERROR");
 const normalized={listingId,requesterId,message:String(input.message||"").trim()||null,scope:input.scope||null,proposedPrice,currency:input.currency?String(input.currency).toUpperCase():null,completionDueAt:input.completionDueAt||null,requestedStartAt:input.requestedStartAt||null,requestedEndAt:input.requestedEndAt||null};
 const fingerprint=hashPayload(normalized),keyHash=hashValue(idempotencyKey);
 return withTransaction(async db=>{
  const existing=(await db.query("select * from service_request where request_idempotency_hash=$1 for update",[keyHash])).rows[0];
  if(existing){
   if(existing.request_fingerprint!==fingerprint)throw error(409,"This submission key was already used for different information. Start a new request before changing the form.","IDEMPOTENCY_KEY_CONFLICT");
   return {...existing,idempotent:true,replayed:true,nextAction:existing.status==="requested"?"Wait for the provider to respond.":existing.status==="accepted"?"Confirm scope, timing and milestones.":existing.status==="in_progress"?"Track delivery and review the provider's submitted outcome.":"Review the recorded request outcome; do not submit the same request again."};
  }
  const listing=(await db.query("select * from service_listing where id=$1 for update",[listingId])).rows[0];
  // Re-check the key after acquiring the listing lock: another request may have committed while this transaction waited.
  const racedExisting=(await db.query("select * from service_request where request_idempotency_hash=$1 for update",[keyHash])).rows[0];
  if(racedExisting){
   if(racedExisting.request_fingerprint!==fingerprint)throw error(409,"This submission key was already used for different information. Start a new request before changing the form.","IDEMPOTENCY_KEY_CONFLICT");
   return {...racedExisting,idempotent:true,replayed:true,nextAction:racedExisting.status==="requested"?"Wait for the provider to respond.":racedExisting.status==="accepted"?"Confirm scope, timing and milestones.":racedExisting.status==="in_progress"?"Track delivery and review the provider's submitted outcome.":"Review the recorded request outcome; do not submit the same request again."};
  }
  if(!listing||listing.status!=="published"||listing.moderation_status!=="approved"||listing.visibility==="private") throw error(404,"Service listing is not available.","NOT_FOUND");
  if(listing.organization_id){const org=(await db.query("select verification_status from organization where id=$1",[listing.organization_id])).rows[0];if(!org||org.verification_status!=="verified")throw error(404,"Service listing is not available.","NOT_FOUND");}
  else if(!(await activeMember(db,listing.provider_user_id))) throw error(404,"Service listing is not available.","NOT_FOUND");
  if(listing.visibility!=="public"&&!(await activeMember(db,requesterId))) throw error(403,"An active membership is required to request a member-only service.","MEMBERSHIP_REQUIRED");
  if(listing.provider_user_id===requesterId) throw error(409,"You cannot request your own service.","SELF_REQUEST");
  const duplicate=(await db.query("select * from service_request where service_listing_id=$1 and requester_user_id=$2 and status in ('requested','accepted','in_progress') order by created_at desc limit 1 for update",[listingId,requesterId])).rows[0];
  if(duplicate) return {...duplicate,idempotent:true,nextAction:duplicate.status==="requested"?"Wait for the provider to respond.":duplicate.status==="accepted"?"Confirm scope, timing and milestones.":"Track delivery and review the provider's submitted outcome."};
  const row=(await db.query("insert into service_request(service_listing_id,requester_user_id,provider_user_id,status,message,scope,agreed_price,agreed_currency,completion_due_at,requested_start_at,requested_end_at,request_idempotency_hash,request_fingerprint) values($1,$2,$3,'requested',$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict do nothing returning *",[listingId,requesterId,listing.provider_user_id,normalized.message,normalized.scope,proposedPrice,normalized.currency||listing.currency,normalized.completionDueAt,normalized.requestedStartAt,normalized.requestedEndAt,keyHash,fingerprint])).rows[0];
  if(!row){
   const raced=(await db.query("select * from service_request where request_idempotency_hash=$1 for update",[keyHash])).rows[0];
   if(!raced||raced.request_fingerprint!==fingerprint)throw error(409,"This submission key was already used for different information. Start a new request before changing the form.","IDEMPOTENCY_KEY_CONFLICT");
   return {...raced,idempotent:true,replayed:true,nextAction:"This service request was already recorded. Follow its current status; you do not need to submit it again."};
  }
  await db.query("insert into service_request_event(request_id,actor_user_id,to_status,note) values($1,$2,'requested',$3)",[row.id,requesterId,normalized.message]);
  await audit(db,requesterId,"service.request_created","service_request",row.id,requestId,{listingId,organizationId:listing.organization_id||null});
  const recipients=listing.organization_id?(await db.query("select user_id from organization_membership where organization_id=$1 and status='active' and role_code=any($2::text[])",[listing.organization_id,["owner","administrator","recruiter","project_manager"]])).rows.map(x=>x.user_id):[listing.provider_user_id];
  for(const recipient of new Set(recipients))if(recipient&&recipient!==requesterId)await queueWorkflowEmail(db,recipient,"professional.workflow_update",{notificationEventCode:"service.request_received",category:"services",title:"New service request",status:"requested",message:"A new service request needs a response.",nextAction:"Review the requested scope and accept, decline or ask for clarification.",actionUrl:"/services",actionRequired:true,priority:"high"},"service_request",row.id);
  await queueWorkflowEmail(db,requesterId,"professional.workflow_update",{notificationEventCode:"service.request_submitted",category:"services",title:"Service request submitted",status:"requested",message:"Your service request has been recorded.",nextAction:"Track the provider response in your service requests.",actionUrl:"/services"},"service_request",row.id);
  return {...row,idempotent:false,replayed:false,nextAction:"Your request is recorded. The provider or authorized organization team must respond before delivery begins."};
 });
}
export async function listMyServiceListings(userId){
 const db=getPool();
 const roles=["owner","administrator","recruiter","project_manager"];
 return (await db.query("select s.*,coalesce(o.display_name,p.display_name) provider_name,o.verification_status organization_verification_status from service_listing s left join person p on p.user_id=s.provider_user_id left join organization o on o.id=s.organization_id where (s.organization_id is null and s.provider_user_id=$1 and exists(select 1 from app_user_role ur join app_role ar on ar.id=ur.role_id where ur.user_id=$1 and ar.role_code=any(array['member','professional']::text[]))) or (s.organization_id is not null and exists(select 1 from organization_membership om where om.organization_id=s.organization_id and om.user_id=$1 and om.status='active' and om.role_code=any($2::text[]))) order by s.updated_at desc",[userId,roles])).rows;
}

export async function listMyServiceRequests(userId){
  const db=getPool();
  const orgRoles=["owner","administrator","recruiter","project_manager"];
  return (await db.query("select r.*,s.title service_title,s.service_category,p.display_name requester_name,coalesce((select jsonb_agg(jsonb_build_object('fromStatus',e.from_status,'toStatus',e.to_status,'note',e.note,'createdAt',e.created_at) order by e.created_at) from service_request_event e where e.request_id=r.id),'[]'::jsonb) status_history,((s.organization_id is null and r.provider_user_id=$1) or (s.organization_id is not null and exists(select 1 from organization_membership om where om.organization_id=s.organization_id and om.user_id=$1 and om.status='active' and om.role_code=any($2::text[])))) is_provider from service_request r join service_listing s on s.id=r.service_listing_id join person p on p.user_id=r.requester_user_id where r.requester_user_id=$1 or (s.organization_id is null and r.provider_user_id=$1) or (s.organization_id is not null and exists(select 1 from organization_membership om where om.organization_id=s.organization_id and om.user_id=$1 and om.status='active' and om.role_code=any($2::text[]))) order by r.created_at desc",[userId,orgRoles])).rows;
}

export async function changeServiceRequestStatus(requestId,userId,status,note,requestIdHeader){
  return withTransaction(async db=>{
    const r=(await db.query("select sr.*,sl.organization_id from service_request sr join service_listing sl on sl.id=sr.service_listing_id where sr.id=$1 for update of sr",[requestId])).rows[0];
    if(!r) throw error(404,"Service request not found.","NOT_FOUND");
    const providerActor=await isServiceProviderActor(db,requestId,userId);
    if(!providerActor && r.requester_user_id!==userId) throw error(403,"You are not a participant in this service request.","FORBIDDEN");
    if(r.status===status && status!=="completed") return {...r,idempotent:true,nextAction:status==="requested"?"Wait for the provider to respond.":status==="accepted"?"Agree the start date and delivery milestones.":status==="in_progress"?"Review delivery updates; the requester accepts completion after the provider submits it.":status==="disputed"?"Work with the other participant or Support Desk to resolve the issue.":"This request is resolved; create a new request if needed."};
    if(status==="completed"&&r.status==="in_progress"&&r.provider_completed_at&&providerActor)return {...r,idempotent:true,nextAction:"The requester must review the submitted outcome and accept completion."};
    if(r.status==="requested" && !providerActor) throw error(403,"Only the provider can accept or decline a service request.","FORBIDDEN");
    if(r.status==="accepted" && status==="in_progress" && !providerActor) throw error(403,"Only the provider can start service delivery.","FORBIDDEN");
    if(r.status==="disputed" && status==="in_progress" && !providerActor) throw error(403,"Only the provider can resume delivery after the concern is addressed.","FORBIDDEN");
    if(r.status==="in_progress" && status==="completed" && !providerActor) throw error(403,"Only the provider can mark delivery complete; the requester must accept the outcome separately.","FORBIDDEN");
    if(r.status==="accepted" && status==="cancelled" && !providerActor) {
      // requester cancellation is allowed before delivery starts
    } else if(r.status==="accepted" && status==="cancelled" && providerActor) {
      throw error(409,"The provider cannot cancel an accepted engagement; use the dispute path if delivery is blocked.","INVALID_STATE");
    }
    if(status==="completed"&&r.status==="in_progress"){
      const pending=(await db.query("select count(*)::int count from service_request_milestone where request_id=$1 and status not in ('accepted','completed','cancelled')",[requestId])).rows[0].count;
      if(Number(pending)>0) throw error(409,"All active delivery milestones must be accepted or completed before completion.","OUTCOMES_INCOMPLETE");
      const updated=(await db.query("update service_request set provider_completed_at=now(),provider_note=coalesce($1,provider_note),updated_at=now() where id=$2 returning *",[note||null,requestId])).rows[0];
      await db.query("insert into service_request_event(request_id,actor_user_id,from_status,to_status,note) values($1,$2,$3,$4,$5)",[requestId,userId,r.status,r.status,note||"Provider submitted completion; requester acceptance is still required."]);
      await audit(db,userId,"service.request_completion_submitted","service_request",requestId,requestIdHeader,{status:r.status});
      await notify(db,r.requester_user_id,"service.completion_submitted","service_request",requestId,{message:"The provider says the work is complete. Review the delivery and accept it or raise a concern.",nextAction:"Review submitted delivery and accept completion when satisfied."});
      return {...updated,nextAction:"The requester must review the outcome and accept completion. Paid work also requires verified settlement."};
    }
    if(!allowedServiceRequestTransition(r.status,status)) throw error(409,"Invalid service request transition.","INVALID_STATE");
    if(["declined","cancelled","disputed"].includes(status)&&String(note||"").trim().length<4) throw error(400,"Add a short explanation so the other participant understands this decision and the next step.","OUTCOME_NOTE_REQUIRED");
    const updated=(await db.query("update service_request set status=$1,provider_note=case when $2::uuid<>requester_user_id then $3 else provider_note end,requester_note=case when $2::uuid=requester_user_id then $3 else requester_note end,outcome_summary=case when $1 in ('declined','cancelled','disputed') then coalesce($3,outcome_summary) else outcome_summary end,accepted_at=case when $1='accepted' then now() else accepted_at end,started_at=case when $1='in_progress' then now() else started_at end,cancelled_at=case when $1='cancelled' then now() else cancelled_at end,updated_at=now() where id=$4 returning *",[status,userId,note||null,requestId])).rows[0];
    await db.query("insert into service_request_event(request_id,actor_user_id,from_status,to_status,note) values($1,$2,$3,$4,$5)",[requestId,userId,r.status,status,note||null]);
    await audit(db,userId,"service.request_status_changed","service_request",requestId,requestIdHeader,{from:r.status,to:status});
    const message=status==="accepted"?"Your service request was accepted. Agree the start date and delivery scope.":status==="declined"?"Your service request was declined. Review the explanation or choose another provider.":status==="in_progress"?"Service delivery has started. Track milestones and submitted work.":status==="disputed"?"A concern was raised. Review the note and agree the next step or contact Support Desk.":"The service request was cancelled. Review the explanation before creating a new request.";
    const nextAction=status==="accepted"?"Confirm scope, timing and milestones.":status==="in_progress"?"Track delivery and submit/review milestones.":status==="disputed"?"Respond to the concern and document the resolution.":status==="declined"?"Choose another provider or submit a revised request.":"Create a new request only if the need remains."; 
    for(const recipient of new Set([r.requester_user_id,...await serviceProviderRecipients(db,requestId)])) if(recipient&&recipient!==userId) await notify(db,recipient,"service.request_status_changed","service_request",requestId,{from:r.status,to:status,message,nextAction,actionRequired:["accepted","disputed"].includes(status),priority:status==="disputed"?"high":"normal"});
    return {...updated,nextAction};
  });
}

export async function submitServicePayment(requestId,userId,input,requestIdHeader){
  return withTransaction(async db=>{
    const r=(await db.query("select * from service_request where id=$1 for update",[requestId])).rows[0];
    if(!r) throw error(404,"Service request not found.","NOT_FOUND");
    if(r.requester_user_id!==userId) throw error(403,"Only the requester can submit service payment.","FORBIDDEN");
    if(!["accepted","in_progress"].includes(r.status)) throw error(409,"Payment can only be submitted after the service request is accepted.","INVALID_STATE");
    const amount=input.amount===undefined||input.amount===null?r.agreed_price:Number(input.amount);
    if(!Number.isFinite(Number(amount))||Number(amount)<0) throw error(400,"A valid non-negative payment amount is required.","VALIDATION_ERROR");
    if(r.agreed_price!==null&&Number(amount)!==Number(r.agreed_price)) throw error(400,"Payment amount does not match the agreed service price.","PAYMENT_AMOUNT_MISMATCH");
    const currency=String(input.currency||r.agreed_currency||"ETB").toUpperCase();
    if(currency.length!==3) throw error(400,"A three-letter currency code is required.","VALIDATION_ERROR");
    const channel=input.channel||"manual";
    if(!["online","manual","bank_transfer","cash","other"].includes(channel)) throw error(400,"Unsupported payment channel.","VALIDATION_ERROR");
    const idem=String(input.idempotencyKey||"").trim();
    if(!idem) throw error(400,"idempotencyKey is required.","VALIDATION_ERROR");
    const existing=(await db.query("select sp.*,pt.purpose,pt.purpose_reference from service_payment sp join payment_transaction pt on pt.id=sp.payment_transaction_id where pt.idempotency_key=$1",[idem])).rows[0];
    if(existing){if(existing.purpose!=="service"||String(existing.purpose_reference)!==String(requestId))throw error(409,"This payment retry key was already used for a different transaction. Refresh the request and submit a new payment reference.","IDEMPOTENCY_KEY_CONFLICT");return {...existing,idempotent:true,nextAction:existing.status==="succeeded"?"Payment is verified. You can continue with delivery acceptance.":existing.status==="failed"?"Payment was not accepted. Review the finance note before retrying.":"Your payment is already awaiting finance review."};}
    const p=(await db.query("insert into payment_transaction(provider,idempotency_key,purpose,amount,currency,status,request_payload,channel,submitted_by,purpose_reference,source) values('manual',$1,'service',$2,$3,'pending',$4::jsonb,$5,$6,$7,'manual_entry') returning *",[idem,amount,currency,JSON.stringify({requestId,channel,reference:input.reference||null}),channel,userId,requestId])).rows[0];
    if(input.evidenceFileId){
      const f=(await db.query("select id from file_object where id=$1 and created_by=$2 and visibility='private'",[input.evidenceFileId,userId])).rows[0];
      if(!f) throw error(400,"Payment evidence must be a private file owned by the payer.","INVALID_EVIDENCE");
    }
    const row=(await db.query("insert into service_payment(request_id,payment_transaction_id,payer_user_id,provider_user_id,amount,currency,channel,evidence_file_id,submitted_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *",[requestId,p.id,userId,r.provider_user_id,amount,currency,channel,input.evidenceFileId||null,userId])).rows[0];
    await audit(db,userId,"service.payment_submitted","service_payment",row.id,requestIdHeader,{requestId,channel});
    for(const providerUserId of await serviceProviderRecipients(db,requestId))if(providerUserId&&providerUserId!==userId)await notify(db,providerUserId,"service.payment_review_required","service_payment",row.id,{message:"A requester submitted payment for your service engagement.",nextAction:"Track finance verification before treating the payment as settled.",actionUrl:"/services",actionRequired:false});
    const financeUsers=(await db.query("select distinct u.id user_id from app_user u where u.status='active' and (exists(select 1 from app_user_role ur join app_role ar on ar.id=ur.role_id where ur.user_id=u.id and ar.role_code in ('finance_officer','system_admin')) or exists(select 1 from app_user_permission up where up.user_id=u.id and up.permission_code='finance.manage'))")).rows;
    for(const finance of financeUsers)await notify(db,finance.user_id,"service.payment_review_required","service_payment",row.id,{message:"A service payment is awaiting finance verification.",nextAction:"Review payment evidence and record a reasoned decision in the existing finance queue.",actionUrl:"/dashboard",reviewerQueue:true,actionRequired:true,priority:"high"});
    return row;
  });
}

export async function acceptServiceCompletion(requestId,userId,note,requestIdHeader){
  return withTransaction(async db=>{
    const r=(await db.query("select * from service_request where id=$1 for update",[requestId])).rows[0];
    if(!r) throw error(404,"Service request not found.","NOT_FOUND");
    if(r.requester_user_id!==userId) throw error(403,"Only the requester can accept service delivery.","FORBIDDEN");
    if(r.status==="completed"&&r.requester_accepted_at) return {...r,idempotent:true,nextAction:"This delivery is already accepted. You can leave feedback or review the engagement record."};
    if(r.status!=="in_progress" || !r.provider_completed_at) throw error(409,"The provider has not submitted completion for this engagement.","COMPLETION_NOT_SUBMITTED");
    const paid=(await db.query("select count(*)::int count from service_payment where request_id=$1 and amount>0",[requestId])).rows[0].count;
    const expectedAmount=Number(r.agreed_price||0);
    if(expectedAmount>0||Number(paid)>0){
      const settled=(await db.query("select 1 from service_payment where request_id=$1 and status='succeeded' and amount>0 and ($2::numeric<=0 or amount=$2::numeric) and ($3::text is null or upper(currency)=upper($3::text)) order by verified_at desc nulls last,created_at desc limit 1",[requestId,expectedAmount,r.agreed_currency||null])).rows[0];
      if(!settled) throw error(409,"The agreed paid service must have a finance-verified successful payment for the agreed amount and currency before the requester can accept completion.","PAYMENT_NOT_SETTLED");
    }
    const outcome=String(note||"The requester accepted the submitted service outcome.").trim().slice(0,3000);
    const row=(await db.query("update service_request set requester_accepted_at=now(),status='completed',outcome_summary=$1,completed_at=now(),updated_at=now() where id=$2 returning *",[outcome,requestId])).rows[0];
    await db.query("insert into service_request_event(request_id,actor_user_id,from_status,to_status,note) values($1,$2,'in_progress','completed',$3)",[requestId,userId,outcome]);
    await audit(db,userId,"service.request_completion_accepted","service_request",requestId,requestIdHeader);
    for(const recipient of await serviceProviderRecipients(db,requestId))if(recipient&&recipient!==userId)await notify(db,recipient,"service.completion_accepted","service_request",requestId,{message:"The requester accepted the delivered outcome.",nextAction:"The engagement is complete. You may request feedback or review the final record.",actionUrl:"/services"});
    return {...row,nextAction:"The engagement is complete. You can now leave feedback or view the outcome record."};
  });
}

export async function createServiceMilestone(requestId,userId,input,requestIdHeader){
  return withTransaction(async db=>{
    const r=(await db.query("select * from service_request where id=$1 for update",[requestId])).rows[0];
    if(!r) throw error(404,"Service request not found.","NOT_FOUND");
    if(!(await isServiceProviderActor(db,requestId,userId))) throw error(403,"Only the provider or authorized organization team can define delivery milestones.","FORBIDDEN");
    if(!["accepted","in_progress"].includes(r.status)) throw error(409,"Milestones can only be added to an accepted or active engagement.","INVALID_STATE");
    if(!input.title) throw error(400,"Milestone title is required.","VALIDATION_ERROR");
    const row=(await db.query("insert into service_request_milestone(request_id,title,description,due_at,created_by) values($1,$2,$3,$4,$5) returning *",[requestId,input.title,input.description||null,input.dueAt||null,userId])).rows[0];
    await audit(db,userId,"service.milestone_created","service_request_milestone",row.id,requestIdHeader);
    return row;
  });
}

export async function listServiceMilestones(requestId,userId){
  const db=getPool(); const r=(await db.query("select provider_user_id,requester_user_id from service_request where id=$1",[requestId])).rows[0];
  if(!r) throw error(404,"Service request not found.","NOT_FOUND");
  if(r.requester_user_id!==userId&&!(await isServiceProviderActor(db,requestId,userId))) throw error(403,"You are not a participant in this service request.","FORBIDDEN");
  return (await db.query("select * from service_request_milestone where request_id=$1 order by due_at nulls last,created_at",[requestId])).rows;
}

export async function listServiceDeliveries(requestId,userId){
 const db=getPool();
 const participant=(await db.query("select provider_user_id,requester_user_id from service_request where id=$1",[requestId])).rows[0];
 if(!participant) throw error(404,"Service request not found.","NOT_FOUND");
 if(participant.requester_user_id!==userId&&!(await isServiceProviderActor(db,requestId,userId))) throw error(403,"You are not a participant in this service request.","FORBIDDEN");
 return (await db.query(`select d.*,m.title milestone_title,p.display_name submitter_name
  from service_request_delivery d left join service_request_milestone m on m.id=d.milestone_id
  join person p on p.user_id=d.submitted_by
  where d.request_id=$1 order by d.created_at desc`,[requestId])).rows;
}

export async function submitServiceDelivery(requestId,userId,input,requestIdHeader){
  return withTransaction(async db=>{
    const r=(await db.query("select * from service_request where id=$1 for update",[requestId])).rows[0];
    if(!r) throw error(404,"Service request not found.","NOT_FOUND");
    if(!(await isServiceProviderActor(db,requestId,userId))) throw error(403,"Only the provider or authorized organization team can submit delivery.","FORBIDDEN");
    if(r.status!=="in_progress") throw error(409,"Service must be in progress before delivery is submitted.","INVALID_STATE");
    if(!input.description) throw error(400,"Delivery description is required.","VALIDATION_ERROR");
    if(input.fileObjectId){
      const f=(await db.query("select id from file_object where id=$1 and created_by=$2 and visibility='private'",[input.fileObjectId,userId])).rows[0];
      if(!f) throw error(400,"The delivery file must be a private file owned by the provider.","INVALID_FILE");
    }
    if(input.milestoneId){
      const m=(await db.query("select id from service_request_milestone where id=$1 and request_id=$2",[input.milestoneId,requestId])).rows[0];
      if(!m) throw error(400,"Milestone does not belong to this service request.","INVALID_MILESTONE");
      await db.query("update service_request_milestone set status='submitted',updated_at=now() where id=$1",[input.milestoneId]);
    }
    const row=(await db.query("insert into service_request_delivery(request_id,milestone_id,submitted_by,description,file_object_id) values($1,$2,$3,$4,$5) returning *",[requestId,input.milestoneId||null,userId,input.description,input.fileObjectId||null])).rows[0];
    await audit(db,userId,"service.delivery_submitted","service_request_delivery",row.id,requestIdHeader,{requestId});
    await notify(db,r.requester_user_id,"service.delivery_submitted","service_request_delivery",row.id,{message:"The provider submitted a delivery for your service engagement.",nextAction:"Review the delivery and accept it or request a revision with a clear explanation.",actionUrl:"/services",actionRequired:true,priority:"high"});
    return row;
  });
}

export async function reviewServiceDelivery(deliveryId,userId,input,requestIdHeader){
  return withTransaction(async db=>{
    const d=(await db.query("select d.*,r.requester_user_id,r.provider_user_id from service_request_delivery d join service_request r on r.id=d.request_id where d.id=$1 for update",[deliveryId])).rows[0];
    if(!d) throw error(404,"Service delivery not found.","NOT_FOUND");
    if(d.requester_user_id!==userId) throw error(403,"Only the requester can review a delivery.","FORBIDDEN");
    if(!["accepted","revision_requested"].includes(input.status)) throw error(400,"Delivery review must be accepted or revision_requested.","VALIDATION_ERROR");
    if(input.status==="revision_requested"&&String(input.note||"").trim().length<4)throw error(400,"Explain what needs to change before requesting a revision.","REVISION_NOTE_REQUIRED");
    if(d.status===input.status)return {...d,idempotent:true,nextAction:input.status==="accepted"?"This delivery is accepted.":"This revision request is already recorded."};
    const row=(await db.query("update service_request_delivery set status=$1,reviewer_note=$2,reviewed_by=$3,reviewed_at=now() where id=$4 returning *",[input.status,input.note||null,userId,deliveryId])).rows[0];
    if(d.milestone_id) await db.query("update service_request_milestone set status=$1,completed_at=case when $1='completed' then now() else completed_at end,updated_at=now() where id=$2",[input.status==="accepted"?"completed":"revision_requested",d.milestone_id]);
    await audit(db,userId,"service.delivery_reviewed","service_request_delivery",deliveryId,requestIdHeader,{status:input.status});
    for(const recipient of await serviceProviderRecipients(db,d.request_id))if(recipient&&recipient!==userId)await notify(db,recipient,input.status==="accepted"?"service.delivery_accepted":"service.delivery_revision_requested","service_request_delivery",deliveryId,{message:input.status==="accepted"?"The requester accepted your delivery.":"The requester requested a revision.",note:input.note||null,nextAction:input.status==="accepted"?"Continue with the next milestone or submit completion when all work is ready.":"Review the requester's note and submit a revised delivery.",actionUrl:"/services",actionRequired:input.status==="revision_requested",priority:input.status==="revision_requested"?"high":"normal"});
    return {...row,nextAction:input.status==="accepted"?"Continue with the next milestone or submit completion when all work is ready.":"Review the note and submit a revised delivery."};
  });
}

export async function listServicePaymentsForReview(reviewerId){
 const db=getPool();
 const allowed=(await db.query("select 1 where exists (select 1 from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1 and r.role_code in ('finance_officer','system_admin')) or exists (select 1 from app_user_permission up where up.user_id=$1 and up.permission_code='finance.manage')",[reviewerId])).rows[0];
 if(!allowed) throw error(403,"Finance reviewer role required.","FORBIDDEN");
 return (await db.query(`select sp.id,sp.request_id,sp.payment_transaction_id,sp.payer_user_id,sp.provider_user_id,sp.amount,sp.currency,sp.channel,sp.status,sp.created_at,
  pt.status transaction_status,pt.idempotency_key,pt.purpose_reference,
  sr.status request_status,s.title service_title,pr.display_name requester_name,pv.display_name provider_name
  from service_payment sp join payment_transaction pt on pt.id=sp.payment_transaction_id
  join service_request sr on sr.id=sp.request_id join service_listing s on s.id=sr.service_listing_id
  join person pr on pr.user_id=sp.payer_user_id join person pv on pv.user_id=sp.provider_user_id
  where sp.status='pending' order by sp.created_at`)).rows;
}
export async function verifyServicePayment(servicePaymentId,verifierId,input,requestIdHeader){
 return withTransaction(async db=>{
  const allowed=(await db.query("select 1 where exists (select 1 from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1 and r.role_code in ('finance_officer','system_admin')) or exists (select 1 from app_user_permission up where up.user_id=$1 and up.permission_code='finance.manage')",[verifierId])).rows[0];
  if(!allowed) throw error(403,"Finance reviewer role required.","FORBIDDEN");
  const row=(await db.query(`select sp.*,pt.status transaction_status,pt.channel transaction_channel,pt.source,sp.payer_user_id,sp.provider_user_id
   from service_payment sp join payment_transaction pt on pt.id=sp.payment_transaction_id where sp.id=$1 for update of sp,pt`,[servicePaymentId])).rows[0];
  if(!row) throw error(404,"Service payment not found.","NOT_FOUND");
  if(row.payer_user_id===verifierId||row.provider_user_id===verifierId) throw error(403,"A service participant cannot verify their own payment.","CONFLICT_OF_INTEREST");
  if(row.status!=="pending"||row.transaction_status!=="pending") throw error(409,"Only a pending service payment can be verified.","INVALID_STATE");
  if(!["manual","bank_transfer","cash","other"].includes(row.transaction_channel)||row.source==="provider_webhook") throw error(400,"This payment is not eligible for manual verification.","INVALID_PAYMENT_CHANNEL");
  if(!["approved","rejected","needs_correction"].includes(input.decision)) throw error(400,"Invalid service payment decision.","VALIDATION_ERROR");
  const next=input.decision==="approved"?"succeeded":input.decision==="rejected"?"failed":"pending";
  await db.query("insert into payment_verification(payment_transaction_id,verifier_user_id,decision,evidence_checked,note) values($1,$2,$3,$4,$5)",[row.payment_transaction_id,verifierId,input.decision,JSON.stringify(input.evidenceChecked||[]),input.note||null]);
  const updated=(await db.query("update service_payment set status=$1,verified_by=$2,verified_at=case when $1<>'pending' then now() else null end,verification_note=$3,updated_at=now() where id=$4 returning *",[next,verifierId,input.note||null,servicePaymentId])).rows[0];
  await db.query("update payment_transaction set status=$1,verified_by=$2,verified_at=now(),verification_note=$3,completed_at=case when $1 in ('succeeded','failed') then now() else completed_at end,updated_at=now() where id=$4",[next,verifierId,input.note||null,row.payment_transaction_id]);
  await audit(db,verifierId,"service.payment_verified","service_payment",servicePaymentId,requestIdHeader,{decision:input.decision,requestId:row.request_id});
  const approved=input.decision==="approved", correction=input.decision==="needs_correction";
  await notify(db,row.payer_user_id,"service.payment_decision","service_payment",servicePaymentId,{message:approved?"Your service payment was verified.":correction?"Finance needs additional information about your service payment.":"Your service payment was not approved.",nextAction:approved?"Continue with the service workflow; paid completion still requires the matching verified amount and currency.":correction?"Review the finance note and provide corrected payment evidence.":"Review the finance note and contact support if you believe the decision is incorrect.",actionUrl:"/services",actionRequired:!approved,priority:correction?"high":"normal"});
  for(const providerUserId of await serviceProviderRecipients(db,row.request_id))if(providerUserId&&providerUserId!==row.payer_user_id)await notify(db,providerUserId,"service.payment_decision","service_payment",servicePaymentId,{decision:input.decision,eventVersion:requestIdHeader,message:approved?"The service payment was verified by finance.":correction?"Finance requested additional information for the service payment.":"The service payment was not approved.",nextAction:approved?"Continue the engagement according to the agreed delivery terms.":"Coordinate with the requester and finance to resolve the payment status.",actionUrl:"/services",actionRequired:correction,priority:correction?"high":"normal"});
  return updated;
 });
}

export async function submitServiceFeedback(requestId,userId,input,requestIdHeader){
  return withTransaction(async db=>{
    const r=(await db.query("select * from service_request where id=$1",[requestId])).rows[0];
    if(!r) throw error(404,"Service request not found.","NOT_FOUND");
    if(r.requester_user_id!==userId&&!(await isServiceProviderActor(db,requestId,userId))) throw error(403,"You are not a participant in this service request.","FORBIDDEN");
    if(r.status!=="completed") throw error(409,"Service feedback requires a completed engagement.","SERVICE_NOT_COMPLETED");
    const target=input.targetRole||"service";
    if(target==="provider"&&r.provider_user_id===userId) throw error(400,"A provider cannot rate themselves.","SELF_RATING");
    if(target==="requester"&&r.requester_user_id===userId) throw error(400,"A requester cannot rate themselves.","SELF_RATING");
    if(!["provider","requester","service"].includes(target)) throw error(400,"Unsupported feedback target.","VALIDATION_ERROR");
    const row=(await db.query("insert into service_request_feedback(request_id,reviewer_user_id,target_role,rating,comments) values($1,$2,$3,$4,$5) on conflict(request_id,reviewer_user_id,target_role) do update set rating=excluded.rating,comments=excluded.comments returning *",[requestId,userId,target,input.rating??null,input.comments||null])).rows[0];
    await audit(db,userId,"service.feedback_submitted","service_request_feedback",row.id,requestIdHeader);
    return row;
  });
}


export async function createMentorProfile(userId,input,requestId){
  return withTransaction(async db=>{
    await requirePersonalProfessionalCapability(db,userId);
    if(!(await professionalVerified(db,userId))) throw error(403,"A verified professional claim is required to become a mentor.","PROFESSIONAL_VERIFICATION_REQUIRED");
    const headline=String(input.headline||"").trim();
    if(!headline) throw error(400,"headline is required.","VALIDATION_ERROR");
    const maxActiveMentees=input.maxActiveMentees===undefined?3:Number(input.maxActiveMentees);
    if(!Number.isInteger(maxActiveMentees)||maxActiveMentees<1||maxActiveMentees>50) throw error(400,"maxActiveMentees must be an integer from 1 to 50.","VALIDATION_ERROR");
    const visibility=input.visibility||"members";
    if(!["members","public"].includes(visibility)) throw error(400,"visibility must be members or public.","VALIDATION_ERROR");
    const existing=(await db.query("select id,status from mentor_profile where user_id=$1 for update",[userId])).rows[0];
    if(existing?.status==="closed") throw error(409,"Closed mentor profiles cannot be reopened.","INVALID_STATE");
    const circleEnabled=input.circleEnabled===true,circleName=String(input.circleName||"").trim().slice(0,120)||null;
    const values=[headline,String(input.bio||"").trim()||null,JSON.stringify(normalizeArray(input.expertise)),JSON.stringify(normalizeArray(input.languages)),JSON.stringify(normalizeArray(input.mentoringModes||["remote"])),maxActiveMentees,visibility,circleEnabled,circleName];
    const row=existing
      ? (await db.query("update mentor_profile set status=case when status='active' then 'draft' else status end,moderation_status='pending',moderation_note=null,moderated_by=null,moderated_at=null,headline=$1,bio=$2,expertise=$3,languages=$4,mentoring_modes=$5,max_active_mentees=$6,visibility=$7,circle_enabled=$8,circle_name=$9,updated_at=now() where id=$10 returning *",[...values,existing.id])).rows[0]
      : (await db.query("insert into mentor_profile(user_id,headline,bio,expertise,languages,mentoring_modes,max_active_mentees,visibility,circle_enabled,circle_name) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *",[userId,...values])).rows[0];
    await audit(db,userId,"mentorship.profile_updated","mentor_profile",row.id,requestId,{status:row.status});
    return row;
  });
}

export async function updateMentorProfile(profileId,userId,input,requestId){
  return withTransaction(async db=>{
    const row=(await db.query("select * from mentor_profile where id=$1 for update",[profileId])).rows[0];
    if(!row) throw error(404,"Mentor profile not found.","NOT_FOUND");
    if(row.user_id!==userId) throw error(403,"Only the mentor can edit this profile.","FORBIDDEN");
    await requirePersonalProfessionalCapability(db,userId);
    const updated=(await db.query("update mentor_profile set status=case when status='active' then 'draft' else status end,moderation_status='pending',moderation_note=null,moderated_by=null,moderated_at=null,headline=coalesce($1,headline),bio=coalesce($2,bio),expertise=coalesce($3,expertise),languages=coalesce($4,languages),mentoring_modes=coalesce($5,mentoring_modes),max_active_mentees=coalesce($6,max_active_mentees),visibility=coalesce($7,visibility),circle_enabled=coalesce($8,circle_enabled),circle_name=coalesce($9,circle_name),updated_at=now() where id=$10 returning *",[input.headline||null,input.bio||null,input.expertise?JSON.stringify(normalizeArray(input.expertise)):null,input.languages?JSON.stringify(normalizeArray(input.languages)):null,input.mentoringModes?JSON.stringify(normalizeArray(input.mentoringModes)):null,input.maxActiveMentees||null,input.visibility||null,input.circleEnabled===undefined?null:Boolean(input.circleEnabled),input.circleName===undefined?null:(String(input.circleName||"").trim().slice(0,120)||null),profileId])).rows[0];
    await audit(db,userId,"mentorship.profile_updated","mentor_profile",profileId,requestId);
    return updated;
  });
}

export async function changeMentorStatus(profileId,userId,status,requestId){
  if(!["draft","active","paused","closed"].includes(status)) throw error(400,"Unsupported mentor status.","VALIDATION_ERROR");
  return withTransaction(async db=>{
    const p=(await db.query("select * from mentor_profile where id=$1 for update",[profileId])).rows[0];
    if(!p) throw error(404,"Mentor profile not found.","NOT_FOUND");
    if(p.user_id!==userId) throw error(403,"Only the mentor can manage this profile.","FORBIDDEN");
    await requirePersonalProfessionalCapability(db,userId);
    if(p.status==="closed"&&status!=="closed") throw error(409,"Closed mentor profiles cannot be reopened.","INVALID_STATE");
    if(status==="active" && p.moderation_status!=="approved"){
      if(p.moderation_status==="rejected") throw error(409,"This mentorship offer was rejected and cannot be resubmitted. Update the offer through a new profile if the opportunity has materially changed.","LISTING_REJECTED");
      if(!(await activeMember(db,userId))) throw error(403,"A current active membership is required to submit a mentor profile.","MEMBERSHIP_REQUIRED");
      if(!(await professionalVerified(db,userId))) throw error(403,"A verified professional claim is required to submit a mentor profile.","PROFESSIONAL_VERIFICATION_REQUIRED");
      const submitted=(await db.query("update mentor_profile set status='draft',moderation_status='pending',moderation_note=null,moderated_by=null,moderated_at=null,updated_at=now() where id=$1 returning *",[profileId])).rows[0];
      await audit(db,userId,"mentorship.offer_submitted_for_review","mentor_profile",profileId,requestId,{from:p.status,to:"draft"});
      await notify(db,userId,"mentorship.offer_submitted_for_review","mentor_profile",profileId,{message:"Your mentor offer was submitted for moderation.",nextAction:"Monitor the offer for a moderation decision or requested changes.",actionUrl:"/mentorship",eventVersion:submitted.updated_at||requestId||profileId});
      const moderators=(await db.query("select distinct u.id user_id from app_user u where u.status='active' and (exists(select 1 from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=u.id and r.role_code in ('supporting_staff','system_admin')) or exists(select 1 from app_user_permission up where up.user_id=u.id and up.permission_code='marketplace.moderate'))")).rows;
      for(const moderator of moderators)await notify(db,moderator.user_id,"mentorship.offer_review_required","mentor_profile",profileId,{message:"A mentor offer is awaiting moderation.",nextAction:"Review the offer in the existing marketplace moderation queue and record the decision with a reason.",actionUrl:"/admin/marketplace",reviewerQueue:true,actionRequired:true,priority:"high",eventVersion:submitted.updated_at||requestId||profileId});
      return submitted;
    }
    if(status==="active" && !(await activeMember(db,userId))) throw error(403,"A current active membership is required to publish a mentor profile.","MEMBERSHIP_REQUIRED");
    if(status==="active" && !(await professionalVerified(db,userId))) throw error(403,"A verified professional claim is required to activate a mentor profile.","PROFESSIONAL_VERIFICATION_REQUIRED");
    const row=(await db.query("update mentor_profile set status=$1,updated_at=now() where id=$2 returning *",[status,profileId])).rows[0];
    await audit(db,userId,"mentorship.profile_status_changed","mentor_profile",profileId,requestId,{from:p.status,to:status});
    return row;
  });
}

export async function setMentorAvailability(profileId,userId,input,requestId){
  return withTransaction(async db=>{
    const p=(await db.query("select user_id from mentor_profile where id=$1",[profileId])).rows[0];
    if(!p) throw error(404,"Mentor profile not found.","NOT_FOUND");
    if(p.user_id!==userId) throw error(403,"Only the mentor can manage availability.","FORBIDDEN");
    await requirePersonalProfessionalCapability(db,userId);
    if(!Array.isArray(input.slots)) throw error(400,"slots must be an array.","VALIDATION_ERROR");
    for(const s of input.slots){
      if(!Number.isInteger(Number(s.dayOfWeek))||Number(s.dayOfWeek)<0||Number(s.dayOfWeek)>6) throw error(400,"dayOfWeek must be 0-6.","VALIDATION_ERROR");
      const start=String(s.startTime||""),end=String(s.endTime||"");
      const validTime=v=>/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(v);
      if(!validTime(start)||!validTime(end)||start>=end) throw error(400,"Availability start and end times must be valid and end after start on the same day.","VALIDATION_ERROR");
      if(s.timezone!==undefined&&(!String(s.timezone).trim()||String(s.timezone).length>80)) throw error(400,"timezone must be a valid non-empty timezone identifier.","VALIDATION_ERROR");
    }
    await db.query("delete from mentor_availability where mentor_profile_id=$1",[profileId]);
    for(const s of input.slots){
      await db.query("insert into mentor_availability(mentor_profile_id,day_of_week,start_time,end_time,timezone) values($1,$2,$3,$4,$5)",[profileId,Number(s.dayOfWeek),s.startTime,s.endTime,s.timezone||"Africa/Addis_Ababa"]);
    }
    await audit(db,userId,"mentorship.availability_updated","mentor_profile",profileId,requestId,{slotCount:input.slots.length});
    return (await db.query("select * from mentor_availability where mentor_profile_id=$1 order by day_of_week,start_time",[profileId])).rows;
  });
}

export async function addMentorTimeOff(profileId,userId,input,requestId){
  return withTransaction(async db=>{
    const p=(await db.query("select user_id from mentor_profile where id=$1",[profileId])).rows[0];
    if(!p) throw error(404,"Mentor profile not found.","NOT_FOUND");
    if(p.user_id!==userId) throw error(403,"Only the mentor can manage availability.","FORBIDDEN");
    if(!input.startsAt||!input.endsAt) throw error(400,"startsAt and endsAt are required.","VALIDATION_ERROR");
    const row=(await db.query("insert into mentor_time_off(mentor_profile_id,starts_at,ends_at,reason) values($1,$2,$3,$4) returning *",[profileId,input.startsAt,input.endsAt,input.reason||null])).rows[0];
    await audit(db,userId,"mentorship.time_off_added","mentor_profile",profileId,requestId,{timeOffId:row.id});
    return row;
  });
}

export async function getMentorProfile(userId,viewerId=null){
 const db=getPool();
 const row=(await db.query(`select mp.id,mp.user_id,p.display_name,mp.headline,mp.bio,mp.expertise,mp.languages,mp.mentoring_modes,mp.max_active_mentees
 from mentor_profile mp join app_user u on u.id=mp.user_id join person p on p.user_id=mp.user_id
 where mp.user_id=$1 and u.status='active' and mp.status='active' and mp.moderation_status='approved'
 and exists(select 1 from membership_record mm where mm.user_id=mp.user_id and mm.status='active' and mm.start_date<=current_date and (mm.end_date is null or mm.end_date>=current_date))
 and (mp.visibility='public' or (mp.visibility='members' and $2::uuid is not null and exists(select 1 from membership_record vm where vm.user_id=$2 and vm.status='active' and vm.start_date<=current_date and (vm.end_date is null or vm.end_date>=current_date))))`,[userId,viewerId||null])).rows[0];
 if(!row)throw error(404,"Mentor profile not found or not visible.","NOT_FOUND");
 return row;
}

export async function listMentors(viewerId,filters={}){
  const db=getPool();
  // The public endpoint must not disclose member-only mentor profiles. $1 is
  // always bound so the query is valid with or without optional filters.
  const args=[viewerId||null];
  const where=["mp.status='active'","mp.moderation_status='approved'","m.status='active'","m.start_date<=current_date","(m.end_date is null or m.end_date>=current_date)","(mp.visibility='public' or (mp.visibility='members' and $1::uuid is not null and exists(select 1 from membership_record vm where vm.user_id=$1::uuid and vm.status='active' and vm.start_date<=current_date and (vm.end_date is null or vm.end_date>=current_date))))"];
  if(filters.q){ args.push(`%${String(filters.q).trim()}%`); where.push(`(mp.headline ilike $${args.length} or mp.bio ilike $${args.length})`); }
  if(filters.topic){ args.push(`%${String(filters.topic).trim().toLowerCase()}%`); where.push(`mp.expertise::text ilike $${args.length}`); }
  const limit=Math.min(Math.max(Number(filters.limit)||20,1),50),offset=Math.max(Number(filters.offset)||0,0);
  const rows=(await db.query(`select mp.id,mp.user_id,p.display_name,mp.headline,mp.bio,mp.expertise,mp.languages,mp.mentoring_modes,mp.max_active_mentees,mp.circle_enabled,mp.circle_name,(select count(*)::int from mentorship_circle_membership cm where cm.mentor_profile_id=mp.id and cm.left_at is null) circle_joined_count from mentor_profile mp join app_user u on u.id=mp.user_id join person p on p.user_id=u.id join membership_record m on m.user_id=u.id where ${where.join(" and ")} order by p.display_name limit ${limit+1} offset ${offset}`,args)).rows;
  return rows;
}

export async function createMentorshipRequest(menteeId,input,requestId,idempotencyKey=null){
 if(typeof idempotencyKey!=="string" || !/^[A-Za-z0-9_-]{32,200}$/.test(idempotencyKey))
  throw error(400,"This form needs a secure submission key. Reload the form and try again.","IDEMPOTENCY_KEY_REQUIRED");
 if(typeof input.goals!=="string"||!input.goals.trim()) throw error(400,"A non-empty mentorship goal is required.","VALIDATION_ERROR");
 const goals=String(input.goals).trim(),preferredMentor=input.preferredMentorUserId||null,topics=JSON.stringify(normalizeArray(input.topics)),modes=JSON.stringify(normalizeArray(input.preferredModes||["remote"])),languages=JSON.stringify(normalizeArray(input.preferredLanguages)),days=JSON.stringify((input.preferredDays||[]).map(Number).filter(n=>n>=0&&n<=6));
 if(preferredMentor===menteeId) throw error(400,"You cannot mentor yourself.","VALIDATION_ERROR");
 const shareWithEligibleMentors=input.shareWithEligibleMentors===true;
 const normalized={menteeId,goals,preferredMentor,topics:JSON.parse(topics),modes:JSON.parse(modes),languages:JSON.parse(languages),days:JSON.parse(days),shareWithEligibleMentors};
 const fingerprint=hashPayload(normalized),keyHash=hashValue(idempotencyKey);
 return withTransaction(async db=>{
  // Serialize submissions from the same mentee so different keys cannot race past duplicate-request detection.
  const lockedMentee=(await db.query("select id from app_user where id=$1 for update",[menteeId])).rows[0];
  if(!lockedMentee)throw error(404,"Mentee account not found.","NOT_FOUND");
  const existing=(await db.query("select * from mentorship_request where request_idempotency_hash=$1 for update",[keyHash])).rows[0];
  if(existing){
   if(existing.request_fingerprint!==fingerprint)throw error(409,"This submission key was already used for different information. Start a new request before changing the form.","IDEMPOTENCY_KEY_CONFLICT");
   return {...existing,idempotent:true,replayed:true,nextAction:existing.status==="matched"?"A mentor proposal is already active. Wait for the mentor to respond.":"This mentorship request was already recorded. Review its current status or wait for the matching team."};
  }
  if(!(await activeMember(db,menteeId))) throw error(403,"An active membership is required for mentorship.","MEMBERSHIP_REQUIRED");
  const prior=(await db.query("select * from mentorship_request where mentee_user_id=$1 and goals=$2 and preferred_mentor_user_id is not distinct from $3 and topics=$4::jsonb and preferred_modes=$5::jsonb and preferred_languages=$6::jsonb and preferred_days=$7::jsonb and status in ('requested','matching','matched') order by created_at desc limit 1 for update",[menteeId,goals,preferredMentor,topics,modes,languages,days])).rows[0];
  if(prior)return {...prior,idempotent:true,nextAction:prior.status==="matched"?"A mentor proposal is already active. Wait for the mentor to respond.":"Your mentorship request is already recorded. Review its status or wait for the matching team."};
  const inserted=(await db.query("insert into mentorship_request(mentee_user_id,preferred_mentor_user_id,goals,topics,preferred_modes,preferred_languages,preferred_days,status,request_idempotency_hash,request_fingerprint,share_with_eligible_mentors) values($1,$2,$3,$4,$5,$6,$7,'requested',$8,$9,$10) on conflict do nothing returning *",[menteeId,preferredMentor,goals,topics,modes,languages,days,keyHash,fingerprint,shareWithEligibleMentors])).rows[0];
  if(!inserted){
   const raced=(await db.query("select * from mentorship_request where request_idempotency_hash=$1 for update",[keyHash])).rows[0];
   if(!raced||raced.request_fingerprint!==fingerprint)throw error(409,"This submission key was already used for different information. Start a new request before changing the form.","IDEMPOTENCY_KEY_CONFLICT");
   return {...raced,idempotent:true,replayed:true,nextAction:"This mentorship request was already recorded. Review its current status or wait for the matching team."};
  }
  await audit(db,menteeId,"mentorship.request_created","mentorship_request",inserted.id,requestId);
  const supportUsers=(await db.query("select distinct ur.user_id from app_user_role ur join app_role ar on ar.id=ur.role_id join app_user u on u.id=ur.user_id where u.status='active' and ar.role_code=any($1::text[])",[["supporting_staff","system_admin"]])).rows;
  for(const member of supportUsers)await notify(db,member.user_id,"mentorship.request_received","mentorship_request",inserted.id,{message:"A new mentorship goal is waiting for matching review.",nextAction:"Review eligible mentors and propose a match; the relationship starts only after acceptance.",actionUrl:"/mentorship",reviewerQueue:true,actionRequired:true,priority:"high"});
  return {...inserted,idempotent:false,replayed:false,nextAction:"Your goal is recorded. A mentor must be proposed and accept before a relationship is active."};
 });
}
async function mentorCandidates(db,request){
  const mentors=(await db.query("select mp.*,p.display_name from mentor_profile mp join person p on p.user_id=mp.user_id where mp.status='active' and mp.moderation_status='approved' and mp.visibility in ('members','public') and exists (select 1 from membership_record m where m.user_id=mp.user_id and m.status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)) and exists (select 1 from verification_claim vc join verification_case c on c.id=vc.case_id where c.subject_user_id=mp.user_id and vc.status='verified' and lower(vc.claim_code_snapshot)=any($1::text[])) and mp.user_id<>$2",[PROFESSIONAL_CLAIMS,request.mentee_user_id])).rows;
  const results=[];
  for(const m of mentors){
    const active=(await db.query("select count(*)::int count from mentorship where mentor_user_id=$1 and status in ('active','paused')",[m.user_id])).rows[0].count;
    if(active>=m.max_active_mentees) continue;
    const topics=normalizeArray(m.expertise), langs=normalizeArray(m.languages), modes=normalizeArray(m.mentoring_modes);
    const topicScore=overlap(topics,request.topics)*10;
    const languageScore=overlap(langs,request.preferred_languages)*5;
    const modeScore=overlap(modes,request.preferred_modes)*3;
    let dayScore=0;
    if(Array.isArray(request.preferred_days)&&request.preferred_days.length){
      const days=(await db.query("select distinct day_of_week from mentor_availability where mentor_profile_id=$1 and active=true",[m.id])).rows.map(x=>Number(x.day_of_week));
      dayScore=days.some(d=>request.preferred_days.map(Number).includes(d))?5:0;
    }
    const preferredBonus=request.preferred_mentor_user_id===m.user_id?100:0;
    results.push({mentorUserId:m.user_id,displayName:m.display_name,score:preferredBonus+topicScore+languageScore+modeScore+dayScore,reasons:[topicScore?"topic match":null,languageScore?"language match":null,modeScore?"mode match":null,dayScore?"availability match":null,preferredBonus?"preferred mentor":null].filter(Boolean)});
  }
  return results.sort((a,b)=>b.score-a.score);
}

export async function getMentorshipRequest(requestId,menteeId){
  const db=getPool();
  const row=(await db.query("select id,mentee_user_id,preferred_mentor_user_id,goals,topics,preferred_modes,preferred_languages,preferred_days,status,created_at,updated_at from mentorship_request where id=$1 and mentee_user_id=$2",[requestId,menteeId])).rows[0];
  if(!row) throw error(404,"Mentorship request not found.","NOT_FOUND");
  return row;
}

export async function findMentorMatches(requestId,menteeId){
  const db=getPool(); const request=(await db.query("select * from mentorship_request where id=$1",[requestId])).rows[0];
  if(!request) throw error(404,"Mentorship request not found.","NOT_FOUND");
  if(request.mentee_user_id!==menteeId) throw error(403,"Only the mentee can inspect matches.","FORBIDDEN");
  if(["cancelled","declined","completed"].includes(request.status)) throw error(409,"This mentorship request is no longer matchable.","INVALID_STATE");
  const candidates=await mentorCandidates(db,request);
  return candidates.slice(0,20);
}

export async function proposeMentorMatch(requestId,mentorUserId,actorUserId,requestIdHeader){
  return withTransaction(async db=>{
    const request=(await db.query("select * from mentorship_request where id=$1 for update",[requestId])).rows[0];
    if(!request) throw error(404,"Mentorship request not found.","NOT_FOUND");
    if(request.mentee_user_id!==actorUserId && !(await hasPlatformRole(db,actorUserId,["supporting_staff","system_admin"]))) throw error(403,"Only the mentee or authorized matching staff may propose a match.","FORBIDDEN");
    if(["cancelled","completed"].includes(request.status)) throw error(409,"This mentorship request is closed.","INVALID_STATE");
    const existingRelationship=(await db.query("select id,status from mentorship where request_id=$1 for update",[requestId])).rows[0];
    if(existingRelationship)throw error(409,"This request already became a mentorship relationship. Manage goals, sessions and completion from the active relationship instead of proposing another match.","RELATIONSHIP_ALREADY_CREATED");
    const existingMatch=(await db.query("select * from mentorship_match where request_id=$1 and status in ('proposed','accepted') and mentee_consent_status<>'declined' limit 1 for update",[requestId])).rows[0];
    if(existingMatch?.status==="accepted"&&existingMatch.mentee_consent_status!=="declined")throw error(409,"The mentor already accepted this match. Wait for the mentee to approve or decline this specific match.","MATCH_ALREADY_ACCEPTED");
    if(existingMatch?.status==="proposed"&&existingMatch.mentee_consent_status!=="declined"){if(existingMatch.mentor_user_id===mentorUserId)return {...existingMatch,idempotent:true,nextAction:"The mentor has already been invited. Wait for their response."};throw error(409,"A mentor proposal is already awaiting a response. Wait for the answer before proposing another match.","MATCH_RESPONSE_PENDING");}
    const candidates=await mentorCandidates(db,request); const match=candidates.find(x=>x.mentorUserId===mentorUserId);
    if(!match) throw error(409,"Selected mentor is not currently eligible or available.","MENTOR_UNAVAILABLE");
    const row=(await db.query("insert into mentorship_match(request_id,mentor_user_id,mentee_user_id,score,match_reasons,status,mentee_consent_status,proposed_at) values($1,$2,$3,$4,$5,'proposed','pending',now()) returning *",[requestId,mentorUserId,request.mentee_user_id,match.score,JSON.stringify(match.reasons)])).rows[0];
    await db.query("update mentorship_request set status='matched',matched_mentor_user_id=$1,matched_at=now(),updated_at=now() where id=$2",[mentorUserId,requestId]);
    await audit(db,actorUserId,"mentorship.match_proposed","mentorship_match",row.id,requestIdHeader,{mentorUserId,score:match.score});
    await queueWorkflowEmail(db,mentorUserId,"mentor.mentorship_update",{status:"match proposed",nextAction:"Review and accept or decline the mentorship match",actionUrl:"/mentorship",actionRequired:true,priority:"high",matchId:row.id,eventVersion:row.proposed_at||requestIdHeader},"mentorship_match",row.id);
    await db.query("update mentorship_match set mentor_notification_status='queued',mentor_notification_updated_at=now(),mentor_notification_detail=$2 where id=$1",[row.id,"Workflow email queued; provider delivery and reading are not confirmed."]);
    await queueWorkflowEmail(db,request.mentee_user_id,"professional.workflow_update",{status:"mentor match proposed",nextAction:"Wait for the proposed mentor to respond",actionUrl:"/mentorship",eventVersion:row.proposed_at||requestIdHeader},"mentorship_match",row.id);
    return row;
  });
}

export async function respondToMatch(matchId,mentorUserId,status,requestIdHeader){
  if(!["accepted","declined"].includes(status)) throw error(400,"Match response must be accepted or declined.","VALIDATION_ERROR");
  return withTransaction(async db=>{
    const match=(await db.query("select * from mentorship_match where id=$1 for update",[matchId])).rows[0];
    if(!match) throw error(404,"Mentorship match not found.","NOT_FOUND");
    if(match.mentor_user_id!==mentorUserId) throw error(403,"Only the proposed mentor can respond.","FORBIDDEN");
    if(match.status===status && (status==="declined"||match.mentee_consent_status!=="declined"))return {...match,idempotent:true,nextAction:status==="accepted"?(match.mentee_consent_status==="accepted"?"Both participants have accepted. Open the active mentorship to agree goals and sessions.":"The mentor has accepted. The mentee must also approve this specific match before the relationship starts."):"The mentee or Support Desk can propose another mentor."};
    if(match.status!=="proposed"||match.mentee_consent_status==="declined") throw error(409,"This match is no longer awaiting a mentor response.","INVALID_STATE");
    const updated=(await db.query("update mentorship_match set status=$1,responded_at=now() where id=$2 returning *",[status,matchId])).rows[0];
    if(status==="accepted"){
      if(match.mentee_consent_status==="accepted"){
        const existing=(await db.query("select id from mentorship where request_id=$1 for update",[match.request_id])).rows[0];
        if(!existing)await db.query("insert into mentorship(request_id,mentor_user_id,mentee_user_id,goals,status) select mm.request_id,mm.mentor_user_id,mm.mentee_user_id,mr.goals,'active' from mentorship_match mm join mentorship_request mr on mr.id=mm.request_id where mm.id=$1 and mm.status='accepted' and mm.mentee_consent_status='accepted'",[matchId]);
        await db.query("update mentorship_request set status='matched',matched_mentor_user_id=$1,updated_at=now() where id=$2",[mentorUserId,match.request_id]);
        await notify(db,match.mentee_user_id,"mentorship.match_fully_accepted","mentorship_match",matchId,{message:"Both you and the proposed mentor accepted this match. The mentorship is active.",nextAction:"Open the active mentorship to agree goals and schedule the first session.",actionRequired:true,priority:"normal",actionUrl:"/mentorship"});
      }else{
        await db.query("update mentorship_request set status='matched',matched_mentor_user_id=$1,updated_at=now() where id=$2",[mentorUserId,match.request_id]);
        await notify(db,match.mentee_user_id,"mentorship.match_mentor_accepted","mentorship_match",matchId,{message:"The proposed mentor has accepted. The relationship will not start until you approve this specific match.",nextAction:"Review the mentor and accept or decline this match.",actionRequired:true,priority:"high",actionUrl:"/mentorship"});
      }
    } else {
      await db.query("update mentorship_request set status='matching',matched_mentor_user_id=null,matched_at=null,updated_at=now() where id=$1",[match.request_id]);
      const supportUsers=(await db.query("select distinct ur.user_id from app_user_role ur join app_role ar on ar.id=ur.role_id join app_user u on u.id=ur.user_id where u.status='active' and ar.role_code=any($1::text[])",[["supporting_staff","system_admin"]])).rows;
      for(const member of supportUsers)await notify(db,member.user_id,"mentorship.match_declined","mentorship_request",match.request_id,{message:"A proposed mentor declined a match and the request returned to matching.",nextAction:"Review the request and propose another currently eligible mentor.",actionUrl:"/mentorship",reviewerQueue:true,actionRequired:true,priority:"high"});
    }
    await audit(db,mentorUserId,"mentorship.match_responded","mentorship_match",matchId,requestIdHeader,{status,menteeConsentStatus:updated.mentee_consent_status});
    return {...updated,nextAction:status==="accepted"?(updated.mentee_consent_status==="accepted"?"Both participants accepted. The mentorship is active; agree goals and schedule the first session.":"The mentee must approve this specific match before the relationship becomes active."):"The request is back in matching. Choose another eligible mentor."};
  });
}

export async function respondToMenteeMatch(matchId,menteeUserId,status,note,requestIdHeader){
  if(!["accepted","declined"].includes(status))throw error(400,"Choose accept or decline for this proposed mentor.","VALIDATION_ERROR");
  if(status==="declined"&&String(note||"").trim().length<4)throw error(400,"Please add a short reason so the coordinator knows how to help with another match.","MATCH_DECLINE_REASON_REQUIRED");
  return withTransaction(async db=>{
    const match=(await db.query("select * from mentorship_match where id=$1 for update",[matchId])).rows[0];
    if(!match)throw error(404,"Mentorship match not found.","NOT_FOUND");
    if(match.mentee_user_id!==menteeUserId)throw error(403,"Only the mentee who requested this match can respond.","FORBIDDEN");
    if(match.mentee_consent_status===status){
      const nextAction=status==="declined"?"Your decline is already recorded. The request is back in matching.":match.status==="accepted"?"Both participants have accepted. Open the active mentorship to agree goals and sessions.":match.status==="declined"?"Your consent was recorded, but the mentor declined. The request is back in matching.":"Your consent is recorded. The mentor must also accept before the relationship starts.";
      return {...match,idempotent:true,nextAction};
    }
    if(!["proposed","accepted"].includes(match.status))throw error(409,"This match is no longer awaiting a response.","INVALID_STATE");
    if(match.mentee_consent_status!=="pending")throw error(409,"This match has already received your final response.","INVALID_STATE");
    const updated=(await db.query("update mentorship_match set mentee_consent_status=$1,mentee_responded_at=now(),mentee_response_note=$2,status=case when $1='declined' then 'declined' else status end,responded_at=case when $1='declined' then now() else responded_at end where id=$3 returning *",[status,String(note||"").trim()||null,matchId])).rows[0];
    if(status==="accepted"){
      if(match.status==="accepted"){
        const existing=(await db.query("select id from mentorship where request_id=$1 for update",[match.request_id])).rows[0];
        if(!existing)await db.query("insert into mentorship(request_id,mentor_user_id,mentee_user_id,goals,status) select mm.request_id,mm.mentor_user_id,mm.mentee_user_id,mr.goals,'active' from mentorship_match mm join mentorship_request mr on mr.id=mm.request_id where mm.id=$1 and mm.status='accepted' and mm.mentee_consent_status='accepted'",[matchId]);
        await db.query("update mentorship_request set status='matched',matched_mentor_user_id=$1,updated_at=now() where id=$2",[match.mentor_user_id,match.request_id]);
        await notify(db,match.mentor_user_id,"mentorship.match_fully_accepted","mentorship_match",matchId,{message:"The mentee approved this specific match. You can now agree goals and schedule the first session.",nextAction:"Open the active mentorship and agree goals and a first session.",actionRequired:true,priority:"normal",actionUrl:"/mentorship"});
      }else{
        await notify(db,match.mentor_user_id,"mentorship.match_mentee_accepted_first","mentorship_match",matchId,{message:"The mentee has approved this proposed match first. Your separate acceptance is still required before the mentorship starts.",nextAction:"Review the proposed match and accept or decline it.",actionRequired:true,priority:"high",actionUrl:"/mentorship"});
      }
    }else{
      await db.query("update mentorship_request set status='matching',matched_mentor_user_id=null,matched_at=null,updated_at=now() where id=$1",[match.request_id]);
      const supportUsers=(await db.query("select distinct ur.user_id from app_user_role ur join app_role ar on ar.id=ur.role_id join app_user u on u.id=ur.user_id where u.status='active' and ar.role_code=any($1::text[])",[["supporting_staff","system_admin"]])).rows;
      for(const member of supportUsers)await notify(db,member.user_id,"mentorship.match_mentee_declined","mentorship_request",match.request_id,{message:"The mentee declined the proposed mentor. The request has returned to matching.",nextAction:"Review the mentee's reason and propose another eligible mentor.",actionUrl:"/mentorship",reviewerQueue:true,actionRequired:true,priority:"high"});
    }
    await audit(db,menteeUserId,"mentorship.match_mentee_response","mentorship_match",matchId,requestIdHeader,{status,note:note?.trim()||null,mentorStatus:match.status});
    return {...updated,nextAction:status==="accepted"?(match.status==="accepted"?"Both participants accepted. The mentorship is active; agree goals and schedule the first session.":"Your consent is recorded. Wait for the mentor to respond; the relationship is not active yet."):"Your response is recorded and the request returned to matching."};
  });
}

async function mentorshipParticipant(db,mentorshipId,userId){
  const row=(await db.query("select * from mentorship where id=$1",[mentorshipId])).rows[0];
  if(!row) throw error(404,"Mentorship not found.","NOT_FOUND");
  if(row.mentor_user_id!==userId&&row.mentee_user_id!==userId) throw error(403,"You are not a participant in this mentorship.","FORBIDDEN");
  return row;
}

export async function changeMentorshipStatus(mentorshipId,userId,status,note,requestIdHeader){
  if(!["active","paused","completed","cancelled"].includes(status)) throw error(400,"Unsupported mentorship status.","VALIDATION_ERROR");
  return withTransaction(async db=>{
    const m=await mentorshipParticipant(db,mentorshipId,userId);
    if(m.status===status)return {...m,idempotent:true,nextAction:status==="active"?"Agree the next goal or session.":status==="paused"?"Resume when both participants are ready, or record a final outcome.":"This mentorship relationship is resolved."};
    if(["cancelled","completed"].includes(status)&&String(note||"").trim().length<4)throw error(400,"Add a short outcome note so both participants understand how this relationship is ending.","OUTCOME_NOTE_REQUIRED");
    if(!allowedMentorshipTransition(m.status,status)) throw error(409,"Invalid mentorship lifecycle transition.","INVALID_STATE");
    if(status==="completed"){const pending=(await db.query("select count(*)::int count from mentorship_goal where mentorship_id=$1 and status in ('planned','in_progress')",[mentorshipId])).rows[0].count;if(Number(pending)>0)throw error(409,"Resolve or cancel all open goals before completing this mentorship.","GOALS_STILL_OPEN");}
    const row=(await db.query("update mentorship set status=$1,outcome_summary=case when $1 in ('completed','cancelled') then $2 else outcome_summary end,paused_at=case when $1='paused' then now() else paused_at end,completed_at=case when $1='completed' then now() else completed_at end,cancelled_at=case when $1='cancelled' then now() else cancelled_at end,updated_at=now() where id=$3 returning *",[status,String(note||"").trim()||null,mentorshipId])).rows[0];
    await db.query("insert into mentorship_event(mentorship_id,actor_user_id,from_status,to_status,note) values($1,$2,$3,$4,$5)",[mentorshipId,userId,m.status,status,note||null]);
    await audit(db,userId,"mentorship.status_changed","mentorship",mentorshipId,requestIdHeader,{from:m.status,to:status});
    for(const recipient of new Set([m.mentor_user_id,m.mentee_user_id]))if(recipient!==userId)await notify(db,recipient,"mentorship.status_changed","mentorship",mentorshipId,{from:m.status,to:status,note:note||null,message:status==="paused"?"The mentorship was paused.":status==="completed"?"The mentorship was marked complete.":"The mentorship was cancelled.",nextAction:status==="paused"?"Agree when to resume or document the outcome.":status==="completed"?"Review completed goals and submit program feedback.":"Review the reason and decide whether to request a new match."});
    return {...row,nextAction:status==="paused"?"Agree when to resume or document the outcome.":status==="completed"?"Review goals and submit program feedback.":"Review the cancellation reason and request a new match if needed."};
  });
}

export async function createMentorshipSession(mentorshipId,userId,input,requestId){
  return withTransaction(async db=>{
    const m=await mentorshipParticipant(db,mentorshipId,userId);
    if(m.status!=="active") throw error(409,"Sessions can only be scheduled for an active mentorship.","MENTORSHIP_NOT_ACTIVE");
    if(!input.scheduledStartAt||!input.scheduledEndAt) throw error(400,"scheduledStartAt and scheduledEndAt are required.","VALIDATION_ERROR");
    const coordinationDetails=String(input.meetingReference||"")+" "+String(input.locationLabel||"");
    if(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(coordinationDetails)||/(?:tel:|whatsapp:)/i.test(coordinationDetails)||/\+\d[\d ().-]{7,}/.test(coordinationDetails))throw error(400,"Use a meeting link or public meeting location only; do not enter personal email addresses or phone contact details.","PRIVATE_CONTACT_NOT_ALLOWED");
    await assertSessionFitsAvailability(db,m.mentor_user_id,input.scheduledStartAt,input.scheduledEndAt);
    const row=(await db.query("insert into mentorship_session(mentorship_id,scheduled_start_at,scheduled_end_at,mode,location_label,meeting_reference,agenda,created_by,coordination_status,proposed_by,proposal_note) values($1,$2,$3,$4,$5,$6,$7,$8,'proposed',$8,$9) returning *",[mentorshipId,input.scheduledStartAt,input.scheduledEndAt,input.mode||"remote",input.locationLabel||null,input.meetingReference||null,input.agenda||null,userId,String(input.proposalNote||"").trim().slice(0,1000)||null])).rows[0];
    await audit(db,userId,"mentorship.session_created","mentorship_session",row.id,requestId);
    const other=m.mentor_user_id===userId?m.mentee_user_id:m.mentor_user_id;
    await notify(db,other,"mentorship.session_scheduled","mentorship_session",row.id,{message:"A first-session proposal is waiting for your confirmation.",nextAction:"Review the proposed date, time, mode and agenda in the mentorship workspace. No private contact details are shared.",actionUrl:"/mentorship",actionRequired:true,priority:"high",scheduledStartAt:row.scheduled_start_at,scheduledEndAt:row.scheduled_end_at,coordinationStatus:"proposed"});
    return row;
  });
}

export async function changeMentorshipSession(sessionId,userId,status,notes,requestId){
  if(!["completed","cancelled","no_show"].includes(status)) throw error(400,"Session status must be completed, cancelled or no_show.","VALIDATION_ERROR");
  return withTransaction(async db=>{
    const s=(await db.query("select s.*,m.mentor_user_id,m.mentee_user_id,m.status mentorship_status from mentorship_session s join mentorship m on m.id=s.mentorship_id where s.id=$1 for update",[sessionId])).rows[0];
    if(!s) throw error(404,"Mentorship session not found.","NOT_FOUND");
    if(s.mentor_user_id!==userId&&s.mentee_user_id!==userId) throw error(403,"You are not a session participant.","FORBIDDEN");
    if(s.coordination_status!=="accepted") throw error(409,"Both participants must confirm the session proposal before recording completion, cancellation or no-show.","SESSION_NOT_CONFIRMED");
    if(s.status===status)return {...s,idempotent:true,nextAction:status==="completed"?"You can submit session feedback.":"Review the session record or schedule another session."};
    if(!allowedSessionTransition(s.status,status)) throw error(409,"Invalid session transition.","INVALID_STATE");
    const row=(await db.query("update mentorship_session set status=$1,notes=coalesce($2,notes),completed_at=case when $1='completed' then now() else completed_at end,updated_at=now() where id=$3 returning *",[status,notes||null,sessionId])).rows[0];
    await audit(db,userId,"mentorship.session_status_changed","mentorship_session",sessionId,requestId,{from:s.status,to:status});
    const other=s.mentor_user_id===userId?s.mentee_user_id:s.mentor_user_id;
    if(other)await notify(db,other,"mentorship.session_status_changed","mentorship_session",sessionId,{from:s.status,to:status,notes:notes||null,message:status==="completed"?"A mentorship session was marked complete.":status==="no_show"?"A participant recorded a no-show.":"A mentorship session was cancelled.",nextAction:status==="completed"?"Submit session feedback or schedule the next session.":"Coordinate a replacement session if appropriate."});
    return {...row,nextAction:status==="completed"?"Submit session feedback or schedule the next session.":"Coordinate a replacement session if appropriate."};
  });
}

export async function listMentorshipSessions(mentorshipId,userId){
  const db=getPool(); await mentorshipParticipant(db,mentorshipId,userId);
  return (await db.query("select id,mentorship_id,scheduled_start_at,scheduled_end_at,mode,case when coordination_status='accepted' then location_label else null end location_label,case when coordination_status='accepted' then meeting_reference else null end meeting_reference,agenda,status,notes,completed_at,created_by,created_at,updated_at,coordination_status,proposed_by,responded_by,responded_at,proposal_note from mentorship_session where mentorship_id=$1 order by scheduled_start_at",[mentorshipId])).rows;
}

export async function submitMentorshipFeedback(mentorshipId,userId,input,requestId){
  return withTransaction(async db=>{
    const m=await mentorshipParticipant(db,mentorshipId,userId);
    if(!input.targetRole||!["mentor","mentee","program"].includes(input.targetRole)) throw error(400,"Unsupported feedback target.","VALIDATION_ERROR");
    if(input.targetRole==="mentor"&&m.mentor_user_id===userId) throw error(400,"A mentor cannot rate themselves.","VALIDATION_ERROR");
    if(input.targetRole==="mentee"&&m.mentee_user_id===userId) throw error(400,"A mentee cannot rate themselves.","VALIDATION_ERROR");
    if(input.sessionId){
      const s=(await db.query("select status,mentorship_id from mentorship_session where id=$1",[input.sessionId])).rows[0];
      if(!s||s.mentorship_id!==mentorshipId) throw error(400,"Session does not belong to this mentorship.","VALIDATION_ERROR");
      if(s.status!=="completed") throw error(409,"Session feedback requires a completed session.","SESSION_NOT_COMPLETED");
    } else if(m.status!=="completed") {
      throw error(409,"Program feedback requires a completed mentorship.","MENTORSHIP_NOT_COMPLETED");
    }
    const rating=Number(input.rating),comments=String(input.comments||"").trim();
    if(!Number.isInteger(rating)||rating<1||rating>5)throw error(400,"Feedback rating must be an integer from 1 to 5.","VALIDATION_ERROR");
    if(comments.length<10||comments.length>2000)throw error(400,"Feedback comments must contain 10 to 2,000 characters.","VALIDATION_ERROR");
    const row=(await db.query("insert into mentorship_feedback(mentorship_id,session_id,reviewer_user_id,target_role,rating,comments) values($1,$2,$3,$4,$5,$6) on conflict(session_id,reviewer_user_id,target_role) do update set rating=excluded.rating,comments=excluded.comments returning *",[mentorshipId,input.sessionId||null,userId,input.targetRole,rating,comments])).rows[0];
    await audit(db,userId,"mentorship.feedback_submitted","mentorship_feedback",row.id,requestId,{targetRole:input.targetRole,sessionId:input.sessionId||null});
    return row;
  });
}

export async function createMentorshipGoal(mentorshipId,userId,input,requestId){
  return withTransaction(async db=>{
    const m=await mentorshipParticipant(db,mentorshipId,userId);
    if(m.status!=="active"&&m.status!=="paused") throw error(409,"Goals can only be managed for an active or paused mentorship.","INVALID_STATE");
    if(!input.title) throw error(400,"Goal title is required.","VALIDATION_ERROR");
    if(input.ownerRole&&!["mentor","mentee","shared"].includes(input.ownerRole)) throw error(400,"Invalid goal owner role.","VALIDATION_ERROR");
    const row=(await db.query("insert into mentorship_goal(mentorship_id,title,description,success_measure,target_date,owner_role,created_at,updated_at) values($1,$2,$3,$4,$5,$6,now(),now()) returning *",[mentorshipId,input.title,input.description||null,input.successMeasure||null,input.targetDate||null,input.ownerRole||"shared"])).rows[0];
    await audit(db,userId,"mentorship.goal_created","mentorship_goal",row.id,requestId);
    return row;
  });
}
export async function listMentorshipGoals(mentorshipId,userId){
  const db=getPool(); await mentorshipParticipant(db,mentorshipId,userId);
  return (await db.query("select * from mentorship_goal where mentorship_id=$1 order by target_date nulls last,created_at",[mentorshipId])).rows;
}
export async function updateMentorshipGoal(goalId,userId,input,requestId){
  return withTransaction(async db=>{
    const g=(await db.query("select g.*,m.mentor_user_id,m.mentee_user_id,m.status mentorship_status from mentorship_goal g join mentorship m on m.id=g.mentorship_id where g.id=$1 for update",[goalId])).rows[0];
    if(!g) throw error(404,"Mentorship goal not found.","NOT_FOUND");
    if(g.mentor_user_id!==userId&&g.mentee_user_id!==userId) throw error(403,"You are not a participant in this mentorship.","FORBIDDEN");
    if(!["planned","in_progress","achieved","not_achieved","cancelled"].includes(input.status||g.status)) throw error(400,"Invalid goal status.","VALIDATION_ERROR");
    const row=(await db.query("update mentorship_goal set title=coalesce($1,title),description=coalesce($2,description),success_measure=coalesce($3,success_measure),target_date=coalesce($4,target_date),status=coalesce($5,status),completed_at=case when $5 in ('achieved','not_achieved','cancelled') then now() else completed_at end,updated_at=now() where id=$6 returning *",[input.title??null,input.description??null,input.successMeasure??null,input.targetDate??null,input.status??null,goalId])).rows[0];
    await audit(db,userId,"mentorship.goal_updated","mentorship_goal",goalId,requestId,{status:row.status});
    return row;
  });
}

export async function getMentorship(mentorshipId,userId){
  const db=getPool(); const m=await mentorshipParticipant(db,mentorshipId,userId);
  const sessions=(await db.query("select * from mentorship_session where mentorship_id=$1 order by scheduled_start_at",[mentorshipId])).rows;
  const feedback=(await db.query("select id,session_id,reviewer_user_id,target_role,rating,comments,created_at from mentorship_feedback where mentorship_id=$1 order by created_at desc",[mentorshipId])).rows;
  const goals=(await db.query("select * from mentorship_goal where mentorship_id=$1 order by target_date nulls last,created_at",[mentorshipId])).rows;
  return {...m,sessions,feedback,goals};
}


export async function listMyMentorshipRequests(userId){
 const db=getPool();
 return (await db.query("select id,mentee_user_id,preferred_mentor_user_id,goals,topics,preferred_modes,preferred_languages,preferred_days,status,share_with_eligible_mentors,created_at,updated_at from mentorship_request where mentee_user_id=$1 order by created_at desc",[userId])).rows;
}


export async function listMyMentorshipMatches(userId){
 const db=getPool();
 return (await db.query(`select mm.id,mm.request_id,mm.mentor_user_id,mm.mentee_user_id,mm.score,mm.match_reasons,mm.status,mm.mentee_consent_status,mm.mentee_response_note,mm.proposed_at,mr.goals,pm.display_name mentor_name,pe.display_name mentee_name,
 case when mm.mentor_user_id=$1 then 'mentor' else 'mentee' end match_role
 from mentorship_match mm join mentorship_request mr on mr.id=mm.request_id
 join person pm on pm.user_id=mm.mentor_user_id join person pe on pe.user_id=mm.mentee_user_id
 where (mm.mentor_user_id=$1 and (mm.status='proposed' or (mm.status='accepted' and mm.mentee_consent_status='pending')))
    or (mm.mentee_user_id=$1 and mm.status='accepted' and mm.mentee_consent_status='pending')
 order by mm.proposed_at desc`,[userId])).rows;
}
export async function listMyMentorships(userId){
 const db=getPool();
 return (await db.query(`select m.*,pm.display_name mentor_name,pe.display_name mentee_name
 from mentorship m join person pm on pm.user_id=m.mentor_user_id join person pe on pe.user_id=m.mentee_user_id
 where m.mentor_user_id=$1 or m.mentee_user_id=$1 order by m.created_at desc`,[userId])).rows;
}


export async function getMyMentorProfile(userId){
 const db=getPool();
 try { await assertProfessionalIdentity(db,userId); }
 catch(cause) { throw error(cause.statusCode||403,cause.message||"A personal professional account is required to access mentor profile settings.",cause.code||"PROFESSIONAL_PROFILE_FORBIDDEN"); }
 const profile=(await db.query("select mp.*,p.display_name from mentor_profile mp join person p on p.user_id=mp.user_id where mp.user_id=$1",[userId])).rows[0];
 if(!profile)return null;
 profile.availability=(await db.query("select id,day_of_week,start_time,end_time,timezone,active from mentor_availability where mentor_profile_id=$1 order by day_of_week,start_time",[profile.id])).rows;
 return profile;
}
