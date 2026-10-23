import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import * as membership from "../../src/membership/service.js";
import * as organizationJobs from "../../src/organization-jobs/service.js";
import { closePool, getPool } from "../../src/platform/db.js";
import * as marketplace from "../../src/services-mentorship/demand.js";
import * as organizationOffers from "../../src/services-mentorship/organization-offers.js";
import * as journeys from "../../src/services-mentorship/service.js";
import * as talent from "../../src/talent/service.js";
import * as verification from "../../src/verification/service.js";

function identity(suffix){
 const digits=suffix.replace(/[^0-9]/g,"").slice(0,8).padEnd(8,"7");
 return {email:`journey-${suffix}@example.test`,password:"JourneyGate2Password!2026",firstName:"Journey",lastName:`Gate${suffix.slice(0,8)}`,phone:`06${digits}`};
}
async function account(suffix=randomUUID()){
 const created=await membership.register(identity(suffix),`gate2-journey-${suffix}`);
 return created.user.id;
}
async function activeMember(userId){
 const db=getPool(),product=(await db.query("select id from membership_product where product_code='BASIC'")).rows[0];
 assert.ok(product,"BASIC membership product must exist");
 await db.query("insert into membership_record(user_id,membership_product_id,membership_number,status,start_date,end_date,source) values($1,$2,$3,'active',current_date,current_date+365,'online')",[userId,product.id,`MPA-G2-${randomUUID().slice(0,8).toUpperCase()}`]);
 const role=(await db.query("select id from app_role where role_code='member'")).rows[0];
 if(role) await db.query("insert into app_user_role(user_id,role_id) values($1,$2) on conflict do nothing",[userId,role.id]);
}
async function financeStaff(){
 const db=getPool(),userId=await account();
 const role=(await db.query("select id from app_role where role_code='finance_officer'")).rows[0];
 assert.ok(role,"finance_officer role must exist");
 await db.query("insert into app_user_role(user_id,role_id) values($1,$2) on conflict do nothing",[userId,role.id]);
 return userId;
}
async function supportStaff(){
 const db=getPool(),userId=await account();
 const role=(await db.query("select id from app_role where role_code='supporting_staff'")).rows[0];
 assert.ok(role,"supporting_staff role must exist");
 await db.query("insert into app_user_role(user_id,role_id) values($1,$2) on conflict do nothing",[userId,role.id]);
 return userId;
}
async function verifiedProfessionalClaim(userId){
 const db=getPool(),suffix=randomUUID().replaceAll("-","").slice(0,10);
 const program=(await db.query("insert into verification_program(program_code,name,purpose,subject_type) values($1,$2,$3,'person') returning id",[`gate2-journey-${suffix}`,"Gate 2 test verification","Test-only verified professional claim for a complete mentorship journey."])).rows[0];
 const verificationCase=(await db.query("insert into verification_case(program_id,subject_user_id,status,purpose_snapshot,opened_by) values($1,$2,'approved',$3,$2) returning id",[program.id,userId,"Gate 2 mentorship test"])).rows[0];
 const claimType=(await db.query("insert into verification_claim_type(claim_code,name,active) values('professional_certification','Professional certification',true) on conflict(claim_code) do update set active=true returning id")).rows[0];
 await db.query("insert into verification_claim(case_id,claim_type_id,claim_code_snapshot,claimed_value,status,verified_at) values($1,$2,'professional_certification',$3,'verified',now())",[verificationCase.id,claimType.id,{source:"Gate 2 integration test"}]);
}
async function approvedOrg(ownerId){
 const db=getPool();
 const org=await organizationJobs.registerOrganization(ownerId,{legalName:`Gate 2 Org ${randomUUID()}`,displayName:"Gate 2 Verified Organization"},"gate2-org-create");
 await db.query("update organization set verification_status='verified',verified_at=now(),verified_by=$2,public_visible=true where id=$1",[org.id,ownerId]);
 return org;
}

