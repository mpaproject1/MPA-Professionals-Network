import { createHash } from "node:crypto";
import { getPool, withTransaction } from "../platform/db.js";
import { createInAppNotification } from "../platform/notifications.js";
import { resolveNetworkPlusAccess } from "../platform/network-plus-access.js";
import { assertOrganizationCapability, hasCurrentActiveMembership, hasProfessionalIdentity, policyError } from "../platform/identity-policy.js";

const MEMBER_OWNER_ROLES = ["member", "professional"];
const ORG_OWNER_ROLES = ["owner", "administrator"];
const BUSINESS_REVIEW_ROLES = ["verification_reviewer", "system_admin"];
const LISTING_REVIEW_ROLES = ["supporting_staff", "system_admin"];
const CATEGORIES = new Set(["professional_services","consulting","technology","design","education","healthcare","legal","finance","construction","trade","manufacturing","other"]);
const MODIFIABLE = new Set(["displayName","tradingName","description","website","locationLabel"]);
const LISTING_MODIFIABLE = new Set(["title","summary","description","serviceCategory","audience","deliveryMode","locationLabel","capacity","pricingModel","priceAmount","currency","availability","credentials"]);
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
function normalizeBusinessInput(input) {
  return {
    businessKind:input.businessKind,
    displayName:text(input.displayName,160,"Business name",{min:2}),
    tradingName:text(input.tradingName,160,"Trading name",{optional:true}),
    description:text(input.description,5000,"Description",{min:20}),
    website:safeWebsite(input.website),
    locationLabel:text(input.locationLabel,160,"Location",{optional:true}),
    geographyReferenceItemId:input.geographyReferenceItemId||null
  };
}
function normalizeListingInput(input) {
  const row={
    title:text(input.title,160,"Title",{min:3}),
    summary:text(input.summary,500,"Summary",{min:20}),
    description:text(input.description,8000,"Description",{min:40}),
    serviceCategory:text(input.serviceCategory,100,"Service category",{min:2}).toLowerCase(),
    audience:input.audience||"members",
    deliveryMode:input.deliveryMode||"remote",
    locationLabel:text(input.locationLabel,160,"Location",{optional:true}),
    capacity:input.capacity===undefined||input.capacity===null||input.capacity===""?null:Number(input.capacity),
    pricingModel:input.pricingModel||"quote",
    priceAmount:input.priceAmount===undefined||input.priceAmount===null||input.priceAmount===""?null:Number(input.priceAmount),
    currency:input.currency?String(input.currency).trim().toUpperCase():null,
    availability:input.availability&&typeof input.availability==="object"&&!Array.isArray(input.availability)?input.availability:{},
    credentials:Array.isArray(input.credentials)?input.credentials:[]
  };
  if(!CATEGORIES.has(row.serviceCategory))fail(400,"Choose a supported service category.","VALIDATION_ERROR");
  if(!["members","organizations","both"].includes(row.audience))fail(400,"Unsupported listing audience.","VALIDATION_ERROR");
  if(!["remote","onsite","hybrid"].includes(row.deliveryMode))fail(400,"Unsupported delivery mode.","VALIDATION_ERROR");
  if(!["free","fixed","hourly","quote"].includes(row.pricingModel))fail(400,"Unsupported pricing model.","VALIDATION_ERROR");
  if(row.capacity!==null&&(!Number.isInteger(row.capacity)||row.capacity<1||row.capacity>100000))fail(400,"Capacity must be a positive whole number.","VALIDATION_ERROR");
  if(row.priceAmount!==null&&(!Number.isFinite(row.priceAmount)||row.priceAmount<0))fail(400,"Price must be a non-negative amount.","VALIDATION_ERROR");
  if(row.pricingModel==="free"&&(row.priceAmount!==null&&row.priceAmount!==0))fail(400,"Free listings cannot have a non-zero price.","VALIDATION_ERROR");
  if(["fixed","hourly"].includes(row.pricingModel)&&(!row.priceAmount||!row.currency||! /^[A-Z]{3}$/.test(row.currency)))fail(400,"Fixed and hourly pricing require a price and three-letter currency.","VALIDATION_ERROR");
  if(row.pricingModel==="quote"&&(row.priceAmount!==null||row.currency!==null))fail(400,"Quotation listings must not include a fixed price or currency.","VALIDATION_ERROR");
  if(row.credentials.length>30||row.credentials.some(x=>typeof x!=="string"||x.trim().length>160))fail(400,"Credentials must be a short list of up to 30 labels.","VALIDATION_ERROR");
  if(JSON.stringify(row.availability).length>8000)fail(400,"Availability details are too large.","VALIDATION_ERROR");
  return row;
}
async function assertEntry(db,userId) {
  const access=await resolveNetworkPlusAccess(db,userId);
  if(!access.eligible)fail(403,"Network-Plus access is required.","NETWORK_PLUS_FORBIDDEN");
}
async function rolesFor(db,userId) {
  return (await db.query("select r.role_code from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1",[userId])).rows.map(r=>r.role_code);
}
async function permissionsFor(db,userId) {
  return (await db.query("select permission_code from app_user_permission where user_id=$1",[userId])).rows.map(r=>r.permission_code);
}
async function assertBusinessOwner(db,businessId,userId,capability="business.manage_listing") {
  const business=(await db.query("select * from network_plus_business where id=$1",[businessId])).rows[0];
  if(!business)fail(404,"Business not found.","NOT_FOUND");
  const owned=(await db.query(`select bo.id,bo.owner_type,bo.owner_role,bo.consent_status,bo.owner_organization_id
    from network_plus_business_ownership bo
    where bo.business_id=$1 and bo.status='active' and bo.consent_status='accepted'
      and ((bo.owner_type='member' and bo.owner_user_id=$2)
        or (bo.owner_type='organization' and exists(
          select 1 from organization_membership om where om.organization_id=bo.owner_organization_id
            and om.user_id=$2 and om.status='active' and om.role_code=any($3::text[])
        ))) limit 1`,[businessId,userId,ORG_OWNER_ROLES])).rows[0];
  if(owned)return {business,owner:owned};
  const delegated=(await db.query(`select 1 from network_plus_business_access
    where business_id=$1 and user_id=$2 and capability_code=$3 and revoked_at is null
      and (expires_at is null or expires_at>now()) limit 1`,[businessId,userId,capability])).rowCount>0;
  if(!delegated)fail(403,"An active owner or explicit business-scoped assignment is required.","BUSINESS_FORBIDDEN");
  return {business,owner:null};
}
async function audit(db,actor,action,type,id,requestId,metadata={}) {
  await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,$2,$3,$4,$5,'success',$6)",[actor,action,type,id,requestId,metadata]);
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
async function assertBusinessPublishable(db,businessId) {
  const row=(await db.query("select verification_status,moderation_status,publication_status from network_plus_business where id=$1",[businessId])).rows[0];
  if(!row)fail(404,"Business not found.","NOT_FOUND");
  if(row.verification_status!=="verified")fail(409,"Business verification must be approved before a service listing can be published.","BUSINESS_NOT_VERIFIED");
  if(row.moderation_status!=="approved")fail(409,"Business profile moderation must be approved before publishing a service listing.","BUSINESS_NOT_MODERATED");
  if(row.publication_status==="suspended"||row.publication_status==="archived")fail(409,"This business is not eligible to publish listings.","BUSINESS_NOT_PUBLISHABLE");
}
export async function createBusiness(userId,input,requestId,idempotencyKey) {
  if(typeof idempotencyKey!=="string"||!/^[A-Za-z0-9_-]{32,200}$/.test(idempotencyKey))fail(400,"A secure idempotency key is required.","IDEMPOTENCY_KEY_REQUIRED");
  const normalized=normalizeBusinessInput(input||{});
  const ownerType=input.ownerType;
  const organizationId=input.organizationId||null;
  if(!["member","organization"].includes(ownerType))fail(400,"Choose a canonical member or organization owner.","VALIDATION_ERROR");
  if((ownerType==="organization")!==Boolean(organizationId))fail(400,"Organization ownership requires exactly one organization ID.","VALIDATION_ERROR");
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
      and ((bo.owner_type='member' and bo.owner_user_id=$1) or
        (bo.owner_type='organization' and exists(select 1 from organization_membership om where om.organization_id=bo.owner_organization_id and om.user_id=$1 and om.status='active' and om.role_code=any($2::text[]))))
    union
    select distinct b.id,b.business_kind,b.display_name,b.trading_name,b.description,b.website,b.location_label,
      b.verification_status,b.moderation_status,b.publication_status,b.created_at,b.updated_at
    from network_plus_business b join network_plus_business_access a on a.business_id=b.id
    where a.user_id=$1 and a.revoked_at is null and (a.expires_at is null or a.expires_at>now())
    order by created_at desc`,[userId,ORG_OWNER_ROLES])).rows;
}
export async function updateBusiness(businessId,userId,input,requestId) {
  const entries=Object.entries(input||{}).filter(([key])=>MODIFIABLE.has(key));
  if(!entries.length)fail(400,"Provide at least one supported business profile field.","VALIDATION_ERROR");
  return withTransaction(async db=>{
    const {business}=await assertBusinessOwner(db,businessId,userId);
    if(["suspended","archived"].includes(business.publication_status))fail(409,"A suspended or archived business cannot be edited through the ordinary management route.","BUSINESS_LOCKED");
    const next={displayName:business.display_name,tradingName:business.trading_name,description:business.description,website:business.website,locationLabel:business.location_label};
    for(const [key,value] of entries){
      if(key==="website")next.website=safeWebsite(value);
      else next[key]=key==="tradingName"||key==="locationLabel"?text(value,160,key,{optional:true}):key==="displayName"?text(value,160,key,{min:2}):text(value,5000,key,{min:20});
    }
    const row=(await db.query(`update network_plus_business set display_name=$1,trading_name=$2,description=$3,website=$4,location_label=$5,
      verification_status=case when verification_status='verified' then 'submitted' else verification_status end,
      moderation_status=case when moderation_status='approved' then 'pending_review' else moderation_status end,
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
    if(["suspended","archived"].includes(business.publication_status))fail(409,"This business cannot be submitted while suspended or archived.","BUSINESS_LOCKED");
    const existing=(await db.query("select id,status from network_plus_business_verification_case where business_id=$1 and status in ('submitted','under_review','appealed') order by created_at desc limit 1 for update",[businessId])).rows[0];
    if(existing)return {...existing,idempotent:true};
    const row=(await db.query("insert into network_plus_business_verification_case(business_id,status,submitted_by) values($1,'submitted',$2) returning *",[businessId,userId])).rows[0];
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
    const expiry=input.expiresAt?new Date(input.expiresAt):null;
    if(status==="verified"&&(!expiry||!Number.isFinite(expiry.getTime())||expiry<=new Date()))fail(400,"A verified decision requires a valid future revalidation date.","VERIFICATION_EXPIRY_REQUIRED");
    const updated=(await db.query(`update network_plus_business_verification_case set status=$1,reviewer_user_id=$2,decision_reason=$3,reviewed_at=now(),expires_at=$4,updated_at=now() where id=$5 returning *`,[status,userId,reason,expiry,open.id])).rows[0];
    await db.query(`update network_plus_business set verification_status=$1,verified_at=case when $1='verified' then now() else null end,
      verification_expires_at=$2,verified_by=$3,publication_status=case when $1='suspended' then 'suspended' when $1='verified' then publication_status else 'paused' end,updated_at=now() where id=$4`,[status==="appealed"?"under_review":status,expiry,userId,businessId]);
    await audit(db,userId,"network_plus.business_verification_decided","network_plus_business",businessId,requestId,{caseId:open.id,status,reason,expiresAt:expiry?.toISOString()||null});
    await notifyOwners(db,businessId,"network_plus.business_verification_decided",{message:"A decision was recorded for the business verification case.",nextAction:status==="verified"?"Continue to listing moderation and publication.":"Review the decision reason and provide any requested clarification.",actionUrl:"/network-plus/businesses/"+businessId,status,eventVersion:updated.updated_at});
    return updated;
  });
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
    const row=(await db.query(`insert into network_plus_service_listing(business_id,created_by,title,summary,description,service_category,audience,delivery_mode,location_label,capacity,pricing_model,price_amount,currency,availability,credentials,request_idempotency_hash,request_fingerprint)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning *`,[businessId,userId,normalized.title,normalized.summary,normalized.description,normalized.serviceCategory,normalized.audience,normalized.deliveryMode,normalized.locationLabel,normalized.capacity,normalized.pricingModel,normalized.priceAmount,normalized.currency,normalized.availability,normalized.credentials,keyHash,payloadFingerprint])).rows[0];
    await audit(db,userId,"network_plus.service_listing_created","network_plus_service_listing",row.id,requestId,{businessId});
    return row;
  });
}
export async function updateProfessionalServiceListing(listingId,userId,input,requestId) {
  return withTransaction(async db=>{
    const row=(await db.query("select * from network_plus_service_listing where id=$1 for update",[listingId])).rows[0];
    if(!row)fail(404,"Professional service listing not found.","NOT_FOUND");
    await assertBusinessOwner(db,row.business_id,userId);
    if(["suspended","archived","rejected"].includes(row.status))fail(409,"This listing cannot be edited in its current status.","LISTING_LOCKED");
    const merged={title:row.title,summary:row.summary,description:row.description,serviceCategory:row.service_category,audience:row.audience,deliveryMode:row.delivery_mode,locationLabel:row.location_label,capacity:row.capacity,pricingModel:row.pricing_model,priceAmount:row.price_amount,currency:row.currency,availability:row.availability,credentials:row.credentials};
    const inputEntries=Object.entries(input||{}).filter(([key])=>LISTING_MODIFIABLE.has(key));
    if(!inputEntries.length)fail(400,"Provide at least one supported listing field.","VALIDATION_ERROR");
    for(const [key,value] of inputEntries)merged[key]=value;
    const normalized=normalizeListingInput(merged);
    const updated=(await db.query(`update network_plus_service_listing set title=$1,summary=$2,description=$3,service_category=$4,audience=$5,delivery_mode=$6,location_label=$7,capacity=$8,pricing_model=$9,price_amount=$10,currency=$11,availability=$12,credentials=$13,
      status=case when status='published' then 'paused' else 'draft' end,updated_at=now() where id=$14 returning *`,[normalized.title,normalized.summary,normalized.description,normalized.serviceCategory,normalized.audience,normalized.deliveryMode,normalized.locationLabel,normalized.capacity,normalized.pricingModel,normalized.priceAmount,normalized.currency,normalized.availability,normalized.credentials,listingId])).rows[0];
    await audit(db,userId,"network_plus.service_listing_updated","network_plus_service_listing",listingId,requestId,{fields:inputEntries.map(([key])=>key)});
    return updated;
  });
}
export async function submitProfessionalServiceListing(listingId,userId,requestId) {
  return withTransaction(async db=>{
    const row=(await db.query("select * from network_plus_service_listing where id=$1 for update",[listingId])).rows[0];
    if(!row)fail(404,"Professional service listing not found.","NOT_FOUND");
    await assertBusinessOwner(db,row.business_id,userId);
    await assertBusinessPublishable(db,row.business_id);
    if(!["draft","changes_requested","rejected","paused"].includes(row.status))fail(409,"This listing is not ready for moderation submission.","INVALID_STATE");
    const updated=(await db.query("update network_plus_service_listing set status='pending_review',moderation_reason=null,updated_at=now() where id=$1 returning *",[listingId])).rows[0];
    await db.query("insert into network_plus_service_listing_event(listing_id,actor_user_id,event_code,from_status,to_status,request_id) values($1,$2,'submitted_for_moderation',$3,'pending_review',$4)",[listingId,userId,row.status,requestId]);
    await audit(db,userId,"network_plus.service_listing_submitted","network_plus_service_listing",listingId,requestId,{businessId:row.business_id});
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
    if(row.created_by===userId)fail(403,"A listing creator cannot moderate their own listing.","SELF_REVIEW_FORBIDDEN");
    if(row.status!=="pending_review")fail(409,"Only a listing awaiting moderation can receive this decision.","INVALID_STATE");
    if(status==="published")await assertBusinessPublishable(db,row.business_id);
    const updated=(await db.query(`update network_plus_service_listing set status=$1,moderation_reason=$2,reviewed_by=$3,reviewed_at=now(),
      published_at=case when $1='published' then now() else published_at end,
      suspended_at=case when $1='suspended' then now() else null end,
      suspension_reason=case when $1='suspended' then $2 else null end,updated_at=now() where id=$4 returning *`,[status,reason,userId,listingId])).rows[0];
    await db.query("insert into network_plus_service_listing_event(listing_id,actor_user_id,event_code,from_status,to_status,reason,request_id) values($1,$2,'moderation_decision',$3,$4,$5,$6)",[listingId,userId,row.status,status,reason,requestId]);
    await audit(db,userId,"network_plus.service_listing_moderated","network_plus_service_listing",listingId,requestId,{status,reason,businessId:row.business_id});
    await notifyOwners(db,row.business_id,"network_plus.service_listing_moderation_decided",{message:"A moderation decision was recorded for a professional service listing.",nextAction:status==="published"?"Your listing is now visible to eligible Network-Plus members.":"Review the moderation reason and update the listing if changes are requested.",actionUrl:"/network-plus/businesses/"+row.business_id,status,eventVersion:updated.updated_at});
    return updated;
  });
}
export async function listBusinesses(viewerId,filters={}) {
  const db=getPool();await assertEntry(db,viewerId);
  const args=[],where=["b.publication_status='published'","b.verification_status='verified'","b.moderation_status='approved'","(b.verification_expires_at is null or b.verification_expires_at>now())"];
  const q=String(filters.q||"").trim().slice(0,120);
  if(q){args.push(`%${q}%`);where.push(`(b.display_name ilike $${args.length} or coalesce(b.trading_name,'') ilike $${args.length} or b.description ilike $${args.length})`);}
  const limit=Math.min(Math.max(Number(filters.limit)||20,1),50),offset=Math.min(Math.max(Number(filters.offset)||0,0),100000);
  const base=` from network_plus_business b where ${where.join(" and ")}`;
  const total=Number((await db.query(`select count(*)::int count${base}`,args)).rows[0]?.count||0);
  const items=(await db.query(`select b.id,b.business_kind,b.display_name,b.trading_name,b.description,b.website,b.location_label,b.verified_at,b.verification_expires_at,b.created_at${base}
    order by b.display_name limit ${limit+1} offset ${offset}`,args)).rows;
  return {items:items.slice(0,limit),limit,offset,total,hasMore:offset+limit<total};
}
export async function getBusiness(businessId,viewerId) {
  const db=getPool();await assertEntry(db,viewerId);
  const row=(await db.query(`select b.id,b.business_kind,b.display_name,b.trading_name,b.description,b.website,b.location_label,b.verified_at,b.verification_expires_at,b.created_at
    from network_plus_business b where b.id=$1 and b.publication_status='published' and b.verification_status='verified'
      and b.moderation_status='approved' and (b.verification_expires_at is null or b.verification_expires_at>now())`,[businessId])).rows[0];
  if(!row)fail(404,"Published business profile not found.","NOT_FOUND");
  const services=(await db.query(`select id,title,summary,description,service_category,audience,delivery_mode,location_label,capacity,pricing_model,price_amount,currency,availability,credentials,published_at
    from network_plus_service_listing where business_id=$1 and status='published' order by published_at desc`,[businessId])).rows;
  return {...row,services};
}
export async function listProfessionalServices(viewerId,filters={}) {
  const db=getPool();await assertEntry(db,viewerId);
  const args=[],where=["s.status='published'","b.publication_status='published'","b.verification_status='verified'","b.moderation_status='approved'","(b.verification_expires_at is null or b.verification_expires_at>now())"];
  const q=String(filters.q||"").trim().slice(0,120);
  if(q){args.push(`%${q}%`);where.push(`(s.title ilike $${args.length} or s.summary ilike $${args.length} or s.description ilike $${args.length} or b.display_name ilike $${args.length})`);}
  const category=String(filters.category||"").trim().toLowerCase();
  if(category){args.push(category);where.push(`s.service_category=$${args.length}`);}
  const limit=Math.min(Math.max(Number(filters.limit)||20,1),50),offset=Math.min(Math.max(Number(filters.offset)||0,0),100000);
  const base=` from network_plus_service_listing s join network_plus_business b on b.id=s.business_id where ${where.join(" and ")}`;
  const total=Number((await db.query(`select count(*)::int count${base}`,args)).rows[0]?.count||0);
  const items=(await db.query(`select s.id,s.business_id,b.display_name business_name,s.title,s.summary,s.service_category,s.audience,s.delivery_mode,s.location_label,s.capacity,s.pricing_model,s.price_amount,s.currency,s.published_at
    ${base} order by s.published_at desc limit ${limit+1} offset ${offset}`,args)).rows;
  return {items:items.slice(0,limit),limit,offset,total,hasMore:offset+limit<total};
}
export async function getProfessionalService(listingId,viewerId) {
  const db=getPool();await assertEntry(db,viewerId);
  const row=(await db.query(`select s.id,s.business_id,b.display_name business_name,s.title,s.summary,s.description,s.service_category,s.audience,s.delivery_mode,s.location_label,s.capacity,s.pricing_model,s.price_amount,s.currency,s.availability,s.credentials,s.published_at
    from network_plus_service_listing s join network_plus_business b on b.id=s.business_id
    where s.id=$1 and s.status='published' and b.publication_status='published' and b.verification_status='verified' and b.moderation_status='approved'
      and (b.verification_expires_at is null or b.verification_expires_at>now())`,[listingId])).rows[0];
  if(!row)fail(404,"Published professional service not found.","NOT_FOUND");
  return row;
}
