import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { withTransaction } from "../platform/db.js";
import { policyError } from "../platform/identity-policy.js";
import { resolveNetworkPlusAccess } from "../platform/network-plus-access.js";
import { createInAppNotification } from "../platform/notifications.js";


const INTENTS = new Set(["service_request","supplier_inquiry","referral","expertise_request","partnership_proposal","collaboration_request","business_opportunity","interest","question","quote_request","meeting_request"]);
const CONTACT_FIELDS = new Set(["email","phone","whatsapp","website","business_location"]);
const WORKSPACE_ELIGIBLE_INTENTS = new Set(["service_request","supplier_inquiry","expertise_request","partnership_proposal","collaboration_request"]);
const SUPPORT_ROLES = new Set(["network_plus_support","system_admin"]);
const hash = value => createHash("sha256").update(String(value)).digest("hex");
function fail(status,message,code="REQUEST_RULE"){ throw policyError(status,message,code); }
function clean(value,max,label,min=1) { const s=String(value??"").trim(); if(s.length<min||s.length>max)fail(400,`${label} must be between ${min} and ${max} characters.`,"VALIDATION_ERROR"); return s; }
function object(value,label) { if(value===undefined||value===null)return {}; if(typeof value!=="object"||Array.isArray(value))fail(400,`${label} must be an object.`,"VALIDATION_ERROR"); return value; }
function assertNoContactFields(value) { if(Array.isArray(value)){for(const item of value)assertNoContactFields(item);return;} if(typeof value==="string"&&(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)||/(?:\+|(?:^|\D)0)[0-9 ()-]{7,}[0-9]/.test(value)))fail(400,"Do not include private contact details in request content. Use the separate consent-controlled contact release workflow.","CONTACT_DETAILS_FORBIDDEN"); if(value&&typeof value==="object")for(const [key,child] of Object.entries(value)){ if(/email|phone|mobile|whatsapp|telegram|contact/i.test(key))fail(400,"Do not include private contact details in request content. Use the separate consent-controlled contact release workflow.","CONTACT_DETAILS_FORBIDDEN"); assertNoContactFields(child); } }
function safeTerms(intent,raw) {
  const t=object(raw,"Terms");
  if(intent==="partnership_proposal"||intent==="collaboration_request") {
    for(const key of ["purpose","scope","contributions","responsibilities","outputs","timeline","authorizedRepresentatives"]) if(t[key]===undefined)fail(400,`Partnership/collaboration terms require ${key}.`,"TERMS_INCOMPLETE");
    for(const key of ["purpose","scope"]) t[key]=clean(t[key],5000,key);
    for(const key of ["contributions","responsibilities","outputs","authorizedRepresentatives"]) {
      if(!Array.isArray(t[key])||t[key].length<1||t[key].length>30)fail(400,`${key} must be a list of 1–30 items.`,"TERMS_INCOMPLETE");
      t[key]=t[key].map(v=>clean(v,500,key));
    }
    t.timeline=object(t.timeline,"Timeline");
  }
  if(intent==="business_opportunity") {
    t.opportunityType=clean(t.opportunityType,100,"Opportunity type",2);
    t.eligibility=clean(t.eligibility,2000,"Eligibility",5);
    t.selectionProcess=clean(t.selectionProcess,2000,"Selection process",5);
    if(t.deadline!==undefined&&t.deadline!==null&&t.deadline!=="") {
      if(typeof t.deadline!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(t.deadline)||Number.isNaN(Date.parse(t.deadline)))fail(400,"Opportunity deadline must be a valid calendar date.","VALIDATION_ERROR");
    }
    if(t.value!==undefined&&t.value!==null&&String(t.value).length>300)fail(400,"Opportunity value/compensation must be 300 characters or fewer.","VALIDATION_ERROR");
  }
  if(intent==="service_request") {
    t.scope=clean(t.scope,5000,"Scope",3);
    if(!Array.isArray(t.deliverables)||t.deliverables.length<1||t.deliverables.length>50)fail(400,"Service requests require 1–50 deliverables.","TERMS_INCOMPLETE");
    t.deliverables=t.deliverables.map(v=>clean(v,500,"Deliverable",2));
    t.pricing=object(t.pricing,"Pricing/quotation");
    if(!t.pricing.proposal)fail(400,"Provide a fixed quotation, rate or quote request.","TERMS_INCOMPLETE");
    t.schedule=object(t.schedule,"Schedule");
    if(!t.schedule.requested)fail(400,"Provide a proposed schedule or state that it is to be agreed.","TERMS_INCOMPLETE");
    if(t.completionEvidence!==undefined&&(!Array.isArray(t.completionEvidence)||t.completionEvidence.length>30))fail(400,"Completion evidence must be a list.","VALIDATION_ERROR");
  }
  return t;
}
async function assertEntry(db,userId) {
  const access=await resolveNetworkPlusAccess(db,userId);
  if(!access.eligible)fail(403,"Network-Plus access is required.","NETWORK_PLUS_FORBIDDEN");
}
async function participant(db,requestId,userId) {
  const row=(await db.query("select p.*,r.status request_status,r.requester_user_id,r.recipient_user_id,r.recipient_organization_id from network_plus_request_participant p join network_plus_request r on r.id=p.request_id where p.request_id=$1 and p.user_id=$2 and p.consent_status<>'revoked' and (p.participant_role<>'additional_participant' or p.consent_status='accepted')",[requestId,userId])).rows[0];
  if(!row)fail(404,"Request not found.","NOT_FOUND");
  return row;
}
async function hasSupportRole(db,userId) {
  const roles=(await db.query("select r.role_code from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1",[userId])).rows.map(x=>x.role_code);
  return roles.some(x=>SUPPORT_ROLES.has(x));
}
async function assertSupport(db,userId,requestId,reason,ticket) {
  if(!await hasSupportRole(db,userId))fail(403,"Authorized Network-Plus support staff only.","SUPPORT_FORBIDDEN");
  if(typeof reason!=="string"||reason.trim().length<8||reason.trim().length>500||typeof ticket!=="string"||ticket.trim().length<6||ticket.trim().length>120)fail(400,"Support access requires a meaningful reason and a valid support case reference.","SUPPORT_REASON_REQUIRED");
  const grant=(await db.query("select id from network_plus_request_support_grant where request_id=$1 and support_user_id=$2 and support_case_reference=$3 and revoked_at is null and expires_at>now()",[requestId,userId,ticket.trim()])).rows[0];
  if(!grant)fail(403,"No active support grant exists for this request and case reference.","SUPPORT_GRANT_REQUIRED");
}
async function notify(db,userId,event,requestId,message) {
  await createInAppNotification(db,userId,event,"network_plus_request",requestId,{message,nextAction:"Open Network-Plus requests to review the update."});
}
async function audit(db,requestId,actor,event,from,to,requestIdHeader,metadata={},idempotencyHash=null,requestFingerprint=null) {
  await db.query("insert into network_plus_request_event(request_id,actor_user_id,event_code,from_status,to_status,reason,request_id_header,idempotency_hash,request_fingerprint,metadata) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",[requestId,actor,event,from||null,to||null,metadata.reason||null,requestIdHeader||null,idempotencyHash,requestFingerprint,metadata]);
  await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,$2,'network_plus_request',$3,$4,'success',$5)",[actor,event,requestId,requestIdHeader||null,metadata]);
}
async function hasBusinessAuthority(db,businessId,userId,capability) {
  const owner=(await db.query("select 1 from network_plus_business_ownership bo join network_plus_business b on b.id=bo.business_id where bo.business_id=$1 and bo.status='active' and bo.consent_status='accepted' and b.verification_status='verified' and b.moderation_status='approved' and b.publication_status='published' and ((bo.owner_type='member' and bo.owner_user_id=$2 and exists(select 1 from membership_record mr where mr.user_id=$2 and mr.status='active' and mr.start_date<=current_date and (mr.end_date is null or mr.end_date>=current_date))) or (bo.owner_type='organization' and exists(select 1 from organization_membership om join organization o on o.id=om.organization_id where om.organization_id=bo.owner_organization_id and om.user_id=$2 and om.status='active' and om.role_code in ('owner','administrator') and o.verification_status='verified' and o.network_plus_visible=true)))",[businessId,userId])).rowCount>0;
  if(owner)return true;
  return (await db.query("select 1 from network_plus_business_access a join network_plus_business b on b.id=a.business_id where a.business_id=$1 and a.user_id=$2 and a.capability_code=$3 and a.revoked_at is null and (a.expires_at is null or a.expires_at>now()) and b.verification_status='verified' and b.moderation_status='approved' and b.publication_status='published'",[businessId,userId,capability])).rowCount>0;
}
function canTransition(intent,from,to,actorRole) {
  if(["in_progress","completed"].includes(to)&&!["service_request","supplier_inquiry","expertise_request","partnership_proposal","collaboration_request"].includes(intent))return false;
  const map={
    draft:["submitted","withdrawn"],
    submitted:["under_review","accepted","declined","withdrawn"],
    under_review:["accepted","declined","withdrawn"],
    clarification_requested:["submitted","withdrawn","declined"],
    accepted:["in_progress","disputed","closed","completed","recipient_withdrawn"],
    in_progress:["completed","disputed","closed","recipient_withdrawn"],
    disputed:["in_progress","completed","closed","recipient_withdrawn"],
    declined:[],withdrawn:[],recipient_withdrawn:[],completed:["disputed","closed"],closed:[]
  };
  if(!map[from]?.includes(to))return false;
  if(to==="withdrawn")return actorRole==="requester";
  if(to==="recipient_withdrawn")return actorRole==="recipient";
  if(["under_review","clarification_requested","accepted","declined"].includes(to))return actorRole==="recipient"||actorRole==="support";
  if(["in_progress","completed","disputed","closed"].includes(to))return actorRole==="requester"||actorRole==="recipient"||actorRole==="support";
  return actorRole==="requester";
}
export async function createNetworkPlusRequest(userId,input,requestIdHeader,idempotencyKey) {
  input=input||{};
  if(typeof idempotencyKey!=="string"||!/^[A-Za-z0-9_-]{32,200}$/.test(idempotencyKey))fail(400,"A secure X-Idempotency-Key is required.","IDEMPOTENCY_KEY_REQUIRED");
  const intent=input.intent;
  if(!INTENTS.has(intent))fail(400,"Choose a supported request intent.","INVALID_INTENT");
  const subject=clean(input.subject,180,"Subject",3), summary=clean(input.summary,500,"Summary",10);
  const details=object(input.details,"Request details"); const terms=safeTerms(intent,input.terms); assertNoContactFields({subject,summary,details,terms});
  if(input.recipientUserId===userId)fail(400,"You cannot send a request to yourself.","INVALID_RECIPIENT");
  if(!input.businessId&&!input.serviceListingId&&Boolean(input.recipientUserId)===Boolean(input.recipientOrganizationId))fail(400,"Choose exactly one recipient user or organization, or select a published business/service listing.","INVALID_RECIPIENT");
  const fingerprint=hash(JSON.stringify({intent,subject,summary,details,terms,recipientUserId:input.recipientUserId||null,recipientOrganizationId:input.recipientOrganizationId||null,businessId:input.businessId||null,serviceListingId:input.serviceListingId||null}));
  return withTransaction(async db=>{
    const entry=await assertEntry(db,userId);
    await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[`network-plus-request:${userId}:${hash(idempotencyKey)}`]);
    const prior=(await db.query("select id,request_fingerprint from network_plus_request where requester_user_id=$1 and idempotency_hash=$2",[userId,hash(idempotencyKey)])).rows[0];
    if(prior){if(prior.request_fingerprint!==fingerprint)fail(409,"This idempotency key was already used for different request content.","IDEMPOTENCY_CONFLICT");return (await db.query("select * from network_plus_request where id=$1",[prior.id])).rows[0];}
    let recipientUserId=input.recipientUserId||null;
    let recipientOrganizationId=input.recipientOrganizationId||null;
    if(input.serviceListingId) {
      const listing=(await db.query("select s.id,s.business_id,s.audience,s.listing_kind,s.availability_status,s.remote_available from network_plus_service_listing s join network_plus_business b on b.id=s.business_id where s.id=$1 and s.status='published' and b.verification_status='verified' and b.moderation_status='approved' and b.publication_status='published'",[input.serviceListingId])).rows[0];
      if(!listing)fail(404,"Published verified service listing not found.","SERVICE_NOT_FOUND");
      if((listing.audience==="members"&&!entry.access.member)||(listing.audience==="organizations"&&!entry.access.organization))fail(403,"This service listing is not available to your Network-Plus audience.","SERVICE_AUDIENCE_FORBIDDEN");
      if(["paused","unavailable"].includes(listing.availability_status))fail(409,"This listing is not currently accepting new connection requests.","LISTING_NOT_ACCEPTING_REQUESTS");
      if(listing.listing_kind==="product_profile"&&!["supplier_inquiry","referral","interest","question","quote_request","meeting_request"].includes(intent))fail(400,"Product profiles support discovery inquiries, questions, quotation requests and meeting handoffs only; they cannot be used to create service orders or other engagements.","PRODUCT_PROFILE_DISCOVERY_ONLY");
      if(input.businessId&&input.businessId!==listing.business_id)fail(400,"Service listing does not belong to the selected business.","BUSINESS_LISTING_MISMATCH");
      input.businessId=listing.business_id;
    }
    if(input.businessId) {
      const owner=(await db.query("select bo.owner_type,bo.owner_user_id,bo.owner_organization_id from network_plus_business_ownership bo join network_plus_business b on b.id=bo.business_id where bo.business_id=$1 and bo.owner_role='primary_owner' and bo.status='active' and bo.consent_status='accepted' and b.verification_status='verified' and b.moderation_status='approved' and b.publication_status='published'",[input.businessId])).rows[0];
      if(!owner)fail(404,"Published verified business not found.","BUSINESS_NOT_FOUND");
      if(owner.owner_type==="member") {
        if(recipientUserId&&recipientUserId!==owner.owner_user_id)fail(400,"The selected recipient does not own this business.","RECIPIENT_BUSINESS_MISMATCH");
        if(recipientOrganizationId)fail(400,"A member-owned business cannot be addressed to an unrelated organization.","RECIPIENT_BUSINESS_MISMATCH");
        recipientUserId=owner.owner_user_id;recipientOrganizationId=null;
      } else {
        if(recipientUserId)fail(400,"An organization-owned business must be addressed to its owner organization.","RECIPIENT_BUSINESS_MISMATCH");
        if(recipientOrganizationId&&recipientOrganizationId!==owner.owner_organization_id)fail(400,"The selected recipient organization does not own this business.","RECIPIENT_BUSINESS_MISMATCH");
        recipientOrganizationId=owner.owner_organization_id;recipientUserId=null;
      }
    } else if(Boolean(recipientUserId)===Boolean(recipientOrganizationId)) {
      fail(400,"Choose exactly one recipient user or organization.","INVALID_RECIPIENT");
    }
    if(recipientUserId===userId)fail(400,"You cannot send a request to yourself.","INVALID_RECIPIENT");
    if(recipientOrganizationId) {
      const org=(await db.query("select id,verification_status,network_plus_visible from organization where id=$1",[recipientOrganizationId])).rows[0];
      if(!org||org.verification_status!=="verified"||org.network_plus_visible!==true)fail(404,"Verified opted-in recipient organization not found.","RECIPIENT_NOT_FOUND");
      const reps=(await db.query("select user_id from organization_membership where organization_id=$1 and status='active' and role_code in ('owner','administrator')",[org.id])).rows;
      if(!reps.length)fail(409,"Recipient organization has no active authorized representative.","RECIPIENT_UNAVAILABLE");
    } else if(input.businessId) {
      const activeOwner=(await db.query("select 1 from membership_record where user_id=$1 and status='active' and start_date<=current_date and (end_date is null or end_date>=current_date)",[recipientUserId])).rowCount>0;
      if(!activeOwner)fail(409,"The business owner must retain active membership to receive requests.","RECIPIENT_UNAVAILABLE");
    } else {
      const eligible=(await db.query("select 1 from app_user u join membership_record m on m.user_id=u.id and m.status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date) join verification_visibility vv on vv.user_id=u.id and vv.directory_visible=true join person p on p.user_id=u.id join professional_profile pp on pp.person_id=p.id and pp.directory_visibility in ('members','public') where u.id=$1 and exists(select 1 from verification_claim vc join verification_case c on c.id=vc.case_id where c.subject_user_id=u.id and vc.status='verified' and lower(vc.claim_code_snapshot)=any($2::text[]))",[recipientUserId,["professional_certification","education","employment","experience","service_capability"]])).rowCount>0;
      if(!eligible)fail(404,"Verified professional not found or not accepting directory contact.","RECIPIENT_NOT_FOUND");
    }
    const created=(await db.query(`insert into network_plus_request(intent,status,requester_user_id,recipient_user_id,recipient_organization_id,business_id,service_listing_id,subject,summary,request_details,terms,idempotency_hash,request_fingerprint)
      values($1,'draft',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,[intent,userId,recipientUserId,recipientOrganizationId||null,input.businessId||null,input.serviceListingId||null,subject,summary,details,terms,hash(idempotencyKey),fingerprint])).rows[0];
    await db.query("insert into network_plus_request_participant(request_id,user_id,participant_role,consent_status,consented_at,added_by) values($1,$2,'requester','accepted',now(),$2)",[created.id,userId]);
    if(recipientUserId) await db.query("insert into network_plus_request_participant(request_id,user_id,participant_role,consent_status,added_by) values($1,$2,'recipient_representative','pending',$3)",[created.id,recipientUserId,userId]);
    else await db.query(`insert into network_plus_request_participant(request_id,user_id,participant_role,consent_status,added_by)
      select $1,om.user_id,'recipient_representative','pending',$2 from organization_membership om
      where om.organization_id=$3 and om.status='active' and om.role_code in ('owner','administrator')`,[created.id,userId,recipientOrganizationId]);
    if(input.businessId) {
      await db.query("insert into network_plus_request_participant(request_id,user_id,participant_role,consent_status,added_by) select $1,bo.owner_user_id,'recipient_representative','pending',$2 from network_plus_business_ownership bo join membership_record mr on mr.user_id=bo.owner_user_id and mr.status='active' and mr.start_date<=current_date and (mr.end_date is null or mr.end_date>=current_date) where bo.business_id=$3 and bo.owner_type='member' and bo.status='active' and bo.consent_status='accepted' on conflict(request_id,user_id) do nothing",[created.id,userId,input.businessId]);
      await db.query("insert into network_plus_request_participant(request_id,user_id,participant_role,consent_status,added_by) select $1,a.user_id,'recipient_representative','pending',$2 from network_plus_business_access a where a.business_id=$3 and a.capability_code in ('business.respond_requests','business.accept_terms') and a.revoked_at is null and (a.expires_at is null or a.expires_at>now()) and (exists(select 1 from membership_record mr where mr.user_id=a.user_id and mr.status='active' and mr.start_date<=current_date and (mr.end_date is null or mr.end_date>=current_date)) or exists(select 1 from organization_membership om where om.user_id=a.user_id and om.status='active')) on conflict(request_id,user_id) do nothing",[created.id,userId,input.businessId]);
    }
    await audit(db,created.id,userId,"request.created",null,"draft",requestIdHeader,{intent});
    return created;
  });
}
export async function submitNetworkPlusRequest(requestId,userId,requestIdHeader,idempotencyKey) {
  return transitionRequest(requestId,userId,"submitted",{},requestIdHeader,idempotencyKey);
}
export async function transitionNetworkPlusRequest(requestId,userId,input,requestIdHeader,idempotencyKey) {
  return transitionRequest(requestId,userId,input.status,input,requestIdHeader,idempotencyKey);
}
async function transitionRequest(requestId,userId,to,input,requestIdHeader,idempotencyKey) {
  if(typeof idempotencyKey!=="string"||!/^[A-Za-z0-9_-]{32,200}$/.test(idempotencyKey))fail(400,"A secure idempotency key is required for this decision.","IDEMPOTENCY_KEY_REQUIRED");
  const idempotencyHash=hash(idempotencyKey), requestFingerprint=hash(JSON.stringify({to,reason:input.reason||null,completionEvidence:input.completionEvidence||null}));
  return withTransaction(async db=>{
    await assertEntry(db,userId);
    await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))",["network-plus-transition:"+requestId+":"+userId+":"+idempotencyHash]);
    const replay=(await db.query("select request_fingerprint from network_plus_request_event where request_id=$1 and actor_user_id=$2 and idempotency_hash=$3",[requestId,userId,idempotencyHash])).rows[0];
    if(replay){if(replay.request_fingerprint!==requestFingerprint)fail(409,"This decision key was already used for a different transition.","IDEMPOTENCY_CONFLICT");return (await db.query("select * from network_plus_request where id=$1",[requestId])).rows[0];}
    const row=(await db.query("select * from network_plus_request where id=$1 for update",[requestId])).rows[0];
    if(!row)fail(404,"Request not found.","NOT_FOUND");
    const p=await participant(db,requestId,userId);
    let role=p.participant_role==="requester"?"requester":p.participant_role==="recipient_representative"?"recipient":"participant";
    if(input.supportReason||input.supportTicket){await assertSupport(db,userId,input.supportReason,input.supportTicket);role="support";}
    if(role==="recipient") {
      if(row.business_id) {
        const capability=to==="accepted"?"business.accept_terms":"business.respond_requests";
        if(!await hasBusinessAuthority(db,row.business_id,userId,capability))fail(403,"The current business owner or required delegated capability is needed for this decision.","RECIPIENT_AUTHORITY_REQUIRED");
      } else if(row.recipient_user_id) {
        const active=(await db.query("select 1 from membership_record where user_id=$1 and status='active' and start_date<=current_date and (end_date is null or end_date>=current_date)",[userId])).rowCount>0;
        if(userId!==row.recipient_user_id||!active)fail(403,"Only the intended active member recipient may decide this request.","RECIPIENT_AUTHORITY_REQUIRED");
      } else if(row.recipient_organization_id) {
        const active=(await db.query("select 1 from organization_membership om join organization o on o.id=om.organization_id where om.organization_id=$1 and om.user_id=$2 and om.status='active' and om.role_code in ('owner','administrator') and o.verification_status='verified' and o.network_plus_visible=true",[row.recipient_organization_id,userId])).rowCount>0;
        if(!active)fail(403,"Only a current authorized representative of the recipient organization may decide this request.","RECIPIENT_AUTHORITY_REQUIRED");
      }
    }
    if(!canTransition(row.intent,row.status,to,role))fail(403,"This role cannot make the requested transition from the current status.","TRANSITION_FORBIDDEN");
    if(to==="accepted"&&role!=="recipient")fail(403,"Only an authorized recipient representative may explicitly accept this request.","RECIPIENT_ACCEPTANCE_REQUIRED");
    if(to==="clarification_requested"&&!input.reason)fail(400,"A clarification reason is required.","REASON_REQUIRED");
    if(to==="declined"&&!input.reason)fail(400,"A decline reason is required.","REASON_REQUIRED");
    if(to==="recipient_withdrawn"&&(!input.reason||String(input.reason).trim().length<5))fail(400,"Explain why the recipient is withdrawing from this connection.","REASON_REQUIRED");
    if(to==="disputed"&&!input.reason)fail(400,"A dispute reason is required.","REASON_REQUIRED");
    if(to==="completed"&&(!Array.isArray(input.completionEvidence)||!input.completionEvidence.length||input.completionEvidence.some(value=>typeof value!=="string"||value.trim().length<5)))fail(400,"Provide completion evidence or a documented not-applicable reason.","COMPLETION_EVIDENCE_REQUIRED");
    if(to==="in_progress"&&row.status!=="accepted")fail(409,"Only an accepted engagement can start.","ACCEPTANCE_REQUIRED");
    const updated=(await db.query(`update network_plus_request set status=$1,submitted_at=case when $1='submitted' then coalesce(submitted_at,now()) else submitted_at end,
      accepted_at=case when $1='accepted' then now() else accepted_at end,declined_at=case when $1='declined' then now() else declined_at end,
      withdrawn_at=case when $1='withdrawn' then now() else withdrawn_at end,recipient_withdrawn_at=case when $1='recipient_withdrawn' then now() else recipient_withdrawn_at end,completed_at=case when $1='completed' then now() else completed_at end,
      disputed_at=case when $1='disputed' then now() else disputed_at end,closed_at=case when $1='closed' then now() else closed_at end,
      review_due_at=case when $1='submitted' and requester_disposition='in_progress' then coalesce(review_due_at,now()+interval '7 days') when $1 in ('declined','withdrawn','recipient_withdrawn','completed','closed') then null else review_due_at end,
      version=version+1,updated_at=now() where id=$2 returning *`,[to,requestId])).rows[0];
    await audit(db,requestId,userId,`request.${to}`,row.status,to,requestIdHeader,{reason:input.reason||null,version:updated.version},idempotencyHash,requestFingerprint);
    if(["disputed","completed","closed","recipient_withdrawn"].includes(to)) { const nextWorkspaceStatus=to==="disputed"?"disputed":to==="recipient_withdrawn"?"closed":to; await db.query("update network_plus_collaboration_workspace set status=$1,completed_at=case when $1=$3 then coalesce(completed_at,now()) else completed_at end,closed_at=case when $1=$4 then coalesce(closed_at,now()) else closed_at end,updated_at=now() where request_id=$2",[nextWorkspaceStatus,requestId,"completed","closed"]); }
    if(to==="accepted") {
      await db.query("update network_plus_request_participant set consent_status='accepted',consented_at=now() where request_id=$1 and user_id=$2 and participant_role='recipient_representative'",[requestId,userId]);
      // Acceptance records a connection decision only. Shared workspaces are explicit opt-in.
    }
    const other=(await db.query("select user_id from network_plus_request_participant where request_id=$1 and user_id<>$2 and consent_status<>'revoked'",[requestId,userId])).rows;
    for(const x of other) await notify(db,x.user_id,`network_plus.request.${to}`,requestId,`Your Network-Plus request is now ${to.replaceAll("_"," ")}.`);
    return updated;
  });
}
export async function listNetworkPlusRequests(userId,{status,intent,disposition,requesterOnly=false,limit=30,offset=0,supportReason,supportTicket,supportRequestId}={}) {
  return withTransaction(async db=>{
    let support=false;
    if(supportReason||supportTicket){if(!supportRequestId)fail(400,"Support access must be scoped to one request record.","SUPPORT_SCOPE_REQUIRED");await assertSupport(db,userId,supportRequestId,supportReason,supportTicket);support=true;} else await assertEntry(db,userId);
    const rows=(await db.query(`select r.id,r.intent,r.status,r.subject,r.summary,r.requester_user_id,r.recipient_user_id,r.recipient_organization_id,r.business_id,r.service_listing_id,r.version,r.created_at,r.updated_at,
        r.requester_disposition,r.requester_disposition_remark,r.requester_disposition_updated_at,r.review_due_at,
        (r.requester_user_id=$1) as is_requester
      from network_plus_request r where (${support} or exists(select 1 from network_plus_request_participant p where p.request_id=r.id and p.user_id=$1 and p.consent_status<>'revoked' and (p.participant_role<>'additional_participant' or p.consent_status='accepted')))
      and ($2::text is null or r.status=$2) and ($3::text is null or r.intent=$3) and ($4::uuid is null or r.id=$4::uuid)
      and ($7::text is null or r.requester_disposition=$7) and (not $8::boolean or r.requester_user_id=$1)
      order by case when r.requester_user_id=$1 and r.requester_disposition='in_progress' then 0 else 1 end,r.updated_at desc limit $5 offset $6`,[userId,status||null,intent||null,supportRequestId||null,Math.min(100,Math.max(1,Number(limit)||30)),Math.max(0,Number(offset)||0),disposition||null,Boolean(requesterOnly)])).rows;
    if(support) for(const row of rows) await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,outcome,metadata) values($1,$2,$3,$4,$5,$6)",[userId,"network_plus.request.support_list","network_plus_request",row.id,"success",{reason:supportReason,ticket:supportTicket}]);
    return rows;
  });
}
export async function updateNetworkPlusRequestDisposition(requestId,userId,input,requestIdHeader,idempotencyKey) {
  const disposition=input?.disposition;
  if(!["in_progress","completed","cancelled"].includes(disposition))fail(400,"Choose In progress, Completed or Cancelled.","INVALID_DISPOSITION");
  const remark=String(input?.remark??"").trim();
  if(disposition!=="in_progress"&&(remark.length<5||remark.length>500))fail(400,"A closing remark of 5–500 characters is required when completing or cancelling a request.","CLOSING_REMARK_REQUIRED");
  if(disposition==="in_progress"&&remark.length>500)fail(400,"The update remark must be 500 characters or fewer.","VALIDATION_ERROR");
  if(typeof idempotencyKey!=="string"||!/^[A-Za-z0-9_-]{32,200}$/.test(idempotencyKey))fail(400,"A secure idempotency key is required.","IDEMPOTENCY_KEY_REQUIRED");
  const idempotencyHash=hash(idempotencyKey),fingerprint=hash(JSON.stringify({disposition,remark}));
  return withTransaction(async db=>{
    await assertEntry(db,userId);
    await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))",["network-plus-disposition:"+requestId+":"+userId+":"+idempotencyHash]);
    const replay=(await db.query("select request_fingerprint from network_plus_request_event where request_id=$1 and actor_user_id=$2 and idempotency_hash=$3",[requestId,userId,idempotencyHash])).rows[0];
    if(replay){if(replay.request_fingerprint!==fingerprint)fail(409,"This update key was already used for different disposition content.","IDEMPOTENCY_CONFLICT");return (await db.query("select * from network_plus_request where id=$1",[requestId])).rows[0];}
    const row=(await db.query("select * from network_plus_request where id=$1 for update",[requestId])).rows[0];
    if(!row||row.requester_user_id!==userId)fail(404,"Request not found.","NOT_FOUND");
    if(row.status==="draft")fail(409,"Submit the request before recording its connection outcome.","REQUEST_NOT_SUBMITTED");
    const previous=row.requester_disposition||"in_progress";
    if(previous===disposition&&String(row.requester_disposition_remark||"")===remark)return row;
    if(previous!=="in_progress"&&disposition==="in_progress"&&remark.length<5)fail(400,"Add a short remark explaining why this request is being reopened.","REOPEN_REMARK_REQUIRED");
    const reopened=previous!=="in_progress"&&disposition==="in_progress";
    const updated=(await db.query(`update network_plus_request set requester_disposition=$1,requester_disposition_remark=$2,
      requester_disposition_updated_at=now(),review_due_at=case when $1='in_progress' then now()+interval '7 days' else null end,
      review_reminder_sent_at=null,version=version+1,updated_at=now() where id=$3 returning *`,[disposition,remark||null,requestId])).rows[0];
    const eventCode=reopened?"request.disposition_reopened":"request.disposition_updated";
    const metadata={previousDisposition:previous,disposition,remark:remark||null,source:"requester_reported"};
    await audit(db,requestId,userId,eventCode,row.status,row.status,requestIdHeader,metadata,idempotencyHash,fingerprint);
    return updated;
  });
}
export async function dispatchNetworkPlusRequestReviewReminders({limit=100}={}) {
  return withTransaction(async db=>{
    const due=(await db.query(`select id,requester_user_id from network_plus_request
      where requester_disposition='in_progress' and review_due_at<=now()
        and status not in ('draft','completed','closed')
      order by review_due_at for update skip locked limit $1`,[Math.min(500,Math.max(1,Number(limit)||100))])).rows;
    for(const row of due){
      await notify(db,row.requester_user_id,"network_plus.request.review_reminder",row.id,"A gentle reminder to review this connection request. Update its progress or close it with a short remark.");
      await db.query("update network_plus_request set review_reminder_sent_at=now(),review_due_at=now()+interval '7 days' where id=$1",[row.id]);
      await db.query("insert into network_plus_request_event(request_id,actor_user_id,event_code,from_status,to_status,metadata) values($1,$2,'request.review_reminder_sent',null,null,$3)",[row.id,row.requester_user_id,{source:"scheduled_review_reminder",actor:"system"}]);
    }
    return {sent:due.length};
  });
}

export async function grantNetworkPlusSupportAccess(requestId,actorUserId,input,requestIdHeader) {
  return withTransaction(async db=>{
    const roles=(await db.query("select r.role_code from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1",[actorUserId])).rows.map(row=>row.role_code);
    if(!roles.includes("system_admin"))fail(403,"Only a system administrator may grant request support access.","SUPPORT_GRANT_FORBIDDEN");
    const targetUserId=input?.supportUserId, ticket=clean(input?.supportCaseReference,120,"Support case reference",6), reason=clean(input?.reason,500,"Grant reason",8);
    if(!targetUserId)fail(400,"Choose a support user for this grant.","SUPPORT_USER_REQUIRED");
    const targetRoles=(await db.query("select r.role_code from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1",[targetUserId])).rows.map(row=>row.role_code);
    if(!targetRoles.includes("network_plus_support")&&!targetRoles.includes("system_admin"))fail(403,"The support user must hold the privileged Network-Plus support role.","SUPPORT_FORBIDDEN");
    const expiresAt=new Date(input?.expiresAt);
    if(!Number.isFinite(expiresAt.getTime())||expiresAt<=new Date()||expiresAt.getTime()>Date.now()+72*60*60*1000)fail(400,"Support access must expire within the next 72 hours.","INVALID_SUPPORT_EXPIRY");
    const grant=(await db.query("insert into network_plus_request_support_grant(request_id,support_user_id,support_case_reference,granted_by,grant_reason,expires_at) values($1,$2,$3,$4,$5,$6) on conflict(request_id,support_user_id,support_case_reference) do update set granted_by=excluded.granted_by,grant_reason=excluded.grant_reason,expires_at=excluded.expires_at,revoked_at=null,created_at=now() returning *",[requestId,targetUserId,ticket,actorUserId,reason,expiresAt])).rows[0];
    await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,$2,$3,$4,$5,$6,$7)",[actorUserId,"network_plus.request.support_granted","network_plus_request",requestId,requestIdHeader,"success",{supportUserId:targetUserId,ticket,reason,expiresAt}]);
    return grant;
  });
}
export async function revokeNetworkPlusSupportAccess(requestId,grantId,actorUserId,requestIdHeader) {
  return withTransaction(async db=>{
    const roles=(await db.query("select r.role_code from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1",[actorUserId])).rows.map(row=>row.role_code);
    if(!roles.includes("system_admin"))fail(403,"Only a system administrator may revoke request support access.","SUPPORT_GRANT_FORBIDDEN");
    const grant=(await db.query("update network_plus_request_support_grant set revoked_at=now() where id=$1 and request_id=$2 and revoked_at is null returning *",[grantId,requestId])).rows[0];
    if(!grant)fail(404,"Support grant not found.","NOT_FOUND");
    await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,$2,$3,$4,$5,$6,$7)",[actorUserId,"network_plus.request.support_revoked","network_plus_request",requestId,requestIdHeader,"success",{grantId:grant.id,supportUserId:grant.support_user_id}]);
    return {id:grant.id,revoked:true};
  });
}
export async function listNetworkPlusParticipantInvitations(userId) {
  return withTransaction(async db=>{
    await assertEntry(db,userId);
    return (await db.query("select r.id,r.intent,r.subject,r.created_at,p.created_at invited_at from network_plus_request_participant p join network_plus_request r on r.id=p.request_id where p.user_id=$1 and p.participant_role='additional_participant' and p.consent_status='pending' and r.status in ('accepted','in_progress') order by p.created_at desc limit 50",[userId])).rows;
  });
}
export async function getNetworkPlusRequest(requestId,userId,{supportReason,supportTicket}={}) {
  return withTransaction(async db=>{
    const row=(await db.query("select * from network_plus_request where id=$1",[requestId])).rows[0];
    if(!row)fail(404,"Request not found.","NOT_FOUND");
    const isParticipant=(await db.query("select 1 from network_plus_request_participant where request_id=$1 and user_id=$2 and consent_status<>'revoked' and (participant_role<>'additional_participant' or consent_status='accepted')",[requestId,userId])).rowCount>0;
    if(isParticipant) await assertEntry(db,userId); else { if(!await hasSupportRole(db,userId))fail(404,"Request not found.","NOT_FOUND"); await assertSupport(db,userId,requestId,supportReason,supportTicket); await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,outcome,metadata) values($1,$2,$3,$4,$5,$6)",[userId,"network_plus.request.support_read","network_plus_request",requestId,"success",{reason:supportReason,ticket:supportTicket}]); }
    const participants=(await db.query("select user_id,participant_role,consent_status,consented_at from network_plus_request_participant where request_id=$1 and consent_status<>'revoked'",[requestId])).rows;
    const recipientRepresentativeParticipant=participants.some(p=>p.user_id===userId&&p.participant_role==="recipient_representative"&&p.consent_status==="accepted");
    const isRecipientRepresentative=recipientRepresentativeParticipant&&await hasCurrentRecipientAuthority(db,row,userId,"business.respond_requests");
    const isPrimaryParticipant=participants.some(p=>p.user_id===userId&&p.participant_role==="requester")||isRecipientRepresentative;
    const clarifications=(await db.query("select id,asked_by,answered_by,prompt_code,question,answer,status,created_at,answered_at from network_plus_request_clarification where request_id=$1 and ($2::boolean or asked_by=$3) order by created_at",[requestId,isPrimaryParticipant,userId])).rows;
    const meetings=(await db.query("select * from network_plus_request_meeting where request_id=$1 and $3::boolean and (proposer_user_id=$2 or responder_user_id=$2) order by created_at desc",[requestId,userId,isPrimaryParticipant])).rows;
    const events=(await db.query("select event_code,from_status,to_status,reason,metadata,created_at from network_plus_request_event where request_id=$1 and ($2::boolean or (actor_user_id=$3 and event_code not like 'request.meeting_%' and event_code not like 'request.contact_consent_%')) order by created_at",[requestId,isPrimaryParticipant,userId])).rows;
    const workspace=(await db.query("select * from network_plus_collaboration_workspace where request_id=$1",[requestId])).rows[0]||null;
    const canReview=isRecipientRepresentative;
    const canAccept=isRecipientRepresentative&&await hasCurrentRecipientAuthority(db,row,userId,"business.accept_terms");
    return { ...row, recipient_response:isRecipientRepresentative||row.requester_user_id===userId?row.recipient_response:null, recipient_response_by:isRecipientRepresentative||row.requester_user_id===userId?row.recipient_response_by:null, recipient_response_at:isRecipientRepresentative||row.requester_user_id===userId?row.recipient_response_at:null, participants, clarifications, meetings, events, workspace, isRequester:row.requester_user_id===userId, isRecipientRepresentative, canReview, canAccept, canHandoff:isPrimaryParticipant };
  });
}
export async function addNetworkPlusRequestParticipant(requestId,userId,input,requestIdHeader) {
  const target=input?.userId;
  if(!target||target===userId)fail(400,"Choose another participant.","INVALID_PARTICIPANT");
  return withTransaction(async db=>{
    await assertEntry(db,userId);
    const actorParticipant=await participant(db,requestId,userId);
    if(actorParticipant.consent_status!=="accepted")fail(403,"Only an accepted participant can invite collaborators.","PARTICIPANT_CONSENT_REQUIRED");
    await assertEntry(db,target);
    const request=(await db.query("select status,requester_user_id from network_plus_request where id=$1 for update",[requestId])).rows[0];
    if(!["accepted","in_progress"].includes(request.status))fail(409,"Additional participants can join only an accepted engagement.","ACCEPTANCE_REQUIRED");
    const inserted=await db.query("insert into network_plus_request_participant(request_id,user_id,participant_role,consent_status,added_by) values($1,$2,'additional_participant','pending',$3) on conflict(request_id,user_id) do nothing returning user_id",[requestId,target,userId]);
    const existing=(await db.query("select consent_status from network_plus_request_participant where request_id=$1 and user_id=$2",[requestId,target])).rows[0];
    if(inserted.rowCount){await audit(db,requestId,userId,"request.participant_invited",request.status,request.status,requestIdHeader,{});await notify(db,target,"network_plus.request.participant_invited",requestId,"You have been invited to an accepted Network-Plus engagement. Accept participation to view its workspace.");}
    return {requestId,userId:target,consentStatus:existing.consent_status,replayed:!inserted.rowCount};
  });
}
export async function respondNetworkPlusParticipant(requestId,userId,decision,requestIdHeader) {
  if(!["accept","decline"].includes(decision))fail(400,"Choose accept or decline.","INVALID_DECISION");
  return withTransaction(async db=>{
    await assertEntry(db,userId);
    const p=(await db.query("select * from network_plus_request_participant where request_id=$1 and user_id=$2 for update",[requestId,userId])).rows[0];
    if(!p||p.participant_role!=="additional_participant")fail(404,"Invitation not found.","NOT_FOUND");
    const nextConsent=decision==="accept"?"accepted":"declined";
    if(p.consent_status===nextConsent)return {requestId,consentStatus:nextConsent,replayed:true};
    if(p.consent_status!=="pending")fail(409,"This invitation has already been decided.","INVITATION_ALREADY_DECIDED");
    await db.query("update network_plus_request_participant set consent_status=$1,consented_at=case when $1='accepted' then now() else consented_at end where request_id=$2 and user_id=$3",[nextConsent,requestId,userId]);
    await audit(db,requestId,userId,`request.participant_${decision}ed`,null,null,requestIdHeader,{});
    const others=(await db.query("select user_id from network_plus_request_participant where request_id=$1 and user_id<>$2 and consent_status='accepted'",[requestId,userId])).rows;
    for(const other of others)await notify(db,other.user_id,"network_plus.request.participant_consent",requestId,"An invited participant has responded to the collaboration invitation.");
    return {requestId,consentStatus:nextConsent};
  });
}
async function workspaceAccess(db,workspaceId,userId) {
  const ws=(await db.query(`select w.*,r.id request_id from network_plus_collaboration_workspace w join network_plus_request r on r.id=w.request_id
    join network_plus_request_participant p on p.request_id=r.id and p.user_id=$2 and p.consent_status='accepted'
    where w.id=$1`,[workspaceId,userId])).rows[0];
  if(!ws)fail(404,"Collaboration workspace not found.","NOT_FOUND");
  return ws;
}

function contactEncryptionKey(){
  const secret=process.env.NETWORK_PLUS_CONTACT_ENCRYPTION_KEY;
  if(typeof secret!=="string"||secret.length<32)fail(503,"Secure contact sharing is not configured. Ask the platform administrator to configure NETWORK_PLUS_CONTACT_ENCRYPTION_KEY.","CONTACT_SHARING_NOT_CONFIGURED");
  return createHash("sha256").update(secret).digest();
}
function encryptContactValue(value,context){
  const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",contactEncryptionKey(),iv);
  cipher.setAAD(Buffer.from(context,"utf8"));
  const encrypted=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
  return ["v1",iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),encrypted.toString("base64url")].join(".");
}
function decryptContactValue(value,context){
  const parts=String(value||"").split(".");
  const legacy=parts.length===3;
  const [version,iv,tag,data]=legacy?["legacy",...parts]:parts;
  if((!legacy&&version!=="v1")||!iv||!tag||!data)fail(500,"Stored contact data is invalid or uses an unsupported encryption version.","CONTACT_DATA_INVALID");
  const decipher=createDecipheriv("aes-256-gcm",contactEncryptionKey(),Buffer.from(iv,"base64url"));
  if(!legacy)decipher.setAAD(Buffer.from(context,"utf8"));
  decipher.setAuthTag(Buffer.from(tag,"base64url"));
  try{return Buffer.concat([decipher.update(Buffer.from(data,"base64url")),decipher.final()]).toString("utf8");}
  catch{fail(500,"Stored contact data could not be authenticated. Ask the platform administrator to verify the encryption key.","CONTACT_DATA_AUTHENTICATION_FAILED");}
}
function validateContactValue(field,value){
  const v=clean(value,field==="business_location"?500:field==="website"?300:180,field.replaceAll("_"," "),2);
  if(field==="email"&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))fail(400,"Enter a valid email address.","INVALID_CONTACT_VALUE");
  if(["phone","whatsapp"].includes(field)&&! /^\+?[0-9 ()-]{7,30}$/.test(v))fail(400,"Enter a valid phone number including country code where possible.","INVALID_CONTACT_VALUE");
  if(field==="website"){let url;try{url=new URL(v);}catch{fail(400,"Enter a valid HTTPS website URL.","INVALID_CONTACT_VALUE");}if(url.protocol!=="https:")fail(400,"Contact websites must use HTTPS.","INVALID_CONTACT_VALUE");}
  return v;
}
async function hasCurrentRecipientAuthority(db,request,userId,capability="business.respond_requests"){
  if(request.business_id){
    if(await hasBusinessAuthority(db,request.business_id,userId,capability))return true;
    return capability==="business.respond_requests"&&hasBusinessAuthority(db,request.business_id,userId,"business.accept_terms");
  }
  if(request.recipient_organization_id){
    return (await db.query("select 1 from organization_membership om join organization o on o.id=om.organization_id where om.organization_id=$1 and om.user_id=$2 and om.status='active' and om.role_code in ('owner','administrator') and o.verification_status='verified' and o.network_plus_visible=true",[request.recipient_organization_id,userId])).rowCount>0;
  }
  if(request.recipient_user_id===userId){
    return (await db.query("select 1 from membership_record where user_id=$1 and status='active' and start_date<=current_date and (end_date is null or end_date>=current_date)",[userId])).rowCount>0;
  }
  return false;
}
async function assertRecipientRepresentative(db,request,userId){
  if(!await hasCurrentRecipientAuthority(db,request,userId))fail(403,"The recipient representative no longer has current authority for this request.","RECIPIENT_AUTHORITY_REQUIRED");
}
async function connectionPair(db,requestId,userId,peerUserId){
  const request=(await db.query("select * from network_plus_request where id=$1 for update",[requestId])).rows[0];
  if(!request)fail(404,"Request not found.","NOT_FOUND");
  if(!["accepted","in_progress","completed","closed"].includes(request.status))fail(409,"Contact and meeting handoffs are available only after recipient acceptance.","RECIPIENT_ACCEPTANCE_REQUIRED");
  const actor=await participant(db,requestId,userId);
  if(actor.consent_status!=="accepted")fail(403,"Accept the request invitation before sharing contact details.","PARTICIPANT_CONSENT_REQUIRED");
  let side,peer;
  if(userId===request.requester_user_id){
    side="requester";peer=peerUserId||request.recipient_user_id;
    if(!peer)fail(400,"Choose the recipient representative for this contact handoff.","RECIPIENT_REPRESENTATIVE_REQUIRED");
  }else if(actor.participant_role==="recipient_representative"){
    side="recipient";peer=request.requester_user_id;
  }else fail(403,"Only the requester and an accepted recipient representative can arrange a connection handoff.","PARTICIPANT_FORBIDDEN");
  const other=(await db.query("select participant_role,consent_status from network_plus_request_participant where request_id=$1 and user_id=$2",[requestId,peer])).rows[0];
  if(!other||(side==="requester"&&other.participant_role!=="recipient_representative")||(side==="recipient"&&other.participant_role!=="requester")||other.consent_status!=="accepted")fail(403,"The selected connection partner has not accepted this request.","PARTICIPANT_CONSENT_REQUIRED");
  if(side==="requester"){await assertEntry(db,userId);await assertRecipientRepresentative(db,request,peer);}
  else {await assertRecipientRepresentative(db,request,userId);await assertEntry(db,peer);}
  return {request,side,peerUserId:peer};
}
async function contactHandoffFor(db,requestId,userId,peerUserId){
  const {side}=await connectionPair(db,requestId,userId,peerUserId);
  const recipientUserId=side==="requester"?peerUserId:userId;
  const rows=(await db.query("select * from network_plus_request_contact_consent where request_id=$1 and recipient_user_id=$2 order by field_code",[requestId,recipientUserId])).rows;
  return {requestId,fields:rows.map(row=>{
    const released=row.requester_status==="accepted"&&row.recipient_status==="accepted";
    const yourStatus=side==="requester"?row.requester_status:row.recipient_status;
    const peerStatus=side==="requester"?row.recipient_status:row.requester_status;
    const yourCipher=side==="requester"?row.requester_value_ciphertext:row.recipient_value_ciphertext;
    const peerCipher=side==="requester"?row.recipient_value_ciphertext:row.requester_value_ciphertext;
    const context=`network-plus-contact:v1:${requestId}:${recipientUserId}:${row.field_code}`;
    return {field:row.field_code,yourStatus,peerStatus,released,yourValue:yourStatus==="accepted"&&yourCipher?decryptContactValue(yourCipher,context):null,sharedWithYou:released&&peerCipher?decryptContactValue(peerCipher,context):null};
  })};
}
export async function updateNetworkPlusContactConsent(requestId,userId,input,requestIdHeader){
  const field=input?.field,decision=input?.decision;
  if(!CONTACT_FIELDS.has(field))fail(400,"Choose a supported contact field.","INVALID_CONTACT_FIELD");
  if(!["accept","decline","revoke"].includes(decision))fail(400,"Choose accept, decline or revoke.","INVALID_CONSENT_DECISION");
  return withTransaction(async db=>{
    const pair=await connectionPair(db,requestId,userId,input?.peerUserId);
    const value=decision==="accept"?validateContactValue(field,input?.value):null;
    const status=decision==="accept"?"accepted":decision==="decline"?"declined":"revoked";
    const recipientUserId=pair.side==="requester"?pair.peerUserId:userId;
    const context=`network-plus-contact:v1:${requestId}:${recipientUserId}:${field}`;
    const encrypted=value?encryptContactValue(value,context):null;
    if(decision==="revoke"){
      const exists=(await db.query("select 1 from network_plus_request_contact_consent where request_id=$1 and recipient_user_id=$2 and field_code=$3",[requestId,recipientUserId,field])).rowCount>0;
      if(!exists)fail(404,"There is no contact consent to revoke.","CONTACT_CONSENT_NOT_FOUND");
    }
    if(pair.side==="requester"){
      await db.query("insert into network_plus_request_contact_consent(request_id,recipient_user_id,field_code,requester_status,requester_value_ciphertext,requester_consented_at) values($1,$2,$3,$4,$5,case when $4='accepted' then now() end) on conflict(request_id,recipient_user_id,field_code) do update set requester_status=excluded.requester_status,requester_value_ciphertext=excluded.requester_value_ciphertext,requester_consented_at=case when excluded.requester_status='accepted' then now() else null end,updated_at=now()",[requestId,pair.peerUserId,field,status,encrypted]);
    }else{
      await db.query("insert into network_plus_request_contact_consent(request_id,recipient_user_id,field_code,recipient_status,recipient_value_ciphertext,recipient_consented_at) values($1,$2,$3,$4,$5,case when $4='accepted' then now() end) on conflict(request_id,recipient_user_id,field_code) do update set recipient_status=excluded.recipient_status,recipient_value_ciphertext=excluded.recipient_value_ciphertext,recipient_consented_at=case when excluded.recipient_status='accepted' then now() else null end,updated_at=now()",[requestId,pair.peerUserId,field,status,encrypted]);
    }
    await audit(db,requestId,userId,"request.contact_consent_"+status,null,null,requestIdHeader,{field,peerUserId:pair.peerUserId,side:pair.side});
    const row=(await db.query("select requester_status,recipient_status from network_plus_request_contact_consent where request_id=$1 and recipient_user_id=$2 and field_code=$3",[requestId,recipientUserId,field])).rows[0];
    const released=row.requester_status==="accepted"&&row.recipient_status==="accepted";
    await notify(db,pair.peerUserId,released?"network_plus.request.contact_released":"network_plus.request.contact_consent",requestId,released?"Both parties consented to share a contact field. Open the private request to view the released details.":"The other participant updated a field-specific contact-sharing preference.");
    return contactHandoffFor(db,requestId,userId,pair.peerUserId);
  });
}
export async function getNetworkPlusContactHandoff(requestId,userId,peerUserId){
  return withTransaction(async db=>{
    await assertEntry(db,userId);
    const pair=await connectionPair(db,requestId,userId,peerUserId);
    return contactHandoffFor(db,requestId,userId,pair.peerUserId);
  });
}
function assertUnambiguousLocalMeetingTime(startsAt,timezone){
  const formatter=new Intl.DateTimeFormat("en-US",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
  const partsAt=instant=>Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part=>[part.type,Number(part.value)]));
  const localEpoch=parts=>Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second);
  const instant=Math.floor(startsAt.getTime()/1000)*1000,local=partsAt(instant),base=localEpoch(local);
  const offsets=new Set([-36,-24,-12,0,12,24,36].map(hours=>{const sample=base+hours*60*60*1000;return localEpoch(partsAt(sample))-sample;}));
  const candidates=[...offsets].map(offset=>base-offset).filter(candidate=>{
    const parts=partsAt(candidate);
    return parts.year===local.year&&parts.month===local.month&&parts.day===local.day&&parts.hour===local.hour&&parts.minute===local.minute&&parts.second===local.second;
  });
  if(!candidates.includes(instant))fail(400,"The meeting instant does not match its selected local timezone.","INVALID_LOCAL_MEETING_TIME");
  if(candidates.length>1)fail(400,"That local time occurs twice in the selected timezone because clocks move backward. Choose a time outside the repeated hour.","AMBIGUOUS_LOCAL_MEETING_TIME");
}
function validateMeeting(input){
  const placeType=input?.placeType;
  if(!["office","coffee","online","other"].includes(placeType))fail(400,"Choose a supported meeting place type.","INVALID_MEETING_PLACE");
  const placeDetails=String(input?.placeDetails||"").trim();
  if(placeDetails.length>500)fail(400,"Meeting place details must be 500 characters or fewer.","VALIDATION_ERROR");
  if(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(placeDetails)||/\+?[0-9][0-9 ()-]{6,}[0-9]/.test(placeDetails)||/https?:\/\//i.test(placeDetails))fail(400,"Do not put contact details or meeting links in the meeting location. Share those separately only through consent.","CONTACT_DETAILS_FORBIDDEN");
  const timezone=clean(input?.timezone,100,"Timezone",3);
  try{new Intl.DateTimeFormat("en",{timeZone:timezone}).format(new Date());}catch{fail(400,"Choose a valid IANA timezone.","INVALID_TIMEZONE");}
  const startsAt=new Date(input?.startsAt);
  if(!Number.isFinite(startsAt.getTime())||startsAt.getTime()<Date.now()+15*60*1000||startsAt.getTime()>Date.now()+180*24*60*60*1000)fail(400,"Meeting time must be at least 15 minutes ahead and within 180 days.","INVALID_MEETING_TIME");
  assertUnambiguousLocalMeetingTime(startsAt,timezone);
  const durationMinutes=Number(input?.durationMinutes);
  if(![15,30,45,60,90,120].includes(durationMinutes))fail(400,"Choose a supported meeting duration.","INVALID_MEETING_DURATION");
  return {placeType,placeDetails,startsAt,timezone,durationMinutes};
}
export async function createNetworkPlusMeetingProposal(requestId,userId,input,requestIdHeader,idempotencyKey){
  if(typeof idempotencyKey!=="string"||!/^[A-Za-z0-9_-]{32,200}$/.test(idempotencyKey))fail(400,"A secure idempotency key is required for a meeting proposal.","IDEMPOTENCY_KEY_REQUIRED");
  const proposal=validateMeeting(input),fingerprint=hash(JSON.stringify({proposal,peerUserId:input?.peerUserId||null})),idHash=hash(idempotencyKey);
  return withTransaction(async db=>{
    const pair=await connectionPair(db,requestId,userId,input?.peerUserId);
    if(!["accepted","in_progress"].includes(pair.request.status))fail(409,"A first meeting can be arranged only for an accepted or active request.","INVALID_REQUEST_STATUS");
    await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))",["network-plus-meeting:"+requestId]);
    const replay=(await db.query("select * from network_plus_request_meeting where request_id=$1 and proposer_user_id=$2 and idempotency_hash=$3",[requestId,userId,idHash])).rows[0];
    if(replay){if(replay.request_fingerprint!==fingerprint)fail(409,"This meeting key was already used for different details.","IDEMPOTENCY_CONFLICT");return replay;}
    const active=(await db.query("select id from network_plus_request_meeting where request_id=$1 and status in ('proposed','countered')",[requestId])).rows[0];
    if(active)fail(409,"A meeting proposal is already awaiting a response.","MEETING_RESPONSE_PENDING");
    const confirmed=(await db.query("select id from network_plus_request_meeting where request_id=$1 and status='confirmed' limit 1",[requestId])).rows[0];
    if(confirmed)fail(409,"A first meeting has already been confirmed for this connection.","MEETING_ALREADY_CONFIRMED");
    const created=(await db.query("insert into network_plus_request_meeting(request_id,proposer_user_id,responder_user_id,place_type,place_details,starts_at,timezone,duration_minutes,idempotency_hash,request_fingerprint) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *",[requestId,userId,pair.peerUserId,proposal.placeType,proposal.placeDetails,proposal.startsAt,proposal.timezone,proposal.durationMinutes,idHash,fingerprint])).rows[0];
    await audit(db,requestId,userId,"request.meeting_proposed",pair.request.status,pair.request.status,requestIdHeader,{meetingId:created.id,placeType:proposal.placeType,startsAt:proposal.startsAt,timezone:proposal.timezone,durationMinutes:proposal.durationMinutes});
    await notify(db,pair.peerUserId,"network_plus.request.meeting_proposed",requestId,"A participant proposed a first meeting. Review the private request to accept, suggest another time or decline.");
    return created;
  });
}
export async function respondNetworkPlusMeeting(requestId,meetingId,userId,input,requestIdHeader){
  const decision=input?.decision;
  if(!["accept","counter","decline"].includes(decision))fail(400,"Choose accept, suggest another time or decline.","INVALID_MEETING_DECISION");
  const counter=decision==="counter"?validateMeeting(input):null;
  return withTransaction(async db=>{
    const meeting=(await db.query("select * from network_plus_request_meeting where id=$1 and request_id=$2 for update",[meetingId,requestId])).rows[0];
    if(!meeting)fail(404,"Meeting proposal not found.","NOT_FOUND");
    const peerUserId=userId===meeting.proposer_user_id?meeting.responder_user_id:meeting.proposer_user_id;
    const pair=await connectionPair(db,requestId,userId,peerUserId);
    const isResponder=userId===meeting.responder_user_id,isProposer=userId===meeting.proposer_user_id;
    if(meeting.status==="proposed"&&!isResponder)fail(403,"Only the invited participant can respond to this meeting proposal.","MEETING_RESPONDER_REQUIRED");
    if(meeting.status==="countered"&&!isProposer)fail(403,"Only the original proposer can respond to the counterproposal.","MEETING_PROPOSER_REQUIRED");
    if(!["proposed","countered"].includes(meeting.status))fail(409,"This meeting proposal has already been resolved.","MEETING_ALREADY_RESOLVED");
    if(decision==="counter"){
      if(meeting.status!=="proposed")fail(409,"Only one counterproposal is allowed for this meeting handoff.","MEETING_COUNTER_LIMIT");
      await db.query("update network_plus_request_meeting set status='countered',counter_place_type=$1,counter_place_details=$2,counter_starts_at=$3,counter_timezone=$4,counter_duration_minutes=$5,responded_by=$6,responded_at=now(),updated_at=now() where id=$7",[counter.placeType,counter.placeDetails,counter.startsAt,counter.timezone,counter.durationMinutes,userId,meetingId]);
    }else if(decision==="accept"){
      const accepted=meeting.status==="countered"?{placeType:meeting.counter_place_type,placeDetails:meeting.counter_place_details,startsAt:meeting.counter_starts_at,timezone:meeting.counter_timezone,durationMinutes:meeting.counter_duration_minutes}:{placeType:meeting.place_type,placeDetails:meeting.place_details,startsAt:meeting.starts_at,timezone:meeting.timezone,durationMinutes:meeting.duration_minutes};
      await db.query("update network_plus_request_meeting set status='confirmed',confirmed_place_type=$1,confirmed_place_details=$2,confirmed_starts_at=$3,confirmed_timezone=$4,confirmed_duration_minutes=$5,confirmed_by=$6,confirmed_at=now(),responded_by=$6,responded_at=now(),updated_at=now() where id=$7",[accepted.placeType,accepted.placeDetails,accepted.startsAt,accepted.timezone,accepted.durationMinutes,userId,meetingId]);
    }else{
      await db.query("update network_plus_request_meeting set status='declined',responded_by=$1,responded_at=now(),updated_at=now() where id=$2",[userId,meetingId]);
    }
    await audit(db,requestId,userId,"request.meeting_"+(decision==="counter"?"countered":decision==="accept"?"confirmed":"declined"),pair.request.status,pair.request.status,requestIdHeader,{meetingId,decision});
    await notify(db,peerUserId,"network_plus.request.meeting_"+(decision==="counter"?"countered":decision==="accept"?"confirmed":"declined"),requestId,decision==="counter"?"A participant suggested another meeting time.":decision==="accept"?"The first meeting has been mutually confirmed.":"A meeting proposal was declined.");
    return (await db.query("select * from network_plus_request_meeting where id=$1",[meetingId])).rows[0];
  });
}
const CLARIFICATION_PROMPTS=new Set(["scope","budget","timeline","quantity","location","availability","eligibility","other"]);
export async function askNetworkPlusClarification(requestId,userId,input,requestIdHeader){
  const promptCode=input?.promptCode,question=clean(input?.question,1200,"Clarification question",3); assertNoContactFields({question});
  if(!CLARIFICATION_PROMPTS.has(promptCode))fail(400,"Choose a structured clarification topic.","INVALID_CLARIFICATION_TOPIC");
  return withTransaction(async db=>{
    await assertEntry(db,userId);
    const request=(await db.query("select * from network_plus_request where id=$1 for update",[requestId])).rows[0];
    if(!request)fail(404,"Request not found.","NOT_FOUND");
    if(!["submitted","under_review"].includes(request.status))fail(409,"Clarification can be requested only while a request is awaiting recipient review.","INVALID_REQUEST_STATUS");
    const actor=await participant(db,requestId,userId);
    if(actor.participant_role!=="recipient_representative")fail(403,"Only the recipient representative can request clarification.","RECIPIENT_ONLY");
    await assertRecipientRepresentative(db,request,userId);
    const openClarification=(await db.query("select id from network_plus_request_clarification where request_id=$1 and status='open' limit 1",[requestId])).rows[0];
    if(openClarification)fail(409,"A clarification is already awaiting the requester response.","CLARIFICATION_ALREADY_OPEN");
    const clarification=(await db.query("insert into network_plus_request_clarification(request_id,asked_by,prompt_code,question) values($1,$2,$3,$4) returning *",[requestId,userId,promptCode,question])).rows[0];
    await db.query("update network_plus_request set status='clarification_requested',version=version+1,updated_at=now() where id=$1",[requestId]);
    await audit(db,requestId,userId,"request.clarification_requested",request.status,"clarification_requested",requestIdHeader,{clarificationId:clarification.id,promptCode});
    await notify(db,request.requester_user_id,"network_plus.request.clarification_requested",requestId,"The recipient asked for a clarification. Open the private request to respond.");
    return clarification;
  });
}
export async function answerNetworkPlusQuestion(requestId,userId,input,requestIdHeader){
  const answer=clean(input?.answer,2000,"Question response",3);
  assertNoContactFields({answer});
  return withTransaction(async db=>{
    await assertEntry(db,userId);
    const request=(await db.query("select * from network_plus_request where id=$1 for update",[requestId])).rows[0];
    if(!request)fail(404,"Request not found.","NOT_FOUND");
    if(request.intent!=="question")fail(409,"Only question requests accept a direct recipient answer.","INVALID_REQUEST_INTENT");
    if(!["submitted","under_review"].includes(request.status))fail(409,"A question can be answered only while it is awaiting recipient review.","INVALID_REQUEST_STATUS");
    const actor=await participant(db,requestId,userId);
    if(actor.participant_role!=="recipient_representative")fail(403,"Only the recipient can answer this question.","RECIPIENT_ONLY");
    await assertRecipientRepresentative(db,request,userId);
    if(request.recipient_response_at)fail(409,"A recipient answer has already been recorded for this question.","QUESTION_ALREADY_ANSWERED");
    const updated=(await db.query("update network_plus_request set recipient_response=$1,recipient_response_by=$2,recipient_response_at=now(),version=version+1,updated_at=now() where id=$3 returning *",[answer,userId,requestId])).rows[0];
    await audit(db,requestId,userId,"request.question_answered",request.status,request.status,requestIdHeader,{responseLength:answer.length});
    await notify(db,request.requester_user_id,"network_plus.request.question_answered",requestId,"The recipient answered your question. Review the private request for the response.");
    return {id:updated.id,recipient_response:updated.recipient_response,recipient_response_by:updated.recipient_response_by,recipient_response_at:updated.recipient_response_at};
  });
}
export async function answerNetworkPlusClarification(requestId,clarificationId,userId,input,requestIdHeader){
  const answer=clean(input?.answer,2000,"Clarification response",3); assertNoContactFields({answer});
  return withTransaction(async db=>{
    await assertEntry(db,userId);
    const request=(await db.query("select * from network_plus_request where id=$1 for update",[requestId])).rows[0];
    if(!request)fail(404,"Request not found.","NOT_FOUND");
    if(request.requester_user_id!==userId||request.status!=="clarification_requested")fail(403,"Only the requester can answer an open clarification.","REQUESTER_ONLY");
    const clarification=(await db.query("update network_plus_request_clarification set answer=$1,answered_by=$2,status='answered',answered_at=now(),updated_at=now() where id=$3 and request_id=$4 and status='open' returning *",[answer,userId,clarificationId,requestId])).rows[0];
    if(!clarification)fail(404,"Open clarification not found.","CLARIFICATION_NOT_FOUND");
    await db.query("update network_plus_request set status='submitted',version=version+1,updated_at=now() where id=$1",[requestId]);
    await audit(db,requestId,userId,"request.clarification_answered","clarification_requested","submitted",requestIdHeader,{clarificationId});
    const recipients=(await db.query("select user_id from network_plus_request_participant where request_id=$1 and participant_role='recipient_representative' and consent_status<>'revoked'",[requestId])).rows;
    for(const recipient of recipients)await notify(db,recipient.user_id,"network_plus.request.clarification_answered",requestId,"The requester answered your clarification. Review the updated request.");
    return clarification;
  });
}
export async function createNetworkPlusWorkspace(requestId,userId,requestIdHeader) {
  return withTransaction(async db=>{
    await assertEntry(db,userId);
    const request=(await db.query("select * from network_plus_request where id=$1 for update",[requestId])).rows[0];
    if(!request)fail(404,"Request not found.","NOT_FOUND");
    if(!["accepted","in_progress","disputed"].includes(request.status)||!request.accepted_at)fail(409,"A collaboration workspace can be enabled only for an accepted, active request.","ACCEPTANCE_REQUIRED");
    if(!WORKSPACE_ELIGIBLE_INTENTS.has(request.intent))fail(409,"This request is intended to remain a lightweight connection and does not support a collaboration workspace.","WORKSPACE_NOT_APPLICABLE");
    const actor=await participant(db,requestId,userId);
    if(!["requester","recipient_representative"].includes(actor.participant_role)||actor.consent_status!=="accepted")fail(403,"Only an accepted primary participant may enable the shared workspace.","PARTICIPANT_CONSENT_REQUIRED");
    const terms=request.terms||{};
    const purpose=clean(terms.purpose||request.subject,2000,"Workspace purpose",3);
    const scope=clean(terms.scope||request.summary,5000,"Workspace scope",3);
    const created=(await db.query(`insert into network_plus_collaboration_workspace(request_id,purpose,scope,timeline,created_by,accepted_at)
      values($1,$2,$3,$4,$5,$6) on conflict(request_id) do nothing returning *`,[requestId,purpose,scope,terms.timeline||{},userId,request.accepted_at])).rows[0];
    const workspace=created||(await db.query("select * from network_plus_collaboration_workspace where request_id=$1",[requestId])).rows[0];
    if(created){
      await db.query("insert into network_plus_collaboration_event(workspace_id,actor_user_id,event_type,title,body) values($1,$2,'update','Optional collaboration workspace enabled','An accepted participant explicitly enabled a shared workspace.')",[workspace.id,userId]);
      await audit(db,requestId,userId,"request.workspace_enabled",request.status,request.status,requestIdHeader,{workspaceId:workspace.id});
      const others=(await db.query("select user_id from network_plus_request_participant where request_id=$1 and user_id<>$2 and consent_status='accepted'",[requestId,userId])).rows;
      for(const other of others)await notify(db,other.user_id,"network_plus.request.workspace_enabled",requestId,"An optional collaboration workspace was enabled for your accepted request.");
    }
    return workspace;
  });
}
export async function getNetworkPlusWorkspace(requestId,userId) {
  return withTransaction(async db=>{
    await assertEntry(db,userId);
    const ws=(await db.query("select id from network_plus_collaboration_workspace where request_id=$1",[requestId])).rows[0];
    if(!ws)fail(404,"Accepted collaboration workspace not found.","NOT_FOUND");
    await workspaceAccess(db,ws.id,userId);
    const milestones=(await db.query("select * from network_plus_collaboration_milestone where workspace_id=$1 order by due_at nulls last,created_at",[ws.id])).rows;
    const events=(await db.query("select * from network_plus_collaboration_event where workspace_id=$1 order by created_at desc",[ws.id])).rows;
    return {workspace:ws,milestones,events};
  });
}
export async function addNetworkPlusWorkspaceMilestone(requestId,userId,input,idempotencyKey) {
  if(typeof idempotencyKey!=="string"||!/^[A-Za-z0-9_-]{32,200}$/.test(idempotencyKey))fail(400,"A secure idempotency key is required.","IDEMPOTENCY_KEY_REQUIRED");
  return withTransaction(async db=>{
    await assertEntry(db,userId);
    const ws=(await db.query("select id from network_plus_collaboration_workspace where request_id=$1",[requestId])).rows[0];
    if(!ws)fail(404,"Accepted collaboration workspace not found.","NOT_FOUND");
    await workspaceAccess(db,ws.id,userId);
    const title=clean(input?.title,180,"Milestone title",2);
    const owner=input?.ownerUserId||userId;
    const active=(await db.query("select 1 from network_plus_request_participant where request_id=$1 and user_id=$2 and consent_status='accepted'",[requestId,owner])).rowCount>0;
    if(!active)fail(400,"Milestone owner must be an accepted participant.","INVALID_MILESTONE_OWNER");
    const description=String(input.description||"").slice(0,2000)||null, dueAt=input.dueAt||null, keyHash=hash(idempotencyKey), fingerprint=hash(JSON.stringify({title,description,owner,dueAt}));
    const prior=(await db.query("select * from network_plus_collaboration_milestone where workspace_id=$1 and created_by=$2 and idempotency_hash=$3",[ws.id,userId,keyHash])).rows[0];
    if(prior){if(prior.request_fingerprint!==fingerprint)fail(409,"This milestone key was used for different content.","IDEMPOTENCY_CONFLICT");return prior;}
    const created=(await db.query("insert into network_plus_collaboration_milestone(workspace_id,title,description,owner_user_id,due_at,created_by,idempotency_hash,request_fingerprint) values($1,$2,$3,$4,$5,$6,$7,$8) returning *",[ws.id,title,description,owner,dueAt,userId,keyHash,fingerprint])).rows[0];
    await db.query("insert into network_plus_collaboration_event(workspace_id,actor_user_id,event_type,title,body,metadata,idempotency_hash,request_fingerprint) values($1,$2,$3,$4,$5,$6,$7,$8)",[ws.id,userId,"milestone","Milestone created",title,{milestoneId:created.id},keyHash,fingerprint]);
    await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,$2,$3,$4,$5,$6,$7)",[userId,"collaboration.milestone_created","network_plus_collaboration_workspace",ws.id,requestId,"success",{milestoneId:created.id,title}]);
    const others=(await db.query("select user_id from network_plus_request_participant where request_id=$1 and user_id<>$2 and consent_status='accepted'",[requestId,userId])).rows;
    for(const other of others)await notify(db,other.user_id,"network_plus.collaboration.milestone",requestId,"A collaboration milestone was added.");
    return created;
  });
}
export async function updateNetworkPlusWorkspaceMilestone(requestId,milestoneId,userId,input,requestIdHeader) {
  return withTransaction(async db=>{
    await assertEntry(db,userId);
    const ws=(await db.query("select id from network_plus_collaboration_workspace where request_id=$1",[requestId])).rows[0];
    if(!ws)fail(404,"Accepted collaboration workspace not found.","NOT_FOUND");
    await workspaceAccess(db,ws.id,userId);
    const current=(await db.query("select * from network_plus_collaboration_milestone where id=$1 and workspace_id=$2 for update",[milestoneId,ws.id])).rows[0];
    if(!current)fail(404,"Milestone not found.","NOT_FOUND");
    const status=input?.status||current.status;
    if(!["not_started","in_progress","blocked","completed","cancelled"].includes(status))fail(400,"Unsupported milestone status.","VALIDATION_ERROR");
    const owner=input?.ownerUserId||current.owner_user_id;
    if(owner) {
      const valid=(await db.query("select 1 from network_plus_request_participant where request_id=$1 and user_id=$2 and consent_status='accepted'",[requestId,owner])).rowCount>0;
      if(!valid)fail(400,"Milestone owner must be an accepted participant.","INVALID_MILESTONE_OWNER");
    }
    const dueAt=input?.dueAt===undefined?current.due_at:input.dueAt, description=input?.description===undefined?current.description:String(input.description).slice(0,2000);
    if(current.status===status&&current.owner_user_id===owner&&String(current.due_at||"")===String(dueAt||"")&&current.description===description)return current;
    const updated=(await db.query("update network_plus_collaboration_milestone set status=$1,owner_user_id=$2,due_at=$3,description=$4,updated_at=now() where id=$5 returning *",[status,owner,dueAt,description,milestoneId])).rows[0];
    await db.query("insert into network_plus_collaboration_event(workspace_id,actor_user_id,event_type,title,body,metadata) values($1,$2,'milestone',$3,$4,$5)",[ws.id,userId,"Milestone updated",updated.title+" is now "+status.replaceAll("_"," ")+".",{milestoneId,status}]);
    await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'collaboration.milestone_updated','network_plus_collaboration_workspace',$2,$3,'success',$4)",[userId,ws.id,requestIdHeader,{milestoneId,status}]);
    const others=(await db.query("select user_id from network_plus_request_participant where request_id=$1 and user_id<>$2 and consent_status=$3",[requestId,userId,"accepted"])).rows;
    for(const other of others)await notify(db,other.user_id,"network_plus.collaboration.milestone_updated",requestId,"A collaboration milestone was updated: "+updated.title);
    return updated;
  });
}
export async function addNetworkPlusWorkspaceEvent(requestId,userId,input,requestIdHeader,idempotencyKey) {
  const eventType=input?.eventType;
  if(!["update","blocker","decision","outcome"].includes(eventType))fail(400,"Unsupported collaboration update type.","VALIDATION_ERROR");
  if(typeof idempotencyKey!=="string"||!/^[A-Za-z0-9_-]{32,200}$/.test(idempotencyKey))fail(400,"A secure idempotency key is required.","IDEMPOTENCY_KEY_REQUIRED");
  return withTransaction(async db=>{
    await assertEntry(db,userId);
    const ws=(await db.query("select id from network_plus_collaboration_workspace where request_id=$1",[requestId])).rows[0];
    if(!ws)fail(404,"Accepted collaboration workspace not found.","NOT_FOUND");
    await workspaceAccess(db,ws.id,userId);
    const title=clean(input.title,180,"Title",2), body=clean(input.body,4000,"Update",2), metadata=object(input.metadata,"Metadata"); assertNoContactFields(metadata);
    const keyHash=hash(idempotencyKey), fingerprint=hash(JSON.stringify({eventType,title,body,metadata}));
    const prior=(await db.query("select * from network_plus_collaboration_event where workspace_id=$1 and actor_user_id=$2 and idempotency_hash=$3",[ws.id,userId,keyHash])).rows[0];
    if(prior){if(prior.request_fingerprint!==fingerprint)fail(409,"This update key was used for different content.","IDEMPOTENCY_CONFLICT");return prior;}
    const row=(await db.query("insert into network_plus_collaboration_event(workspace_id,actor_user_id,event_type,title,body,metadata,idempotency_hash,request_fingerprint) values($1,$2,$3,$4,$5,$6,$7,$8) returning *",[ws.id,userId,eventType,title,body,metadata,keyHash,fingerprint])).rows[0];
    await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,$2,'network_plus_collaboration_workspace',$3,$4,'success',$5)",[userId,`collaboration.${eventType}`,ws.id,requestIdHeader,{requestId}]);
    const others=(await db.query("select user_id from network_plus_request_participant where request_id=$1 and user_id<>$2 and consent_status=$3",[requestId,userId,"accepted"])).rows;
    for(const other of others)await notify(db,other.user_id,"network_plus.collaboration."+eventType,requestId,"A collaboration workspace update was recorded: "+title);
    return row;
  });
}
export const requestLifecycle = Object.freeze({intents:[...INTENTS],workspaceEligibleIntents:[...WORKSPACE_ELIGIBLE_INTENTS],statuses:["draft","submitted","under_review","clarification_requested","accepted","declined","withdrawn","in_progress","completed","disputed","closed"]});