test("Gate 2: reference consent and reviewer assessment persist values allowed by the migration",async()=>{
 const subject=await account(),referee=await account(),reviewer=await account(),unassignedReviewer=await account();
 await activeMember(subject);
 const db=getPool();
 await db.query("insert into app_user_role(user_id,role_id) select $1,id from app_role where role_code='verification_reviewer' on conflict do nothing",[reviewer]);
 await db.query("insert into app_user_role(user_id,role_id) select $1,id from app_role where role_code='verification_reviewer' on conflict do nothing",[unassignedReviewer]);
 const code=`gate2-reference-${randomUUID().replaceAll("-","").slice(0,12)}`;
 const program=(await db.query("insert into verification_program(program_code,name,purpose,subject_type) values($1,$2,$3,'person') returning id",[code,"Reference workflow compatibility","Test the reference consent and review states against persisted database constraints."])).rows[0];
 const caseRow=(await db.query("insert into verification_case(program_id,subject_user_id,status,purpose_snapshot,opened_by,assigned_reviewer_id) values($1,$2,'review',$3,$2,$4) returning id",[program.id,subject,"Reference compatibility test",reviewer])).rows[0];
 const refereeEmail=(await db.query("select email from app_user where id=$1",[referee])).rows[0].email;
 const requested=await verification.requestReference(caseRow.id,{refereeEmail,relationship:"Former colleague"},subject,"gate2-reference-request");
 assert.equal(requested.consent_status,"pending");
 const responded=await verification.respondReferenceRequest(requested.id,{consent:true,responseText:"I worked with this person and can confirm their professional contribution."},referee,"gate2-reference-consent");
 assert.equal(responded.consent_status,"consented");
 assert.equal(responded.verification_status,"pending");
 await assert.rejects(
  verification.reviewReferenceRequest(requested.id,{status:"verified",reason:"Unassigned reviewer must not be able to decide this reference."},unassignedReviewer,"gate2-reference-unassigned-review"),
  error=>error.code==="FORBIDDEN",
  "a reviewer without assignment must not assess another reviewer's reference"
 );
 const reviewed=await verification.reviewReferenceRequest(requested.id,{status:"needs_clarification",reason:"Please clarify the dates and responsibilities covered by this reference."},reviewer,"gate2-reference-review");
 assert.equal(reviewed.verification_status,"needs_clarification");
 const persisted=(await db.query("select referee_contact,consent_status,verification_status,requester_user_id,referee_user_id,responded_by,reviewed_by from verification_reference_request where id=$1",[requested.id])).rows[0];
 assert.equal(persisted.referee_contact,refereeEmail,"the required legacy contact column must remain populated");
 assert.equal(persisted.consent_status,"consented");
 assert.equal(persisted.verification_status,"needs_clarification");
 assert.equal(persisted.requester_user_id,subject);
 assert.equal(persisted.referee_user_id,referee);
 assert.equal(persisted.responded_by,referee);
 assert.equal(persisted.reviewed_by,reviewer);
});

test("Gate 2: concurrent talent inquiries from one requester cannot create duplicate pending records",async()=>{
 const requester=await account(),professional=await account();
 await activeMember(requester);
 await activeMember(professional);
 await verifiedProfessionalClaim(professional);
 const db=getPool();
 await db.query("insert into verification_visibility(user_id,directory_visible) values($1,true) on conflict(user_id) do update set directory_visible=true",[professional]);
 await db.query("update professional_profile set directory_visibility='members' where person_id=(select id from person where user_id=$1)",[professional]);
 const input={professionalUserId:professional,subject:"Professional collaboration",message:"I would like to discuss a possible professional collaboration."};
 const outcomes=await Promise.allSettled([
  talent.createTalentInquiry(requester,input,"gate2-talent-concurrent-a",`gate2-talent-a-${randomUUID()}`),
  talent.createTalentInquiry(requester,input,"gate2-talent-concurrent-b",`gate2-talent-b-${randomUUID()}`)
 ]);
 assert.equal(outcomes.filter(x=>x.status==="fulfilled").length,1,"only one concurrent pending inquiry should be created");
 const rejected=outcomes.find(x=>x.status==="rejected");
 assert.equal(rejected.reason.code,"DUPLICATE_INQUIRY","the second concurrent request must return the existing-request conflict");
 const count=await db.query("select count(*)::int count from talent_inquiry where requester_user_id=$1 and professional_user_id=$2 and status='requested'",[requester,professional]);
 assert.equal(count.rows[0].count,1,"duplicate concurrent inquiries must not both persist");
});

test("Gate 2: concurrent mentorship submissions cannot create duplicate requests or reuse a key for changed goals",async()=>{
 const mentee=await account();
 await activeMember(mentee);
 const key=`gate2-mentorship-idempotency-${randomUUID()}`;
 const input={goals:"Prepare a practical mentorship plan for product discovery and delivery.",topics:["product","strategy"],preferredModes:["remote"],preferredLanguages:["english"],preferredDays:[1,3]};
 const results=await Promise.all([
  journeys.createMentorshipRequest(mentee,input,"gate2-mentorship-idempotency-a",key),
  journeys.createMentorshipRequest(mentee,input,"gate2-mentorship-idempotency-b",key)
 ]);
 assert.equal(results[0].id,results[1].id,"concurrent retries with the same key must resolve to one request");
 const secondKeyResult=await journeys.createMentorshipRequest(mentee,input,"gate2-mentorship-distinct-key",`gate2-distinct-${randomUUID()}`);
 assert.equal(secondKeyResult.id,results[0].id,"same pending goal must not be duplicated when a second tab uses a different key");
 const persisted=await getPool().query("select count(*)::int count from mentorship_request where mentee_user_id=$1 and goals=$2 and status in ('requested','matching','matched')",[mentee,input.goals]);
 assert.equal(persisted.rows[0].count,1,"only one active request for the same normalized goal should persist");
 await assert.rejects(
  journeys.createMentorshipRequest(mentee,{...input,goals:"Changed goal with the same key"},"gate2-mentorship-idempotency-conflict",key),
  error=>error.code==="IDEMPOTENCY_KEY_CONFLICT"
 );
});

