import { createHash } from "node:crypto";
import { withTransaction } from "../platform/db.js";
import { createInAppNotification } from "../platform/notifications.js";
import { resolveNetworkPlusAccess } from "../platform/network-plus-access.js";
import { policyError } from "../platform/identity-policy.js";

const INTENTS = new Set(["service_request","supplier_inquiry","referral","expertise_request","partnership_proposal","collaboration_request"]);
const SUPPORT_ROLES = new Set(["network_plus_support","system_admin"]);
const hash = value => createHash("sha256").update(String(value)).digest("hex");
function fail(status,message,code="REQUEST_RULE"){ throw policyError(status,message,code); }
function clean(value,max,label,min=1) { const s=String(value??"").trim(); if(s.length<min||s.length>max)fail(400,`${label} must be between ${min} and ${max} characters.`,"VALIDATION_ERROR"); return s; }
function object(value,label) { if(value===undefined||value===null)return {}; if(typeof value!=="object"||Array.isArray(value))fail(400,`${label} must be an object.`,"VALIDATION_ERROR"); return value; }
function assertNoContactFields(value) { if(Array.isArray(value)){for(const item of value)assertNoContactFields(item);return;} if(value&&typeof value==="object")for(const [key,child] of Object.entries(value)){ if(/email|phone|mobile|whatsapp|telegram|contact/i.test(key))fail(400,"Do not include private contact details in request content. Use the separate consent-controlled contact release workflow.","CONTACT_DETAILS_FORBIDDEN"); assertNoContactFields(child); } }
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
    submitted:["under_review","clarification_requested","accepted","declined","withdrawn"],
    under_review:["clarification_requested","accepted","declined","withdrawn"],
    clarification_requested:["submitted","withdrawn","declined"],
    accepted:["in_progress","disputed","closed","completed"],
    in_progress:["completed","disputed","closed"],
    disputed:["in_progress","completed","closed"],
    declined:[],withdrawn:[],completed:["disputed","closed"],closed:[]
  };
  if(!map[from]?.includes(to))return false;
  if(to==="withdrawn")return actorRole==="requester";
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
  const details=object(input.details,"Request details"); assertNoContactFields(details); const terms=safeTerms(intent,input.terms);
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
      const listing=(await db.query("select s.id,s.business_id,s.audience from network_plus_service_listing s join network_plus_business b on b.id=s.business_id where s.id=$1 and s.status='published' and b.verification_status='verified' and b.moderation_status='approved' and b.publication_status='published'",[input.serviceListingId])).rows[0];
      if(!listing)fail(404,"Published verified service listing not found.","SERVICE_NOT_FOUND");
      if((listing.audience==="members"&&!entry.access.member)||(listing.audience==="organizations"&&!entry.access.organization))fail(403,"This service listing is not available to your Network-Plus audience.","SERVICE_AUDIENCE_FORBIDDEN");
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
    if(to==="disputed"&&!input.reason)fail(400,"A dispute reason is required.","REASON_REQUIRED");
    if(to==="completed"&&(!Array.isArray(input.completionEvidence)||!input.completionEvidence.length||input.completionEvidence.some(value=>typeof value!=="string"||value.trim().length<5)))fail(400,"Provide completion evidence or a documented not-applicable reason.","COMPLETION_EVIDENCE_REQUIRED");
    if(to==="in_progress"&&row.status!=="accepted")fail(409,"Only an accepted engagement can start.","ACCEPTANCE_REQUIRED");
    const updated=(await db.query(`update network_plus_request set status=$1,submitted_at=case when $1='submitted' then coalesce(submitted_at,now()) else submitted_at end,
      accepted_at=case when $1='accepted' then now() else accepted_at end,declined_at=case when $1='declined' then now() else declined_at end,
      withdrawn_at=case when $1='withdrawn' then now() else withdrawn_at end,completed_at=case when $1='completed' then now() else completed_at end,
      disputed_at=case when $1='disputed' then now() else disputed_at end,closed_at=case when $1='closed' then now() else closed_at end,
      version=version+1,updated_at=now() where id=$2 returning *`,[to,requestId])).rows[0];
    await audit(db,requestId,userId,`request.${to}`,row.status,to,requestIdHeader,{reason:input.reason||null,version:updated.version},idempotencyHash,requestFingerprint);
    if(["disputed","completed","closed"].includes(to)) { const nextWorkspaceStatus=to==="disputed"?"disputed":to; await db.query("update network_plus_collaboration_workspace set status=$1,completed_at=case when $1=$3 then coalesce(completed_at,now()) else completed_at end,closed_at=case when $1=$4 then coalesce(closed_at,now()) else closed_at end,updated_at=now() where request_id=$2",[nextWorkspaceStatus,requestId,"completed","closed"]); }
    if(to==="accepted") {
      await db.query("update network_plus_request_participant set consent_status='accepted',consented_at=now() where request_id=$1 and user_id=$2 and participant_role='recipient_representative'",[requestId,userId]);
      if(!["service_request","supplier_inquiry","expertise_request","partnership_proposal","collaboration_request"].includes(row.intent)) {
        // Accepted referral/expertise requests are recorded as accepted without a project workspace.
      } else {
        const t=row.terms||{};
        const purpose=t.purpose||row.summary, scope=t.scope||row.summary;
        const ws=(await db.query(`insert into network_plus_collaboration_workspace(request_id,purpose,scope,timeline,created_by,accepted_at)
          values($1,$2,$3,$4,$5,now()) on conflict(request_id) do nothing returning id`,[requestId,purpose,scope,t.timeline||{},userId])).rows[0];
        if(ws) await db.query("insert into network_plus_collaboration_event(workspace_id,actor_user_id,event_type,title,body) values($1,$2,'update','Engagement accepted','The recipient explicitly accepted this request. The collaboration workspace is now active.')",[ws.id,userId]);
      }
    }
    const other=(await db.query("select user_id from network_plus_request_participant where request_id=$1 and user_id<>$2 and consent_status<>'revoked'",[requestId,userId])).rows;
    for(const x of other) await notify(db,x.user_id,`network_plus.request.${to}`,requestId,`Your Network-Plus request is now ${to.replaceAll("_"," ")}.`);
    return updated;
  });
}
export async function listNetworkPlusRequests(userId,{status,intent,limit=30,offset=0,supportReason,supportTicket,supportRequestId}={}) {
  return withTransaction(async db=>{
    let support=false;
    if(supportReason||supportTicket){if(!supportRequestId)fail(400,"Support access must be scoped to one request record.","SUPPORT_SCOPE_REQUIRED");await assertSupport(db,userId,supportRequestId,supportReason,supportTicket);support=true;} else await assertEntry(db,userId);
    const rows=(await db.query(`select r.id,r.intent,r.status,r.subject,r.summary,r.requester_user_id,r.recipient_user_id,r.recipient_organization_id,r.business_id,r.service_listing_id,r.version,r.created_at,r.updated_at
      from network_plus_request r where (${support} or exists(select 1 from network_plus_request_participant p where p.request_id=r.id and p.user_id=$1 and p.consent_status<>'revoked' and (p.participant_role<>'additional_participant' or p.consent_status='accepted')))
      and ($2::text is null or r.status=$2) and ($3::text is null or r.intent=$3) and ($4::uuid is null or r.id=$4::uuid)
      order by r.updated_at desc limit $5 offset $6`,[userId,status||null,intent||null,supportRequestId||null,Math.min(100,Math.max(1,Number(limit)||30)),Math.max(0,Number(offset)||0)])).rows;
    if(support) for(const row of rows) await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,outcome,metadata) values($1,$2,$3,$4,$5,$6)",[userId,"network_plus.request.support_list","network_plus_request",row.id,"success",{reason:supportReason,ticket:supportTicket}]);
    return rows;
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
export async function getNetworkPlusRequest(requestId,userId,{supportReason,supportTicket}={}) {
  return withTransaction(async db=>{
    const row=(await db.query("select * from network_plus_request where id=$1",[requestId])).rows[0];
    if(!row)fail(404,"Request not found.","NOT_FOUND");
    const isParticipant=(await db.query("select 1 from network_plus_request_participant where request_id=$1 and user_id=$2 and consent_status<>'revoked' and (participant_role<>'additional_participant' or consent_status='accepted')",[requestId,userId])).rowCount>0;
    if(isParticipant) await assertEntry(db,userId); else { if(!await hasSupportRole(db,userId))fail(404,"Request not found.","NOT_FOUND"); await assertSupport(db,userId,requestId,supportReason,supportTicket); await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,outcome,metadata) values($1,$2,$3,$4,$5,$6)",[userId,"network_plus.request.support_read","network_plus_request",requestId,"success",{reason:supportReason,ticket:supportTicket}]); }
    const participants=(await db.query("select user_id,participant_role,consent_status,consented_at from network_plus_request_participant where request_id=$1 and consent_status<>'revoked'",[requestId])).rows;
    const events=(await db.query("select event_code,from_status,to_status,reason,metadata,created_at from network_plus_request_event where request_id=$1 order by created_at",[requestId])).rows;
    const workspace=(await db.query("select * from network_plus_collaboration_workspace where request_id=$1",[requestId])).rows[0]||null;
    const isRecipientRepresentative=participants.some(p=>p.user_id===userId&&p.participant_role==="recipient_representative"&&p.consent_status!=="revoked");
    const canReview=isRecipientRepresentative&&(!row.business_id||await hasBusinessAuthority(db,row.business_id,userId,"business.respond_requests")||await hasBusinessAuthority(db,row.business_id,userId,"business.accept_terms"));
    const canAccept=isRecipientRepresentative&&(!row.business_id||await hasBusinessAuthority(db,row.business_id,userId,"business.accept_terms"));
    return { ...row, participants, events, workspace, isRequester:row.requester_user_id===userId, isRecipientRepresentative, canReview, canAccept };
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
export const requestLifecycle = Object.freeze({intents:[...INTENTS],statuses:["draft","submitted","under_review","clarification_requested","accepted","declined","withdrawn","in_progress","completed","disputed","closed"]});
