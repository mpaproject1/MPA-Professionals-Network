import { createHash } from "node:crypto";
import { getPool, withTransaction } from "../platform/db.js";
import { assertOrganizationCapability, hasCurrentActiveMembership, hasProfessionalIdentity, policyError } from "../platform/identity-policy.js";
import { resolveNetworkPlusAccess } from "../platform/network-plus-access.js";
import { createInAppNotification } from "../platform/notifications.js";

const MEMBER_OWNER_ROLES = ["member", "professional"];
const ORG_OWNER_ROLES = ["owner", "administrator"];
const BUSINESS_REVIEW_ROLES = ["business_verification_reviewer", "system_admin"];
const LISTING_REVIEW_ROLES = ["business_moderator", "system_admin"];
const CATEGORIES = new Set(["professional_services","consulting","technology","design","education","healthcare","legal","finance","construction","trade","manufacturing","other","products_supply","business_services","creative_media","facilities_operations","agriculture_food","transport_logistics","specialist_regulatory"]);\nconst LISTING_KINDS = new Set(["need","offer","product_profile","service_profile"]);
const MODIFIABLE = new Set(["displayName","tradingName","description","website","locationLabel"]);
const LISTING_MODIFIABLE = new Set(["title","summary","description","serviceCategory","audience","deliveryMode","remoteAvailable","locationLabel","capacity","pricingModel","priceAmount","currency","pricingDetails","availability","credentials"]);
const hash = value => createHash("sha256").update(String(value)).digest("hex");
const fingerprint = value => hash(JSON.stringify(value));
function fail(status,message,code="BUSINESS_RULE"){ throw policyError(status,message,code); }
function text(value,max,field,{min=1,optional=false}={}) {
  const v=String(value??"").trim();
  if(optional&&!v)return null;
  if(v.length<min||v.length>max)fail(400,`${field} must be between ${min} and ${max} characters.`,"VALIDATION_ERROR");
  return v;
}
function safeWebsite(value) {
  if(value===undefined||value===null||value==="")return null;
  let url;try{url=new URL(String(value).trim());}catch{fail(400,"Website must be a valid HTTPS URL.","VALIDATION_ERROR");}
  if(url.protocol!=="https:"||url.username||url.password||!url.hostname)fail(400,"Website must be a valid HTTPS URL without embedded credentials.","VALIDATION_ERROR");
  return url.toString();
}
function publicText(value,max,field,{min=1}={}) {
  const v=text(value,max,field,{min});
  const patterns=[/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,/(?:https?:\/\/|www\.)\S+/i,/(?:telegram|whatsapp|signal|instagram|facebook|tiktok)\s*(?:handle|username|me|us|at)?\s*[:@]\s*[\w.]{3,}/i,/(?:^|\s)@[A-Z0-9_.]{3,}\b/i];
  const phones=v.match(/(?:\+?\d[\d\s().-]{7,}\d)/g)||[];
  if(patterns.some(pattern=>pattern.test(v))||phones.some(phone=>phone.replace(/\D/g,"").length>=9))fail(400,"Remove personal contact details and direct-contact links from public profile/listing text. Use the approved website field instead.","PUBLIC_CONTACT_DETAILS_FORBIDDEN");
  return v;
}
async function validateGeographyReference(db,id) {
  if(!id)return null;
  const valid=(await db.query("select ri.id from reference_item ri join reference_dataset_version rv on rv.id=ri.dataset_version_id join reference_dataset rd on rd.id=rv.dataset_id where ri.id=$1 and rd.domain='geography' and rv.status='published' and ri.active=true",[id])).rows[0];
  if(!valid)fail(400,"Choose a location from the published geography reference list.","INVALID_GEOGRAPHY_REFERENCE");
  return id;
}
function optionalPublicText(value,max,field) { return value===undefined||value===null||String(value).trim()===""?null:publicText(value,max,field,{min:1}); }
function normalizeBusinessInput(input) {
  return {
    businessKind:input.businessKind,
    displayName:publicText(input.displayName,160,"Business name",{min:2}),
    tradingName:optionalPublicText(input.tradingName,160,"Trading name"),
    description:publicText(input.description,5000,"Description",{min:20}),
    website:safeWebsite(input.website),
    locationLabel:optionalPublicText(input.locationLabel,160,"Location"),
    geographyReferenceItemId:input.geographyReferenceItemId||null
  };
}
function normalizeListingInput(input) {
  const row={
    title:publicText(input.title,160,"Title",{min:3}),
    summary:publicText(input.summary,500,"Summary",{min:20}),
    description:publicText(input.description,8000,"Description",{min:40}),
    serviceCategory:text(input.serviceCategory,100,"Service category",{min:2}).toLowerCase(),
    audience:input.audience||"members",
    deliveryMode:input.deliveryMode||"remote",
    remoteAvailable:input.remoteAvailable===undefined?(input.deliveryMode||"remote")==="remote":input.remoteAvailable,
    locationLabel:text(input.locationLabel,160,"Location",{optional:true}),
    capacity:input.capacity===undefined||input.capacity===null||input.capacity===""?null:Number(input.capacity),
    pricingModel:input.pricingModel||"quote",
    priceAmount:input.priceAmount===undefined||input.priceAmount===null||input.priceAmount===""?null:Number(input.priceAmount),
    currency:input.currency?String(input.currency).trim().toUpperCase():null,
    pricingDetails:normalizePricingDetails(input.pricingDetails),
    availability:input.availability&&typeof input.availability==="object"&&!Array.isArray(input.availability)?input.availability:{},
    credentials:Array.isArray(input.credentials)?input.credentials.map(value=>publicText(value,160,"Credential",{min:2})):[]
  };
  if(!CATEGORIES.has(row.serviceCategory))fail(400,"Choose a supported service category.","VALIDATION_ERROR");
  if(!["members","organizations","both"].includes(row.audience))fail(400,"Unsupported listing audience.","VALIDATION_ERROR");
  if(!["remote","onsite","hybrid"].includes(row.deliveryMode))fail(400,"Unsupported delivery mode.","VALIDATION_ERROR");
  if(typeof row.remoteAvailable!=="boolean")fail(400,"Remote availability must be explicitly selected.","VALIDATION_ERROR");
  if(!["free","fixed","hourly","unit","range","quote","subscription","not_applicable"].includes(row.pricingModel))fail(400,"Unsupported pricing model.","VALIDATION_ERROR");
  if(row.capacity!==null&&(!Number.isInteger(row.capacity)||row.capacity<1||row.capacity>100000))fail(400,"Capacity must be a positive whole number.","VALIDATION_ERROR");
  if(row.priceAmount!==null&&(!Number.isFinite(row.priceAmount)||row.priceAmount<0))fail(400,"Price must be a non-negative amount.","VALIDATION_ERROR");
  validateListingPricing({pricing_model:row.pricingModel,price_amount:row.priceAmount,currency:row.currency,pricing_details:row.pricingDetails});
  if(row.credentials.length>30||row.credentials.some(x=>typeof x!=="string"||x.trim().length>160))fail(400,"Credentials must be a short list of up to 30 labels.","VALIDATION_ERROR");
  if(JSON.stringify(row.availability).length>8000)fail(400,"Availability details are too large.","VALIDATION_ERROR");
  return row;
}
function visibleAudiences(access) { return [...(access.access.member?["members"]:[]),...(access.access.organization?["organizations"]:[]),"both"]; }
async function assertEntry(db,userId) {
  const access=await resolveNetworkPlusAccess(db,userId);
  if(!access.eligible)fail(403,"Network-Plus access is required.","NETWORK_PLUS_FORBIDDEN");
  return access;
}
async function rolesFor(db,userId) {
  return (await db.query("select r.role_code from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1",[userId])).rows.map(r=>r.role_code);
}
async function permissionsFor(db,userId) {
  return (await db.query("select permission_code from app_user_permission where user_id=$1",[userId])).rows.map(r=>r.permission_code);
}
async function assertBusinessOwner(db,businessId,userId,capability="business.manage_listing") {
  await assertEntry(db,userId);
  const business=(await db.query("select * from network_plus_business where id=$1",[businessId])).rows[0];
  if(!business)fail(404,"Business not found.","NOT_FOUND");
  const owned=(await db.query(`select bo.id,bo.owner_type,bo.owner_role,bo.consent_status,bo.owner_organization_id
    from network_plus_business_ownership bo
    where bo.business_id=$1 and bo.status='active' and bo.consent_status='accepted'
      and ((bo.owner_type='member' and bo.owner_user_id=$2
          and exists(select 1 from membership_record mr where mr.user_id=bo.owner_user_id and mr.status='active' and mr.start_date<=current_date and (mr.end_date is null or mr.end_date>=current_date))
          and exists(select 1 from app_user_role ur join app_role ar on ar.id=ur.role_id where ur.user_id=bo.owner_user_id and ar.role_code=any(array['member','professional']::text[])))
        or (bo.owner_type='organization' and exists(
          select 1 from organization_membership om where om.organization_id=bo.owner_organization_id
            and om.user_id=$2 and om.status='active' and om.role_code=any($3::text[])
        ))) limit 1`,[businessId,userId,ORG_OWNER_ROLES])).rows[0];
  if(owned)return {business,owner:owned};
  const delegated=(await db.query(`select 1 from network_plus_business_access
    where business_id=$1 and user_id=$2 and capability_code=$3 and revoked_at is null
      and (expires_at is null or expires_at>now())
      and (
        exists(select 1 from network_plus_business_ownership bo join organization_membership om on om.organization_id=bo.owner_organization_id
          where bo.business_id=$1 and bo.owner_type='organization' and bo.owner_role='primary_owner' and bo.status='active'
            and om.user_id=$2 and om.status='active' and om.role_code='project_manager')
        or (not exists(select 1 from network_plus_business_ownership bo where bo.business_id=$1 and bo.owner_type='organization' and bo.owner_role='primary_owner' and bo.status='active')
          and exists(select 1 from membership_record mr where mr.user_id=$2 and mr.status='active' and mr.start_date<=current_date and (mr.end_date is null or mr.end_date>=current_date)))
      ) limit 1`,[businessId,userId,capability])).rowCount>0;
  if(!delegated)fail(403,"An active owner or explicit business-scoped assignment is required.","BUSINESS_FORBIDDEN");
  return {business,owner:null};
}
async function assertIndependentBusinessReviewer(db,businessId,userId) {
  const conflict=(await db.query(`select 1 from network_plus_business_ownership bo
    where bo.business_id=$1 and bo.status='active' and bo.consent_status='accepted'
      and ((bo.owner_type='member' and bo.owner_user_id=$2) or
        (bo.owner_type='organization' and exists(select 1 from organization_membership om
          where om.organization_id=bo.owner_organization_id and om.user_id=$2 and om.status='active' and om.role_code=any($3::text[]))))
    union all
    select 1 from network_plus_business_access a where a.business_id=$1 and a.user_id=$2 and a.revoked_at is null and (a.expires_at is null or a.expires_at>now())
    limit 1`,[businessId,userId,ORG_OWNER_ROLES])).rowCount>0;
  if(conflict)fail(403,"A business owner, co-owner or delegated manager cannot review or moderate that business.","BUSINESS_REVIEW_CONFLICT");
}
async function transitionBusinessListings(db,businessId,actorUserId,fromStatuses,toStatus,requestId,reason,eventCode) {
  const rows=(await db.query("select id,status from network_plus_service_listing where business_id=$1 and status=any($2::text[]) for update",[businessId,fromStatuses])).rows;
  for(const row of rows){
    await db.query("update network_plus_service_listing set status=$1,suspended_at=case when $1='suspended' then now() else suspended_at end,suspension_reason=case when $1='suspended' then $2 else suspension_reason end,updated_at=now() where id=$3",[toStatus,reason||null,row.id]);
    await audit(db,actorUserId,eventCode,"network_plus_service_listing",row.id,requestId,{businessId,from:row.status,to:toStatus,reason:reason||null});
  }
  return rows.length;
}
async function audit(db,actor,action,type,id,requestId,metadata={}) {
  await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,$2,$3,$4,$5,'success',$6)",[actor,action,type,id,requestId,metadata]);
  if(type==="network_plus_business")await db.query("insert into network_plus_business_event(business_id,actor_user_id,event_code,from_status,to_status,reason,request_id,metadata) values($1,$2,$3,$4,$5,$6,$7,$8)",[id,actor,action,metadata.from||null,metadata.to||metadata.status||null,metadata.reason||null,requestId,metadata]);
  if(type==="network_plus_service_listing")await db.query("insert into network_plus_service_listing_event(listing_id,actor_user_id,event_code,from_status,to_status,reason,request_id,metadata) values($1,$2,$3,$4,$5,$6,$7,$8)",[id,actor,action,metadata.from||null,metadata.to||metadata.status||null,metadata.reason||null,requestId,metadata]);
}
async function notifyOwners(db,businessId,eventCode,payload) {
  const owners=(await db.query(`select distinct bo.owner_user_id user_id from network_plus_business_ownership bo
    where bo.business_id=$1 and bo.owner_type='member' and bo.status='active' and bo.consent_status='accepted'
    union select distinct om.user_id from network_plus_business_ownership bo
      join organization_membership om on om.organization_id=bo.owner_organization_id
      where bo.business_id=$1 and bo.owner_type='organization' and bo.status='active'
        and bo.consent_status='accepted' and om.status='active' and om.role_code=any($2::text[])`,[businessId,ORG_OWNER_ROLES])).rows;
  for(const owner of owners)await createInAppNotification(db,owner.user_id,eventCode,"network_plus_business",businessId,payload);
}
async function assertBusinessPublishable(db,businessId,{requireModeration=true,allowSuspended=false,requirePublished=false}={}) {
  const row=(await db.query("select b.business_kind,b.verification_status,b.moderation_status,b.publication_status,b.verification_expires_at, exists(select 1 from network_plus_business_ownership bo join organization o on o.id=bo.owner_organization_id where bo.business_id=b.id and bo.owner_type='organization' and bo.status='active' and bo.consent_status='accepted' and o.verification_status<>'verified') organization_unverified, (select count(*)::int from network_plus_business_ownership bo where bo.business_id=b.id and bo.status='pending') pending_owner_count, (select count(*)::int from network_plus_business_ownership bo where bo.business_id=b.id and bo.status='active' and bo.consent_status='accepted') active_owner_count from network_plus_business b where b.id=$1",[businessId])).rows[0];
  if(!row)fail(404,"Business not found.","NOT_FOUND");
  if(row.verification_status!=="verified")fail(409,"Business verification must be approved before a service listing can be published.","BUSINESS_NOT_VERIFIED");
  if(row.verification_expires_at&&new Date(row.verification_expires_at)<=new Date())fail(409,"Business verification has expired and must be renewed before publication.","BUSINESS_VERIFICATION_EXPIRED");
  if(row.organization_unverified)fail(409,"The linked organization must remain verified before this business can publish.","ORGANIZATION_NOT_VERIFIED");
  if(row.pending_owner_count>0)fail(409,"All invited co-owners must accept or decline before publication.","OWNERSHIP_CONSENT_PENDING");
  if(row.business_kind==="joint"&&row.active_owner_count<2)fail(409,"A joint business requires at least two accepted owner parties before publication.","JOINT_OWNERSHIP_INCOMPLETE");
  if(requireModeration&&row.moderation_status!=="approved")fail(409,"Business profile moderation must be approved before publishing a service listing.","BUSINESS_NOT_MODERATED");
  if(requirePublished&&row.publication_status!=="published")fail(409,"The business profile must be published before its service listings can be published.","BUSINESS_NOT_PUBLISHED");
  if((row.publication_status==="suspended"&&!allowSuspended)||row.publication_status==="archived")fail(409,"This business is not eligible to publish listings.","BUSINESS_NOT_PUBLISHABLE");
}
export async function createBusiness(userId,input,requestId,idempotencyKey) {
  input=input||{};
  if(typeof idempotencyKey!=="string"||!/^[A-Za-z0-9_-]{32,200}$/.test(idempotencyKey))fail(400,"A secure idempotency key is required.","IDEMPOTENCY_KEY_REQUIRED");
  const normalized=normalizeBusinessInput(input);
  const ownerType=input.ownerType;
  const organizationId=input.organizationId||null;
  if(!["member","organization"].includes(ownerType))fail(400,"Choose a canonical member or organization owner.","VALIDATION_ERROR");
  if((ownerType==="organization")!==Boolean(organizationId))fail(400,"Organization ownership requires exactly one organization ID.","VALIDATION_ERROR");
  await assertEntry(getPool(),userId);
  const roles=await rolesFor(getPool(),userId);
  if(ownerType==="member"){
    if(!roles.some(role=>MEMBER_OWNER_ROLES.includes(role))||!(await hasCurrentActiveMembership(getPool(),userId)))fail(403,"An active professional member account is required to own a personal business.","BUSINESS_OWNER_NOT_ELIGIBLE");
  }else{
    await assertOrganizationCapability(getPool(),organizationId,userId,ORG_OWNER_ROLES);
  }
  if(!["individual","organization","joint"].includes(normalized.businessKind))fail(400,"Unsupported business ownership type.","VALIDATION_ERROR");
  if(normalized.businessKind==="individual"&&ownerType!=="member")fail(400,"An individual business must have a member owner.","OWNER_TYPE_MISMATCH");
  if(normalized.businessKind==="organization"&&ownerType!=="organization")fail(400,"An organization business must have an organization owner.","OWNER_TYPE_MISMATCH");
  const keyHash=hash(idempotencyKey),payloadFingerprint=fingerprint({...normalized,ownerType,organizationId,businessKind:normalized.businessKind});
  return withTransaction(async db=>{
    const existing=(await db.query("select * from network_plus_business where request_idempotency_hash=$1 for update",[keyHash])).rows[0];
    if(existing){
      if(existing.request_fingerprint!==payloadFingerprint)fail(409,"This submission key was already used for different business details.","IDEMPOTENCY_CONFLICT");
      return {...existing,idempotent:true};
    }
    await validateGeographyReference(db,normalized.geographyReferenceItemId);
    const ownerIdentity=ownerType==="member"?userId:organizationId;
    const duplicateKey=ownerType+":"+ownerIdentity+":"+normalized.displayName.toLowerCase();
    await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[duplicateKey]);
    const duplicate=(await db.query(`select b.id from network_plus_business b join network_plus_business_ownership bo on bo.business_id=b.id
      where lower(b.display_name)=lower($1) and bo.status in ('pending','active')
        and ((bo.owner_type='member' and bo.owner_user_id=$2) or (bo.owner_type='organization' and bo.owner_organization_id=$3))
      limit 1`,[normalized.displayName,ownerType==="member"?userId:null,organizationId])).rows[0];
    if(duplicate)fail(409,"A business with this name is already registered under this owner identity.","DUPLICATE_BUSINESS");
    const row=(await db.query(`insert into network_plus_business(business_kind,display_name,trading_name,description,website,geography_reference_item_id,location_label,created_by,request_idempotency_hash,request_fingerprint)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,[normalized.businessKind,normalized.displayName,normalized.tradingName,normalized.description,normalized.website,normalized.geographyReferenceItemId,normalized.locationLabel,userId,keyHash,payloadFingerprint])).rows[0];
    const ownership=(await db.query(`insert into network_plus_business_ownership(business_id,owner_type,owner_user_id,owner_organization_id,owner_role,consent_status,status,consented_at,created_by)
      values($1,$2,$3,$4,'primary_owner','accepted','active',now(),$5) returning id`,[row.id,ownerType,ownerType==="member"?userId:null,organizationId,userId])).rows[0];
    await audit(db,userId,"network_plus.business_created","network_plus_business",row.id,requestId,{businessKind:row.business_kind,ownerType,ownershipId:ownership.id});
    return row;
  });
}
export async function listMyBusinesses(userId) {
  const db=getPool();await assertEntry(db,userId);
  return (await db.query(`select distinct b.id,b.business_kind,b.display_name,b.trading_name,b.description,b.website,b.location_label,
    b.verification_status,b.moderation_status,b.publication_status,b.created_at,b.updated_at
    from network_plus_business b join network_plus_business_ownership bo on bo.business_id=b.id
    where bo.status='active' and bo.consent_status='accepted'
      and ((bo.owner_type='member' and bo.owner_user_id=$1
            and exists(select 1 from membership_record mr where mr.user_id=$1 and mr.status='active' and mr.start_date<=current_date and (mr.end_date is null or mr.end_date>=current_date))
            and exists(select 1 from app_user_role ur join app_role ar on ar.id=ur.role_id where ur.user_id=$1 and ar.role_code=any(array['member','professional']::text[])))
        or (bo.owner_type='organization' and exists(select 1 from organization_membership om where om.organization_id=bo.owner_organization_id and om.user_id=$1 and om.status='active' and om.role_code=any($2::text[]))))
    union
    select distinct b.id,b.business_kind,b.display_name,b.trading_name,b.description,b.website,b.location_label,
      b.verification_status,b.moderation_status,b.publication_status,b.created_at,b.updated_at
    from network_plus_business b join network_plus_business_access a on a.business_id=b.id
    where a.user_id=$1 and a.revoked_at is null and (a.expires_at is null or a.expires_at>now())
      and (exists(select 1 from network_plus_business_ownership bo join organization_membership om on om.organization_id=bo.owner_organization_id
            where bo.business_id=b.id and bo.owner_type='organization' and bo.owner_role='primary_owner' and bo.status='active'
              and om.user_id=$1 and om.status='active' and om.role_code='project_manager')
        or (not exists(select 1 from network_plus_business_ownership bo where bo.business_id=b.id and bo.owner_type='organization' and bo.owner_role='primary_owner' and bo.status='active')
          and exists(select 1 from membership_record mr where mr.user_id=$1 and mr.status='active' and mr.start_date<=current_date and (mr.end_date is null or mr.end_date>=current_date))))
    order by created_at desc`,[userId,ORG_OWNER_ROLES])).rows;
}
export async function updateBusiness(businessId,userId,input,requestId) {
  const entries=Object.entries(input||{}).filter(([key])=>MODIFIABLE.has(key));
  if(!entries.length)fail(400,"Provide at least one supported business profile field.","VALIDATION_ERROR");
  return withTransaction(async db=>{
    const {business}=await assertBusinessOwner(db,businessId,userId);
    if(business.publication_status==="archived")fail(409,"An archived business cannot be edited through the ordinary management route.","BUSINESS_LOCKED");
    const next={displayName:business.display_name,tradingName:business.trading_name,description:business.description,website:business.website,locationLabel:business.location_label};
    for(const [key,value] of entries){
      if(key==="website")next.website=safeWebsite(value);
      else next[key]=key==="tradingName"||key==="locationLabel"?optionalPublicText(value,160,key):key==="displayName"?publicText(value,160,key,{min:2}):publicText(value,5000,key,{min:20});
    }
    const row=(await db.query(`update network_plus_business set display_name=$1,trading_name=$2,description=$3,website=$4,location_label=$5,
      verification_status=case when verification_status='verified' then 'submitted' else verification_status end,
      moderation_status=case when moderation_status='approved' then 'not_submitted' else moderation_status end,
      publication_status=case when publication_status='published' then 'paused' else publication_status end,updated_at=now()
      where id=$6 returning *`,[next.displayName,next.tradingName,next.description,next.website,next.locationLabel,businessId])).rows[0];
    await audit(db,userId,"network_plus.business_updated","network_plus_business",businessId,requestId,{fields:entries.map(([key])=>key)});
    await notifyOwners(db,businessId,"network_plus.business_profile_updated",{message:"Business profile details were updated. Verification and moderation may need renewed review.",nextAction:"Review the updated profile and submit it for verification.",actionUrl:"/network-plus/businesses/"+businessId,eventVersion:row.updated_at});
    return row;
  });
}
export async function submitBusinessVerification(businessId,userId,requestId) {
  return withTransaction(async db=>{
    const {business}=await assertBusinessOwner(db,businessId,userId);
    if(business.publication_status==="archived")fail(409,"An archived business cannot be resubmitted for verification.","BUSINESS_LOCKED");
    const existing=(await db.query("select id,status,submitted_by from network_plus_business_verification_case where business_id=$1 and status in ('submitted','under_review','appealed') order by created_at desc limit 1 for update",[businessId])).rows[0];
    if(existing)return {...existing,idempotent:true};
    const draft=(await db.query("select id from network_plus_business_verification_case where business_id=$1 and status='draft' order by created_at desc limit 1 for update",[businessId])).rows[0];
    const evidenceCount=Number((await db.query("select count(*)::int count from network_plus_business_verification_evidence e join network_plus_business_verification_case c on c.id=e.case_id where c.business_id=$1 and c.id=$2",[businessId,draft?.id||null])).rows[0]?.count||0);
    if(!draft||evidenceCount<1)fail(409,"Attach at least one private verification evidence file before submitting this business for review.","BUSINESS_EVIDENCE_REQUIRED");
    const row=(await db.query("update network_plus_business_verification_case set status='submitted',submitted_by=$1,submitted_at=now(),updated_at=now() where id=$2 returning *",[userId,draft.id])).rows[0];
    await db.query("update network_plus_business set verification_status='submitted',updated_at=now() where id=$1",[businessId]);
    await audit(db,userId,"network_plus.business_verification_submitted","network_plus_business",businessId,requestId,{caseId:row.id});
    const reviewers=(await db.query(`select distinct u.id from app_user u
      where u.status='active' and (exists(select 1 from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=u.id and r.role_code=any($1::text[]))
        or exists(select 1 from app_user_permission p where p.user_id=u.id and p.permission_code='business.verify'))`,[BUSINESS_REVIEW_ROLES])).rows;
    for(const reviewer of reviewers)await createInAppNotification(db,reviewer.id,"network_plus.business_verification_review_required","network_plus_business",businessId,{message:"A business profile is awaiting independent verification review.",nextAction:"Review the business verification case and record a reasoned decision.",actionUrl:"/admin/network-plus/businesses",actionRequired:true,priority:"high",eventVersion:row.created_at});
    return row;
  });
}
export async function reviewBusinessVerification(businessId,userId,input,requestId) {
  const status=input?.status,reason=text(input?.reason,1000,"Decision reason",{min:8});
  if(!["under_review","changes_requested","verified","rejected","suspended","appealed"].includes(status))fail(400,"Unsupported verification decision.","VALIDATION_ERROR");
  return withTransaction(async db=>{
    const roles=await rolesFor(db,userId),permissions=await permissionsFor(db,userId);
    if(!roles.some(r=>BUSINESS_REVIEW_ROLES.includes(r))&&!permissions.includes("business.verify"))fail(403,"Independent business verification reviewer authority is required.","BUSINESS_REVIEW_FORBIDDEN");
    const row=(await db.query("select * from network_plus_business where id=$1 for update",[businessId])).rows[0];
    if(!row)fail(404,"Business not found.","NOT_FOUND");
    const open=(await db.query("select * from network_plus_business_verification_case where business_id=$1 and status in ('submitted','under_review','appealed') order by created_at desc limit 1 for update",[businessId])).rows[0];
    if(!open)fail(409,"There is no open business verification case.","NO_OPEN_VERIFICATION_CASE");
    if(open.submitted_by===userId)fail(403,"A person cannot review their own business verification submission.","SELF_REVIEW_FORBIDDEN");
    await assertIndependentBusinessReviewer(db,businessId,userId);
    const expiry=input.expiresAt?new Date(input.expiresAt):null;
    if(status==="verified"&&(!expiry||!Number.isFinite(expiry.getTime())||expiry<=new Date()))fail(400,"A verified decision requires a valid future revalidation date.","VERIFICATION_EXPIRY_REQUIRED");
    const updated=(await db.query(`update network_plus_business_verification_case set status=$1,reviewer_user_id=$2,decision_reason=$3,reviewed_at=now(),expires_at=$4,updated_at=now() where id=$5 returning *`,[status,userId,reason,expiry,open.id])).rows[0];
    await db.query(`update network_plus_business set verification_status=$1,verified_at=case when $1='verified' then now() else null end,
      verification_expires_at=$2,verified_by=$3,publication_status=case when $1='suspended' then 'suspended' when $1='verified' then publication_status else 'paused' end,updated_at=now() where id=$4`,[status==="appealed"?"under_review":status,expiry,userId,businessId]);
    if(status==="suspended")await transitionBusinessListings(db,businessId,userId,["published","paused","pending_review"],"suspended",requestId,reason,"network_plus.listing_suspended_by_business_moderation");
    await audit(db,userId,"network_plus.business_verification_decided","network_plus_business",businessId,requestId,{caseId:open.id,status,reason,expiresAt:expiry?.toISOString()||null});
    await notifyOwners(db,businessId,"network_plus.business_verification_decided",{message:"A decision was recorded for the business verification case.",nextAction:status==="verified"?"Continue to listing moderation and publication.":"Review the decision reason and provide any requested clarification.",actionUrl:"/network-plus/businesses/"+businessId,status,eventVersion:updated.updated_at});
    return updated;
  });
}

function normalizeStructuredAttributes(value) {
  const attributes=value===undefined||value===null?{}:value;
  if(typeof attributes!=="object"||Array.isArray(attributes))fail(400,"Category details must be a structured object.","VALIDATION_ERROR");
  if(JSON.stringify(attributes).length>8000)fail(400,"Category details are too large.","PAYLOAD_TOO_LARGE");
  const visit=(node,key="")=>{
    if(/email|phone|mobile|whatsapp|telegram|contact|address/i.test(key))fail(400,"Private contact details cannot be included in public listing attributes.","PUBLIC_CONTACT_DETAILS_FORBIDDEN");
    if(typeof node==="string")publicText(node,1000,"Category detail",{min:0});
    else if(Array.isArray(node))node.forEach(item=>visit(item,key));
    else if(node&&typeof node==="object")for(const [childKey,child] of Object.entries(node))visit(child,childKey);
    else if(node!==null&&typeof node!=="number"&&typeof node!=="boolean")fail(400,"Category detail values must be text, numbers, booleans or lists.","VALIDATION_ERROR");
  };
  visit(attributes); return attributes;
}
function normalizePricingDetails(value) {
  const details=value===undefined||value===null?{}:value;
  if(!details||typeof details!=="object"||Array.isArray(details)||JSON.stringify(details).length>2000)fail(400,"Pricing disclosures must be a small structured object.","VALIDATION_ERROR");
  const allowed=new Set(["unitLabel","minimumAmount","maximumAmount","billingPeriod","taxIncluded","feesIncluded","assumptions"]);
  for(const key of Object.keys(details))if(!allowed.has(key))fail(400,"Unsupported pricing disclosure field.","VALIDATION_ERROR");
  const output={};
  if(details.unitLabel!==undefined)output.unitLabel=publicText(details.unitLabel,50,"Price unit",{min:1});
  for(const key of ["minimumAmount","maximumAmount"])if(details[key]!==undefined&&details[key]!==null&&details[key]!==""){const amount=Number(details[key]);if(!Number.isFinite(amount)||amount<0)fail(400,"Pricing range amounts must be non-negative.","VALIDATION_ERROR");output[key]=amount;}
  if(details.billingPeriod!==undefined)output.billingPeriod=String(details.billingPeriod);
  if(details.taxIncluded!==undefined){if(typeof details.taxIncluded!=="boolean")fail(400,"Tax disclosure must be yes or no.","VALIDATION_ERROR");output.taxIncluded=details.taxIncluded;}
  if(details.feesIncluded!==undefined){if(typeof details.feesIncluded!=="boolean")fail(400,"Fee disclosure must be yes or no.","VALIDATION_ERROR");output.feesIncluded=details.feesIncluded;}
  if(details.assumptions!==undefined)output.assumptions=publicText(details.assumptions,500,"Pricing assumptions",{min:0});
  return output;
}
function validateListingPricing(row) {
  const model=row.pricing_model,amount=row.price_amount,currency=row.currency,details=row.pricing_details||{};
  if(["fixed","hourly"].includes(model)&&(!(amount>0)||!currency||! /^[A-Z]{3}$/.test(currency)))fail(400,"Fixed and hourly pricing require an amount and ISO currency.","PRICING_DISCLOSURE_REQUIRED");
  if(model==="unit"&&(!(amount>0)||!currency||! /^[A-Z]{3}$/.test(currency)||!details.unitLabel))fail(400,"Unit pricing requires an amount, currency and unit label.","PRICING_DISCLOSURE_REQUIRED");
  if(model==="subscription"&&(!(amount>0)||!currency||! /^[A-Z]{3}$/.test(currency)||!["weekly","monthly","quarterly","annually"].includes(details.billingPeriod)))fail(400,"Subscription pricing requires an amount, currency and billing period.","PRICING_DISCLOSURE_REQUIRED");
  if(model==="range"&&(!Number.isFinite(details.minimumAmount)||!Number.isFinite(details.maximumAmount)||details.minimumAmount<0||details.maximumAmount<details.minimumAmount||!currency||! /^[A-Z]{3}$/.test(currency)))fail(400,"Price ranges require valid minimum and maximum amounts and an ISO currency.","PRICING_DISCLOSURE_REQUIRED");
  if(["free","quote","not_applicable"].includes(model)&&(amount!==null&&amount!==undefined&&Number(amount)!==0))fail(400,"This pricing model cannot include a fixed amount.","PRICING_DISCLOSURE_INVALID");
  if(["free","quote","not_applicable"].includes(model)&&currency)fail(400,"This pricing model must not include a currency without an amount.","PRICING_DISCLOSURE_INVALID");
}
async function validateListingTaxonomy(db,category,subcategory,listingKind) {
  if(!LISTING_KINDS.has(listingKind))fail(400,"Choose a supported listing type.","VALIDATION_ERROR");
  if(!category){if(subcategory)fail(400,"Choose a primary category before selecting a subcategory.","INVALID_LISTING_SUBCATEGORY");return null;}
  const row=(await db.query("select code,listing_kinds from network_plus_listing_taxonomy where code=$1 and active=true",[category])).rows[0];
  if(!row||!row.listing_kinds.includes(listingKind))fail(400,"Choose an active category that supports this listing type.","INVALID_LISTING_CATEGORY");
  if(subcategory){const child=(await db.query("select code,listing_kinds from network_plus_listing_taxonomy where code=$1 and parent_code=$2 and active=true",[subcategory,category])).rows[0];if(!child||!child.listing_kinds.includes(listingKind))fail(400,"Choose a valid subcategory for the selected category and listing type.","INVALID_LISTING_SUBCATEGORY");}
  return row;
}
export async function listNetworkPlusListingTaxonomy(viewerId) {
  const db=getPool();await assertEntry(db,viewerId);
  return (await db.query("select code,parent_code,label,description,listing_kinds,field_schema,sort_order,taxonomy_version from network_plus_listing_taxonomy where active=true order by coalesce(parent_code,''),sort_order,label")).rows;
}
export async function createOpportunityListingDraft(businessId,userId,input,requestId,idempotencyKey) {
  if(typeof idempotencyKey!=="string"||!/^[A-Za-z0-9_-]{32,200}$/.test(idempotencyKey))fail(400,"A secure idempotency key is required.","IDEMPOTENCY_KEY_REQUIRED");
  const data=input||{},listingKind=data.listingKind||"offer",category=data.categoryCode||data.serviceCategory||null,subcategory=data.subcategoryCode||null;
  const title=data.title?publicText(data.title,160,"Title",{min:3}):null,summary=data.summary?publicText(data.summary,500,"Summary",{min:20}):null,description=data.description?publicText(data.description,8000,"Description",{min:40}):null;
  const attributes=normalizeStructuredAttributes(data.structuredAttributes),step=Number(data.wizardStep||1);
  if(!Number.isInteger(step)||step<1||step>8)fail(400,"Wizard step must be between 1 and 8.","VALIDATION_ERROR");
  const keyHash=hash(idempotencyKey),payloadFingerprint=fingerprint({businessId,userId,listingKind,category,subcategory,title,summary,description,attributes,step});
  return withTransaction(async db=>{
    await assertBusinessOwner(db,businessId,userId);
    const existing=(await db.query("select * from network_plus_service_listing where request_idempotency_hash=$1 for update",[keyHash])).rows[0];
    if(existing){if(existing.request_fingerprint!==payloadFingerprint)fail(409,"This draft key was already used for different details.","IDEMPOTENCY_CONFLICT");return {...existing,idempotent:true};}
    await validateListingTaxonomy(db,category,subcategory,listingKind);
    const row=(await db.query("insert into network_plus_service_listing(business_id,created_by,title,summary,description,service_category,listing_kind,subcategory_code,structured_attributes,wizard_step,draft_saved_at,request_idempotency_hash,request_fingerprint) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),$11,$12) returning *",[businessId,userId,title,summary,description,category,listingKind,subcategory,attributes,step,keyHash,payloadFingerprint])).rows[0];
    await audit(db,userId,"network_plus.listing_draft_created","network_plus_service_listing",row.id,requestId,{businessId,listingKind});return row;
  });
}
function parseOpportunityLocalDateTime(value,timeZone) {
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))fail(400,"Next availability must use a local date and time.","VALIDATION_ERROR");
  let formatter;try{formatter=new Intl.DateTimeFormat("en-CA",{timeZone:timeZone||"UTC",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});}catch{fail(400,"Choose a valid IANA timezone.","INVALID_TIMEZONE");}
  const [datePart,timePart]=value.split("T"),[year,month,day]=datePart.split("-").map(Number),[hour,minute]=timePart.split(":").map(Number),target=Date.UTC(year,month-1,day,hour,minute);
  let guess=target;
  for(let attempt=0;attempt<3;attempt++){const parts=Object.fromEntries(formatter.formatToParts(new Date(guess)).map(part=>[part.type,part.value]));const represented=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute));guess+=target-represented;}
  const check=Object.fromEntries(formatter.formatToParts(new Date(guess)).map(part=>[part.type,part.value]));
  if(Number(check.year)!==year||Number(check.month)!==month||Number(check.day)!==day||Number(check.hour)!==hour||Number(check.minute)!==minute)fail(400,"The selected local time does not exist in this timezone.","INVALID_LOCAL_TIME");
  return new Date(guess);
}
export async function saveOpportunityListingDraft(listingId,userId,input,requestId) {
  const data=input||{};
  return withTransaction(async db=>{
    const row=(await db.query("select * from network_plus_service_listing where id=$1 for update",[listingId])).rows[0];
    if(!row)fail(404,"Opportunity draft not found.","NOT_FOUND");await assertBusinessOwner(db,row.business_id,userId);
    if(!["draft","changes_requested","published","paused"].includes(row.status))fail(409,"This listing cannot be edited in its current state.","DRAFT_LOCKED");
    const kind=data.listingKind||row.listing_kind||"service_profile",category=data.categoryCode===undefined?row.service_category:data.categoryCode,subcategory=data.subcategoryCode===undefined?row.subcategory_code:data.subcategoryCode;await validateListingTaxonomy(db,category,subcategory,kind);
    const title=data.title===undefined?row.title:(data.title?publicText(data.title,160,"Title",{min:3}):null),summary=data.summary===undefined?row.summary:(data.summary?publicText(data.summary,500,"Summary",{min:20}):null),description=data.description===undefined?row.description:(data.description?publicText(data.description,8000,"Description",{min:40}):null),attributes=data.structuredAttributes===undefined?row.structured_attributes:normalizeStructuredAttributes(data.structuredAttributes),step=data.wizardStep===undefined?row.wizard_step:Number(data.wizardStep);
    if(!Number.isInteger(step)||step<1||step>8)fail(400,"Wizard step must be between 1 and 8.","VALIDATION_ERROR");
    const audience=data.audience===undefined?row.audience:data.audience,delivery=data.deliveryMode===undefined?row.delivery_mode:data.deliveryMode,capacity=data.capacity===undefined?row.capacity:(data.capacity===""||data.capacity===null?null:Number(data.capacity)),pricing=data.pricingModel===undefined?row.pricing_model:data.pricingModel,price=data.priceAmount===undefined?row.price_amount:(data.priceAmount===""||data.priceAmount===null?null:Number(data.priceAmount)),currency=data.currency===undefined?row.currency:(data.currency?String(data.currency).trim().toUpperCase():null),pricingDetails=data.pricingDetails===undefined?(row.pricing_details||{}):normalizePricingDetails(data.pricingDetails);
    if(!["members","organizations","both"].includes(audience)||!["remote","onsite","hybrid"].includes(delivery)||!["free","fixed","hourly","unit","range","quote","subscription","not_applicable"].includes(pricing))fail(400,"Choose supported audience, delivery and pricing options.","VALIDATION_ERROR");
    if(capacity!==null&&(!Number.isInteger(capacity)||capacity<1||capacity>100000))fail(400,"Capacity must be a positive whole number.","VALIDATION_ERROR");
    if(price!==null&&(!Number.isFinite(price)||price<0))fail(400,"Price must be non-negative.","VALIDATION_ERROR");
    if(currency&&!/^[A-Z]{3}$/.test(currency))fail(400,"Currency must use a three-letter ISO code.","VALIDATION_ERROR");
    const remoteAvailable=data.remoteAvailable===undefined?Boolean(row.remote_available):data.remoteAvailable;
    if(typeof remoteAvailable!=="boolean")fail(400,"Remote availability must be explicitly selected.","VALIDATION_ERROR");
    const serviceRadiusKm=data.serviceRadiusKm===undefined?row.service_radius_km:(data.serviceRadiusKm===""||data.serviceRadiusKm===null?null:Number(data.serviceRadiusKm));
    const availabilityStatus=data.availabilityStatus===undefined?(row.availability_status||"accepting_requests"):data.availabilityStatus;
    const leadTimeDays=data.leadTimeDays===undefined?row.lead_time_days:(data.leadTimeDays===""||data.leadTimeDays===null?null:Number(data.leadTimeDays));
    const activeWorkLimit=data.activeWorkLimit===undefined?row.active_work_limit:(data.activeWorkLimit===""||data.activeWorkLimit===null?null:Number(data.activeWorkLimit));
    const timezone=data.timezone===undefined?row.timezone:(data.timezone?String(data.timezone).trim().slice(0,64):null);
    const nextAvailableAt=data.nextAvailableAt===undefined?row.next_available_at:(data.nextAvailableAt?parseOpportunityLocalDateTime(data.nextAvailableAt,timezone):null);
    const targetAudience=data.targetAudience===undefined?(row.target_audience||[]):data.targetAudience;
    if(serviceRadiusKm!==null&&(!Number.isInteger(serviceRadiusKm)||serviceRadiusKm<1||serviceRadiusKm>1000))fail(400,"Service radius must be between 1 and 1000 kilometres.","VALIDATION_ERROR");
    if(!["accepting_requests","limited","paused","unavailable"].includes(availabilityStatus))fail(400,"Choose a supported intake status.","VALIDATION_ERROR");
    if(leadTimeDays!==null&&(!Number.isInteger(leadTimeDays)||leadTimeDays<0||leadTimeDays>3650))fail(400,"Lead time must be between 0 and 3650 days.","VALIDATION_ERROR");
    if(activeWorkLimit!==null&&(!Number.isInteger(activeWorkLimit)||activeWorkLimit<1||activeWorkLimit>100000))fail(400,"Active work limit must be a positive whole number.","VALIDATION_ERROR");
    if(timezone&&timezone.length>64)fail(400,"Timezone is too long.","VALIDATION_ERROR");
    if(timezone){try{new Intl.DateTimeFormat("en-US",{timeZone:timezone});}catch{fail(400,"Choose a valid IANA timezone.","INVALID_TIMEZONE");}}
    if(nextAvailableAt&&Number.isNaN(nextAvailableAt.getTime()))fail(400,"Next availability must be a valid date and time.","VALIDATION_ERROR");
    const allowedAudience=new Set(["individuals","smes","nonprofits","public_institutions","startups","all"]);
    if(!Array.isArray(targetAudience)||targetAudience.some(value=>!allowedAudience.has(value)))fail(400,"Choose supported target-audience groups.","VALIDATION_ERROR");
    let areaIds=null,areaVersion=null,areaRows=[];
    if(data.geographyUnitIds!==undefined){
      if(!Array.isArray(data.geographyUnitIds)||data.geographyUnitIds.length>30)fail(400,"Choose up to 30 structured service areas.","VALIDATION_ERROR");
      areaIds=[...new Set(data.geographyUnitIds.map(value=>String(value)))];
      areaVersion=data.geographyVersionId||null;
      if(areaIds.length){
        if(!areaVersion)fail(400,"Choose a published geography reference version.","GEOGRAPHY_VERSION_REQUIRED");
        const version=(await db.query("select id from membership_geography_version where id=$1 and status='published'",[areaVersion])).rows[0];
        if(!version)fail(409,"The selected service-area reference version is not published.","GEOGRAPHY_VERSION_INVALID");
        areaRows=(await db.query("select id,label,unit_level from membership_geography_unit where version_id=$1 and id=any($2::uuid[]) and active=true",[areaVersion,areaIds])).rows;
        if(areaRows.length!==areaIds.length)fail(400,"One or more selected service areas are not active in this geography version.","GEOGRAPHY_UNIT_INVALID");
      }
    }
    const location=data.locationLabel===undefined?row.location_label:(data.locationLabel?optionalPublicText(data.locationLabel,160,"Location"):null);
    const resolvedLocation=areaIds&&areaIds.length?areaRows.map(unit=>unit.label).join(", ").slice(0,160):location;
    const updated=(await db.query("update network_plus_service_listing set title=$1,summary=$2,description=$3,service_category=$4,listing_kind=$5,subcategory_code=$6,structured_attributes=$7,wizard_step=$8,audience=$9,delivery_mode=$10,location_label=$11,capacity=$12,pricing_model=$13,price_amount=$14,currency=$15,pricing_details=$16,remote_available=$17,service_radius_km=$18,availability_status=$19,lead_time_days=$20,active_work_limit=$21,timezone=$22,next_available_at=$23,target_audience=$24,status=case when status in ('published','paused') then 'draft' else status end,draft_saved_at=now(),updated_at=now() where id=$25 returning *",[title,summary,description,category,kind,subcategory,attributes,step,audience,delivery,resolvedLocation,capacity,pricing,price,currency,pricingDetails,remoteAvailable,serviceRadiusKm,availabilityStatus,leadTimeDays,activeWorkLimit,timezone,nextAvailableAt,targetAudience,listingId])).rows[0];
    if(areaIds!==null){
      await db.query("delete from network_plus_service_listing_geography where listing_id=$1",[listingId]);
      for(const geographyUnitId of areaIds)await db.query("insert into network_plus_service_listing_geography(listing_id,geography_version_id,geography_unit_id,created_by) values($1,$2,$3,$4)",[listingId,areaVersion,geographyUnitId,userId]);
    }
    if(["published","paused"].includes(row.status))await audit(db,userId,"network_plus.listing_edit_started","network_plus_service_listing",listingId,requestId,{from:row.status,to:"draft"});
    await audit(db,userId,"network_plus.listing_draft_autosaved","network_plus_service_listing",listingId,requestId,{wizardStep:step,listingKind:kind});return updated;
  });
}
export async function listMyOpportunityListings(userId) {
  const db=getPool();await assertEntry(db,userId);const businesses=await listMyBusinesses(userId),ids=businesses.map(b=>b.id);if(!ids.length)return [];
  return (await db.query("select s.id,s.business_id,b.display_name business_name,s.title,s.summary,s.description,s.service_category category_code,s.subcategory_code,s.listing_kind,s.structured_attributes,s.wizard_step,s.draft_saved_at,s.status,s.moderation_reason,s.audience,s.delivery_mode,s.location_label,s.capacity,s.pricing_model,s.price_amount,s.currency,s.pricing_details,s.remote_available,s.service_radius_km,s.availability_status,s.lead_time_days,s.active_work_limit,s.timezone,s.next_available_at,s.target_audience,(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'version_id',lg.geography_version_id,'code',u.unit_code,'label',u.label,'level',u.unit_level) order by u.label),'[]'::jsonb) from network_plus_service_listing_geography lg join membership_geography_unit u on u.id=lg.geography_unit_id and u.version_id=lg.geography_version_id where lg.listing_id=s.id) geography_areas,s.created_at,s.updated_at,s.published_at from network_plus_service_listing s join network_plus_business b on b.id=s.business_id where s.business_id=any($1::uuid[]) order by case when s.status='draft' then 0 else 1 end,s.updated_at desc",[ids])).rows;
}
export async function createProfessionalServiceListing(businessId,userId,input,requestId,idempotencyKey) {
  if(typeof idempotencyKey!=="string"||!/^[A-Za-z0-9_-]{32,200}$/.test(idempotencyKey))fail(400,"A secure idempotency key is required.","IDEMPOTENCY_KEY_REQUIRED");
  const normalized=normalizeListingInput(input||{}),keyHash=hash(idempotencyKey),payloadFingerprint=fingerprint({businessId,userId,...normalized});
  return withTransaction(async db=>{
    await assertBusinessOwner(db,businessId,userId);
    const existing=(await db.query("select * from network_plus_service_listing where request_idempotency_hash=$1 for update",[keyHash])).rows[0];
    if(existing){
      if(existing.request_fingerprint!==payloadFingerprint)fail(409,"This submission key was already used for different listing details.","IDEMPOTENCY_CONFLICT");
      return {...existing,idempotent:true};
    }
    const row=(await db.query(`insert into network_plus_service_listing(business_id,created_by,title,summary,description,service_category,audience,delivery_mode,location_label,capacity,pricing_model,price_amount,currency,pricing_details,remote_available,availability,credentials,request_idempotency_hash,request_fingerprint)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) returning *`,[businessId,userId,normalized.title,normalized.summary,normalized.description,normalized.serviceCategory,normalized.audience,normalized.deliveryMode,normalized.locationLabel,normalized.capacity,normalized.pricingModel,normalized.priceAmount,normalized.currency,normalized.pricingDetails,normalized.remoteAvailable,normalized.availability,normalized.credentials,keyHash,payloadFingerprint])).rows[0];
    await audit(db,userId,"network_plus.service_listing_created","network_plus_service_listing",row.id,requestId,{businessId});
    return row;
  });
}
export async function updateProfessionalServiceListing(listingId,userId,input,requestId) {
  return withTransaction(async db=>{
    const row=(await db.query("select * from network_plus_service_listing where id=$1 for update",[listingId])).rows[0];
    if(!row)fail(404,"Professional service listing not found.","NOT_FOUND");
    await assertBusinessOwner(db,row.business_id,userId);
    if(row.status==="archived")fail(409,"An archived listing cannot be edited.","LISTING_LOCKED");
    const merged={title:row.title,summary:row.summary,description:row.description,serviceCategory:row.service_category,audience:row.audience,deliveryMode:row.delivery_mode,remoteAvailable:row.remote_available,locationLabel:row.location_label,capacity:row.capacity,pricingModel:row.pricing_model,priceAmount:row.price_amount,currency:row.currency,pricingDetails:row.pricing_details,availability:row.availability,credentials:row.credentials};
    const inputEntries=Object.entries(input||{}).filter(([key])=>LISTING_MODIFIABLE.has(key));
    if(!inputEntries.length)fail(400,"Provide at least one supported listing field.","VALIDATION_ERROR");
    for(const [key,value] of inputEntries)merged[key]=value;
    const normalized=normalizeListingInput(merged);
    const updated=(await db.query(`update network_plus_service_listing set title=$1,summary=$2,description=$3,service_category=$4,audience=$5,delivery_mode=$6,remote_available=$7,location_label=$8,capacity=$9,pricing_model=$10,price_amount=$11,currency=$12,pricing_details=$13,availability=$14,credentials=$15,
      status=case when status='published' then 'paused' when status='suspended' then 'suspended' else 'draft' end,updated_at=now() where id=$16 returning *`,[normalized.title,normalized.summary,normalized.description,normalized.serviceCategory,normalized.audience,normalized.deliveryMode,normalized.remoteAvailable,normalized.locationLabel,normalized.capacity,normalized.pricingModel,normalized.priceAmount,normalized.currency,normalized.pricingDetails,normalized.availability,normalized.credentials,listingId])).rows[0];
    await audit(db,userId,"network_plus.service_listing_updated","network_plus_service_listing",listingId,requestId,{fields:inputEntries.map(([key])=>key)});
    return updated;
  });
}
export async function submitProfessionalServiceListing(listingId,userId,requestId) {
  return withTransaction(async db=>{
    const row=(await db.query("select * from network_plus_service_listing where id=$1 for update",[listingId])).rows[0];
    if(!row)fail(404,"Professional service listing not found.","NOT_FOUND");
    await assertBusinessOwner(db,row.business_id,userId);
    await assertBusinessPublishable(db,row.business_id,{requirePublished:true});
    if(!["draft","changes_requested","rejected","paused","suspended"].includes(row.status))fail(409,"This listing is not ready for moderation submission.","INVALID_STATE");
    if(!row.title||!row.summary||!row.description||!row.service_category)fail(400,"Complete the title, summary, description and category before submitting this listing.","LISTING_INCOMPLETE");
    const taxonomy=(await db.query("select field_schema,listing_kinds from network_plus_listing_taxonomy where code=$1 and active=true",[row.service_category])).rows[0];
    if(!taxonomy||!taxonomy.listing_kinds.includes(row.listing_kind||"service_profile"))fail(400,"The selected listing category is no longer valid for this listing type.","INVALID_LISTING_CATEGORY");
    const categoryFields=[...(taxonomy.field_schema||[])];
    if(row.subcategory_code){const child=(await db.query("select field_schema from network_plus_listing_taxonomy where code=$1 and parent_code=$2 and active=true",[row.subcategory_code,row.service_category])).rows[0];if(!child)fail(400,"The selected subcategory is no longer valid.","INVALID_LISTING_SUBCATEGORY");categoryFields.push(...(child.field_schema||[]));}
    for(const field of categoryFields){const value=row.structured_attributes?.[field.code];if(field.required&&(value===undefined||value===null||value===""||(Array.isArray(value)&&!value.length)))fail(400,"Complete the required category-specific field: "+field.label+".","LISTING_CATEGORY_FIELD_REQUIRED");}
    validateListingPricing(row);
    const serviceAreas=await db.query("select 1 from network_plus_service_listing_geography where listing_id=$1 limit 1",[listingId]);
    if(row.delivery_mode==="remote"&&!row.remote_available)fail(400,"Confirm remote availability for a remote listing.","REMOTE_AVAILABILITY_REQUIRED");
    if(!row.remote_available&&!row.location_label&&!serviceAreas.rowCount)fail(400,"Select at least one structured service area or enable remote availability.","SERVICE_AREA_REQUIRED");
    if(row.service_radius_km&&!serviceAreas.rowCount)fail(400,"A service radius requires a structured service-area reference.","SERVICE_AREA_REQUIRED");

    const updated=(await db.query("update network_plus_service_listing set status='pending_review',moderation_reason=null,submitted_by=$2,updated_at=now() where id=$1 returning *",[listingId])).rows[0];
    await audit(db,userId,"network_plus.service_listing_submitted","network_plus_service_listing",listingId,requestId,{businessId:row.business_id,from:row.status,to:"pending_review"});
    const reviewers=(await db.query(`select distinct u.id from app_user u where u.status='active' and
      (exists(select 1 from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=u.id and r.role_code=any($1::text[]))
       or exists(select 1 from app_user_permission p where p.user_id=u.id and p.permission_code='business.moderate'))`,[LISTING_REVIEW_ROLES])).rows;
    for(const reviewer of reviewers)await createInAppNotification(db,reviewer.id,"network_plus.service_listing_review_required","network_plus_service_listing",listingId,{message:"A professional service listing is awaiting moderation.",nextAction:"Review the listing and approve, request changes or reject with a reason.",actionUrl:"/admin/network-plus/services",actionRequired:true,priority:"high",eventVersion:updated.updated_at});
    return updated;
  });
}
export async function moderateProfessionalServiceListing(listingId,userId,input,requestId) {
  const status=input?.status,reason=text(input?.reason,1000,"Moderation reason",{min:8});
  if(!["published","changes_requested","rejected","suspended"].includes(status))fail(400,"Unsupported moderation decision.","VALIDATION_ERROR");
  return withTransaction(async db=>{
    const roles=await rolesFor(db,userId),permissions=await permissionsFor(db,userId);
    if(!roles.some(r=>LISTING_REVIEW_ROLES.includes(r))&&!permissions.includes("business.moderate"))fail(403,"Independent business-listing moderation authority is required.","LISTING_REVIEW_FORBIDDEN");
    const row=(await db.query("select * from network_plus_service_listing where id=$1 for update",[listingId])).rows[0];
    if(!row)fail(404,"Professional service listing not found.","NOT_FOUND");
    if(row.created_by===userId||row.submitted_by===userId)fail(403,"A listing creator or submitter cannot moderate their own listing.","SELF_REVIEW_FORBIDDEN");
    await assertIndependentBusinessReviewer(db,row.business_id,userId);
    if(status==="suspended" ? !["published","paused","pending_review"].includes(row.status) : !["pending_review","suspended"].includes(row.status))fail(409,"This listing is not in a state eligible for the requested moderation decision.","INVALID_STATE");
    if(status==="published")await assertBusinessPublishable(db,row.business_id,{requirePublished:true});
    const updated=(await db.query(`update network_plus_service_listing set status=$1,moderation_reason=$2,reviewed_by=$3,reviewed_at=now(),
      published_at=case when $1='published' then now() else published_at end,
      suspended_at=case when $1='suspended' then now() else null end,
      suspension_reason=case when $1='suspended' then $2 else null end,updated_at=now() where id=$4 returning *`,[status,reason,userId,listingId])).rows[0];
    await audit(db,userId,"network_plus.service_listing_moderated","network_plus_service_listing",listingId,requestId,{status,reason,businessId:row.business_id,from:row.status,to:status});
    await notifyOwners(db,row.business_id,"network_plus.service_listing_moderation_decided",{message:"A moderation decision was recorded for a professional service listing.",nextAction:status==="published"?"Your listing is now visible to eligible Network-Plus members.":"Review the moderation reason and update the listing if changes are requested.",actionUrl:"/network-plus/businesses/"+row.business_id,status,eventVersion:updated.updated_at});
    return updated;
  });
}
export async function listBusinesses(viewerId,filters={}) {
  const db=getPool();await assertEntry(db,viewerId);
  const args=[],where=["b.publication_status='published'","b.verification_status='verified'","b.moderation_status='approved'","(b.verification_expires_at is null or b.verification_expires_at>now())", "not exists(select 1 from network_plus_business_ownership bo join organization o on o.id=bo.owner_organization_id where bo.business_id=b.id and bo.owner_type='organization' and bo.status='active' and bo.consent_status='accepted' and o.verification_status<>'verified')"];
  const q=String(filters.q||"").trim().slice(0,120);
  if(q){args.push(`%${q}%`);where.push(`(b.display_name ilike $${args.length} or coalesce(b.trading_name,'') ilike $${args.length} or b.description ilike $${args.length})`);}
  const geographyUnitId=String(filters.geographyUnitId||"").trim();if(geographyUnitId){if(!/^[0-9a-f-]{36}$/i.test(geographyUnitId))fail(400,"Choose a valid service-area reference.","VALIDATION_ERROR");args.push(geographyUnitId);where.push(`exists(select 1 from network_plus_service_listing_geography lg where lg.listing_id=s.id and lg.geography_unit_id=${args.length})`);}
  const limit=Math.min(Math.max(Number(filters.limit)||20,1),50),offset=Math.min(Math.max(Number(filters.offset)||0,0),100000);
  const base=` from network_plus_business b where ${where.join(" and ")}`;
  const total=Number((await db.query(`select count(*)::int count${base}`,args)).rows[0]?.count||0);
  const items=(await db.query(`select b.id,b.business_kind,b.display_name,b.trading_name,b.description,b.website,b.location_label,b.verified_at,b.verification_expires_at,b.created_at${base}
    order by b.display_name limit ${limit+1} offset ${offset}`,args)).rows;
  return {items:items.slice(0,limit),limit,offset,total,hasMore:offset+limit<total};
}
export async function getBusiness(businessId,viewerId) {
  const db=getPool();const access=await assertEntry(db,viewerId);
  const row=(await db.query(`select b.id,b.business_kind,b.display_name,b.trading_name,b.description,b.website,b.location_label,b.verified_at,b.verification_expires_at,b.created_at
    from network_plus_business b where b.id=$1 and b.publication_status='published' and b.verification_status='verified'
      and b.moderation_status='approved' and (b.verification_expires_at is null or b.verification_expires_at>now()) and not exists(select 1 from network_plus_business_ownership bo join organization o on o.id=bo.owner_organization_id where bo.business_id=b.id and bo.owner_type='organization' and bo.status='active' and bo.consent_status='accepted' and o.verification_status<>'verified')`,[businessId])).rows[0];
  if(!row)fail(404,"Published business profile not found.","NOT_FOUND");
  const services=(await db.query(`select id,title,summary,description,service_category,audience,delivery_mode,location_label,capacity,pricing_model,price_amount,currency,availability,credentials,published_at
    from network_plus_service_listing where business_id=$1 and status='published' and audience=any($2::text[]) order by published_at desc`,[businessId,visibleAudiences(access)])).rows;
  return {...row,services};
}
export async function listProfessionalServices(viewerId,filters={}) {
  const db=getPool();const access=await assertEntry(db,viewerId);
  const args=[],where=["s.status='published'","b.publication_status='published'","b.verification_status='verified'","b.moderation_status='approved'","(b.verification_expires_at is null or b.verification_expires_at>now())"];
  where.push("not exists(select 1 from network_plus_business_ownership bo join organization o on o.id=bo.owner_organization_id where bo.business_id=b.id and bo.owner_type='organization' and bo.status='active' and bo.consent_status='accepted' and o.verification_status<>'verified')");
  const q=String(filters.q||"").trim().slice(0,120);
  if(q){args.push(`%${q}%`);where.push(`(s.title ilike $${args.length} or s.summary ilike $${args.length} or s.description ilike $${args.length} or b.display_name ilike $${args.length})`);}
  const category=String(filters.category||"").trim().toLowerCase();
  if(category){args.push(category);where.push(`s.service_category=$${args.length}`);}
  const subcategory=String(filters.subcategory||"").trim().toLowerCase();if(subcategory){args.push(subcategory);where.push(`s.subcategory_code=$${args.length}`);}
  const listingKind=String(filters.listingKind||"").trim().toLowerCase();if(listingKind){if(!LISTING_KINDS.has(listingKind))fail(400,"Choose a supported listing type.","VALIDATION_ERROR");args.push(listingKind);where.push(`s.listing_kind=$${args.length}`);}
  const location=String(filters.location||"").trim().slice(0,120);if(location){args.push(`%${location}%`);where.push(`coalesce(s.location_label,'') ilike $${args.length}`);}
  const limit=Math.min(Math.max(Number(filters.limit)||20,1),50),offset=Math.min(Math.max(Number(filters.offset)||0,0),100000);
  args.push(visibleAudiences(access));where.push("s.audience=any($"+args.length+"::text[])");
  const base=` from network_plus_service_listing s join network_plus_business b on b.id=s.business_id where ${where.join(" and ")}`;
  const total=Number((await db.query(`select count(*)::int count${base}`,args)).rows[0]?.count||0);
  const items=(await db.query(`select s.id,s.business_id,b.display_name business_name,s.title,s.summary,s.service_category category_code,s.subcategory_code,s.listing_kind,s.structured_attributes,s.audience,s.delivery_mode,s.location_label,s.capacity,s.pricing_model,s.price_amount,s.currency,s.pricing_details,s.remote_available,s.service_radius_km,s.availability_status,s.lead_time_days,s.active_work_limit,s.timezone,s.next_available_at,s.target_audience,(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'code',u.unit_code,'label',u.label,'level',u.unit_level) order by u.label),'[]'::jsonb) from network_plus_service_listing_geography lg join membership_geography_unit u on u.id=lg.geography_unit_id and u.version_id=lg.geography_version_id where lg.listing_id=s.id) geography_areas,s.published_at
    ${base} order by s.published_at desc limit ${limit+1} offset ${offset}`,args)).rows;
  return {items:items.slice(0,limit),limit,offset,total,hasMore:offset+limit<total};
}
export async function getProfessionalService(listingId,viewerId) {
  const db=getPool();const access=await assertEntry(db,viewerId);
  const row=(await db.query(`select s.id,s.business_id,b.display_name business_name,s.title,s.summary,s.description,s.service_category category_code,s.subcategory_code,s.listing_kind,s.structured_attributes,s.audience,s.delivery_mode,s.location_label,s.capacity,s.pricing_model,s.price_amount,s.currency,s.pricing_details,s.remote_available,s.service_radius_km,s.availability_status,s.lead_time_days,s.active_work_limit,s.timezone,s.next_available_at,s.target_audience,(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'code',u.unit_code,'label',u.label,'level',u.unit_level) order by u.label),'[]'::jsonb) from network_plus_service_listing_geography lg join membership_geography_unit u on u.id=lg.geography_unit_id and u.version_id=lg.geography_version_id where lg.listing_id=s.id) geography_areas,s.availability,s.credentials,s.published_at
    from network_plus_service_listing s join network_plus_business b on b.id=s.business_id
    where s.id=$1 and s.audience=any($2::text[]) and s.status='published' and b.publication_status='published' and b.verification_status='verified' and b.moderation_status='approved'
      and (b.verification_expires_at is null or b.verification_expires_at>now()) and not exists(select 1 from network_plus_business_ownership bo join organization o on o.id=bo.owner_organization_id where bo.business_id=b.id and bo.owner_type='organization' and bo.status='active' and bo.consent_status='accepted' and o.verification_status<>'verified')`,[listingId,visibleAudiences(access)])).rows[0];
  if(!row)fail(404,"Published professional service not found.","NOT_FOUND");
  return row;
}

export async function addBusinessOwner(businessId,userId,input,requestId) {
  const ownerType=input?.ownerType, ownerUserId=input?.ownerUserId||null, organizationId=input?.organizationId||null;
  if(!["member","organization"].includes(ownerType)||(ownerType==="member"?!ownerUserId:!organizationId))fail(400,"Provide one canonical member or organization owner.","VALIDATION_ERROR");
  return withTransaction(async db=>{
    const {business,owner}=await assertBusinessOwner(db,businessId,userId);
    if(!owner||owner.owner_role!=="primary_owner")fail(403,"Only the accountable primary owner can invite co-owners.","OWNERSHIP_FORBIDDEN");
    if(business.business_kind!=="joint")fail(409,"Additional owners are supported only for joint businesses.","JOINT_OWNERSHIP_REQUIRED");
    if(ownerType==="member"){
      const target=(await db.query("select status from app_user where id=$1",[ownerUserId])).rows[0];
      if(!target||target.status!=="active"||!(await hasCurrentActiveMembership(db,ownerUserId))||!(await hasProfessionalIdentity(db,ownerUserId)))fail(409,"The proposed member co-owner must be an active account with current professional membership.","OWNER_NOT_ELIGIBLE");
      if(ownerUserId===userId)fail(409,"The primary owner is already recorded.","DUPLICATE_OWNER");
    }else if(!(await db.query("select 1 from organization where id=$1",[organizationId])).rowCount)fail(404,"The proposed co-owner organization was not found.","OWNER_ORGANIZATION_NOT_FOUND");
    const exists=(await db.query("select 1 from network_plus_business_ownership where business_id=$1 and status in ('pending','active') and ((owner_type='member' and owner_user_id=$2) or (owner_type='organization' and owner_organization_id=$3))",[businessId,ownerUserId,organizationId])).rowCount;
    if(exists)fail(409,"This owner party is already associated with the business.","DUPLICATE_OWNER");
    const row=(await db.query("insert into network_plus_business_ownership(business_id,owner_type,owner_user_id,owner_organization_id,owner_role,consent_status,status,created_by) values($1,$2,$3,$4,'co_owner','pending','pending',$5) on conflict do nothing returning id,business_id,owner_type,owner_user_id,owner_organization_id,owner_role,consent_status,status,created_at",[businessId,ownerType,ownerUserId,organizationId,userId])).rows[0];
    if(!row)fail(409,"This owner party is already associated with the business.","DUPLICATE_OWNER");
    if(business.publication_status==="published"){
      await db.query("update network_plus_business set publication_status=$2,updated_at=now() where id=$1",[businessId,"paused"]);
      await transitionBusinessListings(db,businessId,userId,["published"],"paused",requestId,"Joint owner invitation pending","network_plus.listing_paused_for_ownership_consent");
      await audit(db,userId,"network_plus.business_paused_for_ownership_consent","network_plus_business",businessId,requestId,{from:"published",to:"paused"});
    }
    await audit(db,userId,"network_plus.business_co_owner_invited","network_plus_business_ownership",row.id,requestId,{businessId,ownerType});
    if(ownerType==="member")await createInAppNotification(db,ownerUserId,"network_plus.business_ownership_consent_required","network_plus_business_ownership",row.id,{message:"You have been invited as a co-owner of a Network-Plus business.",nextAction:"Review and explicitly accept or decline this ownership association.",actionUrl:"/network-plus/businesses",actionRequired:true,priority:"high"});
    else {
      const orgOwners=(await db.query("select user_id from organization_membership where organization_id=$1 and status='active' and role_code=any($2::text[])",[organizationId,ORG_OWNER_ROLES])).rows;
      for(const orgOwner of orgOwners)await createInAppNotification(db,orgOwner.user_id,"network_plus.business_ownership_consent_required","network_plus_business_ownership",row.id,{message:"Your organization has been invited as a joint business co-owner.",nextAction:"An active organization owner or administrator must accept or decline the ownership association.",actionUrl:"/network-plus/businesses",actionRequired:true,priority:"high"});
    }
    return row;
  });
}
export async function respondBusinessOwnership(ownershipId,userId,decision,requestId) {
  if(!["accepted","declined"].includes(decision))fail(400,"Choose accept or decline.","VALIDATION_ERROR");
  return withTransaction(async db=>{
    const row=(await db.query("select * from network_plus_business_ownership where id=$1 for update",[ownershipId])).rows[0];
    if(!row)fail(404,"Ownership invitation not found.","NOT_FOUND");
    const permitted=(row.owner_type==="member"&&row.owner_user_id===userId)||(row.owner_type==="organization"&&Boolean((await db.query("select 1 from organization_membership where organization_id=$1 and user_id=$2 and status='active' and role_code=any($3::text[])",[row.owner_organization_id,userId,ORG_OWNER_ROLES])).rowCount));
    if(!permitted)fail(403,"Only the invited owner party may respond to this ownership request.","OWNERSHIP_FORBIDDEN");
    if(decision==="accepted"&&row.owner_type==="member"&&(!(await hasCurrentActiveMembership(db,userId))||!(await hasProfessionalIdentity(db,userId))))fail(403,"An active professional membership is required to accept business ownership.","OWNER_NOT_ELIGIBLE");
    if(row.status!=="pending"||row.consent_status!=="pending")fail(409,"This ownership invitation is no longer awaiting consent.","INVALID_STATE");
    const updated=(await db.query("update network_plus_business_ownership set consent_status=$1,status=$2,consented_at=case when $1='accepted' then now() else null end,updated_at=now() where id=$3 returning *",[decision,decision==="accepted"?"active":"removed",ownershipId])).rows[0];
    await audit(db,userId,"network_plus.business_ownership_responded","network_plus_business_ownership",ownershipId,requestId,{decision,businessId:row.business_id});
    await notifyOwners(db,row.business_id,"network_plus.business_ownership_responded",{message:"A co-owner responded to the business ownership invitation.",nextAction:"Review the updated ownership consent state.",status:decision,eventVersion:updated.updated_at});
    return updated;
  });
}
export async function grantBusinessAccess(businessId,userId,input,requestId) {
  const targetUserId=input?.userId,capability=input?.capability;
  if(!targetUserId||!["business.manage_listing","business.respond_requests","business.accept_terms"].includes(capability))fail(400,"Choose a user and a supported business capability.","VALIDATION_ERROR");
  const expiresAt=input.expiresAt?new Date(input.expiresAt):null;
  if(expiresAt&&(!Number.isFinite(expiresAt.getTime())||expiresAt<=new Date()))fail(400,"Delegation expiry must be a future date.","VALIDATION_ERROR");
  return withTransaction(async db=>{
    const {business,owner}=await assertBusinessOwner(db,businessId,userId);
    if(!owner||owner.owner_role!=="primary_owner")fail(403,"Only an accountable primary owner can delegate business capabilities.","DELEGATION_FORBIDDEN");
    const target=(await db.query("select status from app_user where id=$1",[targetUserId])).rows[0];
    if(!target||target.status!=="active")fail(404,"The proposed manager account is unavailable.","TARGET_NOT_FOUND");
    const orgId=(await db.query("select owner_organization_id from network_plus_business_ownership where business_id=$1 and owner_type='organization' and owner_role='primary_owner' and status='active'",[businessId])).rows[0]?.owner_organization_id||null;
    if(orgId){
      const member=(await db.query("select role_code from organization_membership where organization_id=$1 and user_id=$2 and status='active'",[orgId,targetUserId])).rows[0];
      if(!member||member.role_code!=="project_manager")fail(403,"Organization business delegation is limited to an active project manager of the owning organization.","TARGET_SCOPE_FORBIDDEN");
    }else if(!(await hasCurrentActiveMembership(db,targetUserId)))fail(403,"A delegated manager must have current active membership.","TARGET_SCOPE_FORBIDDEN");
    const row=(await db.query("insert into network_plus_business_access(business_id,user_id,capability_code,granted_by,expires_at,revoked_at) values($1,$2,$3,$4,$5,null) on conflict(business_id,user_id,capability_code) do update set granted_by=excluded.granted_by,expires_at=excluded.expires_at,revoked_at=null returning *",[businessId,targetUserId,capability,userId,expiresAt])).rows[0];
    await audit(db,userId,"network_plus.business_access_granted","network_plus_business_access",row.id,requestId,{businessId,targetUserId,capability});
    await createInAppNotification(db,targetUserId,"network_plus.business_access_granted","network_plus_business",businessId,{message:"A business owner delegated a scoped capability to you.",nextAction:"Open Business Discovery to review the business resources assigned to you.",actionUrl:"/network-plus/businesses"});
    return row;
  });
}
export async function submitBusinessModeration(businessId,userId,requestId) {
  return withTransaction(async db=>{
    const {business}=await assertBusinessOwner(db,businessId,userId);
    if(business.verification_status!=="verified")fail(409,"Business verification must be complete before profile moderation.","BUSINESS_NOT_VERIFIED");
    const updated=(await db.query("update network_plus_business set moderation_status='pending_review',moderation_submitted_by=$2,updated_at=now() where id=$1 and moderation_status in ('not_submitted','rejected','suspended') returning *",[businessId,userId])).rows[0];
    if(!updated)fail(409,"Business profile is already under review or cannot be resubmitted.","INVALID_STATE");
    await audit(db,userId,"network_plus.business_profile_submitted","network_plus_business",businessId,requestId,{});
    const reviewers=(await db.query("select distinct u.id from app_user u where u.status='active' and (exists(select 1 from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=u.id and r.role_code=any($1::text[])) or exists(select 1 from app_user_permission p where p.user_id=u.id and p.permission_code='business.moderate'))",[LISTING_REVIEW_ROLES])).rows;
    for(const reviewer of reviewers)await createInAppNotification(db,reviewer.id,"network_plus.business_profile_review_required","network_plus_business",businessId,{message:"A verified business profile is awaiting moderation.",nextAction:"Review the public business profile and approve, reject or suspend it with a reason.",actionUrl:"/admin/network-plus/businesses",actionRequired:true,priority:"high",eventVersion:updated.updated_at});
    return updated;
  });
}
export async function reviewBusinessModeration(businessId,userId,input,requestId) {
  const status=input?.status,reason=text(input?.reason,1000,"Moderation reason",{min:8});
  if(!["approved","rejected","suspended"].includes(status))fail(400,"Unsupported business moderation decision.","VALIDATION_ERROR");
  return withTransaction(async db=>{
    const roles=await rolesFor(db,userId),permissions=await permissionsFor(db,userId);
    if(!roles.some(r=>LISTING_REVIEW_ROLES.includes(r))&&!permissions.includes("business.moderate"))fail(403,"Independent business moderation authority is required.","BUSINESS_MODERATION_FORBIDDEN");
    const row=(await db.query("select * from network_plus_business where id=$1 for update",[businessId])).rows[0];
    if(!row)fail(404,"Business not found.","NOT_FOUND");
    if(row.created_by===userId||row.moderation_submitted_by===userId)fail(403,"A business creator or submitter cannot moderate their own business profile.","SELF_REVIEW_FORBIDDEN");
    await assertIndependentBusinessReviewer(db,businessId,userId);
    if(status!=="suspended"&&row.moderation_status!=="pending_review"&&!(status==="approved"&&row.publication_status==="suspended"))fail(409,"Business profile is not awaiting moderation or eligible for reinstatement.","INVALID_STATE");
    if(status==="approved")await assertBusinessPublishable(db,businessId,{requireModeration:false,allowSuspended:true});
    const updated=(await db.query("update network_plus_business set moderation_status=$1,publication_status=case when $1='suspended' then 'suspended' when $1='approved' then 'published' else 'draft' end,updated_at=now() where id=$2 returning *",[status,businessId])).rows[0];
    if(status==="suspended")await transitionBusinessListings(db,businessId,userId,["published","paused","pending_review"],"suspended",requestId,reason,"network_plus.listing_suspended_by_business_verification");
    await audit(db,userId,"network_plus.business_profile_moderated","network_plus_business",businessId,requestId,{status,reason});
    await notifyOwners(db,businessId,"network_plus.business_profile_moderation_decided",{message:"A moderation decision was recorded for your business profile.",nextAction:status==="approved"?"Your approved business profile is now discoverable by eligible Network-Plus members.":"Review the decision reason and make any requested corrections.",status,eventVersion:updated.updated_at});
    return updated;
  });
}
export async function changeBusinessPublicationStatus(businessId,userId,status,reason,requestId) {
  if(!["paused","published","archived"].includes(status))fail(400,"Unsupported business publication status.","VALIDATION_ERROR");
  return withTransaction(async db=>{
    const {business}=await assertBusinessOwner(db,businessId,userId);
    if(status==="published")await assertBusinessPublishable(db,businessId);
    if(business.publication_status==="suspended")fail(409,"Only an independent moderator can clear a business suspension.","MODERATION_CLEARANCE_REQUIRED");
    const updated=(await db.query("update network_plus_business set publication_status=$1,updated_at=now() where id=$2 returning *",[status,businessId])).rows[0];
    await audit(db,userId,"network_plus.business_publication_changed","network_plus_business",businessId,requestId,{from:business.publication_status,to:status,reason:String(reason||"").trim().slice(0,500)||null});
    return updated;
  });
}

export async function addBusinessVerificationEvidence(businessId,userId,input,requestId) {
  const fileId=input?.fileObjectId,evidenceType=text(input?.evidenceType,80,"Evidence type",{min:2}),note=text(input?.note,500,"Evidence note",{optional:true});
  if(!fileId)fail(400,"Choose a private uploaded evidence file.","VALIDATION_ERROR");
  return withTransaction(async db=>{
    await assertBusinessOwner(db,businessId,userId);
    await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))",["business-verification-evidence:"+businessId]);
    const file=(await db.query("select f.id,f.visibility,f.created_by from file_object f join private_upload_session s on s.file_object_id=f.id and s.status='confirmed' where f.id=$1",[fileId])).rows[0];
    if(!file||file.visibility!=="private"||file.created_by!==userId)fail(403,"Only a private file uploaded by the current authorized owner can be attached as business evidence.","EVIDENCE_FILE_FORBIDDEN");
    let verificationCase=(await db.query("select id from network_plus_business_verification_case where business_id=$1 and status='draft' order by created_at desc limit 1 for update",[businessId])).rows[0];
    if(!verificationCase)verificationCase=(await db.query("insert into network_plus_business_verification_case(business_id,status,submitted_by) values($1,'draft',$2) returning id",[businessId,userId])).rows[0];
    const row=(await db.query("insert into network_plus_business_verification_evidence(case_id,file_object_id,evidence_type,note,created_by) values($1,$2,$3,$4,$5) on conflict(case_id,file_object_id) do nothing returning id,case_id,evidence_type,note,created_at",[verificationCase.id,fileId,evidenceType,note,userId])).rows[0];
    if(!row)fail(409,"This evidence file is already attached to the verification case.","DUPLICATE_EVIDENCE");
    await audit(db,userId,"network_plus.business_verification_evidence_added","network_plus_business_verification_case",verificationCase.id,requestId,{businessId,evidenceType});
    return row;
  });
}
export async function listBusinessVerificationEvidence(businessId,userId) {
  const db=getPool(),roles=await rolesFor(db,userId),permissions=await permissionsFor(db,userId);
  const reviewer=roles.some(r=>BUSINESS_REVIEW_ROLES.includes(r))||permissions.includes("business.verify");
  if(!reviewer)await assertBusinessOwner(db,businessId,userId);
  return (await db.query("select e.id,e.case_id,e.file_object_id,e.evidence_type,e.note,e.created_at from network_plus_business_verification_evidence e join network_plus_business_verification_case c on c.id=e.case_id where c.business_id=$1 order by e.created_at desc",[businessId])).rows;
}

export async function changeProfessionalServiceStatus(listingId,userId,status,reason,requestId) {
  if(!["paused","archived"].includes(status))fail(400,"Owners may pause or archive a listing; publication requires independent moderation.","INVALID_STATUS");
  return withTransaction(async db=>{
    const row=(await db.query("select * from network_plus_service_listing where id=$1 for update",[listingId])).rows[0];
    if(!row)fail(404,"Professional service listing not found.","NOT_FOUND");
    await assertBusinessOwner(db,row.business_id,userId);
    if(row.status==="suspended")fail(409,"Only an independent moderator can clear a listing suspension.","MODERATION_CLEARANCE_REQUIRED");
    if(row.status==="archived")fail(409,"An archived listing cannot be reopened.","INVALID_STATE");
    const updated=(await db.query("update network_plus_service_listing set status=$1,updated_at=now() where id=$2 returning *",[status,listingId])).rows[0];
    await audit(db,userId,"network_plus.service_listing_owner_status_changed","network_plus_service_listing",listingId,requestId,{from:row.status,to:status,reason:String(reason||"").trim().slice(0,500)||null});
    return updated;
  });
}

export async function revokeBusinessAccess(businessId,accessId,userId,requestId) {
  return withTransaction(async db=>{
    const {owner}=await assertBusinessOwner(db,businessId,userId);
    if(!owner||owner.owner_role!=="primary_owner")fail(403,"Only the accountable primary owner can revoke business delegation.","DELEGATION_FORBIDDEN");
    const row=(await db.query("select * from network_plus_business_access where id=$1 and business_id=$2 and revoked_at is null for update",[accessId,businessId])).rows[0];
    if(!row)fail(404,"Active business delegation not found.","NOT_FOUND");
    const updated=(await db.query("update network_plus_business_access set revoked_at=now() where id=$1 returning *",[accessId])).rows[0];
    await audit(db,userId,"network_plus.business_access_revoked","network_plus_business_access",accessId,requestId,{businessId,targetUserId:row.user_id,capability:row.capability_code});
    await createInAppNotification(db,row.user_id,"network_plus.business_access_revoked","network_plus_business",businessId,{message:"A business owner revoked a previously delegated capability.",nextAction:"Your access to the affected business capability has ended.",actionUrl:"/network-plus/businesses"});
    return updated;
  });
}

async function assertReviewer(userId,roleSet,permissionCode,message) {
  const db=getPool(),roles=await rolesFor(db,userId),permissions=await permissionsFor(db,userId);
  if(!roles.some(role=>roleSet.includes(role))&&!permissions.includes(permissionCode))fail(403,message,"REVIEW_QUEUE_FORBIDDEN");
  return db;
}
function queueBounds(filters={}) {
  return {limit:Math.min(Math.max(Number(filters.limit)||20,1),50),offset:Math.min(Math.max(Number(filters.offset)||0,0),100000)};
}
export async function listBusinessVerificationQueue(userId,filters={}) {
  const db=await assertReviewer(userId,BUSINESS_REVIEW_ROLES,"business.verify","Independent business verification reviewer authority is required.");
  const {limit,offset}=queueBounds(filters);
  const result=await db.query(`select c.id case_id,c.business_id,c.status case_status,c.submitted_at,c.expires_at,
    b.display_name,b.business_kind,b.description,b.website,b.location_label,b.verification_status,b.created_at
    from network_plus_business_verification_case c join network_plus_business b on b.id=c.business_id
    where c.status=any($1::text[]) order by c.submitted_at asc limit $2 offset $3`,[["submitted","under_review","appealed"],limit,offset]);
  return {items:result.rows,limit,offset};
}
export async function listBusinessModerationQueue(userId,filters={}) {
  const db=await assertReviewer(userId,LISTING_REVIEW_ROLES,"business.moderate","Independent business moderation authority is required.");
  const {limit,offset}=queueBounds(filters);
  const result=await db.query(`select b.id,b.business_kind,b.display_name,b.trading_name,b.description,b.website,b.location_label,
    b.verification_status,b.moderation_status,b.publication_status,b.created_at
    from network_plus_business b where b.moderation_status='pending_review'
    order by b.updated_at asc limit $1 offset $2`,[limit,offset]);
  return {items:result.rows,limit,offset};
}
export async function listProfessionalServiceModerationQueue(userId,filters={}) {
  const db=await assertReviewer(userId,LISTING_REVIEW_ROLES,"business.moderate","Independent business-listing moderation authority is required.");
  const {limit,offset}=queueBounds(filters);
  const result=await db.query(`select s.id,s.business_id,b.display_name business_name,s.title,s.summary,s.description,s.service_category category_code,s.subcategory_code,s.listing_kind,s.structured_attributes,
    s.audience,s.delivery_mode,s.location_label,s.capacity,s.pricing_model,s.price_amount,s.currency,s.pricing_details,s.remote_available,s.service_radius_km,s.availability_status,s.lead_time_days,s.active_work_limit,s.timezone,s.next_available_at,s.target_audience,(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'code',u.unit_code,'label',u.label,'level',u.unit_level) order by u.label),'[]'::jsonb) from network_plus_service_listing_geography lg join membership_geography_unit u on u.id=lg.geography_unit_id and u.version_id=lg.geography_version_id where lg.listing_id=s.id) geography_areas,s.status,s.created_at
    from network_plus_service_listing s join network_plus_business b on b.id=s.business_id
    where s.status='pending_review' order by s.updated_at asc limit $1 offset $2`,[limit,offset]);
  return {items:result.rows,limit,offset};
}