test("Gate 2: conflicting concurrent provider responses persist only one decision",async()=>{
 const provider=await account(),requester=await account(),staff=await supportStaff();
 await activeMember(provider);
 const listing=await journeys.createServiceListing(provider,{title:"Concurrent provider decision test",description:"A public listing for testing mutually exclusive provider decisions.",serviceCategory:"Operations",deliveryMode:"remote",pricingModel:"quote",visibility:"public"},"gate2-service-conflict-listing",randomUUID());
 await journeys.changeServiceListingStatus(listing.id,provider,"published","gate2-service-conflict-publish");
 await marketplace.moderateListing("service",listing.id,staff,{decision:"approved",note:"Approved for concurrency test."},"gate2-service-conflict-approve");
 const request=await journeys.requestService(listing.id,requester,{message:"Please review this request."},"gate2-service-conflict-request",randomUUID());
 const outcomes=await Promise.allSettled([
  journeys.changeServiceRequestStatus(request.id,provider,"accepted","The provider accepts the request.","gate2-service-conflict-accept"),
  journeys.changeServiceRequestStatus(request.id,provider,"declined","The provider declines the request.","gate2-service-conflict-decline")
 ]);
 assert.equal(outcomes.filter(x=>x.status==="fulfilled").length,1,"row locking must permit only one conflicting decision to win");
 const rejected=outcomes.find(x=>x.status==="rejected");
 assert.equal(rejected.reason.code,"INVALID_STATE","the losing concurrent action must receive a stale-state conflict");
 const persisted=(await getPool().query("select status from service_request where id=$1",[request.id])).rows[0];
 assert.ok(["accepted","declined"].includes(persisted.status));
 const decisions=await getPool().query("select count(*)::int count from service_request_event where request_id=$1 and from_status='requested' and to_status in ('accepted','declined')",[request.id]);
 assert.equal(decisions.rows[0].count,1,"only the winning response may appear in persisted status history");
});

test("Gate 2: public service journey reaches accepted delivery, requester outcome acceptance and feedback",async()=>{
 const provider=await account(),requester=await account(),staff=await supportStaff();
 await activeMember(provider);
 const listing=await journeys.createServiceListing(provider,{title:"Gate 2 bookkeeping support",description:"Monthly bookkeeping, reconciliation and clear management reporting for small teams.",serviceCategory:"Finance",deliveryMode:"remote",pricingModel:"quote",visibility:"public"},"gate2-service-create",randomUUID());
 const submitted=await journeys.changeServiceListingStatus(listing.id,provider,"published","gate2-service-submit");
 assert.equal(submitted.moderation_status,"pending");
 assert.equal((await journeys.listServices(null,{q:"Gate 2 bookkeeping support"})).items.some(x=>x.id===listing.id),false);
 assert.ok((await marketplace.listAdminListings(staff)).some(x=>x.id===listing.id&&x.moderation_status==="pending"));
 const approved=await marketplace.moderateListing("service",listing.id,staff,{decision:"approved",note:"Scope and public description reviewed."},"gate2-service-approve");
 assert.equal(approved.status,"published");
 assert.ok((await journeys.listServices(null,{q:"Gate 2 bookkeeping support"})).items.some(x=>x.id===listing.id));
 const serviceKey=`gate2-service-request-${randomUUID()}`;
 const servicePayload={message:"Please help us reconcile the last quarter."};
 const concurrentRequests=await Promise.all([
  journeys.requestService(listing.id,requester,servicePayload,"gate2-service-request-a",serviceKey),
  journeys.requestService(listing.id,requester,servicePayload,"gate2-service-request-b",serviceKey)
 ]);
 assert.equal(concurrentRequests[0].id,concurrentRequests[1].id,"concurrent retries must resolve to one service request");
 await assert.rejects(
  journeys.requestService(listing.id,requester,{message:"Changed request scope with the same key."},"gate2-service-request-conflict",serviceKey),
  error=>error.code==="IDEMPOTENCY_KEY_CONFLICT"
 );
 const request=concurrentRequests[0];
 await assert.rejects(journeys.changeServiceRequestStatus(request.id,await account(),"accepted","unrelated user","gate2-outsider"),e=>e.code==="FORBIDDEN");
 assert.equal((await journeys.changeServiceRequestStatus(request.id,provider,"accepted","Scope confirmed.","gate2-service-accept")).status,"accepted");
 assert.equal((await journeys.changeServiceRequestStatus(request.id,provider,"in_progress","Work started.","gate2-service-start")).status,"in_progress");
 const milestone=await journeys.createServiceMilestone(request.id,provider,{title:"Quarterly reconciliation","description":"Reconcile records and deliver a summary."},"gate2-service-milestone");
 const delivery=await journeys.submitServiceDelivery(request.id,provider,{milestoneId:milestone.id,description:"Reconciliation completed; summary and exceptions are documented."},"gate2-service-delivery");
 assert.equal((await journeys.reviewServiceDelivery(delivery.id,requester,{status:"accepted",note:"Reviewed and accepted."},"gate2-service-review")).status,"accepted");
 assert.equal((await journeys.listServiceMilestones(request.id,requester)).find(x=>x.id===milestone.id).status,"completed");
 await journeys.changeServiceRequestStatus(request.id,provider,"completed","Delivery submitted for requester acceptance.","gate2-service-completion");
 const completed=await journeys.acceptServiceCompletion(request.id,requester,"The agreed outcome is accepted.","gate2-service-outcome");
 assert.equal(completed.status,"completed");
 const persistedEvents=(await getPool().query("select from_status,to_status,note from service_request_event where request_id=$1 order by created_at",[request.id])).rows;
 assert.ok(persistedEvents.some(event=>event.to_status==="requested"),"request submission must be recorded in status history");
 assert.ok(persistedEvents.some(event=>event.from_status==="in_progress"&&event.to_status==="in_progress"&&String(event.note||"").includes("requester acceptance")),"provider completion submission must be distinct from requester acceptance");
 assert.ok(persistedEvents.some(event=>event.from_status==="in_progress"&&event.to_status==="completed"),"requester outcome acceptance must be persisted as a separate transition");
 const auditActions=(await getPool().query("select action from audit_log where resource_type='service_request' and resource_id=$1",[request.id])).rows.map(row=>row.action);
 assert.ok(auditActions.includes("service.request_completion_submitted"));
 assert.ok(auditActions.includes("service.request_completion_accepted"));
 const feedback=await journeys.submitServiceFeedback(request.id,requester,{targetRole:"provider",rating:5,comments:"Clear communication and useful outcome."},"gate2-service-feedback");
 assert.equal(Number(feedback.rating),5);
});

