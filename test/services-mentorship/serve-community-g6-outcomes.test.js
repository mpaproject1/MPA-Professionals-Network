import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import * as membership from "../../src/membership/service.js";
import * as organizationJobs from "../../src/organization-jobs/service.js";
import {closePool,getPool} from "../../src/platform/db.js";
import * as services from "../../src/services-mentorship/service.js";

test.after(async()=>{await closePool();});

function identity(suffix){
 const digits=suffix.replace(/[^0-9]/g,"").slice(0,8).padEnd(8,"7");
 return {email:"serve-g6-"+suffix+"@example.test",password:"ServeCommunityG6Password!2026",firstName:"Serve",lastName:"Gate"+suffix.slice(0,8),phone:"07"+digits};
}
async function account(){const suffix=randomUUID().replaceAll("-","").slice(0,16);return (await membership.register(identity(suffix),"serve-community-g6-"+suffix)).user.id;}
async function setupListing({impactModel="standard",pricingModel="free",priceAmount=0,referencePriceAmount=null}={}){
 const owner=await account(),suffix=randomUUID().replaceAll("-","").slice(0,12);
 const org=await organizationJobs.registerOrganization(owner,{legalName:"Serve Community G6 "+suffix,displayName:"Serve Community G6 "+suffix},"serve-g6-org-"+suffix);
 const db=getPool();
 await db.query("update organization set verification_status='verified',verified_at=now(),verified_by=$2,public_visible=true where id=$1",[org.id,owner]);
 const listing=await services.createServiceListing(owner,{organizationId:org.id,title:"Community outcome service",description:"A measurable service delivered to local community members.",serviceCategory:"education",visibility:"public",pricingModel,priceAmount,currency:"ETB",impactModel,referencePriceAmount},"serve-g6-listing-"+suffix,"serve-g6-listing-key-"+suffix+"-0123456789");
 await db.query("update service_listing set moderation_status='approved',moderated_by=$2,moderated_at=now() where id=$1",[listing.id,owner]);
 const active=await services.changeServiceListingStatus(listing.id,owner,"published","serve-g6-publish-"+suffix);
 return {owner,org,listing:active,db,suffix};
}
async function startEngagement(fixture){
 const {owner,listing,suffix}=fixture,requester=await account();
 const request=await services.requestService(listing.id,requester,{message:"Please deliver the agreed community service.",scope:"Initial service delivery"},"serve-g6-request-"+suffix,"serve-g6-request-key-"+suffix+"-0123456789");
 await services.changeServiceRequestStatus(request.id,owner,"accepted","Provider accepts the requested scope","serve-g6-accept-"+suffix);
 await services.acceptServiceAgreement(request.id,requester,"serve-g6-agreement-"+suffix);
 await services.changeServiceRequestStatus(request.id,owner,"in_progress","Both parties accepted the agreed terms","serve-g6-start-"+suffix);
 return {request,requester,owner,listing,db:fixture.db,suffix};
}
async function submitAndAcceptDelivery(e){
 const delivery=await services.submitServiceDelivery(e.request.id,e.owner,{description:"Delivered the agreed work product and documented the verified service results."},"serve-g6-delivery-"+e.suffix);
 const reviewed=await services.reviewServiceDelivery(delivery.id,e.requester,{status:"accepted",note:"The submitted delivery evidence meets the agreed scope."},"serve-g6-delivery-review-"+e.suffix);
 assert.equal(reviewed.status,"accepted");
 return delivery;
}

