import { createHash } from "node:crypto";
import { getPool, withTransaction } from "../platform/db.js";
import { queueWorkflowEmail } from "../platform/email-operations.js";
import { assertCurrentActiveMembership, assertOrganizationCapability, assertProfessionalIdentity, hasCurrentActiveMembership, hasProfessionalIdentity } from "../platform/identity-policy.js";
import { createInAppNotification } from "../platform/notifications.js";

function hashValue(value){return createHash("sha256").update(value).digest("hex");}
function hashPayload(value){return hashValue(JSON.stringify(value));}
function validateImpactPricing({impactModel="standard",pricingModel,priceAmount,referencePriceAmount}) {
 if(!["standard","pro_bono","community_discount","capacity_grant"].includes(impactModel)) throw error(400,"Unsupported impact model.","VALIDATION_ERROR");
 const price=priceAmount===null||priceAmount===undefined||priceAmount===""?null:Number(priceAmount);
 const reference=referencePriceAmount===null||referencePriceAmount===undefined||referencePriceAmount===""?null:Number(referencePriceAmount);
 if(price!==null&&(!Number.isFinite(price)||price<0)) throw error(400,"Price must be a non-negative amount.","VALIDATION_ERROR");
 if(reference!==null&&(!Number.isFinite(reference)||reference<0)) throw error(400,"Reference price must be a non-negative amount.","VALIDATION_ERROR");
 if(impactModel==="pro_bono"&&(pricingModel!=="free"||(price!==null&&price!==0)||reference!==null)) throw error(400,"100% Pro-Bono / Impact requires a free offer and no reference-price claim.","INVALID_IMPACT_PRICING");
 if(impactModel==="community_discount"&&(!["fixed","hourly"].includes(pricingModel)||price===null||price<=0||reference===null||reference<=price)) throw error(400,"Community Discounted Rate requires a positive listed price and a higher documented comparable reference price.","INVALID_IMPACT_PRICING");
 if(impactModel==="capacity_grant"&&reference!==null) throw error(400,"Capacity Grant cannot claim a cash discount without a separately supported pricing model.","INVALID_IMPACT_PRICING");
 return {impactModel,priceAmount:price,referencePriceAmount:reference};
}
function error(status,message,code="BUSINESS_RULE"){ const e=new Error(message); e.statusCode=status; e.code=code; return e; }
function normalizePublicMediaUrl(value,field){
 if(value===undefined||value===null||String(value).trim()==="")return null;
 const raw=String(value).trim();
 if(/[\s"'()\\<>]/.test(raw))throw error(400,field+" must be a valid HTTPS URL.","VALIDATION_ERROR");
 let parsed;try{parsed=new URL(raw);}catch{throw error(400,field+" must be a valid HTTPS URL.","VALIDATION_ERROR");}
 if(parsed.protocol!=="https:"||parsed.username||parsed.password||!parsed.hostname)throw error(400,field+" must be a valid HTTPS URL without embedded credentials.","VALIDATION_ERROR");
 return parsed.toString();
}
const PUBLIC_VIDEO_HOSTS=new Set(["youtube.com","www.youtube.com","m.youtube.com","youtube-nocookie.com","www.youtube-nocookie.com","youtu.be","vimeo.com","www.vimeo.com","player.vimeo.com"]);
export function normalizePublicVideoUrl(value,field="Video URL"){
 if(value===undefined||value===null||String(value).trim()==="")return null;
 const raw=String(value).trim();
 if (/\s|["'()\\<>]/.test(raw)) throw error(400,field+" must be a valid HTTPS video page URL.","VALIDATION_ERROR");
 let parsed;try{parsed=new URL(raw);}catch{throw error(400,field+" must be a valid HTTPS video page URL.","VALIDATION_ERROR");}
 if(parsed.protocol!=="https:"||parsed.username||parsed.password||!PUBLIC_VIDEO_HOSTS.has(parsed.hostname.toLowerCase())||!parsed.pathname||parsed.pathname==="/")throw error(400,field+" must be a public YouTube or Vimeo video page URL without embedded credentials.","VALIDATION_ERROR");
 return parsed.toString();
}

const ENGAGEMENT_UPDATE_CATEGORIES=new Set(["progress","schedule_change","delivery_note","blocker","handover"]);
const FEEDBACK_CATEGORIES=new Set(["service_quality","communication","timeliness","outcome","accessibility","other"]);
function validateCommunityText(value,{field="Text",min=10,max=2000}={}){
 const text=String(value??"").trim();
 if(text.length<min||text.length>max)throw error(400,`${field} must be ${min}–${max} characters.`,"VALIDATION_ERROR");
 const contactPatterns=[
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /(?:https?:\/\/|www\.)\S+/i,
  /(?:telegram|whatsapp|signal|instagram|facebook|tiktok)\s*(?:handle|username|me|us|at)?\s*[:@]\s*[\w.]{3,}/i,
  /(?:^|\s)@[A-Z0-9_.]{3,}\b/i,
  /\b(?:[a-z0-9-]+\.)+(?:com|org|net|io|et|info|co|me|app)\b/i,
  /\b(?:id|passport|account)\s*(?:no\.?|number|#|:)\s*[A-Z0-9-]{5,}\b/i,
  /\b(?:passport number|national id|national identification|medical record|patient record|bank account|account number|diagnosis|medical condition|private address)\b/i
 ];
 const digitMatches=text.match(/(?:\+?\d[\d\s().-]{7,}\d)/g)||[];
 if(contactPatterns.some(pattern=>pattern.test(text))||digitMatches.some(match=>match.replace(/\D/g,"").length>=9))
  throw error(400,"Remove personal contact details, external contact links and sensitive participant information. Use the authorized service/request workflow instead.","SENSITIVE_CONTENT");
 return text;
}
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
export async function assertSessionFitsAvailability(db,mentorUserId,startAt,endAt){
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
 const expiryInput=input.expiresAt===undefined||input.expiresAt===null||input.expiresAt===""?null:new Date(input.expiresAt);
 if(expiryInput && (!Number.isFinite(expiryInput.getTime())||expiryInput.getTime()<=Date.now())) throw error(400,"Expiry must be a valid future date/time or left empty for no expiry.","INVALID_EXPIRY");
 const normalized={userId,organizationId,title:String(input.title||"").trim(),description:String(input.description||"").trim(),serviceCategory:String(input.serviceCategory||"").trim(),deliveryMode:input.deliveryMode||"remote",locationLabel:input.locationLabel||null,pricingModel:input.pricingModel||"quote",priceAmount:input.priceAmount??null,currency:input.currency||null,visibility:input.visibility||"members",maxActiveRequests:input.maxActiveRequests??null,expiresAt:expiryInput?expiryInput.toISOString():null,impactModel:input.impactModel||"standard",referencePriceAmount:input.referencePriceAmount??null,approvedBannerUrl:normalizePublicMediaUrl(input.approvedBannerUrl,"Banner image URL"),approvedBannerAlt:String(input.approvedBannerAlt||"").trim().slice(0,300)||null,videoUrl:normalizePublicVideoUrl(input.videoUrl,"Video URL")};
 if(!normalized.title||!normalized.description||!normalized.serviceCategory) throw error(400,"title, description and serviceCategory are required.","VALIDATION_ERROR");
 if(!["free","fixed","hourly","quote"].includes(normalized.pricingModel)) throw error(400,"Unsupported pricing model.","VALIDATION_ERROR");
 const impact=validateImpactPricing(normalized);
 normalized.priceAmount=impact.priceAmount;normalized.referencePriceAmount=impact.referencePriceAmount;normalized.impactModel=impact.impactModel;
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
  const row=(await db.query("insert into service_listing(provider_user_id,organization_id,title,description,service_category,delivery_mode,location_label,pricing_model,price_amount,currency,visibility,max_active_requests,expires_at,impact_model,reference_price_amount,approved_banner_url,approved_banner_alt,video_url,request_idempotency_hash,request_fingerprint) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) on conflict do nothing returning *",[userId,organizationId,normalized.title,normalized.description,normalized.serviceCategory,normalized.deliveryMode,normalized.locationLabel,normalized.pricingModel,normalized.priceAmount,normalized.currency,normalized.visibility,normalized.maxActiveRequests,normalized.expiresAt,normalized.impactModel,normalized.referencePriceAmount,normalized.approvedBannerUrl,normalized.approvedBannerAlt,normalized.videoUrl,keyHash,fingerprint])).rows[0];
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
    if(row.status==="closed" || ["fulfilled","archived"].includes(row.lifecycle_status)) throw error(409,"Fulfilled or archived service listings cannot be edited or silently reopened.","INVALID_STATE");
    const expiryInput=input.expiresAt===undefined||input.expiresAt===null||input.expiresAt===""?null:new Date(input.expiresAt);
    if(expiryInput && (!Number.isFinite(expiryInput.getTime())||expiryInput.getTime()<=Date.now())) throw error(400,"Expiry must be a valid future date/time or left empty for no expiry.","INVALID_EXPIRY");
    const impactModel=input.impactModel===undefined?row.impact_model||"standard":String(input.impactModel);
    const pricingModel=input.pricingModel===undefined?row.pricing_model:input.pricingModel;
    const priceAmount=input.priceAmount===undefined?row.price_amount:input.priceAmount;
    const referencePriceAmount=input.referencePriceAmount===undefined?row.reference_price_amount:input.referencePriceAmount;
    const impact=validateImpactPricing({impactModel,pricingModel,priceAmount,referencePriceAmount});
    const updated=(await db.query("update service_listing set status='draft',lifecycle_status='draft',moderation_status='pending',moderation_note=null,moderated_by=null,moderated_at=null,title=coalesce($1,title),description=coalesce($2,description),service_category=coalesce($3,service_category),delivery_mode=coalesce($4,delivery_mode),location_label=coalesce($5,location_label),pricing_model=coalesce($6,pricing_model),price_amount=$7,currency=coalesce($8,currency),visibility=coalesce($9,visibility),max_active_requests=coalesce($10,max_active_requests),expires_at=case when $11::boolean then null else coalesce($12,expires_at) end,impact_model=$14,reference_price_amount=$15,approved_banner_url=case when $16::boolean then $17 else approved_banner_url end,approved_banner_alt=case when $18::boolean then $19 else approved_banner_alt end,video_url=case when $20::boolean then $21 else video_url end,updated_at=now() where id=$13 returning *",[input.title||null,input.description||null,input.serviceCategory||null,input.deliveryMode||null,input.locationLabel||null,input.pricingModel||null,impact.priceAmount,input.currency||null,input.visibility||null,input.maxActiveRequests??null,input.clearExpiry===true,expiryInput?expiryInput.toISOString():null,listingId,impact.impactModel,impact.referencePriceAmount,input.approvedBannerUrl!==undefined,input.approvedBannerUrl===undefined?null:normalizePublicMediaUrl(input.approvedBannerUrl,"Banner image URL"),input.approvedBannerAlt!==undefined,input.approvedBannerAlt===undefined?null:(String(input.approvedBannerAlt||"").trim().slice(0,300)||null),input.videoUrl!==undefined,input.videoUrl===undefined?null:normalizePublicVideoUrl(input.videoUrl,"Video URL")])).rows[0];
    if((row.lifecycle_status||"draft")!=="draft") await db.query("insert into service_listing_lifecycle_event(listing_id,actor_user_id,from_status,to_status,reason,request_id) values($1,$2,$3,'draft',$4,$5)",[listingId,userId,row.lifecycle_status||row.status,"Listing terms edited; moderation review required.",requestId]);
    await audit(db,userId,"service.listing_updated","service_listing",listingId,requestId,{from:row.lifecycle_status||row.status,to:"draft",requiresModeration:true});
    return updated;
  });
}

export async function changeServiceListingStatus(listingId,userId,status,requestId,reason=""){
  if(!["draft","published","paused","closed","fulfilled","archived"].includes(status)) throw error(400,"Unsupported service listing status.","VALIDATION_ERROR");
  return withTransaction(async db=>{
    const row=(await db.query("select * from service_listing where id=$1 for update",[listingId])).rows[0];
    if(!row) throw error(404,"Service listing not found.","NOT_FOUND");
    const organization=await assertServiceListingAccess(db,row,userId);
    const currentLifecycleStatus=row.lifecycle_status||({published:"active",paused:"paused",closed:"archived"}[row.status]||"draft");
    if(status==="fulfilled"&&(row.fulfilment_rule||"manual")!=="manual"){
      const completed=Number((await db.query("select count(*)::int count from service_request where service_listing_id=$1 and status='completed' and requester_accepted_at is not null",[listingId])).rows[0].count);
      const target=row.fulfilment_rule==="single_engagement"?1:Number(row.fulfilment_target_count||1);
      if(completed<target)throw error(409,"This listing can be fulfilled only after its configured number of requester-accepted engagements is reached.","FULFILMENT_RULE_NOT_MET");
    }
    const requestedLifecycleStatus=status==="published"?"active":status==="paused"?"paused":status==="closed"?"archived":status;
    if(currentLifecycleStatus===requestedLifecycleStatus && (status!=="published"||row.moderation_status==="approved")) return {...row,idempotent:true};
    if(status==="published" && currentLifecycleStatus==="pending_review" && !["approved","rejected"].includes(row.moderation_status)) return {...row,idempotent:true};
    if(row.status==="closed" && !["closed","archived"].includes(status)) throw error(409,"Closed service listings cannot be reopened.","INVALID_STATE");
    if(["fulfilled","archived","closed"].includes(status) && String(reason||"").trim().length<4) throw error(400,"A reason of at least four characters is required to fulfil or archive a listing.","LIFECYCLE_REASON_REQUIRED");
    if(status==="published" && row.moderation_status!=="approved"){
      if(row.moderation_status==="rejected") throw error(409,"This listing was rejected and cannot be resubmitted. Create a new listing if the offer has materially changed.","LISTING_REJECTED");
      if(row.organization_id && organization?.verification_status!=="verified") throw error(409,"The organization must be verified before it can submit a service listing.","ORGANIZATION_NOT_VERIFIED");
      if(!row.organization_id && !(await activeMember(db,userId))) throw error(403,"A current active membership is required to submit a service listing.","MEMBERSHIP_REQUIRED");
      const submitted=(await db.query("update service_listing set status='draft',lifecycle_status='pending_review',moderation_status='pending',moderation_note=null,moderated_by=null,moderated_at=null,updated_at=now() where id=$1 returning *",[listingId])).rows[0];
      await db.query("insert into service_listing_lifecycle_event(listing_id,actor_user_id,from_status,to_status,reason,request_id) values($1,$2,$3,'pending_review',$4,$5)",[listingId,userId,row.lifecycle_status||null,"Submitted for moderation.",requestId]);
      await audit(db,userId,"service.listing_submitted_for_review","service_listing",listingId,requestId,{from:row.lifecycle_status||row.status,to:"pending_review"});
      await notify(db,userId,"service.listing_submitted_for_review","service_listing",listingId,{message:"Your service listing was submitted for moderation.",nextAction:"Monitor the listing for the moderator's decision or requested changes.",actionUrl:"/services/"+listingId,eventVersion:submitted.updated_at||requestId||listingId});
      const moderators=(await db.query("select distinct u.id user_id from app_user u where u.status='active' and (exists(select 1 from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=u.id and r.role_code in ('supporting_staff','system_admin')) or exists(select 1 from app_user_permission up where up.user_id=u.id and up.permission_code='marketplace.moderate'))")).rows;
      for(const moderator of moderators)await notify(db,moderator.user_id,"service.listing_review_required","service_listing",listingId,{message:"A professional service listing is awaiting moderation.",nextAction:"Review the listing in the existing marketplace moderation queue and approve or reject it with a reason.",actionUrl:"/admin/marketplace",reviewerQueue:true,actionRequired:true,priority:"high",from:row.status,to:"draft",eventVersion:submitted.updated_at||requestId||listingId});
      return submitted;
    }
    if(status==="published" && row.organization_id && organization?.verification_status!=="verified") throw error(409,"The organization must be verified before it can publish a service listing.","ORGANIZATION_NOT_VERIFIED");
    if(status==="published" && !row.organization_id && !(await activeMember(db,userId))) throw error(403,"A current active membership is required to publish a service.","MEMBERSHIP_REQUIRED");
    const lifecycleStatus=requestedLifecycleStatus;
    const allowedListingTransitions={draft:["draft","active","archived"],pending_review:["draft","active","archived"],active:["active","paused","fulfilled","archived"],paused:["paused","active","archived"],suspended:["suspended","active","archived"],fulfilled:["fulfilled","archived"],archived:["archived"],rejected:["rejected","archived"]};
    if(!(allowedListingTransitions[currentLifecycleStatus]||[]).includes(lifecycleStatus)) throw error(409,"Invalid service listing lifecycle transition.","INVALID_STATE");
    if(currentLifecycleStatus==="suspended"&&lifecycleStatus==="active") throw error(403,"Only an authorized moderator may clear a moderation suspension.","MODERATION_CLEARANCE_REQUIRED");
    const legacyStatus=status==="fulfilled"||status==="archived"?"closed":status;
    const updated=(await db.query("update service_listing set status=$1,lifecycle_status=$2,updated_at=now() where id=$3 returning *",[legacyStatus,lifecycleStatus,listingId])).rows[0];
    if(row.lifecycle_status!==lifecycleStatus){
      await db.query("insert into service_listing_lifecycle_event(listing_id,actor_user_id,from_status,to_status,reason,request_id) values($1,$2,$3,$4,$5,$6)",[listingId,userId,row.lifecycle_status||null,lifecycleStatus,String(reason||`Legacy status transition ${row.status} -> ${status}`).trim(),requestId]);
    }
    await audit(db,userId,"service.listing_status_changed","service_listing",listingId,requestId,{from:row.lifecycle_status||row.status,to:lifecycleStatus,reason:String(reason||"").trim()||null});
    return updated;
  });
}


export async function configureServiceCompletionPolicy(listingId,userId,input,requestIdHeader){
  const evidencePolicy=String(input.evidencePolicy||"");
  const fulfilmentRule=String(input.fulfilmentRule||"");
  const target=Number(input.fulfilmentTargetCount??1);
  if(!["accepted_delivery","private_file","description_only"].includes(evidencePolicy))throw error(400,"Choose an allowed completion evidence policy.","VALIDATION_ERROR");
  if(!["manual","single_engagement","engagement_count"].includes(fulfilmentRule))throw error(400,"Choose an allowed listing fulfilment rule.","VALIDATION_ERROR");
  if(!Number.isInteger(target)||target<1||target>1000000)throw error(400,"Fulfilment target must be a whole number from 1 to 1,000,000.","VALIDATION_ERROR");
  if(fulfilmentRule==="single_engagement"&&target!==1)throw error(400,"Single-engagement fulfilment must have a target of one.","VALIDATION_ERROR");
  return withTransaction(async db=>{
    const row=(await db.query("select * from service_listing where id=$1 for update",[listingId])).rows[0];
    if(!row)throw error(404,"Service listing not found.","NOT_FOUND");
    await assertServiceListingAccess(db,row,userId);
    if(["fulfilled","archived","rejected"].includes(row.lifecycle_status))throw error(409,"Completion and fulfilment policy cannot be changed on a closed listing.","INVALID_STATE");
    const updated=(await db.query("update service_listing set completion_evidence_policy=$1,fulfilment_rule=$2,fulfilment_target_count=$3,updated_at=now() where id=$4 returning id,completion_evidence_policy,fulfilment_rule,fulfilment_target_count",[evidencePolicy,fulfilmentRule,target,listingId])).rows[0];
    await audit(db,userId,"service.listing_completion_policy_changed","service_listing",listingId,requestIdHeader,{evidencePolicy,fulfilmentRule,fulfilmentTargetCount:target});
    return updated;
  });
}

export async function acceptServiceAgreement(requestId,userId,requestIdHeader){
 return withTransaction(async db=>{
  const r=(await db.query("select sr.*,sl.organization_id,sl.pricing_model listing_pricing_model,sl.price_amount listing_price_amount,sl.currency listing_currency,sl.completion_evidence_policy listing_completion_evidence_policy,sl.impact_model listing_impact_model,sl.fulfilment_rule listing_fulfilment_rule,sl.fulfilment_target_count listing_fulfilment_target_count from service_request sr join service_listing sl on sl.id=sr.service_listing_id where sr.id=$1 for update of sr",[requestId])).rows[0];
  if(!r)throw error(404,"Service request not found.","NOT_FOUND");
  if(r.requester_user_id!==userId)throw error(403,"Only the requester can confirm agreement to the provider's terms.","FORBIDDEN");
  if(r.status!=="accepted")throw error(409,"The provider must accept the request before the requester can confirm the agreement.","INVALID_STATE");
  const agreement=(await db.query("select * from service_request_agreement where request_id=$1 order by terms_version desc limit 1 for update",[requestId])).rows[0];
  if(!agreement||!agreement.provider_accepted_at)throw error(409,"Provider acceptance and a persisted terms version are required.","AGREEMENT_REQUIRED");
  if(agreement.requester_accepted_at){
   if(agreement.requester_accepted_by!==userId)throw error(409,"The current terms acceptance belongs to another actor.","AGREEMENT_CONFLICT");
   return {...agreement,idempotent:true,nextAction:"Both parties have accepted these terms. The provider may start delivery."};
  }
  const accepted=(await db.query("update service_request_agreement set requester_accepted_by=$1,requester_accepted_at=now() where id=$2 and requester_accepted_at is null returning *",[userId,agreement.id])).rows[0];
  if(!accepted)throw error(409,"The agreement changed concurrently. Reload and review the current terms.","AGREEMENT_CONFLICT");
  await db.query("insert into service_request_event(request_id,actor_user_id,from_status,to_status,note) values($1,$2,$3,$3,$4)",[requestId,userId,r.status,"Requester accepted persisted terms version "+agreement.terms_version]);
  await audit(db,userId,"service.request_agreement_accepted","service_request",requestId,requestIdHeader,{termsVersion:agreement.terms_version,termsHash:agreement.terms_hash});
  await notify(db,r.provider_user_id,"service.request_agreement_accepted","service_request",requestId,{message:"The requester accepted the same persisted service terms.",nextAction:"Start delivery when ready."});
  return {...accepted,idempotent:false,nextAction:"Both parties have accepted these terms. The provider may start delivery."};
 });
}

export async function createServiceListingInterest(listingId,userId,input={},requestId){
 return withTransaction(async db=>{
  const listing=(await db.query("select * from service_listing where id=$1 for update",[listingId])).rows[0];
  if(!listing)throw error(404,"Service listing not found.","NOT_FOUND");
  if(listing.lifecycle_status!=="active"||listing.status!=="published"||listing.moderation_status!=="approved"||(listing.expires_at&&new Date(listing.expires_at)<=new Date()))throw error(409,"This listing is not accepting new interest.","LISTING_NOT_ACTIVE");
  const organizationId=input.organizationId||null;
  if(listing.visibility!=="public" && !(await activeMember(db,userId)))throw error(403,"An active membership is required to express interest in this listing.","MEMBERSHIP_REQUIRED");
  if(listing.provider_user_id===userId || (listing.organization_id && (await db.query("select 1 from organization_membership where organization_id=$1 and user_id=$2 and status='active' and role_code=any($3::text[]) limit 1",[listing.organization_id,userId,["owner","administrator","recruiter","project_manager"]])).rowCount))throw error(400,"A listing owner cannot express interest in their own program.","SELF_INTEREST");
  if(organizationId){
   if(listing.organization_id===organizationId||listing.provider_user_id===userId)throw error(400,"A listing owner cannot express interest in their own program.","SELF_INTEREST");
   try{await assertOrganizationCapability(db,organizationId,userId);}catch(cause){throw error(cause.statusCode||403,cause.message||"Authorized active organization membership is required.",cause.code||"ORGANIZATION_FORBIDDEN");}
  }else if(listing.organization_id===null&&listing.provider_user_id===userId)throw error(400,"A listing owner cannot express interest in their own program.","SELF_INTEREST");
  const q=organizationId
   ? await db.query("insert into service_listing_interest(listing_id,organization_id,actor_user_id,status) values($1,$2,$3,'interested') on conflict do nothing returning *",[listingId,organizationId,userId])
   : await db.query("insert into service_listing_interest(listing_id,individual_user_id,actor_user_id,status) values($1,$2,$2,'interested') on conflict do nothing returning *",[listingId,userId]);
  const row=q.rows[0]|| (organizationId?(await db.query("select * from service_listing_interest where listing_id=$1 and organization_id=$2 and status='interested'",[listingId,organizationId])).rows[0]:(await db.query("select * from service_listing_interest where listing_id=$1 and individual_user_id=$2 and status='interested'",[listingId,userId])).rows[0]);
  if(!row)throw error(409,"Interest changed concurrently. Reload and try again.","INTEREST_CONFLICT");
  if(q.rows[0]){
   await audit(db,userId,"service.listing_interest_created","service_listing_interest",row.id,requestId,{listingId,organizationId:organizationId||null});
   const recipients=listing.organization_id?(await db.query("select user_id from organization_membership where organization_id=$1 and status='active' and role_code=any($2::text[])",[listing.organization_id,["owner","administrator","recruiter","project_manager"]])).rows.map(x=>x.user_id):[listing.provider_user_id];
   for(const recipient of new Set(recipients))if(recipient&&recipient!==userId)await notify(db,recipient,"service.listing_interest_created","service_listing_interest",row.id,{message:"A member or organization expressed interest in your community service.",nextAction:"Review the program's aggregate interest and decide whether to follow up through the formal service workflow.",actionUrl:"/services/"+listingId,actionRequired:false});
  }
  return {...row,idempotent:!q.rows[0]};
 });
}

export async function withdrawServiceListingInterest(interestId,userId,reason,requestId){
 return withTransaction(async db=>{
  const row=(await db.query("select * from service_listing_interest where id=$1 for update",[interestId])).rows[0];
  if(!row)throw error(404,"Interest record not found.","NOT_FOUND");
  let authorized=row.actor_user_id===userId;
  if(row.organization_id){try{await assertOrganizationCapability(db,row.organization_id,userId);authorized=true;}catch{authorized=false;}}
  if(!authorized)throw error(403,"Only the original actor or an authorized organization manager may withdraw this interest.","FORBIDDEN");
  if(row.status==="withdrawn")return {...row,idempotent:true};
  if(row.status!=="interested")throw error(409,"Only active interest can be withdrawn.","INVALID_STATE");
  const updated=(await db.query("update service_listing_interest set status='withdrawn',updated_at=now() where id=$1 and status='interested' returning *",[interestId])).rows[0];
  if(!updated)throw error(409,"Interest changed concurrently. Reload and try again.","INTEREST_CONFLICT");
  await audit(db,userId,"service.listing_interest_withdrawn","service_listing_interest",interestId,requestId,{reason:String(reason||"").trim()||null});
  return updated;
 });
}

export async function createServiceListingPledge(listingId,userId,input={},requestId,idempotencyKey=null){
 const description=String(input.description||"").trim();
 if(description.length<4)throw error(400,"A pledge description of at least four characters is required.","VALIDATION_ERROR");
 if(typeof idempotencyKey!=="string"||!/^[A-Za-z0-9_-]{32,200}$/.test(idempotencyKey))throw error(400,"This form needs a secure submission key. Reload the form and try again.","IDEMPOTENCY_KEY_REQUIRED");
 const organizationId=input.organizationId||null;
 const fingerprint=hashPayload({listingId,userId,organizationId,description}),keyHash=hashValue(idempotencyKey);
 return withTransaction(async db=>{
  const existing=(await db.query("select * from service_listing_pledge where request_idempotency_hash=$1 for update",[keyHash])).rows[0];
  if(existing){if(existing.request_fingerprint!==fingerprint)throw error(409,"This submission key was already used for different pledge details.","IDEMPOTENCY_KEY_CONFLICT");return {...existing,idempotent:true,replayed:true};}
  const listing=(await db.query("select * from service_listing where id=$1 for update",[listingId])).rows[0];
  if(!listing)throw error(404,"Service listing not found.","NOT_FOUND");
  if(listing.lifecycle_status!=="active"||listing.status!=="published"||listing.moderation_status!=="approved"||(listing.expires_at&&new Date(listing.expires_at)<=new Date()))throw error(409,"This listing is not accepting pledges.","LISTING_NOT_ACTIVE");
  if(listing.visibility!=="public" && !(await activeMember(db,userId)))throw error(403,"An active membership is required to pledge support to this listing.","MEMBERSHIP_REQUIRED");
  if(listing.provider_user_id===userId || (listing.organization_id && (await db.query("select 1 from organization_membership where organization_id=$1 and user_id=$2 and status='active' and role_code=any($3::text[]) limit 1",[listing.organization_id,userId,["owner","administrator","recruiter","project_manager"]])).rowCount))throw error(400,"A listing owner cannot pledge support to their own program.","SELF_PLEDGE");
  if(organizationId){
   if(listing.organization_id===organizationId||listing.provider_user_id===userId)throw error(400,"A listing owner cannot pledge support to their own program.","SELF_PLEDGE");
   try{await assertOrganizationCapability(db,organizationId,userId);}catch(cause){throw error(cause.statusCode||403,cause.message||"Authorized active organization membership is required.",cause.code||"ORGANIZATION_FORBIDDEN");}
  }else if(listing.organization_id===null&&listing.provider_user_id===userId)throw error(400,"A listing owner cannot pledge support to their own program.","SELF_PLEDGE");
  const row=(await db.query("insert into service_listing_pledge(listing_id,individual_user_id,organization_id,actor_user_id,description,status,request_idempotency_hash,request_fingerprint) values($1,$2,$3,$4,$5,'submitted',$6,$7) on conflict do nothing returning *",[listingId,organizationId?null:userId,organizationId,userId,description,keyHash,fingerprint])).rows[0];
  if(!row){const raced=(await db.query("select * from service_listing_pledge where request_idempotency_hash=$1 for update",[keyHash])).rows[0];if(!raced||raced.request_fingerprint!==fingerprint)throw error(409,"This submission key was already used for different pledge details.","IDEMPOTENCY_KEY_CONFLICT");return {...raced,idempotent:true,replayed:true};}
  await audit(db,userId,"service.listing_pledge_submitted","service_listing_pledge",row.id,requestId,{listingId,organizationId:organizationId||null});
  const recipients=listing.organization_id?(await db.query("select user_id from organization_membership where organization_id=$1 and status='active' and role_code=any($2::text[])",[listing.organization_id,["owner","administrator","recruiter","project_manager"]])).rows.map(x=>x.user_id):[listing.provider_user_id];
  for(const recipient of new Set(recipients))if(recipient&&recipient!==userId)await notify(db,recipient,"service.listing_pledge_submitted","service_listing_pledge",row.id,{message:"A new pledge of support was submitted for your program.",nextAction:"Review the pledge and accept or decline it with a reason.",actionUrl:"/services/"+row.listing_id,actionRequired:true,priority:"normal"});
  return {...row,idempotent:false,replayed:false};
 });
}

export async function changeServiceListingPledgeStatus(pledgeId,userId,status,reason,requestId){
 if(!["accepted","declined","withdrawn","fulfilled","cancelled"].includes(status))throw error(400,"Unsupported pledge status.","VALIDATION_ERROR");
 return withTransaction(async db=>{
  const row=(await db.query("select p.*,l.provider_user_id,l.organization_id listing_organization_id from service_listing_pledge p join service_listing l on l.id=p.listing_id where p.id=$1 for update of p",[pledgeId])).rows[0];
  if(!row)throw error(404,"Pledge not found.","NOT_FOUND");
  const isPledger=row.actor_user_id===userId;
  let isOwner=row.listing_organization_id?false:row.provider_user_id===userId;
  if(row.listing_organization_id){try{await assertOrganizationCapability(db,row.listing_organization_id,userId);isOwner=true;}catch{isOwner=false;}}
  if(status==="withdrawn"){
   if(!isPledger)throw error(403,"Only the pledge author can withdraw a pledge.","FORBIDDEN");
   if(row.status!=="submitted")throw error(409,"Only a submitted pledge may be withdrawn; accepted pledges require an authorized cancellation decision.","INVALID_STATE");
  }else{
   if(!isOwner)throw error(403,"Only the listing owner or authorized organization manager can decide a pledge.","FORBIDDEN");
   if(!["submitted","accepted"].includes(row.status))throw error(409,"This pledge is no longer awaiting an owner decision or fulfilment.","INVALID_STATE");
   if(["declined","cancelled","fulfilled"].includes(status)&&String(reason||"").trim().length<4)throw error(400,"A reason or evidence summary of at least four characters is required for this pledge decision.","REASON_REQUIRED");
   if(status==="accepted"&&row.status!=="submitted")throw error(409,"Only a submitted pledge can be accepted.","INVALID_STATE");
   if(status==="declined"&&row.status!=="submitted")throw error(409,"Only a submitted pledge can be declined.","INVALID_STATE");
   if(status==="fulfilled"&&row.status!=="accepted")throw error(409,"Only an accepted pledge can be fulfilled.","INVALID_STATE");
   if(status==="cancelled"&&row.status!=="accepted")throw error(409,"Only an accepted pledge can be cancelled.","INVALID_STATE");
  }
  const updated=(await db.query("update service_listing_pledge set status=$1,decision_reason=$2,updated_at=now() where id=$3 returning *",[status,String(reason||"").trim()||null,pledgeId])).rows[0];
  await audit(db,userId,"service.listing_pledge_status_changed","service_listing_pledge",pledgeId,requestId,{from:row.status,to:status,reason:String(reason||"").trim()||null});
  return updated;
 });
}


export async function listMyServiceListingInterestSummary(userId){
 const db=getPool(),roles=["owner","administrator","recruiter","project_manager"];
 return (await db.query(`select s.id listing_id,s.title,
   count(i.id) filter(where i.status='interested' and i.individual_user_id is not null)::int individual_interest_count,
   count(i.id) filter(where i.status='interested' and i.organization_id is not null)::int organization_interest_count,
   count(i.id) filter(where i.status='withdrawn')::int withdrawn_history_count
  from service_listing s left join service_listing_interest i on i.listing_id=s.id
  where (s.organization_id is null and s.provider_user_id=$1)
     or (s.organization_id is not null and exists(select 1 from organization_membership om where om.organization_id=s.organization_id and om.user_id=$1 and om.status='active' and om.role_code=any($2::text[])))
  group by s.id,s.title order by s.updated_at desc`,[userId,roles])).rows;
}

export async function listMyServiceListingPledges(userId){
 const db=getPool(),roles=["owner","administrator","recruiter","project_manager"];
 return (await db.query(`select p.*,s.title service_title,coalesce(pledged_org.display_name,actor_person.display_name) pledged_by_display_name,pledged_org.display_name pledged_organization_name
  from service_listing_pledge p join service_listing s on s.id=p.listing_id
  left join person actor_person on actor_person.user_id=p.actor_user_id
  left join organization pledged_org on pledged_org.id=p.organization_id
  where (s.organization_id is null and s.provider_user_id=$1)
     or (s.organization_id is not null and exists(select 1 from organization_membership om where om.organization_id=s.organization_id and om.user_id=$1 and om.status='active' and om.role_code=any($2::text[])))
  order by p.created_at desc`,[userId,roles])).rows;
}

export async function createServiceListingAnnouncement(listingId,userId,input,requestId,idempotencyKey=null){
 if(typeof idempotencyKey!=="string"||!/^[A-Za-z0-9_-]{32,200}$/.test(idempotencyKey))throw error(400,"This announcement needs a secure submission key. Reload and retry.","IDEMPOTENCY_KEY_REQUIRED");
 const title=validateCommunityText(input.title,{field:"Announcement title",min:4,max:180}),body=validateCommunityText(input.body,{field:"Announcement body",min:10,max:8000}),audience=String(input.audience||"");
 if(!["public","members"].includes(audience))throw error(400,"Listing announcements must target public or active members. Engagement-only updates belong on the specific service request.","INVALID_ANNOUNCEMENT_AUDIENCE");
 const keyHash=hashValue(idempotencyKey),fingerprint=hashPayload({listingId,userId,title,body,audience});
 return withTransaction(async db=>{
  const listing=(await db.query("select * from service_listing where id=$1 for update",[listingId])).rows[0];
  if(!listing)throw error(404,"Service listing not found.","NOT_FOUND");
  await assertServiceListingAccess(db,listing,userId);
  const existing=(await db.query("select * from service_listing_announcement where request_idempotency_hash=$1 for update",[keyHash])).rows[0];
  if(existing){if(existing.listing_id!==listingId||existing.author_user_id!==userId||existing.request_fingerprint!==fingerprint)throw error(409,"This announcement key was already used for different content.","IDEMPOTENCY_KEY_CONFLICT");return {...existing,idempotent:true,replayed:true};}
  if(!["active","paused"].includes(listing.lifecycle_status)||listing.moderation_status!=="approved"||!["published","paused"].includes(listing.status))throw error(409,"Announcements can only be created for approved active or paused programs.","LISTING_NOT_ACTIVE");
  const row=(await db.query("insert into service_listing_announcement(listing_id,author_user_id,audience,status,title,body,request_idempotency_hash,request_fingerprint) values($1,$2,$3,'draft',$4,$5,$6,$7) returning *",[listingId,userId,audience,title,body,keyHash,fingerprint])).rows[0];
  await audit(db,userId,"service.listing_announcement_created","service_listing_announcement",row.id,requestId,{listingId,audience,status:"draft"});
  return {...row,idempotent:false,replayed:false,nextAction:"Submit the announcement for review before it is published."};
 });
}

export async function changeServiceListingAnnouncementStatus(announcementId,userId,status,reason,requestId){
 if(!["pending_review","published","rejected","archived"].includes(status))throw error(400,"Unsupported announcement transition.","VALIDATION_ERROR");
 const note=String(reason||"").trim();
 if(note.length<4)throw error(400,"Provide a reason of at least four characters for this announcement action.","REASON_REQUIRED");
 return withTransaction(async db=>{
  const announcement=(await db.query("select * from service_listing_announcement where id=$1 for update",[announcementId])).rows[0];
  if(!announcement)throw error(404,"Announcement not found.","NOT_FOUND");
  const listing=(await db.query("select * from service_listing where id=$1 for update",[announcement.listing_id])).rows[0];
  if(!listing)throw error(404,"Service listing not found.","NOT_FOUND");
  const owner=listing.provider_user_id===userId || Boolean(listing.organization_id && (await db.query("select 1 from organization_membership where organization_id=$1 and user_id=$2 and status='active' and role_code=any($3::text[]) limit 1",[listing.organization_id,userId,["owner","administrator","recruiter","project_manager"]])).rowCount);
  const moderator=Boolean((await db.query("select 1 where exists(select 1 from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1 and r.role_code in ('supporting_staff','system_admin')) or exists(select 1 from app_user_permission up where up.user_id=$1 and up.permission_code='marketplace.moderate')",[userId])).rows[0]);
  if(["published","rejected"].includes(status)){
   if(!moderator)throw error(403,"Only an authorized moderator can publish or reject an announcement.","FORBIDDEN");
   if(status==="published"&&(!["active","paused"].includes(listing.lifecycle_status)||listing.status!=="published"||listing.moderation_status!=="approved"))throw error(409,"Announcements can only be published for a currently approved active or paused program.","LISTING_NOT_ACTIVE");
   if(announcement.status!=="pending_review")throw error(409,"Only announcements pending review can be published or rejected.","INVALID_STATE");
  }else{
   if(!owner)throw error(403,"Only the listing owner or authorized organization manager can submit or archive this announcement.","FORBIDDEN");
   const allowed= status==="pending_review"?["draft"]:["draft","pending_review","published","rejected"];
   if(!allowed.includes(announcement.status))throw error(409,"Invalid announcement lifecycle transition.","INVALID_STATE");
   if(status==="archived"&&["published","rejected"].includes(announcement.status)===false&&announcement.status!=="draft"&&announcement.status!=="pending_review")throw error(409,"Invalid announcement archive transition.","INVALID_STATE");
  }
  if(announcement.status===status)return {...announcement,idempotent:true};
  const updated=(await db.query("update service_listing_announcement set status=$1,moderation_reason=$2,moderated_by=case when $3 then $4 else moderated_by end,moderated_at=case when $3 then now() else moderated_at end,updated_at=now() where id=$5 returning *",[status,note,["published","rejected"].includes(status),userId,announcementId])).rows[0];
  await audit(db,userId,"service.listing_announcement_status_changed","service_listing_announcement",announcementId,requestId,{listingId:listing.id,from:announcement.status,to:status,reason:note,audience:announcement.audience});
  if(["published","rejected"].includes(status))await notify(db,announcement.author_user_id,status==="published"?"service.listing_announcement_published":"service.listing_announcement_rejected","service_listing_announcement",announcementId,{message:status==="published"?"Your announcement was published.":"Your announcement was not approved.",nextAction:status==="published"?"Review the published announcement.":"Review the moderator reason and revise if permitted.",actionUrl:"/services/"+listing.id,reason:note});
  return updated;
 });
}

export async function listPublicServiceAnnouncements(viewerId=null,{limit=30}={}){
 const db=getPool(),n=Math.min(Math.max(Number.parseInt(limit,10)||30,1),100);
 return (await db.query(`select a.id,a.listing_id,s.title listing_title,a.author_user_id,a.audience,a.status,a.title,a.body,a.created_at,a.updated_at
 from service_listing_announcement a join service_listing s on s.id=a.listing_id
 where a.status='published' and s.status='published' and s.moderation_status='approved' and s.lifecycle_status='active'
   and (s.expires_at is null or s.expires_at>now())
   and (
    (a.audience='public' and (s.visibility='public' or ($1::uuid is not null and s.visibility='members' and exists(select 1 from membership_record vm where vm.user_id=$1 and vm.status='active' and vm.start_date<=current_date and (vm.end_date is null or vm.end_date>=current_date)))))
    or (a.audience='members' and $1::uuid is not null and exists(select 1 from membership_record m where m.user_id=$1 and m.status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)))
   )
 order by a.created_at desc,a.id desc limit $2`,[viewerId||null,n])).rows;
}

export async function listServiceListingAnnouncements(listingId,viewerId=null){
 const db=getPool();
 const rows=(await db.query(`select a.id,a.listing_id,a.author_user_id,a.audience,a.status,a.title,a.body,a.moderation_reason,a.moderated_by,a.moderated_at,a.created_at,a.updated_at
 from service_listing_announcement a join service_listing s on s.id=a.listing_id
 where a.listing_id=$1 and (
  (a.status='published' and s.status='published' and s.lifecycle_status='active' and (s.expires_at is null or s.expires_at>now()) and (
   (a.audience='public' and (s.visibility='public' or ($2::uuid is not null and s.visibility='members' and exists(select 1 from membership_record vm where vm.user_id=$2 and vm.status='active' and vm.start_date<=current_date and (vm.end_date is null or vm.end_date>=current_date)))))
   or (a.audience='members' and $2::uuid is not null and exists(select 1 from membership_record m where m.user_id=$2 and m.status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)))
  ))
  or ($2::uuid is not null and (a.author_user_id=$2 or s.provider_user_id=$2 or exists(select 1 from organization_membership om where om.organization_id=s.organization_id and om.user_id=$2 and om.status='active' and om.role_code=any(array['owner','administrator','recruiter','project_manager']::text[]))))
 ) order by a.created_at desc`,[listingId,viewerId||null])).rows;
 return rows;
}

export async function listServices(viewerId=null,filters={}){
  const db=getPool(); const args=[viewerId||null]; const where=["s.moderation_status='approved'","((s.lifecycle_status='active' and s.status='published' and (s.expires_at is null or s.expires_at>now())) or (s.lifecycle_status in ('fulfilled','archived') and s.status='closed'))","((s.organization_id is not null and exists (select 1 from organization o where o.id=s.organization_id and o.verification_status='verified')) or (s.organization_id is null and exists (select 1 from membership_record m where m.user_id=s.provider_user_id and m.status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date))))","(s.visibility='public' or ($1::uuid is not null and s.visibility='members' and exists(select 1 from membership_record vm where vm.user_id=$1 and vm.status='active' and vm.start_date<=current_date and (vm.end_date is null or vm.end_date>=current_date))))"];
  if(filters.category){ args.push(String(filters.category)); where.push(`s.service_category=$${args.length}`); }
  if(filters.q){ args.push(`%${String(filters.q).trim()}%`); where.push(`(s.title ilike $${args.length} or s.description ilike $${args.length} or s.service_category ilike $${args.length})`); }
  const limit=Math.min(Math.max(Number(filters.limit)||25,1),100),offset=Math.max(Number(filters.offset)||0,0);
  const rows=(await db.query(`select s.id,s.provider_user_id,s.organization_id,s.title,s.description,s.service_category,s.delivery_mode,s.location_label,s.pricing_model,s.price_amount,s.currency,s.visibility,s.created_at,s.lifecycle_status,s.expires_at,s.impact_model,s.reference_price_amount,s.approved_banner_url,s.approved_banner_alt,s.video_url,coalesce(o.display_name,p.display_name) display_name,
 (select count(distinct i.organization_id)::int from service_listing_interest i where i.listing_id=s.id and i.status='interested' and i.organization_id is not null) organizations_interested,
 (select count(distinct i.individual_user_id)::int from service_listing_interest i where i.listing_id=s.id and i.status='interested' and i.individual_user_id is not null) users_interested,
 (select count(distinct p.actor_user_id)::int from service_listing_pledge p where p.listing_id=s.id and p.organization_id is null and p.status in ('submitted','accepted')) users_pledged,
 (select count(distinct p.organization_id)::int from service_listing_pledge p where p.listing_id=s.id and p.organization_id is not null and p.status in ('submitted','accepted')) organizations_pledged,
 (select count(distinct r.id)::int from service_request r join lateral (select a.provider_accepted_at,a.requester_accepted_at from service_request_agreement a where a.request_id=r.id order by a.terms_version desc limit 1) ag on true where r.service_listing_id=s.id and r.status in ('accepted','in_progress','completed') and ag.provider_accepted_at is not null and ag.requester_accepted_at is not null) agreed_services,
 (select count(distinct r.id)::int from service_request r join lateral (select a.provider_accepted_at,a.requester_accepted_at from service_request_agreement a where a.request_id=r.id order by a.terms_version desc limit 1) ag on true where r.service_listing_id=s.id and r.status='in_progress' and ag.provider_accepted_at is not null and ag.requester_accepted_at is not null) active_deliveries,
 (select count(distinct r.id)::int from service_request r where r.service_listing_id=s.id and r.status='completed' and r.provider_completed_at is not null and r.requester_accepted_at is not null and length(trim(coalesce(r.outcome_summary,'')))>0 and (s.pricing_model='free' or exists(select 1 from service_payment sp join payment_transaction pt on pt.id=sp.payment_transaction_id where sp.request_id=r.id and sp.status='succeeded' and pt.status='succeeded'))) verified_outcomes from service_listing s left join person p on p.user_id=s.provider_user_id left join organization o on o.id=s.organization_id where ${where.join(" and ")} order by s.created_at desc limit ${limit} offset ${offset}`,args)).rows;
  return {items:rows,limit,offset};
}

export async function getServiceListing(listingId,viewerId=null){
  const db=getPool();
  const row=(await db.query(`select s.*,coalesce(o.display_name,p.display_name) provider_name,
 (select count(distinct i.organization_id)::int from service_listing_interest i where i.listing_id=s.id and i.status='interested' and i.organization_id is not null) organizations_interested,
 (select count(distinct i.individual_user_id)::int from service_listing_interest i where i.listing_id=s.id and i.status='interested' and i.individual_user_id is not null) users_interested,
 (select count(distinct p.actor_user_id)::int from service_listing_pledge p where p.listing_id=s.id and p.organization_id is null and p.status in ('submitted','accepted')) users_pledged,
 (select count(distinct p.organization_id)::int from service_listing_pledge p where p.listing_id=s.id and p.organization_id is not null and p.status in ('submitted','accepted')) organizations_pledged,
 (select count(distinct r.id)::int from service_request r join lateral (select a.provider_accepted_at,a.requester_accepted_at from service_request_agreement a where a.request_id=r.id order by a.terms_version desc limit 1) ag on true where r.service_listing_id=s.id and r.status in ('accepted','in_progress','completed') and ag.provider_accepted_at is not null and ag.requester_accepted_at is not null) agreed_services,
 (select count(distinct r.id)::int from service_request r join lateral (select a.provider_accepted_at,a.requester_accepted_at from service_request_agreement a where a.request_id=r.id order by a.terms_version desc limit 1) ag on true where r.service_listing_id=s.id and r.status='in_progress' and ag.provider_accepted_at is not null and ag.requester_accepted_at is not null) active_deliveries,
 (select count(distinct r.id)::int from service_request r where r.service_listing_id=s.id and r.status='completed' and r.provider_completed_at is not null and r.requester_accepted_at is not null and length(trim(coalesce(r.outcome_summary,'')))>0 and (s.pricing_model='free' or exists(select 1 from service_payment sp join payment_transaction pt on pt.id=sp.payment_transaction_id where sp.request_id=r.id and sp.status='succeeded' and pt.status='succeeded'))) verified_outcomes from service_listing s left join person p on p.user_id=s.provider_user_id left join organization o on o.id=s.organization_id where s.id=$1 and ((s.status='published' and s.lifecycle_status='active' and (s.expires_at is null or s.expires_at>now()) and s.moderation_status='approved') or (s.status='closed' and s.lifecycle_status in ('fulfilled','archived') and s.moderation_status='approved') or ($2::uuid is not null and (s.provider_user_id=$2 or exists(select 1 from organization_membership om where om.organization_id=s.organization_id and om.user_id=$2 and om.status='active' and om.role_code=any(array['owner','administrator','recruiter','project_manager']::text[]))))) and ((s.organization_id is not null and exists (select 1 from organization org where org.id=s.organization_id and org.verification_status='verified')) or (s.organization_id is null and exists (select 1 from membership_record m where m.user_id=s.provider_user_id and m.status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)))) and (s.visibility='public' or ($2::uuid is not null and s.visibility='members' and exists(select 1 from membership_record vm where vm.user_id=$2 and vm.status='active' and vm.start_date<=current_date and (vm.end_date is null or vm.end_date>=current_date))))`,[listingId,viewerId||null])).rows[0];
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
  if(!listing||listing.status!=="published"||listing.lifecycle_status!=="active"||listing.moderation_status!=="approved"||(listing.expires_at&&new Date(listing.expires_at)<=new Date())||listing.visibility==="private") throw error(404,"Service listing is not available.","NOT_FOUND");
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
  for(const recipient of new Set(recipients))if(recipient&&recipient!==requesterId)await queueWorkflowEmail(db,recipient,"professional.workflow_update",{notificationEventCode:"service.request_received",category:"services",title:"New service request",status:"requested",message:"A new service request needs a response.",nextAction:"Review the requested scope and accept, decline or ask for clarification.",actionUrl:"/services?requestId="+ row.id +"#service-request-"+row.id,actionRequired:true,priority:"high"},"service_request",row.id);
  await queueWorkflowEmail(db,requesterId,"professional.workflow_update",{notificationEventCode:"service.request_submitted",category:"services",title:"Service request submitted",status:"requested",message:"Your service request has been recorded.",nextAction:"Track the provider response in your service requests.",actionUrl:"/services?requestId="+ row.id +"#service-request-"+row.id},"service_request",row.id);
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
  return (await db.query("select r.*,s.title service_title,s.service_category,p.display_name requester_name,agreement.terms_version agreement_terms_version,agreement.terms agreement_terms,agreement.provider_accepted_at agreement_provider_accepted_at,agreement.requester_accepted_at agreement_requester_accepted_at,coalesce((select jsonb_agg(jsonb_build_object('fromStatus',e.from_status,'toStatus',e.to_status,'note',e.note,'createdAt',e.created_at) order by e.created_at) from service_request_event e where e.request_id=r.id),'[]'::jsonb) status_history,coalesce((select jsonb_agg(jsonb_build_object('eventType',ce.event_type,'actorUserId',ce.actor_user_id,'note',ce.note,'createdAt',ce.created_at,'outcomeSummary',ce.outcome_summary) order by ce.created_at) from service_request_completion_event ce where ce.request_id=r.id),'[]'::jsonb) completion_history,((s.organization_id is null and r.provider_user_id=$1) or (s.organization_id is not null and exists(select 1 from organization_membership om where om.organization_id=s.organization_id and om.user_id=$1 and om.status='active' and om.role_code=any($2::text[])))) is_provider from service_request r join service_listing s on s.id=r.service_listing_id join person p on p.user_id=r.requester_user_id left join lateral (select a.terms_version,a.terms,a.provider_accepted_at,a.requester_accepted_at from service_request_agreement a where a.request_id=r.id order by a.terms_version desc limit 1) agreement on true where r.requester_user_id=$1 or (s.organization_id is null and r.provider_user_id=$1) or (s.organization_id is not null and exists(select 1 from organization_membership om where om.organization_id=s.organization_id and om.user_id=$1 and om.status='active' and om.role_code=any($2::text[]))) order by r.created_at desc",[userId,orgRoles])).rows;
}

export async function changeServiceRequestStatus(requestId,userId,status,note,requestIdHeader){
  return withTransaction(async db=>{
    const r=(await db.query("select sr.*,sl.organization_id,sl.pricing_model listing_pricing_model,sl.price_amount listing_price_amount,sl.currency listing_currency,sl.completion_evidence_policy listing_completion_evidence_policy,sl.impact_model listing_impact_model,sl.fulfilment_rule listing_fulfilment_rule,sl.fulfilment_target_count listing_fulfilment_target_count from service_request sr join service_listing sl on sl.id=sr.service_listing_id where sr.id=$1 for update of sr",[requestId])).rows[0];
    if(!r) throw error(404,"Service request not found.","NOT_FOUND");
    const providerActor=await isServiceProviderActor(db,requestId,userId);
    if(!providerActor && r.requester_user_id!==userId) throw error(403,"You are not a participant in this service request.","FORBIDDEN");
    if(r.status===status && status!=="completed") return {...r,idempotent:true,nextAction:status==="requested"?"Wait for the provider to respond.":status==="accepted"?"Agree the start date and delivery milestones.":status==="in_progress"?"Review delivery updates; the requester accepts completion after the provider submits it.":status==="disputed"?"Work with the other participant or Support Desk to resolve the issue.":"This request is resolved; create a new request if needed."};
    if(status==="completed"&&r.status==="in_progress"&&r.provider_completed_at&&r.provider_completion_submitted_by&&providerActor)return {...r,idempotent:true,nextAction:"The requester must review the submitted outcome and accept completion."};
    if(r.status==="requested" && !providerActor) throw error(403,"Only the provider can accept or decline a service request.","FORBIDDEN");
    if(r.status==="accepted" && status==="in_progress" && !providerActor) throw error(403,"Only the provider can start service delivery.","FORBIDDEN");
    if(r.status==="disputed" && status==="in_progress" && !providerActor) throw error(403,"Only the provider can resume delivery after the concern is addressed.","FORBIDDEN");
    if(r.status==="disputed"&&status==="in_progress")validateCommunityText(note,{field:"Dispute resolution note",min:4,max:1000});
    if(r.status==="in_progress" && status==="completed" && !providerActor) throw error(403,"Only the provider can mark delivery complete; the requester must accept the outcome separately.","FORBIDDEN");
    if(r.status==="accepted" && status==="cancelled" && !providerActor) {
      // requester cancellation is allowed before delivery starts
    } else if(r.status==="accepted" && status==="cancelled" && providerActor) {
      throw error(409,"The provider cannot cancel an accepted engagement; use the dispute path if delivery is blocked.","INVALID_STATE");
    }
    if(status==="completed"&&r.status==="in_progress"){
      if(String(note||"").trim().length<10) throw error(400,"Provide a meaningful completion summary of at least 10 characters.","COMPLETION_SUMMARY_REQUIRED");
      validateCommunityText(note,{field:"Completion summary",min:10,max:3000});
      const pending=(await db.query("select count(*)::int count from service_request_milestone where request_id=$1 and status not in ('accepted','completed','cancelled')",[requestId])).rows[0].count;
      if(Number(pending)>0) throw error(409,"All active delivery milestones must be accepted or completed before completion.","OUTCOMES_INCOMPLETE");
      const policy=r.listing_completion_evidence_policy||"accepted_delivery";
      const latest=(await db.query("select id,status,file_object_id,created_at from service_request_delivery where request_id=$1 order by created_at desc,id desc limit 1",[requestId])).rows[0];
      const reopened=(await db.query("select created_at from service_request_completion_event where request_id=$1 and event_type='reopened' order by created_at desc limit 1",[requestId])).rows[0];
      if(reopened&&(!latest||new Date(latest.created_at)<=new Date(reopened.created_at)))throw error(409,"A new delivery evidence record is required after dispute resolution before completion can be resubmitted.","DELIVERY_EVIDENCE_REQUIRED");
      if(policy==="accepted_delivery"&&(!latest||latest.status!=="accepted")) throw error(409,"Submit delivery evidence and wait for the requester to accept the latest delivery before submitting completion.","DELIVERY_EVIDENCE_REQUIRED");
      if(policy==="private_file"&&(!latest||latest.status!=="accepted"||!latest.file_object_id)) throw error(409,"This service requires an accepted delivery backed by a private evidence file.","PRIVATE_FILE_EVIDENCE_REQUIRED");
      if(policy==="description_only"&&String(note||"").trim().length<10) throw error(400,"This service requires a meaningful written outcome summary.","COMPLETION_SUMMARY_REQUIRED");
      const previous=(await db.query("select 1 from service_request_completion_event where request_id=$1 and event_type in ('submitted','resubmitted') limit 1",[requestId])).rowCount>0;
      const updated=(await db.query("update service_request set provider_completed_at=now(),provider_completion_submitted_by=$1,provider_note=$2,requester_outcome_decision=null,requester_outcome_decision_by=null,requester_outcome_decision_at=null,requester_outcome_note=null,completion_evidence_delivery_id=$3,updated_at=now() where id=$4 returning *",[userId,String(note).trim(),latest?.id||null,requestId])).rows[0];
      await db.query("insert into service_request_completion_event(request_id,actor_user_id,event_type,outcome_summary,evidence_delivery_id,note) values($1,$2,$3,$4,$5,$6)",[requestId,userId,previous?"resubmitted":"submitted",String(note).trim(),latest?.id||null,String(note).trim()]);
      await db.query("insert into service_request_event(request_id,actor_user_id,from_status,to_status,note) values($1,$2,$3,$4,$5)",[requestId,userId,r.status,r.status,"Provider submitted completion; requester decision is required."]);
      await audit(db,userId,"service.request_completion_submitted","service_request",requestId,requestIdHeader,{status:r.status,evidencePolicy:policy,evidenceDeliveryId:latest?.id||null});
      await notify(db,r.requester_user_id,"service.completion_submitted","service_request",requestId,{message:"The provider submitted completion evidence. Review the outcome and accept it, request revision, or dispute it.",nextAction:"Review the completion evidence and record your outcome decision.",actionUrl:"/services?requestId="+ requestId +"#service-request-"+requestId,actionRequired:true});
      return {...updated,nextAction:"The requester must accept the submitted outcome, request a revision or dispute it. Payment verification remains a separate finance step for paid engagements."};
    }
    if(!allowedServiceRequestTransition(r.status,status)) throw error(409,"Invalid service request transition.","INVALID_STATE");
    if(["declined","cancelled","disputed"].includes(status)&&String(note||"").trim().length<4) throw error(400,"Add a short explanation so the other participant understands this decision and the next step.","OUTCOME_NOTE_REQUIRED");
    if(status==="in_progress"){
      const agreement=(await db.query("select * from service_request_agreement where request_id=$1 order by terms_version desc limit 1 for update",[requestId])).rows[0];
      if(!agreement || !agreement.provider_accepted_at || !agreement.requester_accepted_at) throw error(409,"Both parties must accept the same persisted service terms before delivery can start.","AGREEMENT_REQUIRED");
    }
    const updated=(await db.query("update service_request set status=$1,provider_note=case when $2::uuid<>requester_user_id then $3 else provider_note end,requester_note=case when $2::uuid=requester_user_id then $3 else requester_note end,outcome_summary=case when $1 in ('declined','cancelled','disputed') then coalesce($3,outcome_summary) else outcome_summary end,accepted_at=case when $1='accepted' then now() else accepted_at end,started_at=case when $1='in_progress' then now() else started_at end,cancelled_at=case when $1='cancelled' then now() else cancelled_at end,updated_at=now() where id=$4 returning *",[status,userId,note||null,requestId])).rows[0];
    if(r.status==="disputed"&&status==="in_progress"){
      await db.query("update service_request set provider_completed_at=null,provider_completion_submitted_by=null,requester_outcome_decision=null,requester_outcome_decision_by=null,requester_outcome_decision_at=null,requester_outcome_note=null,completion_evidence_delivery_id=null where id=$1",[requestId]);
      Object.assign(updated,{provider_completed_at:null,provider_completion_submitted_by:null,requester_outcome_decision:null,requester_outcome_decision_by:null,requester_outcome_decision_at:null,requester_outcome_note:null,completion_evidence_delivery_id:null});
      await db.query("insert into service_request_completion_event(request_id,actor_user_id,event_type,note) values($1,$2,'reopened',$3)",[requestId,userId,String(note||"Delivery resumed after dispute resolution.").trim()]);
    }
    if(status==="accepted"){
      const terms={scope:r.scope||null,listingPricingModel:r.listing_pricing_model||null,listingPriceAmount:r.listing_price_amount===null?null:Number(r.listing_price_amount),listingCurrency:r.listing_currency||null,agreedPrice:r.agreed_price===null?null:Number(r.agreed_price),currency:r.agreed_currency||null,completionDueAt:r.completion_due_at||null,requestedStartAt:r.requested_start_at||null,requestedEndAt:r.requested_end_at||null};
      const termsHash=hashPayload(terms);
      await db.query("insert into service_request_agreement(request_id,terms_version,terms,terms_hash,provider_accepted_by,provider_accepted_at) values($1,1,$2,$3,$4,now()) on conflict(request_id,terms_version) do nothing",[requestId,terms,termsHash,userId]);
    }
    await db.query("insert into service_request_event(request_id,actor_user_id,from_status,to_status,note) values($1,$2,$3,$4,$5)",[requestId,userId,r.status,status,note||null]);
    await audit(db,userId,"service.request_status_changed","service_request",requestId,requestIdHeader,{from:r.status,to:status});
    const message=status==="accepted"?"Your service request was accepted. Agree the start date and delivery scope.":status==="declined"?"Your service request was declined. Review the explanation or choose another provider.":status==="in_progress"?"Service delivery has started. Track milestones and submitted work.":status==="disputed"?"A concern was raised. Review the note and agree the next step or contact Support Desk.":"The service request was cancelled. Review the explanation before creating a new request.";
    const nextAction=status==="accepted"?"Confirm scope, timing and milestones.":status==="in_progress"?"Track delivery and submit/review milestones.":status==="disputed"?"Respond to the concern and document the resolution.":status==="declined"?"Choose another provider or submit a revised request.":"Create a new request only if the need remains."; 
    for(const recipient of new Set([r.requester_user_id,...await serviceProviderRecipients(db,requestId)])) if(recipient&&recipient!==userId) await notify(db,recipient,"service.request_status_changed","service_request",requestId,{from:r.status,to:status,message,nextAction,actionUrl:"/services?requestId="+ requestId +"#service-request-"+requestId,actionRequired:["accepted","disputed"].includes(status),priority:status==="disputed"?"high":"normal"});
    return {...updated,nextAction};
  });
}

export async function submitServicePayment(requestId,userId,input,requestIdHeader){
  return withTransaction(async db=>{
    const r=(await db.query("select sr.*,sl.pricing_model listing_pricing_model,sl.price_amount listing_price_amount,sl.impact_model listing_impact_model from service_request sr join service_listing sl on sl.id=sr.service_listing_id where sr.id=$1 for update of sr",[requestId])).rows[0];
    if(!r) throw error(404,"Service request not found.","NOT_FOUND");
    if(r.requester_user_id!==userId) throw error(403,"Only the requester can submit service payment.","FORBIDDEN");
    if(r.listing_impact_model==="pro_bono"||r.listing_pricing_model==="free"||Number(r.agreed_price||r.listing_price_amount||0)<=0)throw error(409,"This engagement does not require paid-payment submission; continue using its agreed service evidence and outcome workflow.","PAYMENT_NOT_REQUIRED");
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
    for(const providerUserId of await serviceProviderRecipients(db,requestId))if(providerUserId&&providerUserId!==userId)await notify(db,providerUserId,"service.payment_review_required","service_payment",row.id,{message:"A requester submitted payment for your service engagement.",nextAction:"Track finance verification before treating the payment as settled.",actionUrl:"/services?requestId="+ requestId +"#service-request-"+requestId,actionRequired:false});
    const financeUsers=(await db.query("select distinct u.id user_id from app_user u where u.status='active' and (exists(select 1 from app_user_role ur join app_role ar on ar.id=ur.role_id where ur.user_id=u.id and ar.role_code in ('finance_officer','system_admin')) or exists(select 1 from app_user_permission up where up.user_id=u.id and up.permission_code='finance.manage'))")).rows;
    for(const finance of financeUsers)await notify(db,finance.user_id,"service.payment_review_required","service_payment",row.id,{message:"A service payment is awaiting finance verification.",nextAction:"Review payment evidence and record a reasoned decision in the existing finance queue.",actionUrl:"/dashboard",reviewerQueue:true,actionRequired:true,priority:"high"});
    return row;
  });
}

export async function reviewServiceCompletion(requestId,userId,input,requestIdHeader){
  return withTransaction(async db=>{
    const r=(await db.query("select sr.*,sl.pricing_model listing_pricing_model,sl.price_amount listing_price_amount,sl.currency listing_currency,sl.impact_model listing_impact_model,sl.completion_evidence_policy listing_completion_evidence_policy,sl.fulfilment_rule listing_fulfilment_rule,sl.fulfilment_target_count listing_fulfilment_target_count from service_request sr join service_listing sl on sl.id=sr.service_listing_id where sr.id=$1 for update of sr",[requestId])).rows[0];
    if(!r)throw error(404,"Service request not found.","NOT_FOUND");
    if(r.requester_user_id!==userId)throw error(403,"Only the requester can decide the submitted service outcome.","FORBIDDEN");
    const decision=String(input.status||"");
    if(!["accepted","revision_requested","disputed"].includes(decision))throw error(400,"Outcome decision must be accepted, revision_requested or disputed.","VALIDATION_ERROR");
    if(r.status==="completed"&&r.requester_outcome_decision==="accepted"&&decision==="accepted")return {...r,idempotent:true,nextAction:"This engagement is already accepted and completed."};
    if(r.status!=="in_progress"||!r.provider_completed_at||!r.provider_completion_submitted_by)throw error(409,"The provider has not submitted a valid completion for review.","COMPLETION_NOT_SUBMITTED");
    const note=String(input.note||input.outcomeSummary||"").trim();
    if(decision==="accepted"&&note.length<10)throw error(400,"Record the final outcome in at least 10 characters before accepting completion.","FINAL_OUTCOME_REQUIRED");
    if(decision!=="accepted"&&note.length<4)throw error(400,"Explain the revision request or dispute in at least four characters.","OUTCOME_NOTE_REQUIRED");
    validateCommunityText(note,{field:decision==="accepted"?"Final outcome":"Outcome decision note",min:decision==="accepted"?10:4,max:3000});
    if(decision==="accepted"){
      const policy=r.listing_completion_evidence_policy||"accepted_delivery";
      const latest=(await db.query("select id,status,file_object_id from service_request_delivery where request_id=$1 order by created_at desc,id desc limit 1",[requestId])).rows[0];
      const evidenceDeliveryId=latest?.status==="accepted"?latest.id:null;
      if(policy==="accepted_delivery"&&(!latest||latest.status!=="accepted"))throw error(409,"The latest delivery must be accepted before the engagement outcome can be accepted.","DELIVERY_EVIDENCE_REQUIRED");
      if(policy==="private_file"&&(!latest||latest.status!=="accepted"||!latest.file_object_id))throw error(409,"The listing requires an accepted delivery backed by a private evidence file.","PRIVATE_FILE_EVIDENCE_REQUIRED");
      if(policy==="description_only"&&String(r.provider_note||"").trim().length<10)throw error(409,"The provider must submit the required written service evidence before acceptance.","COMPLETION_SUMMARY_REQUIRED");
      const expectedAmount=Number(r.agreed_price===null?r.listing_price_amount:r.agreed_price||0);
      const requiresPayment=r.listing_impact_model!=="pro_bono"&&r.listing_pricing_model!=="free"&&Number(r.listing_price_amount||0)>0;
      if(requiresPayment){
        if(expectedAmount<=0)throw error(409,"A paid service must have an agreed positive amount before completion can be accepted.","AGREED_PRICE_REQUIRED");
        const currency=String(r.agreed_currency||r.listing_currency||"").toUpperCase();
        const settled=(await db.query("select 1 from service_payment where request_id=$1 and status='succeeded' and amount=$2::numeric and upper(currency)=upper($3::text) and verified_at is not null limit 1",[requestId,expectedAmount,currency])).rows[0];
        if(!settled)throw error(409,"The paid service requires finance-verified settlement for the agreed amount and currency. This check is separate from outcome acceptance.","PAYMENT_NOT_SETTLED");
      }
      const updated=(await db.query("update service_request set requester_accepted_at=now(),requester_outcome_decision='accepted',requester_outcome_decision_by=$1,requester_outcome_decision_at=now(),requester_outcome_note=$2,final_outcome_summary=$2,status='completed',outcome_summary=$2,completed_at=now(),completion_evidence_delivery_id=coalesce($3,completion_evidence_delivery_id),updated_at=now() where id=$4 returning *",[userId,note,evidenceDeliveryId,requestId])).rows[0];
      await db.query("insert into service_request_completion_event(request_id,actor_user_id,event_type,outcome_summary,evidence_delivery_id,note) values($1,$2,'accepted',$3,$4,$5)",[requestId,userId,note,evidenceDeliveryId,note]);
      await db.query("insert into service_request_event(request_id,actor_user_id,from_status,to_status,note) values($1,$2,'in_progress','completed',$3)",[requestId,userId,note]);
      await audit(db,userId,"service.request_completion_accepted","service_request",requestId,requestIdHeader,{evidenceDeliveryId:evidenceDeliveryId,paid:requiresPayment});
      const listing=(await db.query("select id,lifecycle_status,fulfilment_rule,fulfilment_target_count from service_listing where id=$1 for update",[r.service_listing_id])).rows[0];
      if(listing&&listing.lifecycle_status!=="fulfilled"&&listing.fulfilment_rule!=="manual"){
        const completed=Number((await db.query("select count(*)::int count from service_request where service_listing_id=$1 and status='completed' and requester_accepted_at is not null",[listing.id])).rows[0].count);
        const target=listing.fulfilment_rule==="single_engagement"?1:Number(listing.fulfilment_target_count||1);
        if(completed>=target&&["active","paused"].includes(listing.lifecycle_status)){
          await db.query("update service_listing set status='closed',lifecycle_status='fulfilled',updated_at=now() where id=$1",[listing.id]);
          await db.query("insert into service_listing_lifecycle_event(listing_id,actor_user_id,from_status,to_status,reason,request_id) values($1,$2,$3,'fulfilled',$4,$5)",[listing.id,userId,listing.lifecycle_status,"Fulfilment rule "+listing.fulfilment_rule+" reached after "+completed+" requester-accepted engagements.",requestIdHeader]);
          await audit(db,userId,"service.listing_auto_fulfilled","service_listing",listing.id,requestIdHeader,{rule:listing.fulfilment_rule,target,completed});
        }
      }
      for(const recipient of await serviceProviderRecipients(db,requestId))if(recipient&&recipient!==userId)await notify(db,recipient,"service.completion_accepted","service_request",requestId,{message:"The requester accepted the delivered outcome.",nextAction:"The engagement is complete. Review the final outcome record.",actionUrl:"/services?requestId="+requestId+"#service-request-"+requestId});
      return {...updated,nextAction:"The engagement is complete. Payment verification was evaluated separately where the listing requires payment."};
    }
    const nextStatus=decision==="disputed"?"disputed":"in_progress";
    if(decision==="revision_requested"&&r.completion_evidence_delivery_id)await db.query("update service_request_delivery set status='revision_requested',reviewer_note=$1,reviewed_by=$2,reviewed_at=now() where id=$3 and request_id=$4",[note,userId,r.completion_evidence_delivery_id,requestId]);
    const updated=(await db.query("update service_request set status=$1,requester_outcome_decision=$2,requester_outcome_decision_by=$3,requester_outcome_decision_at=now(),requester_outcome_note=$4,provider_completed_at=case when $2='revision_requested' then null else provider_completed_at end,provider_completion_submitted_by=case when $2='revision_requested' then null else provider_completion_submitted_by end,completion_evidence_delivery_id=case when $2='revision_requested' then null else completion_evidence_delivery_id end,updated_at=now() where id=$5 returning *",[nextStatus,decision,userId,note,requestId])).rows[0];
    await db.query("insert into service_request_completion_event(request_id,actor_user_id,event_type,evidence_delivery_id,note) values($1,$2,$3,$4,$5)",[requestId,userId,decision,r.completion_evidence_delivery_id||null,note]);
    await db.query("insert into service_request_event(request_id,actor_user_id,from_status,to_status,note) values($1,$2,'in_progress',$3,$4)",[requestId,userId,nextStatus,note]);
    await audit(db,userId,"service.request_completion_"+decision,"service_request",requestId,requestIdHeader,{decision});
    for(const recipient of await serviceProviderRecipients(db,requestId))if(recipient&&recipient!==userId)await notify(db,recipient,decision==="disputed"?"service.completion_disputed":"service.completion_revision_requested","service_request",requestId,{message:decision==="disputed"?"The requester disputed the submitted outcome.":"The requester requested a revision to the submitted outcome.",nextAction:decision==="disputed"?"Review the dispute and agree a documented resolution before resuming delivery.":"Review the requested changes, submit revised delivery evidence and submit completion again.",note,actionUrl:"/services?requestId="+requestId+"#service-request-"+requestId,actionRequired:true,priority:"high"});
    return {...updated,nextAction:decision==="disputed"?"Delivery is disputed and must be explicitly resolved before work resumes.":"Revision is required; submit revised delivery evidence before submitting completion again."};
  });
}

export async function acceptServiceCompletion(requestId,userId,note,requestIdHeader){
  return reviewServiceCompletion(requestId,userId,{status:"accepted",note},requestIdHeader);
}

export async function createServiceMilestone(requestId,userId,input,requestIdHeader){
  return withTransaction(async db=>{
    const r=(await db.query("select * from service_request where id=$1 for update",[requestId])).rows[0];
    if(!r) throw error(404,"Service request not found.","NOT_FOUND");
    if(!(await isServiceProviderActor(db,requestId,userId))) throw error(403,"Only the provider or authorized organization team can define delivery milestones.","FORBIDDEN");
    if(!["accepted","in_progress"].includes(r.status)) throw error(409,"Milestones can only be added to an accepted or active engagement.","INVALID_STATE");
    if(r.provider_completed_at)throw error(409,"Milestones cannot be added while provider completion is awaiting requester review.","COMPLETION_REVIEW_PENDING");
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
    await notify(db,r.requester_user_id,"service.delivery_submitted","service_request_delivery",row.id,{message:"The provider submitted a delivery for your service engagement.",nextAction:"Review the delivery and accept it or request a revision with a clear explanation.",actionUrl:"/services?requestId="+ requestId +"#service-request-"+requestId,actionRequired:true,priority:"high"});
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
    for(const recipient of await serviceProviderRecipients(db,d.request_id))if(recipient&&recipient!==userId)await notify(db,recipient,input.status==="accepted"?"service.delivery_accepted":"service.delivery_revision_requested","service_request_delivery",deliveryId,{message:input.status==="accepted"?"The requester accepted your delivery.":"The requester requested a revision.",note:input.note||null,nextAction:input.status==="accepted"?"Continue with the next milestone or submit completion when all work is ready.":"Review the requester's note and submit a revised delivery.",actionUrl:"/services?requestId="+ d.request_id +"#service-request-"+d.request_id,actionRequired:input.status==="revision_requested",priority:input.status==="revision_requested"?"high":"normal"});
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
  await notify(db,row.payer_user_id,"service.payment_decision","service_payment",servicePaymentId,{message:approved?"Your service payment was verified.":correction?"Finance needs additional information about your service payment.":"Your service payment was not approved.",nextAction:approved?"Continue with the service workflow; paid completion still requires the matching verified amount and currency.":correction?"Review the finance note and provide corrected payment evidence.":"Review the finance note and contact support if you believe the decision is incorrect.",actionUrl:"/services?requestId="+ row.request_id +"#service-request-"+row.request_id,actionRequired:!approved,priority:correction?"high":"normal"});
  for(const providerUserId of await serviceProviderRecipients(db,row.request_id))if(providerUserId&&providerUserId!==row.payer_user_id)await notify(db,providerUserId,"service.payment_decision","service_payment",servicePaymentId,{decision:input.decision,eventVersion:requestIdHeader,message:approved?"The service payment was verified by finance.":correction?"Finance requested additional information for the service payment.":"The service payment was not approved.",nextAction:approved?"Continue the engagement according to the agreed delivery terms.":"Coordinate with the requester and finance to resolve the payment status.",actionUrl:"/services?requestId="+ row.request_id +"#service-request-"+row.request_id,actionRequired:correction,priority:correction?"high":"normal"});
  return updated;
 });
}

export async function createServiceRequestUpdate(requestId,userId,input,requestIdHeader,idempotencyKey=null){
 if(typeof idempotencyKey!=="string"||!/^[A-Za-z0-9_-]{32,200}$/.test(idempotencyKey))throw error(400,"This update needs a secure submission key. Reload and retry.","IDEMPOTENCY_KEY_REQUIRED");
 const category=String(input.category||"");
 if(!ENGAGEMENT_UPDATE_CATEGORIES.has(category))throw error(400,"Choose a supported service-request update category.","VALIDATION_ERROR");
 const body=validateCommunityText(input.body,{field:"Update",min:10,max:2000});
 const keyHash=hashValue(idempotencyKey),fingerprint=hashPayload({requestId,userId,category,body});
 return withTransaction(async db=>{
  const request=(await db.query("select * from service_request where id=$1 for update",[requestId])).rows[0];
  if(!request)throw error(404,"Service request not found.","NOT_FOUND");
  const providerActor=await isServiceProviderActor(db,requestId,userId);
  if(request.requester_user_id!==userId&&!providerActor)throw error(403,"Only the requester or authorized provider-side participant can add an operational update.","FORBIDDEN");
  const existing=(await db.query("select * from service_request_update where request_idempotency_hash=$1 for update",[keyHash])).rows[0];
  if(existing){
   if(existing.request_id!==requestId||existing.author_user_id!==userId||existing.request_fingerprint!==fingerprint)throw error(409,"This update key was already used for different content.","IDEMPOTENCY_KEY_CONFLICT");
   return {...existing,idempotent:true,replayed:true};
  }
  if(!["requested","accepted","in_progress","disputed"].includes(request.status))throw error(409,"Operational updates are available only while the service request is open.","SERVICE_REQUEST_NOT_OPEN");
  const row=(await db.query("insert into service_request_update(request_id,author_user_id,category,body,request_idempotency_hash,request_fingerprint) values($1,$2,$3,$4,$5,$6) returning id,request_id,author_user_id,category,body,created_at",[requestId,userId,category,body,keyHash,fingerprint])).rows[0];
  await audit(db,userId,"service.request_update_created","service_request_update",row.id,requestIdHeader,{requestId,category,audience:"participants"});
  const actionUrl="/services?requestId="+ requestId +"#service-request-"+requestId;
  const payload={message:"A participant added an operational update to your service request.",nextAction:"Review the update on the service request.",actionUrl,actionRequired:true};
  if(providerActor)await notify(db,request.requester_user_id,"service.request_update_created","service_request_update",row.id,payload);
  else for(const recipient of await serviceProviderRecipients(db,requestId))if(recipient!==userId)await notify(db,recipient,"service.request_update_created","service_request_update",row.id,payload);
  return {...row,audience:"participants",idempotent:false,replayed:false};
 });
}

export async function listServiceRequestUpdates(requestId,userId){
 const db=getPool();
 const request=(await db.query("select id,requester_user_id from service_request where id=$1",[requestId])).rows[0];
 if(!request)throw error(404,"Service request not found.","NOT_FOUND");
 const providerActor=await isServiceProviderActor(db,requestId,userId);
 if(request.requester_user_id!==userId&&!providerActor)throw error(403,"Operational updates are available only to the authorized participants of this service request.","FORBIDDEN");
 return (await db.query("select u.id,u.request_id,u.author_user_id,u.category,u.body,u.created_at from service_request_update u where u.request_id=$1 order by u.created_at asc,u.id asc",[requestId])).rows;
}

export async function submitServiceFeedback(requestId,userId,input,requestIdHeader){
  return withTransaction(async db=>{
    const r=(await db.query("select * from service_request where id=$1",[requestId])).rows[0];
    if(!r) throw error(404,"Service request not found.","NOT_FOUND");
    if(r.requester_user_id!==userId&&!(await isServiceProviderActor(db,requestId,userId))) throw error(403,"You are not a participant in this service request.","FORBIDDEN");
    if(r.status!=="completed") throw error(409,"Service feedback requires a completed engagement.","SERVICE_NOT_COMPLETED");
    const target=input.targetRole||"service",category=String(input.category||"");
    if(!FEEDBACK_CATEGORIES.has(category))throw error(400,"Choose a structured feedback category.","FEEDBACK_CATEGORY_REQUIRED");
    if(target==="provider"&&r.provider_user_id===userId) throw error(400,"A provider cannot rate themselves.","SELF_RATING");
    if(target==="requester"&&r.requester_user_id===userId) throw error(400,"A requester cannot rate themselves.","SELF_RATING");
    if(!["provider","requester","service"].includes(target)) throw error(400,"Unsupported feedback target.","VALIDATION_ERROR");
    const rating=input.rating===undefined||input.rating===null||input.rating===""?null:Number(input.rating);
    if(rating!==null&&(!Number.isInteger(rating)||rating<1||rating>5))throw error(400,"Rating must be a whole number from 1 to 5.","VALIDATION_ERROR");
    const comments=String(input.comments||"").trim();
    if(comments.length>1000)throw error(400,"Feedback comments must be 1,000 characters or fewer.","VALIDATION_ERROR");
    if(comments)validateCommunityText(comments,{field:"Feedback comments",min:1,max:1000});
    if(rating===null&&!comments)throw error(400,"Provide a rating or concise feedback with a category.","VALIDATION_ERROR");
    const row=(await db.query("insert into service_request_feedback(request_id,reviewer_user_id,target_role,category,rating,comments) values($1,$2,$3,$4,$5,$6) on conflict(request_id,reviewer_user_id,target_role) do update set category=excluded.category,rating=excluded.rating,comments=excluded.comments returning *",[requestId,userId,target,category,rating,comments||null])).rows[0];
    await audit(db,userId,"service.feedback_submitted","service_request_feedback",row.id,requestIdHeader,{category,target,audience:"participants"});
    const actionUrl="/services?requestId="+ requestId +"#service-request-"+requestId;
    const payload={message:"Feedback was submitted for a completed service engagement.",nextAction:"Review the completed service record.",actionUrl,actionRequired:true};
    if(r.requester_user_id===userId)for(const recipient of await serviceProviderRecipients(db,requestId))await notify(db,recipient,"service.feedback_submitted","service_request_feedback",row.id,payload);
    else await notify(db,r.requester_user_id,"service.feedback_submitted","service_request_feedback",row.id,payload);
    return {...row,audience:"participants"};
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
    const approvedBannerUrl=normalizePublicMediaUrl(input.approvedBannerUrl,"Banner image URL"),approvedBannerAlt=String(input.approvedBannerAlt||"").trim().slice(0,300)||null,videoUrl=normalizePublicVideoUrl(input.videoUrl,"Video URL");
    const values=[headline,String(input.bio||"").trim()||null,JSON.stringify(normalizeArray(input.expertise)),JSON.stringify(normalizeArray(input.languages)),JSON.stringify(normalizeArray(input.mentoringModes||["remote"])),maxActiveMentees,visibility,circleEnabled,circleName,approvedBannerUrl,approvedBannerAlt,videoUrl];
    const row=existing
      ? (await db.query("update mentor_profile set status=case when status='active' then 'draft' else status end,moderation_status='pending',moderation_note=null,moderated_by=null,moderated_at=null,headline=$1,bio=$2,expertise=$3,languages=$4,mentoring_modes=$5,max_active_mentees=$6,visibility=$7,circle_enabled=$8,circle_name=$9,approved_banner_url=$10,approved_banner_alt=$11,video_url=$12,updated_at=now() where id=$13 returning *",[...values,existing.id])).rows[0]
      : (await db.query("insert into mentor_profile(user_id,headline,bio,expertise,languages,mentoring_modes,max_active_mentees,visibility,circle_enabled,circle_name,approved_banner_url,approved_banner_alt,video_url) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *",[userId,...values])).rows[0];
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
    const updated=(await db.query("update mentor_profile set status=case when status='active' then 'draft' else status end,moderation_status='pending',moderation_note=null,moderated_by=null,moderated_at=null,headline=coalesce($1,headline),bio=coalesce($2,bio),expertise=coalesce($3,expertise),languages=coalesce($4,languages),mentoring_modes=coalesce($5,mentoring_modes),max_active_mentees=coalesce($6,max_active_mentees),visibility=coalesce($7,visibility),circle_enabled=coalesce($8,circle_enabled),circle_name=coalesce($9,circle_name),approved_banner_url=case when $10::boolean then $11 else approved_banner_url end,approved_banner_alt=case when $12::boolean then $13 else approved_banner_alt end,video_url=case when $14::boolean then $15 else video_url end,updated_at=now() where id=$16 returning *",[input.headline||null,input.bio||null,input.expertise?JSON.stringify(normalizeArray(input.expertise)):null,input.languages?JSON.stringify(normalizeArray(input.languages)):null,input.mentoringModes?JSON.stringify(normalizeArray(input.mentoringModes)):null,input.maxActiveMentees||null,input.visibility||null,input.circleEnabled===undefined?null:Boolean(input.circleEnabled),input.circleName===undefined?null:(String(input.circleName||"").trim().slice(0,120)||null),input.approvedBannerUrl!==undefined,input.approvedBannerUrl===undefined?null:normalizePublicMediaUrl(input.approvedBannerUrl,"Banner image URL"),input.approvedBannerAlt!==undefined,input.approvedBannerAlt===undefined?null:(String(input.approvedBannerAlt||"").trim().slice(0,300)||null),input.videoUrl!==undefined,input.videoUrl===undefined?null:normalizePublicVideoUrl(input.videoUrl,"Video URL"),profileId])).rows[0];
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
 const row=(await db.query(`select mp.id,mp.user_id,p.display_name,mp.headline,mp.bio,mp.expertise,mp.languages,mp.mentoring_modes,mp.max_active_mentees,mp.approved_banner_url,mp.approved_banner_alt,mp.video_url,(select coalesce(json_agg(json_build_object('day_of_week',a.day_of_week,'start_time',a.start_time,'end_time',a.end_time,'timezone',a.timezone) order by a.day_of_week,a.start_time),'[]'::json) from mentor_availability a where a.mentor_profile_id=mp.id and a.active=true) availability
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
  const rows=(await db.query(`select mp.id,mp.user_id,p.display_name,mp.headline,mp.bio,mp.expertise,mp.languages,mp.mentoring_modes,mp.max_active_mentees,mp.circle_enabled,mp.circle_name,mp.approved_banner_url,mp.approved_banner_alt,mp.video_url,(select coalesce(json_agg(json_build_object('day_of_week',a.day_of_week,'start_time',a.start_time,'end_time',a.end_time,'timezone',a.timezone) order by a.day_of_week,a.start_time),'[]'::json) from mentor_availability a where a.mentor_profile_id=mp.id and a.active=true) availability,(select count(*)::int from mentorship active_m where active_m.mentor_user_id=mp.user_id and active_m.status in ('active','paused')) active_mentee_count,(select count(*)::int from mentorship_circle_membership cm where cm.mentor_profile_id=mp.id and cm.left_at is null) circle_joined_count,exists(select 1 from mentorship_circle_membership cm where cm.mentor_profile_id=mp.id and cm.participant_user_id=$1 and cm.left_at is null) circle_joined_by_me from mentor_profile mp join app_user u on u.id=mp.user_id join person p on p.user_id=u.id join membership_record m on m.user_id=u.id where ${where.join(" and ")} order by p.display_name limit ${limit+1} offset ${offset}`,args)).rows;
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
    const emailOutboxQueued=(await db.query("select 1 from notification_outbox where template_code='mentor.mentorship_update' and payload->>'matchId'=$1 limit 1",[row.id])).rowCount>0;
    await db.query("update mentorship_match set mentor_notification_status=$2,mentor_notification_updated_at=now(),mentor_notification_detail=$3 where id=$1",[row.id,emailOutboxQueued?"queued":"unknown",emailOutboxQueued?"Email queued; provider delivery and reading are not confirmed.":"In-app workflow notification may be recorded, but no email outbox delivery attempt is available to verify."]);
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
    const meetingReference=String(input.meetingReference||"").trim(),locationLabel=String(input.locationLabel||"").trim(),agenda=String(input.agenda||"").trim(),proposalNote=String(input.proposalNote||"").trim();
    if(meetingReference.length>1000||locationLabel.length>250||agenda.length>1000||proposalNote.length>1000)throw error(400,"Meeting details exceed the allowed length.","VALIDATION_ERROR");
    let meetingUrl=null;try{if(meetingReference)meetingUrl=new URL(meetingReference);}catch{meetingUrl=null;}
    const sharedText=locationLabel+" "+agenda+" "+proposalNote;
    if((meetingReference&&(!meetingUrl||meetingUrl.protocol!=="https:"||meetingUrl.username||meetingUrl.password))||/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(meetingReference+" "+sharedText)||/(?:tel:|whatsapp:)/i.test(meetingReference+" "+sharedText)||/(?:\+\d{7,}|\(\d{2,4}\)\s*\d{3,}|\b\d{3,}[- ]\d{3,}[- ]\d{3,}\b)/.test(sharedText))throw error(400,"Use an HTTPS meeting link or public meeting location only; do not enter personal email addresses or phone contact details in the shared session details.","PRIVATE_CONTACT_NOT_ALLOWED");
    await assertSessionFitsAvailability(db,m.mentor_user_id,input.scheduledStartAt,input.scheduledEndAt);
    const row=(await db.query("insert into mentorship_session(mentorship_id,scheduled_start_at,scheduled_end_at,mode,location_label,meeting_reference,agenda,created_by,coordination_status,proposed_by,proposal_note) values($1,$2,$3,$4,$5,$6,$7,$8,'proposed',$8,$9) returning *",[mentorshipId,input.scheduledStartAt,input.scheduledEndAt,input.mode||"remote",locationLabel||null,meetingReference||null,String(input.agenda||"").trim().slice(0,1000)||null,userId,String(input.proposalNote||"").trim().slice(0,1000)||null])).rows[0];
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
    if(s.coordination_status==="proposed"&&status==="cancelled"&&s.proposed_by===userId){
      const withdrawn=(await db.query("update mentorship_session set coordination_status='declined',status='cancelled',responded_by=$1,responded_at=now(),proposal_note=coalesce($2,proposal_note),updated_at=now() where id=$3 returning *",[userId,String(notes||"").trim().slice(0,1000)||null,sessionId])).rows[0];
      await audit(db,userId,"mentorship.session_proposal_withdrawn","mentorship_session",sessionId,requestId);
      const other=s.mentor_user_id===userId?s.mentee_user_id:s.mentor_user_id;
      if(other)await notify(db,other,"mentorship.session_proposal_withdrawn","mentorship_session",sessionId,{message:"The other participant withdrew their first-session proposal.",nextAction:"Review the mentorship workspace if a new session time is needed.",actionUrl:"/mentorship",coordinationStatus:"declined"});
      return {...withdrawn,nextAction:"Session proposal withdrawn. The other participant was notified in the platform."};
    }
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
  return (await db.query("select s.id,s.mentorship_id,s.scheduled_start_at,s.scheduled_end_at,s.mode,case when s.coordination_status='accepted' then s.location_label else null end location_label,case when s.coordination_status='accepted' then s.meeting_reference else null end meeting_reference,s.agenda,s.status,s.notes,s.completed_at,s.created_by,s.created_at,s.updated_at,s.coordination_status,s.proposed_by,s.responded_by,s.responded_at,s.proposal_note,cp.id change_proposal_id,cp.status change_proposal_status,cp.proposed_by change_proposed_by,cp.previous_start_at change_previous_start_at,cp.previous_end_at change_previous_end_at,cp.proposed_start_at change_proposed_start_at,cp.proposed_end_at change_proposed_end_at,cp.proposal_note change_proposal_note,cp.responded_at change_responded_at,cp.response_note change_response_note from mentorship_session s left join lateral (select id,status,proposed_by,previous_start_at,previous_end_at,proposed_start_at,proposed_end_at,proposal_note,responded_at,response_note from mentorship_session_change_proposal where session_id=s.id order by created_at desc limit 1) cp on true where s.mentorship_id=$1 order by s.scheduled_start_at",[mentorshipId])).rows;
}

export async function listMyMentorshipSessions(userId){
  const db=getPool();
  return (await db.query("select s.id,s.mentorship_id,s.scheduled_start_at,s.scheduled_end_at,s.mode,case when s.coordination_status='accepted' then s.location_label else null end location_label,case when s.coordination_status='accepted' then s.meeting_reference else null end meeting_reference,s.agenda,s.status,s.created_at,s.updated_at,s.coordination_status,s.proposed_by,s.responded_at,cp.id change_proposal_id,cp.status change_proposal_status,cp.proposed_by change_proposed_by,cp.proposed_start_at change_proposed_start_at,cp.proposed_end_at change_proposed_end_at,cp.responded_at change_responded_at from mentorship_session s join mentorship m on m.id=s.mentorship_id left join lateral (select id,status,proposed_by,proposed_start_at,proposed_end_at,responded_at from mentorship_session_change_proposal where session_id=s.id order by created_at desc limit 1) cp on true where (m.mentor_user_id=$1 or m.mentee_user_id=$1) order by s.scheduled_start_at desc limit 200",[userId])).rows;
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

export async function listMentorshipLearningActivities(mentorshipId,userId){
  const db=getPool(),m=await mentorshipParticipant(db,mentorshipId,userId);
  return (await db.query(`select a.id,a.mentorship_id,a.title,a.instructions,a.due_at,a.status,a.created_at,a.updated_at,
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',s.id,'version',s.version,'response',s.response,'status',s.status,'submittedAt',s.submitted_at,
      'reviews',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'decision',r.decision,'feedback',r.feedback,'createdAt',r.created_at) order by r.created_at) from mentorship_learning_review r where r.submission_id=s.id),'[]'::jsonb)
    ) order by s.version desc) from mentorship_learning_submission s where s.activity_id=a.id and s.submitted_by=$2),'[]'::jsonb) submissions
    from mentorship_learning_activity a where a.mentorship_id=$1 and a.status='published' order by a.due_at nulls last,a.created_at desc`,[mentorshipId,m.mentee_user_id])).rows;
}

export async function listMyMentorshipLearningProgress(userId){
  const db=getPool();
  return (await db.query(`select a.id,a.mentorship_id,a.title,a.instructions,a.due_at,a.status,a.created_at,a.updated_at,
    m.mentor_user_id,m.mentee_user_id,$1::uuid viewer_user_id,
    s.id submission_id,s.version,s.status submission_status,s.submitted_at,coalesce(s.submitted_at,a.updated_at) last_activity_at,
    review.decision latest_review_decision,review.feedback latest_review_feedback
    from mentorship_learning_activity a join mentorship m on m.id=a.mentorship_id
    left join lateral (select id,version,status,submitted_at from mentorship_learning_submission where activity_id=a.id and submitted_by=m.mentee_user_id order by version desc limit 1) s on true
    left join lateral (select decision,feedback from mentorship_learning_review where submission_id=s.id order by created_at desc limit 1) review on true
    where a.status='published' and (m.mentor_user_id=$1 or m.mentee_user_id=$1)
    order by a.due_at nulls last,a.created_at desc limit 200`,[userId])).rows;
}

export async function createMentorshipLearningActivity(mentorshipId,userId,input,requestId){
  return withTransaction(async db=>{
    const m=await mentorshipParticipant(db,mentorshipId,userId);
    if(m.mentor_user_id!==userId)throw error(403,"Only the assigned mentor can create learning activities.","FORBIDDEN");
    if(m.status!=="active")throw error(409,"Learning activities can only be created in an active mentorship.","INVALID_STATE");
    const title=String(input.title||"").trim(),instructions=String(input.instructions||"").trim();
    if(title.length<4||title.length>180)throw error(400,"Activity title must contain 4 to 180 characters.","VALIDATION_ERROR");
    if(instructions.length<10||instructions.length>4000)throw error(400,"Activity instructions must contain 10 to 4,000 characters.","VALIDATION_ERROR");
    let dueAt=null;
    if(input.dueAt){dueAt=new Date(input.dueAt);if(Number.isNaN(dueAt.getTime()))throw error(400,"Choose a valid activity due date.","VALIDATION_ERROR");}
    const row=(await db.query("insert into mentorship_learning_activity(mentorship_id,created_by,title,instructions,due_at) values($1,$2,$3,$4,$5) returning id,mentorship_id,title,instructions,due_at,status,created_at,updated_at",[mentorshipId,userId,title,instructions,dueAt])).rows[0];
    await audit(db,userId,"mentorship.learning_activity_created","mentorship_learning_activity",row.id,requestId);
    await createInAppNotification(db,m.mentee_user_id,"mentorship.learning_activity_created","mentorship_learning_activity",row.id,{title:"New mentorship activity",message:"Your mentor has published a practical activity for your agreed professional goal.",actionRequired:true,nextAction:"Open My Mentorship to review and complete this activity.",dedupeKey:"mentorship-learning-activity:"+row.id});
    return row;
  });
}

export async function submitMentorshipLearningActivity(activityId,userId,input,requestId){
  return withTransaction(async db=>{
    const activity=(await db.query("select a.*,m.mentor_user_id,m.mentee_user_id,m.status mentorship_status from mentorship_learning_activity a join mentorship m on m.id=a.mentorship_id where a.id=$1 for update",[activityId])).rows[0];
    if(!activity)throw error(404,"Learning activity not found.","NOT_FOUND");
    if(activity.mentee_user_id!==userId)throw error(403,"Only the assigned mentee can submit this activity.","FORBIDDEN");
    if(activity.mentorship_status!=="active"||activity.status!=="published")throw error(409,"This learning activity is not accepting submissions.","INVALID_STATE");
    const response=String(input.response||"").trim();
    if(response.length<10||response.length>10000)throw error(400,"Your practical work must contain 10 to 10,000 characters.","VALIDATION_ERROR");
    const latest=(await db.query("select version,status from mentorship_learning_submission where activity_id=$1 and submitted_by=$2 order by version desc limit 1",[activityId,userId])).rows[0];
    if(latest?.status==="accepted")throw error(409,"This activity has already been accepted and cannot be resubmitted.","INVALID_STATE");
    if(latest?.status==="submitted")throw error(409,"Your latest version is awaiting mentor review. Wait for feedback before submitting another version.","SUBMISSION_AWAITING_REVIEW");
    const version=Number(latest?.version||0)+1;
    const row=(await db.query("insert into mentorship_learning_submission(activity_id,submitted_by,version,response) values($1,$2,$3,$4) returning id,activity_id,version,response,status,submitted_at",[activityId,userId,version,response])).rows[0];
    await audit(db,userId,"mentorship.learning_submission_created","mentorship_learning_submission",row.id,requestId,{version});
    await createInAppNotification(db,activity.mentor_user_id,"mentorship.learning_submission_created","mentorship_learning_submission",row.id,{title:"Mentee submitted practical work",message:"A new version of a mentorship activity is ready for your review.",actionRequired:true,nextAction:"Open My Mentorship to review the submitted work.",dedupeKey:"mentorship-learning-submission:"+row.id});
    return row;
  });
}

export async function reviewMentorshipLearningSubmission(submissionId,userId,input,requestId){
  return withTransaction(async db=>{
    const submission=(await db.query("select s.*,a.mentorship_id,m.mentor_user_id,m.status mentorship_status from mentorship_learning_submission s join mentorship_learning_activity a on a.id=s.activity_id join mentorship m on m.id=a.mentorship_id where s.id=$1 for update",[submissionId])).rows[0];
    if(!submission)throw error(404,"Learning submission not found.","NOT_FOUND");
    if(submission.mentor_user_id!==userId)throw error(403,"Only the assigned mentor can review this submission.","FORBIDDEN");
    if(submission.mentorship_status!=="active")throw error(409,"This mentorship is not active.","INVALID_STATE");
    if(submission.status!=="submitted")throw error(409,"Only an unreviewed submission can be reviewed.","INVALID_STATE");
    const latest=(await db.query("select id from mentorship_learning_submission where activity_id=$1 and submitted_by=$2 order by version desc limit 1",[submission.activity_id,submission.submitted_by])).rows[0];
    if(latest?.id!==submissionId)throw error(409,"A newer submission exists. Review the latest version.","STALE_SUBMISSION");
    if(!["accepted","changes_requested"].includes(input.decision))throw error(400,"Choose accepted or changes requested.","VALIDATION_ERROR");
    const feedback=String(input.feedback||"").trim();
    if(feedback.length<5||feedback.length>3000)throw error(400,"Feedback must contain 5 to 3,000 characters.","VALIDATION_ERROR");
    const review=(await db.query("insert into mentorship_learning_review(submission_id,reviewer_user_id,decision,feedback) values($1,$2,$3,$4) returning id,submission_id,decision,feedback,created_at",[submissionId,userId,input.decision,feedback])).rows[0];
    await db.query("update mentorship_learning_submission set status=$1,updated_at=now() where id=$2",[input.decision,submissionId]);
    await audit(db,userId,"mentorship.learning_submission_reviewed","mentorship_learning_submission",submissionId,requestId,{decision:input.decision,reviewId:review.id});
    await createInAppNotification(db,submission.submitted_by,"mentorship.learning_submission_reviewed","mentorship_learning_submission",submissionId,{title:input.decision==="accepted"?"Mentor accepted your work":"Mentor requested an improvement",message:feedback,actionRequired:input.decision==="changes_requested",nextAction:input.decision==="accepted"?"Review the mentor feedback and continue to your next goal.":"Review the feedback and submit an improved version.",dedupeKey:"mentorship-learning-review:"+review.id});
    return review;
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
 return (await db.query(`select mm.id,mm.request_id,mm.mentor_user_id,mm.mentee_user_id,mm.score,mm.match_reasons,mm.status,mm.mentee_consent_status,mm.mentee_response_note,mm.proposed_at,mm.mentor_notification_status,mm.mentor_notification_updated_at,mm.mentor_notification_detail,mr.goals,pm.display_name mentor_name,pe.display_name mentee_name,
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