test("Gate 2: paid service completion cannot be accepted before finance verifies the agreed payment",async()=>{
 const provider=await account(),requester=await account(),finance=await financeStaff();
 await activeMember(provider);
 const listing=await journeys.createServiceListing(provider,{title:"Gate 2 paid service settlement",description:"A fixed-price engagement used to prove that completion acceptance follows finance-verified settlement.",serviceCategory:"Operations",deliveryMode:"remote",pricingModel:"fixed",priceAmount:500,currency:"ETB",visibility:"public"},"gate2-paid-service-listing",randomUUID());
 await journeys.changeServiceListingStatus(listing.id,provider,"published","gate2-paid-service-publish");
 const staff=await supportStaff();
 await marketplace.moderateListing("service",listing.id,staff,{decision:"approved",note:"Fixed-price scope and terms reviewed."},"gate2-paid-service-moderate");
 const request=await journeys.requestService(listing.id,requester,{message:"Please deliver the fixed-price operating procedure review.",proposedPrice:500,currency:"ETB"},"gate2-paid-service-request",randomUUID());
 await journeys.changeServiceRequestStatus(request.id,provider,"accepted","Agreed fixed price: ETB 500.","gate2-paid-service-accept");
 await journeys.changeServiceRequestStatus(request.id,provider,"in_progress","Work started.","gate2-paid-service-start");
 await journeys.changeServiceRequestStatus(request.id,provider,"completed","Deliverables are ready for requester review.","gate2-paid-service-submit-completion");
 await assert.rejects(journeys.acceptServiceCompletion(request.id,requester,"The work looks complete.","gate2-paid-service-premature-accept"),error=>error.code==="PAYMENT_NOT_SETTLED");
 const payment=await journeys.submitServicePayment(request.id,requester,{amount:500,currency:"ETB",channel:"bank_transfer",reference:`GATE2-${randomUUID()}`,idempotencyKey:`gate2-paid-service-${randomUUID()}`},"gate2-paid-service-payment");
 assert.equal(payment.status,"pending");
 assert.equal((await journeys.verifyServicePayment(payment.id,finance,{decision:"approved",note:"Bank transfer evidence and amount checked.",evidenceChecked:["amount","currency","reference"]},"gate2-paid-service-verify")).status,"succeeded");
 assert.equal((await journeys.acceptServiceCompletion(request.id,requester,"Finance-confirmed payment and agreed deliverables are accepted.","gate2-paid-service-final-accept")).status,"completed");
});
test("Gate 2: verified organization publishes under its own identity and can fulfill a public service request",async()=>{
 const owner=await account(),requester=await account(),staff=await supportStaff(),org=await approvedOrg(owner);
 const listing=await journeys.createServiceListing(owner,{organizationId:org.id,title:"Gate 2 organization training",description:"Practical workplace training with a clear agenda, materials and measurable learning outcomes.",serviceCategory:"Training",deliveryMode:"hybrid",pricingModel:"quote",visibility:"public"},"gate2-org-service-create",randomUUID());
 assert.equal(listing.organization_id,org.id);
 const submitted=await journeys.changeServiceListingStatus(listing.id,owner,"published","gate2-org-service-submit");
 assert.equal(submitted.moderation_status,"pending");
 const approved=await marketplace.moderateListing("service",listing.id,staff,{decision:"approved",note:"Organization offer reviewed."},"gate2-org-service-approve");
 assert.equal(approved.status,"published");
 const publicListing=(await journeys.listServices(null,{q:"Gate 2 organization training"})).items.find(x=>x.id===listing.id);
 assert.ok(publicListing);assert.equal(publicListing.organization_id,org.id);assert.equal(publicListing.display_name,org.display_name);
 const request=await journeys.requestService(listing.id,requester,{message:"Please share a training outline and available dates."},"gate2-org-service-request",randomUUID());
 await assert.rejects(journeys.changeServiceRequestStatus(request.id,await account(),"accepted","Unrelated actor","gate2-org-service-outsider"),e=>e.code==="FORBIDDEN");
 assert.equal((await journeys.listMyServiceRequests(owner)).some(row=>row.id===request.id),true,"authorized organization owner can follow the request");
 assert.equal((await journeys.listMyServiceRequests(await account())).some(row=>row.id===request.id),false,"unrelated account cannot discover organization request details");
 assert.equal((await journeys.changeServiceRequestStatus(request.id,owner,"accepted","Organization accepted the request.","gate2-org-service-accept")).status,"accepted");
 assert.equal((await journeys.changeServiceRequestStatus(request.id,owner,"in_progress","The organization began the agreed work.","gate2-org-service-start")).status,"in_progress");
 const milestone=await journeys.createServiceMilestone(request.id,owner,{title:"Training delivery",description:"Deliver the agreed workshop, materials and learning outcomes."},"gate2-org-service-milestone");
 const delivery=await journeys.submitServiceDelivery(request.id,owner,{milestoneId:milestone.id,description:"Workshop delivered, materials shared and learning outcomes summarized."},"gate2-org-service-delivery");
 assert.equal((await journeys.reviewServiceDelivery(delivery.id,requester,{status:"accepted",note:"The training and materials meet the agreed scope."},"gate2-org-service-delivery-review")).status,"accepted");
 await journeys.changeServiceRequestStatus(request.id,owner,"completed","Organization submitted the agreed deliverables for requester acceptance.","gate2-org-service-completion");
 const acceptedOutcome=await journeys.acceptServiceCompletion(request.id,requester,"The training outcome and materials are accepted.","gate2-org-service-outcome");
 assert.equal(acceptedOutcome.status,"completed");
 const feedback=await journeys.submitServiceFeedback(request.id,requester,{targetRole:"provider",rating:5,comments:"The organization delivered the agreed training outcome."},"gate2-org-service-feedback");
 assert.equal(Number(feedback.rating),5);
});

