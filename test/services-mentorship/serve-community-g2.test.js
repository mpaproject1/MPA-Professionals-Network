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
 return {email:`serve-g2-${suffix}@example.test`,password:"ServeCommunityG2Password!2026",firstName:"Serve",lastName:`Gate${suffix.slice(0,8)}`,phone:`06${digits}`};
}
async function account(){const suffix=randomUUID().replaceAll("-","").slice(0,16);return (await membership.register(identity(suffix),`serve-community-g2-${suffix}`)).user.id;}
async function setupListing({approved=true,impactModel="standard",pricingModel="free",priceAmount=0,referencePriceAmount=null}={}){
 const owner=await account(), suffix=randomUUID().replaceAll("-","").slice(0,12);
 const org=await organizationJobs.registerOrganization(owner,{legalName:`Serve Community G2 ${suffix}`,displayName:`Serve Community G2 ${suffix}`},`serve-g2-org-${suffix}`);
 const db=getPool();
 await db.query("update organization set verification_status='verified',verified_at=now(),verified_by=$2,public_visible=true where id=$1",[org.id,owner]);
 const listing=await services.createServiceListing(owner,{organizationId:org.id,title:"Community legal support",description:"Pro-bono guidance for local community members.",serviceCategory:"legal",visibility:"public",pricingModel,priceAmount,currency:"ETB",impactModel,referencePriceAmount},`serve-g2-listing-${suffix}`,`serve-g2-listing-key-${suffix}-0123456789`);
 if(approved) await db.query("update service_listing set moderation_status='approved',moderated_by=$2,moderated_at=now() where id=$1",[listing.id,owner]);
 const active=approved?await services.changeServiceListingStatus(listing.id,owner,"published",`serve-g2-publish-${suffix}`):listing;
 return {owner,org,listing:active,db,suffix};
}

test("G3 database: announcements require owner authorization, moderation and idempotent creation",async()=>{
 const {owner,listing,db,suffix}=await setupListing(), outsider=await account();
 const key=`serve-g3-announcement-key-${suffix}-0123456789`;
 const input={audience:"public",title:"Community program update",body:"The program schedule is being coordinated with participating community members."};
 const announcement=await services.createServiceListingAnnouncement(listing.id,owner,input,`serve-g3-announcement-${suffix}`,key);
 assert.equal(announcement.status,"draft");
 const replay=await services.createServiceListingAnnouncement(listing.id,owner,input,`serve-g3-announcement-retry-${suffix}`,key);
 assert.equal(replay.id,announcement.id);
 assert.equal(replay.idempotent,true);
 assert.equal((await services.listServiceListingAnnouncements(listing.id,null)).some(row=>row.id===announcement.id),false,"draft announcements are not publicly visible");
 await assert.rejects(services.changeServiceListingAnnouncementStatus(announcement.id,outsider,"published","Publish this announcement",`serve-g3-announcement-unauth-${suffix}`),e=>e.code==="FORBIDDEN");
 const submitted=await services.changeServiceListingAnnouncementStatus(announcement.id,owner,"pending_review","Submit for moderation",`serve-g3-announcement-submit-${suffix}`);
 assert.equal(submitted.status,"pending_review");
 await assert.rejects(services.changeServiceListingAnnouncementStatus(announcement.id,owner,"published","Owner cannot self-publish",`serve-g3-announcement-self-publish-${suffix}`),e=>e.code==="FORBIDDEN");
 assert.equal((await services.listServiceListingAnnouncements(listing.id,null)).some(row=>row.id===announcement.id),false,"pending announcements are not publicly visible");
 const audit=(await db.query("select 1 from audit_log where resource_type='service_listing_announcement' and resource_id=$1",[announcement.id])).rowCount;
 assert.ok(audit>=2,"announcement creation and submission are auditable");
});

