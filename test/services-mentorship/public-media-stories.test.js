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
 return {email:"public-story-"+suffix+"@example.test",password:"PublicStoryPassword!2026",firstName:"Story",lastName:"Participant"+suffix.slice(0,8),phone:"07"+digits};
}
async function account(){const suffix=randomUUID().replaceAll("-","").slice(0,16);return (await membership.register(identity(suffix),"public-story-account-"+suffix)).user.id;}
async function fixture(){
 const owner=await account(),requester=await account(),moderator=await account(),suffix=randomUUID().replaceAll("-","").slice(0,12);
 const org=await organizationJobs.registerOrganization(owner,{legalName:"Public Story "+suffix,displayName:"Public Story "+suffix},"public-story-org-"+suffix);
 const db=getPool();
 const role=(await db.query("select id from app_role where role_code='system_admin' limit 1")).rows[0];
 assert.ok(role,"system_admin role exists in the disposable schema");
 await db.query("insert into app_user_role(user_id,role_id) values($1,$2) on conflict do nothing",[moderator,role.id]);
 await db.query("update organization set verification_status='verified',verified_at=now(),verified_by=$2,public_visible=true where id=$1",[org.id,owner]);
 const listing=await services.createServiceListing(owner,{organizationId:org.id,title:"Community service for story testing",description:"A service whose participant outcomes can be documented after accepted delivery.",serviceCategory:"education",visibility:"public",pricingModel:"free",priceAmount:0,currency:"ETB"},"public-story-listing-"+suffix,"public-story-listing-key-"+suffix+"-0123456789");
 await db.query("update service_listing set moderation_status='approved',moderated_by=$2,moderated_at=now() where id=$1",[listing.id,owner]);
 await services.changeServiceListingStatus(listing.id,owner,"published","public-story-publish-"+suffix);
 const request=await services.requestService(listing.id,requester,{message:"Please deliver the agreed community service.","scope":"The agreed learning support and documented recommendations."},"public-story-request-"+suffix,"public-story-request-key-"+suffix+"-0123456789");
 await services.changeServiceRequestStatus(request.id,owner,"accepted","The provider accepts the requested service scope.","public-story-accept-"+suffix);
 await services.acceptServiceAgreement(request.id,requester,"public-story-agreement-"+suffix);
 await services.changeServiceRequestStatus(request.id,owner,"in_progress","Both parties accepted the service terms.","public-story-start-"+suffix);
 const delivery=await services.submitServiceDelivery(request.id,owner,{description:"Delivered the agreed learning support and documented actionable recommendations."},"public-story-delivery-"+suffix);
 await services.reviewServiceDelivery(delivery.id,requester,{status:"accepted",note:"The submitted delivery evidence meets the agreed service scope."},"public-story-review-delivery-"+suffix);
 await services.changeServiceRequestStatus(request.id,owner,"completed","The provider submitted the completed service for requester outcome review.","public-story-submit-completion-"+suffix);
 await services.acceptServiceCompletion(request.id,requester,"The agreed learning support was delivered and the requester accepts the recorded outcome.","public-story-accept-completion-"+suffix);
 return {owner,requester,moderator,suffix,listing,db};
}

test("public video stories require completed engagement, explicit consent, moderation and withdrawal",async()=>{
 const f=await fixture();
 const input={title:"My learning support experience",summary:"The service helped me organize a practical learning plan and understand my next steps.",transcript:"I received the learning support described in the service agreement and used the recommendations to plan my next steps.",videoUrl:"https://www.youtube.com/watch?v=abc123",attributionMode:"anonymous",consentGiven:true,consentVersion:"public-media-story-v1"};
 await assert.rejects(services.createPublicMediaStory(f.owner,"service",f.listing.id,input,"public-story-owner-denied-"+f.suffix,"public-story-owner-key-"+f.suffix+"-0123456789"),e=>e.code==="COMPLETED_ENGAGEMENT_REQUIRED");
 await assert.rejects(services.createPublicMediaStory(f.requester,"service",f.listing.id,{...input,consentGiven:false},"public-story-no-consent-"+f.suffix,"public-story-no-consent-key-"+f.suffix+"-0123456789"),e=>e.code==="PUBLICATION_CONSENT_REQUIRED");
 const story=await services.createPublicMediaStory(f.requester,"service",f.listing.id,input,"public-story-submit-"+f.suffix,"public-story-submit-key-"+f.suffix+"-0123456789");
 assert.equal(story.moderation_status,"pending");
 const duplicate=await services.createPublicMediaStory(f.requester,"service",f.listing.id,input,"public-story-retry-"+f.suffix,"public-story-submit-key-"+f.suffix+"-0123456789");
 assert.equal(duplicate.id,story.id,"retrying the same key returns the original story");assert.equal(duplicate.idempotent,true);
 await assert.rejects(services.createPublicMediaStory(f.requester,"service",f.listing.id,{...input,summary:"This is changed content for the same saved story key."},"public-story-key-conflict-"+f.suffix,"public-story-submit-key-"+f.suffix+"-0123456789"),e=>e.code==="IDEMPOTENCY_CONFLICT");
 assert.equal((await services.listPublicMediaStories("service",f.listing.id)).length,0,"pending story is never public");
 await assert.rejects(services.reviewPublicMediaStory(story.id,f.owner,{status:"approved"},"public-story-forbidden-review-"+f.suffix),e=>e.code==="FORBIDDEN");
 const approved=await services.reviewPublicMediaStory(story.id,f.moderator,{status:"approved"},"public-story-approve-"+f.suffix);
 assert.equal(approved.moderation_status,"approved");
 const published=await services.listPublicMediaStories("service",f.listing.id);
 assert.equal(published.length,1);
 assert.equal(published[0].evidence_status,"participant_reported");
 assert.equal(published[0].attribution_mode,"anonymous");
 assert.equal("author_user_id" in published[0],false,"public response does not disclose participant account ID");
 const own=await services.listMyPublicMediaStories(f.requester,"service",f.listing.id);
 assert.equal(own.length,1);
 const withdrawn=await services.withdrawPublicMediaStory(story.id,f.requester,"public-story-withdraw-"+f.suffix);
 assert.equal(withdrawn.moderation_status,"withdrawn");
 assert.equal((await services.listPublicMediaStories("service",f.listing.id)).length,0,"withdrawn consent immediately removes public visibility");
 const audit=(await f.db.query("select action from audit_log where resource_type='public_media_story' and resource_id=$1 order by created_at",[story.id])).rows.map(row=>row.action);
 assert.deepEqual(audit,["public_media_story.submitted","public_media_story.moderated","public_media_story.consent_withdrawn"]);
});

test("public video story rejects unsafe and non-approved video providers",async()=>{
 assert.throws(()=>services.normalizePublicVideoUrl("https://youtube.com.evil.example/watch?v=abc"),{code:"VALIDATION_ERROR"});
 assert.throws(()=>services.normalizePublicVideoUrl("http://youtube.com/watch?v=abc"),{code:"VALIDATION_ERROR"});
 assert.throws(()=>services.normalizePublicVideoUrl("https://user:password@vimeo.com/123"),{code:"VALIDATION_ERROR"});
});