test("Gate 2: mentorship offer is reviewed, matched, accepted, scheduled, completed and rated",async()=>{
 const mentor=await account(),mentee=await account(),staff=await supportStaff();
 await activeMember(mentor);await activeMember(mentee);await verifiedProfessionalClaim(mentor);
 const profile=await journeys.createMentorProfile(mentor,{headline:"Gate 2 product mentorship",bio:"Practical product discovery and delivery coaching.",expertise:["product","strategy"],languages:["english"],mentoringModes:["remote"],visibility:"public",maxActiveMentees:3},"gate2-mentor-create");
 const submitted=await journeys.changeMentorStatus(profile.id,mentor,"active","gate2-mentor-submit");
 assert.equal(submitted.moderation_status,"pending");
 assert.ok((await marketplace.listAdminListings(staff)).some(x=>x.id===profile.id&&x.listing_type==="mentorship"));
 const approved=await marketplace.moderateListing("mentorship",profile.id,staff,{decision:"approved",note:"Mentorship offer reviewed."},"gate2-mentor-approve");
 assert.equal(approved.status,"active");
 assert.ok((await journeys.listMentors(mentee,{q:"Gate 2 product mentorship"})).some(x=>x.id===profile.id));
 const start=new Date(Date.now()+14*24*60*60*1000);start.setUTCHours(7,0,0,0);
 const weekdayNames={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
 const weekday=weekdayNames[new Intl.DateTimeFormat("en-US",{weekday:"short",timeZone:"Africa/Addis_Ababa"}).format(start)];
 await journeys.setMentorAvailability(profile.id,mentor,{slots:[{dayOfWeek:weekday,startTime:"09:00",endTime:"12:00",timezone:"Africa/Addis_Ababa"}]},"gate2-mentor-availability");
 const request=await journeys.createMentorshipRequest(mentee,{goals:"Build a realistic product discovery and delivery plan.",topics:["product","strategy"],preferredModes:["remote"],preferredLanguages:["english"],preferredDays:[weekday]},"gate2-mentorship-request",randomUUID());
 const matches=await journeys.findMentorMatches(request.id,mentee);
 assert.ok(matches.some(x=>x.mentorUserId===mentor));
 const proposed=await journeys.proposeMentorMatch(request.id,mentor,mentee,"gate2-mentorship-propose");
 assert.equal(proposed.status,"proposed");
 const mentorResponse=await journeys.respondToMatch(proposed.id,mentor,"accepted","gate2-mentorship-accept");
 assert.equal(mentorResponse.status,"accepted");
 assert.equal((await getPool().query("select count(*)::int count from mentorship where request_id=$1",[request.id])).rows[0].count,0,"mentor acceptance alone must not activate the relationship");
 const menteeResponse=await journeys.respondToMenteeMatch(proposed.id,mentee,"accepted","","gate2-mentorship-mentee-accept");
 assert.equal(menteeResponse.mentee_consent_status,"accepted");
 const engagement=(await journeys.listMyMentorships(mentee)).find(x=>x.mentor_user_id===mentor&&x.request_id===request.id);
 assert.ok(engagement);assert.equal(engagement.status,"active");
 const sessionStart=start.toISOString(),sessionEnd=new Date(start.getTime()+60*60*1000).toISOString();
 const session=await journeys.createMentorshipSession(engagement.id,mentor,{scheduledStartAt:sessionStart,scheduledEndAt:sessionEnd,mode:"remote",agenda:"Review the discovery plan"},"gate2-mentorship-session");
 assert.equal(session.status,"scheduled");
 assert.equal((await journeys.changeMentorshipSession(session.id,mentee,"completed","Session completed with agreed next steps.","gate2-session-complete")).status,"completed");
 const sessionFeedback=await journeys.submitMentorshipFeedback(engagement.id,mentee,{targetRole:"mentor",rating:5,comments:"Useful and practical.",sessionId:session.id},"gate2-session-feedback");
 assert.equal(Number(sessionFeedback.rating),5);
 await journeys.changeMentorshipStatus(engagement.id,mentor,"completed","The agreed mentorship goals were reviewed.","gate2-mentorship-complete");
 const programFeedback=await journeys.submitMentorshipFeedback(engagement.id,mentee,{targetRole:"program",rating:5,comments:"The mentorship reached its agreed outcome."},"gate2-program-feedback");
 assert.equal(Number(programFeedback.rating),5);
});

test("Gate 2: mentee can consent before the mentor and relationship starts only after both accept",async()=>{
 const mentee=await account(),mentor=await account(),staff=await supportStaff();
 await activeMember(mentee);
 await activeMember(mentor);
 await verifiedProfessionalClaim(mentor);
 const profile=await journeys.createMentorProfile(mentor,{headline:"Mentee-first product mentor",bio:"Practical product discovery and delivery coaching.",expertise:["product","strategy"],languages:["english"],mentoringModes:["remote"],visibility:"public",maxActiveMentees:3},"gate2-mentee-first-profile");
 await journeys.changeMentorStatus(profile.id,mentor,"active","gate2-mentee-first-submit");
 await marketplace.moderateListing("mentorship",profile.id,staff,{decision:"approved",note:"Mentee-first test mentor approved."},"gate2-mentee-first-approve");
 const start=new Date(Date.now()+14*24*60*60*1000);start.setUTCHours(7,0,0,0);
 const weekdayNames={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
 const weekday=weekdayNames[new Intl.DateTimeFormat("en-US",{weekday:"short",timeZone:"Africa/Addis_Ababa"}).format(start)];
 await journeys.setMentorAvailability(profile.id,mentor,{slots:[{dayOfWeek:weekday,startTime:"09:00",endTime:"12:00",timezone:"Africa/Addis_Ababa"}]},"gate2-mentee-first-availability");
 const request=await journeys.createMentorshipRequest(mentee,{goals:"Build a practical product discovery and delivery plan.",topics:["product","strategy"],preferredModes:["remote"],preferredLanguages:["english"],preferredDays:[weekday]},"gate2-mentee-first-request",randomUUID());
 const proposed=await journeys.proposeMentorMatch(request.id,mentor,mentee,"gate2-mentee-first-propose");
 const menteeResponse=await journeys.respondToMenteeMatch(proposed.id,mentee,"accepted","","gate2-mentee-first-consent");
 assert.equal(menteeResponse.mentee_consent_status,"accepted");
 assert.equal((await getPool().query("select count(*)::int count from mentorship where request_id=$1",[request.id])).rows[0].count,0,"mentee consent alone must not activate the relationship");
 const mentorResponse=await journeys.respondToMatch(proposed.id,mentor,"accepted","gate2-mentor-second-consent");
 assert.equal(mentorResponse.mentee_consent_status,"accepted","mentor acceptance must preserve earlier mentee consent");
 const active=(await journeys.listMyMentorships(mentee)).find(x=>x.mentor_user_id===mentor&&x.request_id===request.id);
 assert.ok(active,"the relationship becomes active only after both separate acceptances");
 assert.equal(active.status,"active");
});
test("Gate 2: declined mentorship match remains in history when a different mentor is proposed",async()=>{
 const mentee=await account(),firstMentor=await account(),secondMentor=await account(),staff=await supportStaff();
 await activeMember(mentee);
 for(const mentor of [firstMentor,secondMentor]){
  await activeMember(mentor);
  await verifiedProfessionalClaim(mentor);
 }
 const firstProfile=await journeys.createMentorProfile(firstMentor,{headline:"Rematching product mentor A",bio:"Practical product discovery and delivery coaching.",expertise:["product","strategy"],languages:["english"],mentoringModes:["remote"],visibility:"public",maxActiveMentees:3},"gate2-rematch-profile-a");
 const secondProfile=await journeys.createMentorProfile(secondMentor,{headline:"Rematching product mentor B",bio:"Practical product discovery and delivery coaching.",expertise:["product","strategy"],languages:["english"],mentoringModes:["remote"],visibility:"public",maxActiveMentees:3},"gate2-rematch-profile-b");
 await journeys.changeMentorStatus(firstProfile.id,firstMentor,"active","gate2-rematch-submit-a");
 await journeys.changeMentorStatus(secondProfile.id,secondMentor,"active","gate2-rematch-submit-b");
 await marketplace.moderateListing("mentorship",firstProfile.id,staff,{decision:"approved",note:"Rematching test mentor A approved."},"gate2-rematch-approve-a");
 await marketplace.moderateListing("mentorship",secondProfile.id,staff,{decision:"approved",note:"Rematching test mentor B approved."},"gate2-rematch-approve-b");
 const start=new Date(Date.now()+14*24*60*60*1000);start.setUTCHours(7,0,0,0);
 const weekdayNames={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
 const weekday=weekdayNames[new Intl.DateTimeFormat("en-US",{weekday:"short",timeZone:"Africa/Addis_Ababa"}).format(start)];
 for(const mentor of [firstMentor,secondMentor]){
  const profile=mentor===firstMentor?firstProfile:secondProfile;
  await journeys.setMentorAvailability(profile.id,mentor,{slots:[{dayOfWeek:weekday,startTime:"09:00",endTime:"12:00",timezone:"Africa/Addis_Ababa"}]},"gate2-rematch-availability");
 }
 const request=await journeys.createMentorshipRequest(mentee,{goals:"Build a practical product discovery and delivery plan.",topics:["product","strategy"],preferredModes:["remote"],preferredLanguages:["english"],preferredDays:[weekday]},"gate2-rematch-request",randomUUID());
 const candidates=await journeys.findMentorMatches(request.id,mentee);
 assert.ok(candidates.some(x=>x.mentorUserId===firstMentor));
 assert.ok(candidates.some(x=>x.mentorUserId===secondMentor));
 const firstMatch=await journeys.proposeMentorMatch(request.id,firstMentor,mentee,"gate2-rematch-propose-a");
 assert.equal(firstMatch.status,"proposed");
 assert.equal((await journeys.respondToMatch(firstMatch.id,firstMentor,"declined","gate2-rematch-decline-a")).status,"declined");
 const secondMatch=await journeys.proposeMentorMatch(request.id,secondMentor,mentee,"gate2-rematch-propose-b");
 assert.notEqual(secondMatch.id,firstMatch.id,"rematching creates a new proposal rather than overwriting the declined match");
 assert.equal(secondMatch.status,"proposed");
 const history=(await getPool().query("select id,mentor_user_id,status from mentorship_match where request_id=$1 order by proposed_at,id",[request.id])).rows;
 assert.equal(history.length,2,"both the declined proposal and the new proposal remain persisted");
 assert.equal(history.find(x=>x.id===firstMatch.id).status,"declined");
 assert.equal(history.find(x=>x.id===secondMatch.id).status,"proposed");
});
test("Gate 2: verified organization mentorship offer is moderated, requested, accepted and completed",async()=>{
 const owner=await account(),requester=await account(),staff=await supportStaff(),org=await approvedOrg(owner);
 const offer=await organizationOffers.createOrganizationMentorshipOffer(owner,{organizationId:org.id,title:"Gate 2 leadership mentorship program",description:"A structured program for early-career professionals with guided goals, mentor check-ins and a clear completion outcome.",expertise:["leadership","career development"],languages:["English","Amharic"],deliveryMode:"hybrid",visibility:"public"},"gate2-org-mentorship-create");
 assert.equal(offer.organization_id,org.id);assert.equal(offer.moderation_status,"pending");
 const submitted=await organizationOffers.changeOrganizationMentorshipOfferStatus(offer.id,owner,"published","gate2-org-mentorship-submit");
 assert.equal(submitted.status,"draft");
 assert.ok((await marketplace.listAdminListings(staff)).some(x=>x.id===offer.id&&x.listing_type==="organization_mentorship"));
 const moderated=await marketplace.moderateListing("organization_mentorship",offer.id,staff,{decision:"approved",note:"Verified organization program and public copy reviewed."},"gate2-org-mentorship-approve");
 assert.equal(moderated.status,"published");
 const publicOffer=(await organizationOffers.listOrganizationMentorshipOffers(null)).find(x=>x.id===offer.id);
 assert.ok(publicOffer);assert.equal(publicOffer.organization_name,org.display_name);
 const request=await organizationOffers.requestOrganizationMentorship(offer.id,requester,{message:"I want support building a leadership plan and improving team communication."},"gate2-org-mentorship-request");
 assert.equal(request.status,"requested");
 assert.equal(request.notificationStatus,"in_app_recorded");
 assert.equal(request.externalDelivery,"not_configured");
 assert.ok((await getPool().query("select 1 from notification_event where user_id=$1 and resource_id=$2 and event_code='organization.mentorship_request_received'",[owner,request.id])).rowCount>=1,"organization team notification must be persisted in-app before status is claimed");
 assert.ok((await organizationOffers.listMyOrganizationMentorshipRequests(owner)).some(x=>x.id===request.id&&!x.is_requester));
 await assert.rejects(organizationOffers.respondOrganizationMentorshipRequest(request.id,requester,"accepted","Requester cannot impersonate the organization.","gate2-org-mentorship-requester-forbidden"),e=>e.code==="ORGANIZATION_FORBIDDEN");
 await assert.rejects(organizationOffers.respondOrganizationMentorshipRequest(request.id,await account(),"accepted","Unrelated account cannot decide.","gate2-org-mentorship-outsider-forbidden"),e=>e.code==="ORGANIZATION_FORBIDDEN");
 assert.equal((await organizationOffers.listMyOrganizationMentorshipRequests(requester)).some(row=>row.id===request.id&&row.is_requester),true);
 assert.equal((await organizationOffers.listMyOrganizationMentorshipRequests(await account())).some(row=>row.id===request.id),false,"unrelated account cannot list private organization mentorship requests");
 const accepted=await organizationOffers.respondOrganizationMentorshipRequest(request.id,owner,"accepted","We can support this goal. The organization will contact you to agree next steps.","gate2-org-mentorship-accept");
 assert.equal(accepted.status,"accepted");
 const completed=await organizationOffers.respondOrganizationMentorshipRequest(request.id,owner,"completed","Program completed and the agreed outcome was recorded.","gate2-org-mentorship-complete");
 assert.equal(completed.status,"completed");
 assert.equal((await organizationOffers.listMyOrganizationMentorshipRequests(requester)).find(x=>x.id===request.id).status,"completed");
});

test("Gate 2: Support Desk proposes a suitable provider and the provider responds before demand is matched",async()=>{
 const provider=await account(),requester=await account(),staff=await supportStaff();
 await activeMember(provider);
 const listing=await journeys.createServiceListing(provider,{title:"Gate 2 demand-matching service",description:"Practical business operations support with a defined scope and measurable outcomes.",serviceCategory:"Operations",deliveryMode:"remote",pricingModel:"quote",visibility:"public"},"gate2-match-listing-create",randomUUID());
 await journeys.changeServiceListingStatus(listing.id,provider,"published","gate2-match-listing-submit");
 await marketplace.moderateListing("service",listing.id,staff,{decision:"approved",note:"Public provider offer reviewed."},"gate2-match-listing-approve");
 const demand=await marketplace.createDemand(requester,{demandType:"service",title:"Need operations support",description:"Our small team needs help improving weekly workflows and documenting reliable operating procedures.",category:"Operations",deliveryMode:"remote"},"gate2-match-demand-create",randomUUID());
 await assert.rejects(marketplace.reviewDemand(demand.id,staff,{status:"matched",internalNote:"",outcomeCode:"provider_search"},"gate2-match-premature"),e=>e.code==="PROVIDER_MATCH_REQUIRED");
 const candidates=await marketplace.listDemandMatchCandidates(staff,"service");
 assert.ok(candidates.some(x=>x.id===listing.id&&x.listing_type==="service"));
 const match=await marketplace.createDemandProviderMatch(demand.id,staff,{listingType:"service",listingId:listing.id,note:"The offer's scope aligns with the requested workflow support."},"gate2-match-propose");
 assert.equal(match.status,"proposed");
 assert.equal(match.notificationStatus,"in_app_recorded");
 assert.equal(match.externalDelivery,"not_configured");
 assert.ok((await getPool().query("select 1 from notification_event where user_id=$1 and resource_id=$2 and event_code='marketplace.provider_match_proposed'",[provider,match.id])).rowCount>=1);
 assert.ok((await marketplace.listMyDemandProviderMatches(provider)).some(x=>x.id===match.id&&!x.is_requester));
 await assert.rejects(marketplace.respondToDemandProviderMatch(match.id,requester,"accepted","Not the provider","gate2-match-outsider"),e=>e.code==="FORBIDDEN");
 const accepted=await marketplace.respondToDemandProviderMatch(match.id,provider,"accepted","We can help and will contact the requester to confirm the scope.","gate2-match-accept");
 assert.equal(accepted.status,"accepted");
 assert.equal(accepted.notificationStatus,"in_app_recorded");
 assert.equal(accepted.externalDelivery,"not_configured");
 const requesterView=(await marketplace.listMyDemandProviderMatches(requester)).find(x=>x.id===match.id);
 assert.equal(requesterView.status,"accepted");
 assert.equal((await marketplace.listReviewQueue(staff,{status:"matched"})).some(x=>x.id===demand.id),true);
});

test("Gate 2: organization workspace exposes required evidence and current verification blockers",async()=>{
 const owner=await account();
 const org=await organizationJobs.registerOrganization(owner,{legalName:`Gate 2 Trust Checklist ${randomUUID()}`,displayName:"Gate 2 Trust Checklist Organization",organizationType:"company"},"gate2-org-checklist-create");
 const workspace=(await organizationJobs.listMyOrganizations(owner)).find(row=>row.id===org.id);
 assert.ok(workspace,"the registered organization should appear in its owner's workspace");
 assert.ok(["draft","submitted","pending","correction_required","verified","rejected"].includes(workspace.verification_case_status));
 assert.ok(Array.isArray(workspace.required_evidence),"configured required evidence must be returned for the owner");
 assert.ok(Array.isArray(workspace.missing_evidence),"the owner needs an explicit missing-evidence list");
 assert.ok(Array.isArray(workspace.verification_evidence),"the owner needs to see which evidence has been received");
 assert.equal(workspace.verification_case_status,"draft");
});
test.after(async()=>{await closePool();});