test("G3 database: impact badges require persisted pricing evidence and metrics use eligible records",async()=>{
 const proBono=await setupListing({impactModel:"pro_bono"});
 assert.equal(proBono.listing.impact_model,"pro_bono");
 assert.equal(Number(proBono.listing.price_amount),0);
 const discounted=await setupListing({impactModel:"community_discount",pricingModel:"fixed",priceAmount:75,referencePriceAmount:100});
 assert.equal(discounted.listing.impact_model,"community_discount");
 assert.equal(Number(discounted.listing.reference_price_amount),100);
 assert.equal(Number(discounted.listing.price_amount),75);
 await assert.rejects(services.createServiceListing(discounted.owner,{organizationId:discounted.org.id,title:"Invalid discount evidence",description:"This offer deliberately has an invalid reference price.",serviceCategory:"legal",visibility:"public",pricingModel:"fixed",priceAmount:75,currency:"ETB",impactModel:"community_discount",referencePriceAmount:50},`serve-g3-invalid-${discounted.suffix}`,`serve-g3-invalid-key-${discounted.suffix}-0123456789`),e=>e.code==="INVALID_IMPACT_PRICING");
 const read=await services.getServiceListing(discounted.listing.id,null);
 assert.equal(read.organizations_interested,0);
 assert.equal(read.users_interested,0);
 assert.equal(read.users_pledged,0);
 assert.equal(read.agreed_services,0);
 assert.equal(read.active_deliveries,0);
 assert.equal(read.verified_outcomes,0);
});
 
test("G2 database: moderation submission retries do not duplicate lifecycle events",async()=>{
 const {owner,listing,db,suffix}=await setupListing({approved:false});
 const submitted=await services.changeServiceListingStatus(listing.id,owner,"published",`serve-g2-submit-${suffix}`);
 assert.equal(submitted.lifecycle_status,"pending_review");
 const retry=await services.changeServiceListingStatus(listing.id,owner,"published",`serve-g2-submit-retry-${suffix}`);
 assert.equal(retry.idempotent,true);
 const events=(await db.query("select id from service_listing_lifecycle_event where listing_id=$1 and to_status='pending_review'",[listing.id])).rows;
 assert.equal(events.length,1);
});

test("G2 database: new listings have no expiry and lifecycle actions require an owner, reason and audit event",async()=>{
 const {owner,listing,db,suffix}=await setupListing();
 assert.equal(listing.expires_at,null,"new listings must remain permanent unless an expiry is explicitly selected");
 const outsider=await account();
 await assert.rejects(services.changeServiceListingStatus(listing.id,outsider,"fulfilled",`serve-g2-unauth-${suffix}`,"Program completed"),e=>e.statusCode===403);
 await assert.rejects(services.changeServiceListingStatus(listing.id,owner,"fulfilled",`serve-g2-noreason-${suffix}`),e=>e.code==="LIFECYCLE_REASON_REQUIRED");
 const fulfilled=await services.changeServiceListingStatus(listing.id,owner,"fulfilled",`serve-g2-fulfil-${suffix}`,"Program objectives achieved");
 assert.equal(fulfilled.lifecycle_status,"fulfilled");
 assert.equal(fulfilled.expires_at,null);
 const retry=await services.changeServiceListingStatus(listing.id,owner,"fulfilled",`serve-g2-fulfil-retry-${suffix}`);
 assert.equal(retry.idempotent,true,"retrying the same lifecycle action must not create a second transition");
 await assert.rejects(services.changeServiceListingStatus(listing.id,owner,"published",`serve-g2-reopen-${suffix}`),e=>e.code==="INVALID_STATE");
 const event=(await db.query("select from_status,to_status,reason,actor_user_id from service_listing_lifecycle_event where listing_id=$1 order by created_at desc limit 1",[listing.id])).rows[0];
 assert.equal(event.to_status,"fulfilled");
 assert.equal(event.reason,"Program objectives achieved");
 assert.equal(event.actor_user_id,owner);
 await assert.rejects(services.createServiceListingInterest(listing.id,outsider,{},`serve-g2-closed-interest-${suffix}`),e=>e.code==="LISTING_NOT_ACTIVE");
});