test("G6 database: provider submission, requester acceptance, pro-bono payment separation and manual program fulfilment",async()=>{
 const f=await setupListing({impactModel:"pro_bono",pricingModel:"free"});
 await services.configureServiceCompletionPolicy(f.listing.id,f.owner,{evidencePolicy:"accepted_delivery",fulfilmentRule:"manual",fulfilmentTargetCount:1},"serve-g6-policy-"+f.suffix);
 const e=await startEngagement(f);
 await assert.rejects(services.submitServiceFeedback(e.request.id,e.requester,{category:"outcome",rating:5},"serve-g6-feedback-too-early-"+e.suffix),x=>x.code==="SERVICE_NOT_COMPLETED");
 await assert.rejects(services.acceptServiceCompletion(e.request.id,e.requester,"The outcome is accepted and complete.","serve-g6-too-early-"+e.suffix),x=>x.code==="COMPLETION_NOT_SUBMITTED");
 await assert.rejects(services.changeServiceRequestStatus(e.request.id,e.owner,"completed","The agreed work has been delivered successfully.","serve-g6-no-evidence-"+e.suffix),x=>x.code==="DELIVERY_EVIDENCE_REQUIRED");
 await assert.rejects(services.submitServicePayment(e.request.id,e.requester,{amount:0,currency:"ETB",idempotencyKey:"serve-g6-free-payment-"+e.suffix},"serve-g6-free-payment-request"),x=>x.code==="PAYMENT_NOT_REQUIRED");
 const delivery=await submitAndAcceptDelivery(e);
 const submitted=await services.changeServiceRequestStatus(e.request.id,e.owner,"completed","The service work product and recommendations were delivered.","serve-g6-submit-"+e.suffix);
 assert.equal(submitted.status,"in_progress","provider submission is not requester acceptance");
 assert.ok(submitted.provider_completed_at);
 assert.equal(submitted.provider_completion_submitted_by,e.owner);
 assert.equal(submitted.requester_accepted_at,null);
 const accepted=await services.acceptServiceCompletion(e.request.id,e.requester,"The agreed deliverables were received and the community team can apply the recommendations.","serve-g6-accept-outcome-"+e.suffix);
 assert.equal(accepted.status,"completed");
 assert.ok(accepted.requester_accepted_at);
 assert.equal(accepted.requester_outcome_decision,"accepted");
 assert.equal(accepted.requester_outcome_decision_by,e.requester);
 assert.ok(accepted.requester_outcome_decision_at);
 assert.equal(accepted.completion_evidence_delivery_id,delivery.id);
 assert.equal(accepted.final_outcome_summary,"The agreed deliverables were received and the community team can apply the recommendations.");
 const feedback=await services.submitServiceFeedback(e.request.id,e.requester,{category:"outcome",rating:5,comments:"The delivered recommendations are usable and meet the agreed outcome."},"serve-g6-feedback-after-"+e.suffix);
 assert.equal(feedback.reviewer_user_id,e.requester);
 assert.ok(feedback.created_at);
 assert.equal((await services.getServiceListing(f.listing.id,null)).lifecycle_status,"active","ongoing/manual program remains active after one completed engagement");
 const history=(await f.db.query("select event_type,actor_user_id,created_at from service_request_completion_event where request_id=$1 order by created_at",[e.request.id])).rows;
 assert.deepEqual(history.map(x=>x.event_type),["submitted","accepted"]);
 assert.equal(history[0].actor_user_id,e.owner);
 assert.equal(history[1].actor_user_id,e.requester);
 assert.ok(history.every(x=>x.created_at));
});

