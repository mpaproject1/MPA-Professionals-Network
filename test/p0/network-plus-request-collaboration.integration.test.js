import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import * as membership from "../../src/membership/service.js";
import * as requests from "../../src/network-plus/request-collaboration.js";
import { closePool, getPool } from "../../src/platform/db.js";
import * as talent from "../../src/talent/service.js";
import * as verification from "../../src/verification/service.js";


function accountInput(label) {
  const suffix=randomUUID(),digits=suffix.replace(/\D/g,"").slice(0,8).padEnd(8,"7");
  return {email:`np-request-${label}-${suffix}@example.test`,password:"NetworkPlusRequestPassword!2026",firstName:"Network",lastName:`Request${label}`,phone:`09${digits}`,accountType:"professional"};
}
async function register(label){return membership.register(accountInput(label),`np-request-register-${label}-${randomUUID()}`);}
async function setMembership(userId,endDate="current_date+365"){
 const db=getPool(),product=(await db.query("select id from membership_product where product_code='BASIC'")).rows[0];
 assert.ok(product);
 await db.query(`insert into membership_record(user_id,membership_product_id,membership_number,status,start_date,end_date,source) values($1,$2,$3,'active',current_date,${endDate},'online')`,[userId,""+product.id,"MPA-NPR-"+randomUUID().slice(0,12).toUpperCase()]);
}
async function verifiedRecipient(label,reviewerId){
 const db=getPool(),account=await register(label);await setMembership(account.user.id);
 await talent.updateProfessionalProfile(account.user.id,{professionalTitle:"Verified Network-Plus professional",visibility:"members",directorySummary:"Synthetic verified professional for request lifecycle tests."},`np-profile-${randomUUID()}`);
 await talent.updateVisibility(account.user.id,{directoryVisible:true,showIdentityBadge:true,showProfessionalBadge:true,showExperienceBadge:false,showLocation:false,showExperience:false,showContact:false},`np-visibility-${randomUUID()}`);
 const program=(await db.query("select program_code from verification_program where active=true order by program_code limit 1")).rows[0];
 const verificationCase=await verification.createCase(account.user.id,program.program_code,account.user.id,`np-case-${randomUUID()}`);
 if(verificationCase.status==="consent_pending")await verification.giveConsent(verificationCase.id,account.user.id,"network-plus-request-test-v1",`np-consent-${randomUUID()}`);
 await db.query("update verification_case set assigned_reviewer_id=$1 where id=$2",[reviewerId,verificationCase.id]);
 await verification.transitionCase(verificationCase.id,"review",reviewerId,`np-review-${randomUUID()}`);
 await db.query("insert into verification_claim_type(claim_code,name,description,active) values('SERVICE_CAPABILITY','Service capability','Request lifecycle test capability.',true) on conflict(claim_code) do update set active=true");
 const claim=await verification.addClaim(verificationCase.id,"SERVICE_CAPABILITY",{capability:"Verified service capability"},account.user.id,`np-claim-${randomUUID()}`);
 await verification.addEvidence(verificationCase.id,{claimId:claim.id,evidenceType:"supporting_document",sourceType:"member",sourceName:"Synthetic evidence",sourceReference:`np-ref-${randomUUID()}`,notes:"Synthetic test evidence."},account.user.id,`np-evidence-${randomUUID()}`);
 await verification.setClaimStatus(claim.id,"verified",reviewerId,`np-verify-${randomUUID()}`,verificationCase.id);
 return account;
}
test("Network-Plus requests require recipient acceptance, create participant-only workspaces, notify participants and replay safely",async t=>{
 if(!process.env.DATABASE_URL){t.skip("requires the disposable PostgreSQL database configured by PR Quality");return;}
 const db=getPool(),suffix=randomUUID().replace(/-/g,"");
 const reviewer=await register("reviewer-"+suffix);
 const reviewerRole=(await db.query("select id from app_role where role_code='verification_reviewer'")).rows[0];
 assert.ok(reviewerRole);
 await db.query("insert into app_user_role(user_id,role_id) values($1,$2) on conflict do nothing",[reviewer.user.id,reviewerRole.id]);
 const requester=await register("requester-"+suffix);await setMembership(requester.user.id);
 const recipient=await verifiedRecipient("recipient-"+suffix,reviewer.user.id);
 const outsider=await register("outsider-"+suffix);await setMembership(outsider.user.id);
 const idempotencyKey=randomUUID()+randomUUID(),requestRef=`np-request-${randomUUID()}`;
 await assert.rejects(()=>requests.createNetworkPlusRequest(requester.user.id,{intent:"interest",recipientUserId:recipient.user.id,subject:"Contact leak attempt",summary:"Please call +251911234567 to discuss this opportunity.",details:{},terms:{}},requestRef,randomUUID()+randomUUID()),e=>e.code==="CONTACT_DETAILS_FORBIDDEN");
 const draft=await requests.createNetworkPlusRequest(requester.user.id,{
   intent:"service_request",recipientUserId:recipient.user.id,subject:"Accessibility review",summary:"Please review our public website accessibility.",
   details:{context:"Public website"},terms:{scope:"Review public pages against WCAG AA.",deliverables:["Prioritized audit report"],pricing:{proposal:"Quotation requested"},schedule:{requested:"To be agreed"}}
 },requestRef,idempotencyKey);
 assert.equal(draft.status,"draft");
 await assert.rejects(()=>requests.getNetworkPlusWorkspace(draft.id,requester.user.id),e=>e.code==="NOT_FOUND");
 const submitted=await requests.submitNetworkPlusRequest(draft.id,requester.user.id,requestRef,randomUUID()+randomUUID());
 assert.equal(submitted.status,"submitted");
 const recipientInbox=await requests.listNetworkPlusRequests(recipient.user.id);
 assert.ok(recipientInbox.some(row=>row.id===draft.id));
 const decisionKey=randomUUID()+randomUUID();
 const accepted=await requests.transitionNetworkPlusRequest(draft.id,recipient.user.id,{status:"accepted"},requestRef,decisionKey);
 assert.equal(accepted.status,"accepted");
 const replay=await requests.transitionNetworkPlusRequest(draft.id,recipient.user.id,{status:"accepted"},requestRef,decisionKey);
 assert.equal(replay.status,"accepted");
 await assert.rejects(()=>requests.transitionNetworkPlusRequest(draft.id,recipient.user.id,{status:"declined"},requestRef,decisionKey),e=>e.code==="IDEMPOTENCY_CONFLICT");
 await assert.rejects(()=>requests.getNetworkPlusWorkspace(draft.id,requester.user.id),e=>e.code==="NOT_FOUND");
 const enabledWorkspace=await requests.createNetworkPlusWorkspace(draft.id,requester.user.id,requestRef);
 const requesterWorkspace=await requests.getNetworkPlusWorkspace(draft.id,requester.user.id);
 assert.equal(enabledWorkspace.id,requesterWorkspace.workspace.id);
 const recipientWorkspace=await requests.getNetworkPlusWorkspace(draft.id,recipient.user.id);
 assert.equal(requesterWorkspace.workspace.id,recipientWorkspace.workspace.id);
 const milestone=await requests.addNetworkPlusWorkspaceMilestone(draft.id,requester.user.id,{title:"Complete accessibility audit"},randomUUID()+randomUUID());
 assert.equal(milestone.status,"not_started");
 await requests.updateNetworkPlusWorkspaceMilestone(draft.id,milestone.id,recipient.user.id,{status:"in_progress"},requestRef);
 await requests.addNetworkPlusWorkspaceEvent(draft.id,recipient.user.id,{eventType:"blocker",title:"Content dependency",body:"Waiting for approved content samples."},requestRef,randomUUID()+randomUUID());
 const refreshed=await requests.getNetworkPlusWorkspace(draft.id,requester.user.id);
 assert.equal(refreshed.milestones[0].status,"in_progress");
 assert.ok(refreshed.events.some(event=>event.event_type==="blocker"));
 const invitee=await register("invitee-"+suffix);await setMembership(invitee.user.id);
 await requests.addNetworkPlusRequestParticipant(draft.id,requester.user.id,{userId:invitee.user.id},requestRef);
 await assert.rejects(()=>requests.getNetworkPlusWorkspace(draft.id,invitee.user.id),e=>e.code==="NOT_FOUND");
 await assert.rejects(()=>requests.getNetworkPlusRequest(draft.id,invitee.user.id),e=>e.code==="NOT_FOUND");
 const invitationNotice=await db.query("select 1 from notification_event where user_id=$1 and event_code=$2 and resource_id=$3",[invitee.user.id,"network_plus.request.participant_invited",draft.id]);
 assert.equal(invitationNotice.rowCount,1);
 await requests.respondNetworkPlusParticipant(draft.id,invitee.user.id,"accept",requestRef);
 assert.equal((await requests.getNetworkPlusWorkspace(draft.id,invitee.user.id)).workspace.id,requesterWorkspace.workspace.id);
 const collaborationNotices=await db.query("select event_code from notification_event where resource_type=$1 and resource_id=$2",[ "network_plus_request",draft.id]);
 assert.ok(collaborationNotices.rows.some(row=>row.event_code==="network_plus.collaboration.milestone"));
 assert.ok(collaborationNotices.rows.some(row=>row.event_code==="network_plus.collaboration.blocker"));

 assert.deepEqual(await requests.listNetworkPlusRequests(outsider.user.id),[]);
 await assert.rejects(()=>requests.getNetworkPlusRequest(draft.id,outsider.user.id),e=>e.code==="NOT_FOUND");
 const notices=await db.query("select user_id,event_code from notification_event where resource_type='network_plus_request' and resource_id=$1",[draft.id]);
 assert.ok(notices.rows.some(row=>row.user_id===recipient.user.id&&row.event_code==="network_plus.request.submitted"));
 assert.ok(notices.rows.some(row=>row.user_id===requester.user.id&&row.event_code==="network_plus.request.accepted"));
  const businessOwner=await register("business-owner-"+suffix),requestReviewer=await register("business-reviewer-"+suffix),termsApprover=await register("terms-approver-"+suffix);
  await setMembership(businessOwner.user.id);await setMembership(requestReviewer.user.id);await setMembership(termsApprover.user.id);
  const business=(await db.query("insert into network_plus_business(business_kind,display_name,description,verification_status,moderation_status,publication_status,verified_at,verified_by,created_by) values('individual',$1,$2,'verified','approved','published',now(),$3,$3) returning id",["Verified Test Business "+suffix.slice(0,6),"A synthetic verified business used only by the disposable request lifecycle integration test.",businessOwner.user.id])).rows[0];
  await db.query("insert into network_plus_business_ownership(business_id,owner_type,owner_user_id,owner_role,consent_status,status,consented_at,created_by) values($1,'member',$2,'primary_owner','accepted','active',now(),$2)",[business.id,businessOwner.user.id]);
  await db.query("insert into network_plus_business_access(business_id,user_id,capability_code,granted_by) values($1,$2,'business.respond_requests',$3),($1,$4,'business.accept_terms',$3)",[business.id,requestReviewer.user.id,businessOwner.user.id,termsApprover.user.id]);
  const businessRequest=await requests.createNetworkPlusRequest(requester.user.id,{intent:"partnership_proposal",businessId:business.id,subject:"Verified business partnership",summary:"Propose a defined partnership with measurable community outputs.",details:{},terms:{purpose:"Deliver a community technology pilot.",scope:"Design and deliver a three-month pilot.",contributions:["Technical expertise"],responsibilities:["Coordinate implementation"],outputs:["Pilot and outcomes report"],timeline:{proposed:"Three months"},authorizedRepresentatives:["Business owner representative","Requester representative"]}},requestRef,randomUUID()+randomUUID());
  assert.equal(businessRequest.recipient_user_id,businessOwner.user.id);
  const businessParticipants=await db.query("select user_id from network_plus_request_participant where request_id=$1",[businessRequest.id]);
  assert.ok(businessParticipants.rows.some(row=>row.user_id===requestReviewer.user.id));
  assert.ok(businessParticipants.rows.some(row=>row.user_id===termsApprover.user.id));
  await requests.submitNetworkPlusRequest(businessRequest.id,requester.user.id,requestRef,randomUUID()+randomUUID());
  await requests.transitionNetworkPlusRequest(businessRequest.id,requestReviewer.user.id,{status:"under_review"},requestRef,randomUUID()+randomUUID());
  await assert.rejects(()=>requests.transitionNetworkPlusRequest(businessRequest.id,requestReviewer.user.id,{status:"accepted"},requestRef,randomUUID()+randomUUID()),e=>e.code==="RECIPIENT_AUTHORITY_REQUIRED");
  const businessAccepted=await requests.transitionNetworkPlusRequest(businessRequest.id,termsApprover.user.id,{status:"accepted"},requestRef,randomUUID()+randomUUID());
  assert.equal(businessAccepted.status,"accepted");
  await assert.rejects(()=>requests.getNetworkPlusWorkspace(businessRequest.id,requester.user.id),e=>e.code==="NOT_FOUND");
  assert.ok((await requests.createNetworkPlusWorkspace(businessRequest.id,requester.user.id,requestRef)).id);
  const opportunityRequest=await requests.createNetworkPlusRequest(requester.user.id,{
    intent:"business_opportunity",recipientUserId:recipient.user.id,subject:"Seed support programme",summary:"Express interest in the regional seed support programme.",
    details:{},terms:{opportunityType:"Seed grant",eligibility:"Registered small businesses in the target region.",selectionProcess:"Eligibility screening followed by an independent review.",deadline:"2027-01-15",value:"Grant amount determined by the sponsor."}
  },requestRef,randomUUID()+randomUUID());
  await requests.submitNetworkPlusRequest(opportunityRequest.id,requester.user.id,requestRef,randomUUID()+randomUUID());
  await requests.transitionNetworkPlusRequest(opportunityRequest.id,recipient.user.id,{status:"accepted"},requestRef,randomUUID()+randomUUID());
  await assert.rejects(()=>requests.createNetworkPlusWorkspace(opportunityRequest.id,requester.user.id,requestRef),e=>e.code==="WORKSPACE_NOT_APPLICABLE");
  process.env.NETWORK_PLUS_CONTACT_ENCRYPTION_KEY ||= "phase2-test-contact-encryption-key-32-bytes-minimum";
  const questionRequest=await requests.createNetworkPlusRequest(requester.user.id,{intent:"question",recipientUserId:recipient.user.id,subject:"Question about distribution",summary:"Can your business support regional distribution for a new product line?",details:{topic:"Regional distribution"},terms:{}},requestRef,randomUUID()+randomUUID());
  await requests.submitNetworkPlusRequest(questionRequest.id,requester.user.id,requestRef,randomUUID()+randomUUID());
  const questionResponse=await requests.answerNetworkPlusQuestion(questionRequest.id,recipient.user.id,{answer:"Yes. We support regional distribution through approved local partners and can discuss coverage after a connection is accepted."},requestRef);
  assert.ok(questionResponse.recipient_response_at);
  assert.equal((await requests.getNetworkPlusRequest(questionRequest.id,requester.user.id)).recipient_response,questionResponse.recipient_response);
  await assert.rejects(()=>requests.answerNetworkPlusQuestion(questionRequest.id,recipient.user.id,{answer:"A second answer should not overwrite the first response."},requestRef),e=>e.code==="QUESTION_ALREADY_ANSWERED");
  const handoffRequest=await requests.createNetworkPlusRequest(requester.user.id,{intent:"meeting_request",recipientUserId:recipient.user.id,subject:"Introductory business meeting",summary:"Request a first meeting to discuss the opportunity and possible next steps.",details:{topic:"Professional introduction"},terms:{}},requestRef,randomUUID()+randomUUID());
  await requests.submitNetworkPlusRequest(handoffRequest.id,requester.user.id,requestRef,randomUUID()+randomUUID());
  const clarification=await requests.askNetworkPlusClarification(handoffRequest.id,recipient.user.id,{promptCode:"scope",question:"Which specific business area should the first conversation focus on?"},requestRef);
  assert.equal(clarification.status,"open");
  const answered=await requests.answerNetworkPlusClarification(handoffRequest.id,clarification.id,requester.user.id,{answer:"The first conversation should focus on regional distribution and supplier introductions."},requestRef);
  assert.equal(answered.status,"answered");
  assert.equal((await requests.getNetworkPlusRequest(handoffRequest.id,requester.user.id)).status,"submitted");
  await requests.transitionNetworkPlusRequest(handoffRequest.id,recipient.user.id,{status:"accepted"},requestRef,randomUUID()+randomUUID());
  await assert.rejects(()=>requests.createNetworkPlusWorkspace(handoffRequest.id,requester.user.id,requestRef),e=>e.code==="WORKSPACE_NOT_APPLICABLE");
  const requesterEmail="requester-contact-"+suffix+"@example.test",recipientEmail="recipient-contact-"+suffix+"@example.test";
  let contact=await requests.updateNetworkPlusContactConsent(handoffRequest.id,requester.user.id,{peerUserId:recipient.user.id,field:"email",decision:"accept",value:requesterEmail},requestRef);
  assert.equal(contact.fields[0].released,false);
  assert.equal(contact.fields[0].sharedWithYou,null);
  await requests.updateNetworkPlusContactConsent(handoffRequest.id,recipient.user.id,{field:"email",decision:"accept",value:recipientEmail},requestRef);
  contact=await requests.getNetworkPlusContactHandoff(handoffRequest.id,requester.user.id,recipient.user.id);
  assert.equal(contact.fields[0].released,true);
  assert.equal(contact.fields[0].sharedWithYou,recipientEmail);
  const recipientContact=await requests.getNetworkPlusContactHandoff(handoffRequest.id,recipient.user.id);
  assert.equal(recipientContact.fields[0].sharedWithYou,requesterEmail);
  await requests.updateNetworkPlusContactConsent(handoffRequest.id,recipient.user.id,{field:"email",decision:"revoke"},requestRef);
  contact=await requests.getNetworkPlusContactHandoff(handoffRequest.id,requester.user.id,recipient.user.id);
  assert.equal(contact.fields[0].released,false);
  assert.equal(contact.fields[0].sharedWithYou,null);
  const meetingTime=new Date(Date.now()+48*60*60*1000).toISOString();
  const meeting=await requests.createNetworkPlusMeetingProposal(handoffRequest.id,requester.user.id,{peerUserId:recipient.user.id,placeType:"online",placeDetails:"Video call to be arranged outside the platform.",startsAt:meetingTime,timezone:"Africa/Addis_Ababa",durationMinutes:30},requestRef,randomUUID()+randomUUID());
  assert.equal(meeting.status,"proposed");
  const counterTime=new Date(Date.now()+72*60*60*1000).toISOString();
  const countered=await requests.respondNetworkPlusMeeting(handoffRequest.id,meeting.id,recipient.user.id,{decision:"counter",placeType:"coffee",placeDetails:"A public coffee shop in the agreed service area.",startsAt:counterTime,timezone:"Africa/Addis_Ababa",durationMinutes:45},requestRef);
  assert.equal(countered.status,"countered");
  const confirmed=await requests.respondNetworkPlusMeeting(handoffRequest.id,meeting.id,requester.user.id,{decision:"accept"},requestRef);
  assert.equal(confirmed.status,"confirmed");
  assert.equal(confirmed.confirmed_place_type,"coffee");
  await assert.rejects(()=>requests.createNetworkPlusMeetingProposal(handoffRequest.id,requester.user.id,{peerUserId:recipient.user.id,placeType:"online",startsAt:new Date(Date.now()+96*60*60*1000).toISOString(),timezone:"Africa/Addis_Ababa",durationMinutes:30},requestRef,randomUUID()+randomUUID()),e=>e.code==="MEETING_ALREADY_CONFIRMED");
  const handoffDetail=await requests.getNetworkPlusRequest(handoffRequest.id,requester.user.id);
  assert.equal(handoffDetail.clarifications[0].status,"answered");
  assert.equal(handoffDetail.meetings[0].status,"confirmed");
  assert.equal(handoffDetail.canHandoff,true);
  const handoffInvitee=await register("handoff-invitee-"+suffix);await setMembership(handoffInvitee.user.id);
  await requests.addNetworkPlusRequestParticipant(handoffRequest.id,requester.user.id,{userId:handoffInvitee.user.id},requestRef);
  await requests.respondNetworkPlusParticipant(handoffRequest.id,handoffInvitee.user.id,"accept",requestRef);
  const inviteeDetail=await requests.getNetworkPlusRequest(handoffRequest.id,handoffInvitee.user.id);
  assert.deepEqual(inviteeDetail.clarifications,[]);
  assert.deepEqual(inviteeDetail.meetings,[]);
  assert.equal(inviteeDetail.canHandoff,false);
  assert.ok(!inviteeDetail.events.some(event=>/request\.(clarification|meeting|contact_consent)_/.test(event.event_code)));
  await assert.rejects(()=>requests.getNetworkPlusContactHandoff(handoffRequest.id,handoffInvitee.user.id),e=>e.code==="PARTICIPANT_FORBIDDEN");

 await db.query("delete from app_user_role where user_id=$1 and role_id=$2",[reviewer.user.id,reviewerRole.id]);
  const support=await register("support-"+suffix),admin=await register("support-admin-"+suffix);
  const supportRole=(await db.query("select id from app_role where role_code=$1",["network_plus_support"])).rows[0];
  const adminRole=(await db.query("select id from app_role where role_code=$1",["system_admin"])).rows[0];
  assert.ok(supportRole&&adminRole);
  await db.query("insert into app_user_role(user_id,role_id) values($1,$2) on conflict do nothing",[support.user.id,supportRole.id]);
  await db.query("insert into app_user_role(user_id,role_id) values($1,$2) on conflict do nothing",[admin.user.id,adminRole.id]);
  const supportTicket="SUP-CASE-"+suffix.slice(0,12);
  const supportReason="Investigate a participant-reported access issue.";
  const supportGrant=await requests.grantNetworkPlusSupportAccess(draft.id,admin.user.id,{supportUserId:support.user.id,supportCaseReference:supportTicket,reason:supportReason,expiresAt:new Date(Date.now()+3600000).toISOString()},requestRef);
  const supportDetail=await requests.getNetworkPlusRequest(draft.id,support.user.id,{supportReason,supportTicket});
  assert.equal(supportDetail.id,draft.id);
  await requests.revokeNetworkPlusSupportAccess(draft.id,supportGrant.id,admin.user.id,requestRef);
  await assert.rejects(()=>requests.getNetworkPlusRequest(draft.id,support.user.id,{supportReason,supportTicket}),e=>e.code==="SUPPORT_GRANT_REQUIRED");

});