test("G2 database: concurrent duplicate interest creates one active record; withdrawal preserves history and permits re-expression",async()=>{
 const {listing,db,suffix}=await setupListing(), person=await account();
 const results=await Promise.all([
  services.createServiceListingInterest(listing.id,person,{},`serve-g2-interest-a-${suffix}`),
  services.createServiceListingInterest(listing.id,person,{},`serve-g2-interest-b-${suffix}`)
 ]);
 assert.equal(results.filter(x=>x.idempotent).length,1);
 let rows=(await db.query("select * from service_listing_interest where listing_id=$1 and individual_user_id=$2 order by created_at",[listing.id,person])).rows;
 assert.equal(rows.filter(x=>x.status==="interested").length,1);
 await services.withdrawServiceListingInterest(rows.find(x=>x.status==="interested").id,person,"No longer available",`serve-g2-withdraw-${suffix}`);
 const repeated=await services.createServiceListingInterest(listing.id,person,{},`serve-g2-interest-c-${suffix}`);
 assert.equal(repeated.status,"interested");
 rows=(await db.query("select status from service_listing_interest where listing_id=$1 and individual_user_id=$2",[listing.id,person])).rows;
 assert.equal(rows.length,2,"withdrawn interest remains as history");
 assert.equal(rows.filter(x=>x.status==="interested").length,1);
 const listingOwner=(await db.query("select provider_user_id from service_listing where id=$1",[listing.id])).rows[0].provider_user_id;
 const summary=await services.listMyServiceListingInterestSummary(listingOwner);
 assert.equal(summary.find(x=>x.listing_id===listing.id).individual_interest_count,1);
 const metrics=await services.getServiceListing(listing.id,null);
 assert.equal(metrics.users_interested,1);
 assert.equal(metrics.agreed_services,0);
 assert.equal(metrics.active_deliveries,0);
 await services.getServiceListing(listing.id,null);
 assert.equal((await services.getServiceListing(listing.id,null)).users_interested,1,"anonymous/public reads do not increment interest");
});


test("G2 database: organization interest is persisted against the organization, not collapsed into the acting user",async()=>{
 const {listing,db,suffix}=await setupListing(), orgOwner=await account();
 const actor=orgOwner;
 const org=await organizationJobs.registerOrganization(orgOwner,{legalName:`Interest Organization ${suffix}`,displayName:`Interest Organization ${suffix}`},`serve-g2-interest-org-${suffix}`);
 await db.query("update organization set verification_status='verified',verified_at=now(),verified_by=$2,public_visible=true where id=$1",[org.id,orgOwner]);
 const results=await Promise.all([
  services.createServiceListingInterest(listing.id,actor,{organizationId:org.id},`serve-g2-org-interest-a-${suffix}`),
  services.createServiceListingInterest(listing.id,actor,{organizationId:org.id},`serve-g2-org-interest-b-${suffix}`)
 ]);
 assert.equal(results.filter(x=>x.idempotent).length,1);
 const stored=(await db.query("select individual_user_id,organization_id,actor_user_id,status from service_listing_interest where listing_id=$1 and organization_id=$2 and status='interested'",[listing.id,org.id])).rows;
 assert.equal(stored.length,1);
 assert.equal(stored[0].individual_user_id,null);
 assert.equal(stored[0].organization_id,org.id);
 assert.equal(stored[0].actor_user_id,actor);
 const listingOwner=(await db.query("select provider_user_id from service_listing where id=$1",[listing.id])).rows[0].provider_user_id;
 const summary=await services.listMyServiceListingInterestSummary(listingOwner);
 assert.equal(summary.find(x=>x.listing_id===listing.id).organization_interest_count,1);
 assert.equal((await services.getServiceListing(listing.id,null)).organizations_interested,1);
});