test("G6 database: revision and dispute require fresh evidence and never silently complete",async()=>{
 const f=await setupListing(),e=await startEngagement(f);
 await submitAndAcceptDelivery(e);
 await services.changeServiceRequestStatus(e.request.id,e.owner,"completed","The first delivery is submitted for outcome review.","serve-g6-submit-1-"+e.suffix);
 const revised=await services.reviewServiceCompletion(e.request.id,e.requester,{status:"revision_requested",note:"Please include the missing implementation verification results."},"serve-g6-revision-"+e.suffix);
 assert.equal(revised.status,"in_progress");
 assert.equal(revised.provider_completed_at,null);
 assert.equal(revised.requester_outcome_decision,"revision_requested");
 await assert.rejects(services.acceptServiceCompletion(e.request.id,e.requester,"The work is accepted with a final outcome summary.","serve-g6-accept-revision-too-soon-"+e.suffix),x=>x.code==="COMPLETION_NOT_SUBMITTED");
 await submitAndAcceptDelivery({...e,suffix:e.suffix+"r"});
 await services.changeServiceRequestStatus(e.request.id,e.owner,"completed","The revised deliverables and evidence are now ready for review.","serve-g6-submit-2-"+e.suffix);
 const disputed=await services.reviewServiceCompletion(e.request.id,e.requester,{status:"disputed",note:"The measured result differs from the agreed success criteria."},"serve-g6-dispute-"+e.suffix);
 assert.equal(disputed.status,"disputed");
 assert.equal(disputed.requester_outcome_decision,"disputed");
 await assert.rejects(services.acceptServiceCompletion(e.request.id,e.requester,"The service is accepted after review of all final outcomes.","serve-g6-accept-dispute-"+e.suffix),x=>x.code==="COMPLETION_NOT_SUBMITTED");
 await services.changeServiceRequestStatus(e.request.id,e.owner,"in_progress","The dispute was reviewed and the provider is resuming work against the agreed success criteria.","serve-g6-resume-"+e.suffix);
 await assert.rejects(services.changeServiceRequestStatus(e.request.id,e.owner,"completed","Completion is resubmitted without new evidence after dispute resolution.","serve-g6-no-fresh-evidence-"+e.suffix),x=>x.code==="DELIVERY_EVIDENCE_REQUIRED");
 await submitAndAcceptDelivery({...e,suffix:e.suffix+"d"});
 await services.changeServiceRequestStatus(e.request.id,e.owner,"completed","The corrected delivery evidence now demonstrates the agreed outcome.","serve-g6-submit-final-"+e.suffix);
 const accepted=await services.acceptServiceCompletion(e.request.id,e.requester,"The corrected deliverables meet the agreed success criteria and the service outcome is accepted.","serve-g6-accept-final-"+e.suffix);
 assert.equal(accepted.status,"completed");
 const history=(await f.db.query("select event_type from service_request_completion_event where request_id=$1 order by created_at",[e.request.id])).rows.map(x=>x.event_type);
 assert.deepEqual(history,["submitted","revision_requested","resubmitted","disputed","reopened","resubmitted","accepted"]);
});

test("G6 database: discounted paid completion remains separate from finance settlement",async()=>{
 const f=await setupListing({impactModel:"community_discount",pricingModel:"fixed",priceAmount:50,referencePriceAmount:100});
 const e=await startEngagement(f);
 await submitAndAcceptDelivery(e);
 await services.changeServiceRequestStatus(e.request.id,e.owner,"completed","The discounted service deliverables and outcome evidence are ready for requester review.","serve-g6-paid-submit-"+e.suffix);
 await assert.rejects(services.acceptServiceCompletion(e.request.id,e.requester,"The delivered service meets the agreed success criteria and final outcome is accepted.","serve-g6-paid-unsettled-"+e.suffix),x=>x.code==="PAYMENT_NOT_SETTLED");
 const state=(await f.db.query("select status,requester_accepted_at from service_request where id=$1",[e.request.id])).rows[0];
 assert.equal(state.status,"in_progress");
 assert.equal(state.requester_accepted_at,null,"outcome acceptance remains separate from finance verification");
});

test("G6 database: configured single-engagement fulfilment occurs only after requester acceptance",async()=>{
 const f=await setupListing();
 await services.configureServiceCompletionPolicy(f.listing.id,f.owner,{evidencePolicy:"accepted_delivery",fulfilmentRule:"single_engagement",fulfilmentTargetCount:1},"serve-g6-single-policy-"+f.suffix);
 const e=await startEngagement(f);
 await submitAndAcceptDelivery(e);
 await services.changeServiceRequestStatus(e.request.id,e.owner,"completed","The agreed service work is ready for outcome review.","serve-g6-single-submit-"+e.suffix);
 assert.equal((await services.getServiceListing(f.listing.id,null)).lifecycle_status,"active","provider submission cannot fulfil the program");
 await assert.rejects(services.changeServiceListingStatus(f.listing.id,f.owner,"fulfilled","serve-g6-premature-fulfil-"+e.suffix,"Premature program fulfilment"),x=>x.code==="FULFILMENT_RULE_NOT_MET");
 await services.acceptServiceCompletion(e.request.id,e.requester,"The service outcome meets the agreed success criteria and the deliverables are accepted.","serve-g6-single-accept-"+e.suffix);
 assert.equal((await services.getServiceListing(f.listing.id,null)).lifecycle_status,"fulfilled","single-engagement listing fulfils only after requester acceptance");
});