const PUBLIC_MEDIA_STORY_CONSENT_VERSION="public-media-story-v1";
const PUBLIC_MEDIA_STORY_CONSENT_TEXT="I explicitly consent to public publication of this video URL, story summary, transcript/captions and selected attribution after moderation. I understand this is my reported experience, and I can withdraw publication consent.";
function mediaStoryError(status,message,code="BUSINESS_RULE"){const e=new Error(message);e.statusCode=status;e.code=code;return e;}
function normalizeStoryText(value,field,min,max){
 const result=String(value??"").trim();
 if(result.length<min||result.length>max)throw mediaStoryError(400,field+" must be "+min+"–"+max+" characters.","VALIDATION_ERROR");
 return result;
}
async function requireMediaModerator(db,actorId){
 const roles=(await db.query("select r.role_code from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1",[actorId])).rows.map(row=>row.role_code);
 if(!roles.some(role=>["supporting_staff","system_admin"].includes(role)))throw mediaStoryError(403,"Authorized moderation-team access is required.","FORBIDDEN");
}
export async function listPublicMediaStories(subjectType,subjectId,viewerId=null){
 const db=getPool();
 if(subjectType==="service")await getServiceListing(subjectId,viewerId);
 else if(subjectType==="mentor")await getMentorProfile(subjectId,viewerId);
 else throw mediaStoryError(400,"Unsupported story subject.","VALIDATION_ERROR");
 const column=subjectType==="service"?"service_listing_id":"mentor_profile_id";
 const visibleParent=subjectType==="service"
  ? "exists(select 1 from service_listing sl where sl.id=public_media_story.service_listing_id and sl.status='published' and sl.lifecycle_status='active' and sl.moderation_status='approved' and (sl.expires_at is null or sl.expires_at>now()))"
  : "exists(select 1 from mentor_profile mp where mp.id=public_media_story.mentor_profile_id and mp.status='active' and mp.moderation_status='approved')";
 return (await db.query("select id,title,summary,transcript,video_url,attribution_mode,attribution_name,evidence_status,created_at from public_media_story where "+column+"=$1 and moderation_status='approved' and consent_withdrawn_at is null and "+visibleParent+" order by created_at desc limit 20",[subjectId])).rows;
}
export async function listMyPublicMediaStories(userId,subjectType,subjectId){
 const db=getPool();const args=[userId];let where=["author_user_id=$1"];
 if(subjectType==="service"&&subjectId){args.push(subjectId);where.push("service_listing_id=$2");}
 if(subjectType==="mentor"&&subjectId){args.push(subjectId);where.push("mentor_profile_id=(select id from mentor_profile where user_id=$2)");}
 return (await db.query("select id,service_listing_id,mentor_profile_id,title,moderation_status,moderation_note,consented_at,consent_withdrawn_at,created_at from public_media_story where "+where.join(" and ")+" order by created_at desc limit 50",args)).rows;
}
export async function createPublicMediaStory(authorUserId,subjectType,subjectId,input,requestId,idempotencyKey){
 if(input.consentGiven!==true||input.consentVersion!==PUBLIC_MEDIA_STORY_CONSENT_VERSION)throw mediaStoryError(400,"Explicit publication consent is required before submitting a story.","PUBLICATION_CONSENT_REQUIRED");
 const key=String(idempotencyKey||"").trim();
 if(key.length<16||key.length>200)throw mediaStoryError(400,"A stable idempotency key is required for story submission.","IDEMPOTENCY_KEY_REQUIRED");
 const title=normalizeStoryText(input.title,"Story title",4,120);
 const summary=validateCommunityText(input.summary,{field:"Story summary",min:20,max:1200});
 const transcript=validateCommunityText(input.transcript,{field:"Video transcript or captions",min:20,max:12000});
 const videoUrl=normalizePublicVideoUrl(input.videoUrl,"Video URL");
 if(!videoUrl)throw mediaStoryError(400,"A public YouTube or Vimeo video URL is required.","VALIDATION_ERROR");
 const attributionMode=input.attributionMode==="anonymous"?"anonymous":input.attributionMode==="named"?"named":null;
 if(!attributionMode)throw mediaStoryError(400,"Choose named attribution or anonymous attribution.","VALIDATION_ERROR");
 const attributionName=attributionMode==="named"?normalizeStoryText(input.attributionName,"Approved display name",1,120):null;
 const payloadHash=hashPayload({subjectType,subjectId,title,summary,transcript,videoUrl,attributionMode,attributionName,consentVersion:PUBLIC_MEDIA_STORY_CONSENT_VERSION});
 return withTransaction(async db=>{
  await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[authorUserId+":"+key]);
  const prior=(await db.query("select id,title,moderation_status,created_at,idempotency_payload_hash from public_media_story where author_user_id=$1 and idempotency_key=$2 for update",[authorUserId,key])).rows[0];
  if(prior){if(prior.idempotency_payload_hash!==payloadHash)throw mediaStoryError(409,"This submission key was already used for different story content. Start a new submission.","IDEMPOTENCY_CONFLICT");return {...prior,idempotent:true,nextAction:"This story submission was already saved; its existing moderation status is unchanged."};}
  let serviceListingId=null,mentorProfileId=null;
  if(subjectType==="service"){
   const listing=(await db.query("select id from service_listing where id=$1 and status='published' and lifecycle_status='active' and moderation_status='approved' and (expires_at is null or expires_at>now())",[subjectId])).rows[0];
   if(!listing)throw mediaStoryError(404,"The published service listing is not available for a public story.","NOT_FOUND");
   const engagement=(await db.query("select 1 from service_request where service_listing_id=$1 and requester_user_id=$2 and status='completed' and requester_accepted_at is not null limit 1",[subjectId,authorUserId])).rowCount;
   if(!engagement)throw mediaStoryError(403,"Only a requester with a completed, accepted service engagement can submit a participant story.","COMPLETED_ENGAGEMENT_REQUIRED");
   serviceListingId=subjectId;
  }else if(subjectType==="mentor"){
   const profile=(await db.query("select id,user_id from mentor_profile where user_id=$1 and status='active' and moderation_status='approved'",[subjectId])).rows[0];
   if(!profile)throw mediaStoryError(404,"The approved mentor profile is not available for a public story.","NOT_FOUND");
   const engagement=(await db.query("select 1 from mentorship where mentor_user_id=$1 and mentee_user_id=$2 and status='completed' limit 1",[subjectId,authorUserId])).rowCount;
   if(!engagement)throw mediaStoryError(403,"Only a mentee with a completed mentorship can submit a participant story.","COMPLETED_MENTORSHIP_REQUIRED");
   mentorProfileId=profile.id;
  }else throw mediaStoryError(400,"Unsupported story subject.","VALIDATION_ERROR");
  const row=(await db.query("insert into public_media_story(service_listing_id,mentor_profile_id,author_user_id,idempotency_key,idempotency_payload_hash,title,summary,transcript,video_url,attribution_mode,attribution_name,evidence_status,consent_confirmed,consent_version,consent_text_snapshot,consented_at,moderation_status) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'participant_reported',true,$12,$13,now(),'pending') returning id,title,moderation_status,created_at",[serviceListingId,mentorProfileId,authorUserId,key,payloadHash,title,summary,transcript,videoUrl,attributionMode,attributionName,PUBLIC_MEDIA_STORY_CONSENT_VERSION,PUBLIC_MEDIA_STORY_CONSENT_TEXT])).rows[0];
  await audit(db,authorUserId,"public_media_story.submitted","public_media_story",row.id,requestId,{subjectType,subjectId,attributionMode,consentVersion:PUBLIC_MEDIA_STORY_CONSENT_VERSION});
  return {...row,nextAction:"Your story is private until a moderator approves it. You can withdraw publication consent at any time."};
 });
}
export async function withdrawPublicMediaStory(storyId,authorUserId,requestId){
 return withTransaction(async db=>{
  const story=(await db.query("select id,moderation_status,consent_withdrawn_at from public_media_story where id=$1 and author_user_id=$2 for update",[storyId,authorUserId])).rows[0];
  if(!story)throw mediaStoryError(404,"Story not found for this account.","NOT_FOUND");
  if(story.consent_withdrawn_at)return {...story,idempotent:true,nextAction:"Publication consent was already withdrawn."};
  const row=(await db.query("update public_media_story set consent_withdrawn_at=now(),moderation_status='withdrawn',moderated_at=coalesce(moderated_at,now()),updated_at=now() where id=$1 returning id,moderation_status,consent_withdrawn_at",[storyId])).rows[0];
  await audit(db,authorUserId,"public_media_story.consent_withdrawn","public_media_story",storyId,requestId);
  return {...row,nextAction:"The story is no longer publicly visible. The consent withdrawal is recorded."};
 });
}
export async function listPublicMediaStoryReviewQueue(actorId,status="pending"){
 const db=getPool();
 await requireMediaModerator(db,actorId);
 if(!["pending","approved","rejected"].includes(status))throw mediaStoryError(400,"Unsupported moderation filter.","VALIDATION_ERROR");
 return (await db.query("select s.id,s.service_listing_id,s.mentor_profile_id,s.author_user_id,p.display_name author_display_name,s.title,s.summary,s.transcript,s.video_url,s.attribution_mode,s.attribution_name,s.evidence_status,s.consent_version,s.consent_text_snapshot,s.consented_at,s.moderation_status,s.moderation_note,s.created_at,coalesce(sl.title,mp.headline) subject_title from public_media_story s join person p on p.user_id=s.author_user_id left join service_listing sl on sl.id=s.service_listing_id left join mentor_profile mp on mp.id=s.mentor_profile_id where s.moderation_status=$1 and s.consent_withdrawn_at is null order by s.created_at asc limit 100",[status])).rows;
}
export async function reviewPublicMediaStory(storyId,actorId,input,requestId){
 const db=getPool();
 await requireMediaModerator(db,actorId);
 if(!["approved","rejected"].includes(input.status))throw mediaStoryError(400,"Review status must be approved or rejected.","VALIDATION_ERROR");
 const note=String(input.note||"").trim().slice(0,1000)||null;
 if(input.status==="rejected"&&!note)throw mediaStoryError(400,"A moderation reason is required when rejecting a story.","MODERATION_REASON_REQUIRED");
 return withTransaction(async tx=>{
  const story=(await tx.query("select * from public_media_story where id=$1 for update",[storyId])).rows[0];
  if(!story)throw mediaStoryError(404,"Public media story not found.","NOT_FOUND");
  if(story.consent_withdrawn_at||story.moderation_status==="withdrawn")throw mediaStoryError(409,"Publication consent was withdrawn; this story cannot be approved.","CONSENT_WITHDRAWN");
  if(story.moderation_status!=="pending")throw mediaStoryError(409,"Only pending stories can be reviewed.","INVALID_STATE");
  const row=(await tx.query("update public_media_story set moderation_status=$1,moderation_note=$2,moderated_by=$3,moderated_at=now(),updated_at=now() where id=$4 returning id,moderation_status,moderation_note,moderated_at",[input.status,note,actorId,storyId])).rows[0];
  await audit(tx,actorId,"public_media_story.moderated","public_media_story",storyId,requestId,{status:input.status,consentVersion:story.consent_version});
  return {...row,nextAction:input.status==="approved"?"The consented story is approved for public display.":"The story was rejected and remains private."};
 });
}