test("G2 database: pledge is separate from interest/request and only the listing owner can decide it",async()=>{
 const {owner,listing,db,suffix}=await setupListing(), pledger=await account(), outsider=await account();
 const pledgeKey=`serve-g2-pledge-key-${suffix}-0123456789`;
 const pledge=await services.createServiceListingPledge(listing.id,pledger,{description:"Offer ten volunteer hours"},`serve-g2-pledge-${suffix}`,pledgeKey);
 assert.equal(pledge.status,"submitted");
 const retry=await services.createServiceListingPledge(listing.id,pledger,{description:"Offer ten volunteer hours"},`serve-g2-pledge-retry-${suffix}`,pledgeKey);
 assert.equal(retry.idempotent,true,"same key and payload must replay the original pledge");
 assert.equal(retry.id,pledge.id);
 await assert.rejects(services.changeServiceListingPledgeStatus(pledge.id,outsider,"accepted","Approved",`serve-g2-pledge-unauth-${suffix}`),e=>e.code==="FORBIDDEN");
 const accepted=await services.changeServiceListingPledgeStatus(pledge.id,owner,"accepted","Capacity confirmed",`serve-g2-pledge-accept-${suffix}`);
 assert.equal(accepted.status,"accepted");
 const stored=(await db.query("select status,actor_user_id,individual_user_id,organization_id from service_listing_pledge where id=$1",[pledge.id])).rows[0];
 assert.equal(stored.status,"accepted");
 assert.equal(stored.actor_user_id,pledger);
 assert.equal(stored.individual_user_id,pledger);
 assert.equal(stored.organization_id,null);
 const queue=await services.listMyServiceListingPledges(owner);
 assert.ok(queue.some(x=>x.id===pledge.id),"authorized listing owner can retrieve the pledge for review");
 assert.equal((await services.getServiceListing(listing.id,null)).users_pledged,1,"pledges count separately from interest and requests");
});

test("G2 database: provider acceptance is not enough to start delivery; requester must accept the same terms version",async()=>{
 const {owner,listing,db,suffix}=await setupListing(), requester=await account();
 const request=await services.requestService(listing.id,requester,{message:"Please help with the listed service.",scope:"Initial consultation"},`serve-g2-request-${suffix}`,`serve-g2-request-key-${suffix}-0123456789`);
 const accepted=await services.changeServiceRequestStatus(request.id,owner,"accepted","Provider accepts the proposed scope",`serve-g2-accept-${suffix}`);
 assert.equal(accepted.status,"accepted");
 await assert.rejects(services.changeServiceRequestStatus(request.id,owner,"in_progress","Start",`serve-g2-start-too-soon-${suffix}`),e=>e.code==="AGREEMENT_REQUIRED");
 const terms=(await db.query("select terms_version,terms_hash,provider_accepted_at,requester_accepted_at from service_request_agreement where request_id=$1",[request.id])).rows[0];
 assert.equal(terms.terms_version,1);
 assert.ok(terms.terms_hash);
 assert.ok(terms.provider_accepted_at);
 assert.equal(terms.requester_accepted_at,null);
 await services.acceptServiceAgreement(request.id,requester,`serve-g2-agreement-${suffix}`);
 const started=await services.changeServiceRequestStatus(request.id,owner,"in_progress","Delivery starts after agreement",`serve-g2-start-${suffix}`);
 assert.equal(started.status,"in_progress");
 const agreement=(await db.query("select provider_accepted_by,requester_accepted_by,provider_accepted_at,requester_accepted_at from service_request_agreement where request_id=$1",[request.id])).rows[0];
 assert.equal(agreement.provider_accepted_by,owner);
 assert.equal(agreement.requester_accepted_by,requester);
 assert.ok(agreement.provider_accepted_at);
 assert.ok(agreement.requester_accepted_at);
 const metrics=await services.getServiceListing(listing.id,null);
 assert.equal(metrics.agreed_services,1);
 assert.equal(metrics.active_deliveries,1);
});
