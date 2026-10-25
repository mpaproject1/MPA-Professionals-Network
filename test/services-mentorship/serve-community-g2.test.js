import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import * as membership from "../../src/membership/service.js";
import * as organizationJobs from "../../src/organization-jobs/service.js";
import {getPool} from "../../src/platform/db.js";
import * as services from "../../src/services-mentorship/service.js";

function identity(suffix){
 const digits=suffix.replace(/[^0-9]/g,"").slice(0,8).padEnd(8,"7");
 return {email:`serve-g2-${suffix}@example.test`,password:"ServeCommunityG2Password!2026",firstName:"Serve",lastName:`Gate${suffix.slice(0,8)}`,phone:`06${digits}`};
}
async function account(){const suffix=randomUUID().replaceAll("-","").slice(0,16);return (await membership.register(identity(suffix),`serve-community-g2-${suffix}`)).user.id;}
async function setupListing(){
 const owner=await account(), suffix=randomUUID().replaceAll("-","").slice(0,12);
 const org=await organizationJobs.registerOrganization(owner,{legalName:`Serve Community G2 ${suffix}`,displayName:`Serve Community G2 ${suffix}`},`serve-g2-org-${suffix}`);
 const db=getPool();
 await db.query("update organization set verification_status='verified',verified_at=now(),verified_by=$2,public_visible=true where id=$1",[org.id,owner]);
 const listing=await services.createServiceListing(owner,{organizationId:org.id,title:"Community legal support",description:"Pro-bono guidance for local community members.",serviceCategory:"legal",visibility:"public",pricingModel:"free"},`serve-g2-listing-${suffix}`,`serve-g2-listing-key-${suffix}-0123456789`);
 await db.query("update service_listing set moderation_status='approved',moderated_by=$2,moderated_at=now() where id=$1",[listing.id,owner]);
 const active=await services.changeServiceListingStatus(listing.id,owner,"published",`serve-g2-publish-${suffix}`);
 return {owner,org,listing:active,db,suffix};
}

test("G2 database: new listings have no expiry and lifecycle actions require an owner, reason and audit event",async()=>{
 const {owner,listing,db,suffix}=await setupListing();
 assert.equal(listing.expires_at,null,"new listings must remain permanent unless an expiry is explicitly selected");
 const outsider=await account();
 await assert.rejects(services.changeServiceListingStatus(listing.id,outsider,"fulfilled",`serve-g2-unauth-${suffix}`,"Program completed"),e=>e.code==="FORBIDDEN");
 await assert.rejects(services.changeServiceListingStatus(listing.id,owner,"fulfilled",`serve-g2-noreason-${suffix}`),e=>e.code==="LIFECYCLE_REASON_REQUIRED");
 const fulfilled=await services.changeServiceListingStatus(listing.id,owner,"fulfilled",`serve-g2-fulfil-${suffix}`,"Program objectives achieved");
 assert.equal(fulfilled.lifecycle_status,"fulfilled");
 assert.equal(fulfilled.expires_at,null);
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
});


test("G2 database: organization interest is persisted against the organization, not collapsed into the acting user",async()=>{
 const {listing,db,suffix}=await setupListing(), actor=await account(), orgOwner=await account();
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
});

test("G2 database: pledge is separate from interest/request and only the listing owner can decide it",async()=>{
 const {owner,listing,db,suffix}=await setupListing(), pledger=await account(), outsider=await account();
 const pledge=await services.createServiceListingPledge(listing.id,pledger,{description:"Offer ten volunteer hours"},`serve-g2-pledge-${suffix}`);
 assert.equal(pledge.status,"submitted");
 await assert.rejects(services.changeServiceListingPledgeStatus(pledge.id,outsider,"accepted","Approved",`serve-g2-pledge-unauth-${suffix}`),e=>e.code==="FORBIDDEN");
 const accepted=await services.changeServiceListingPledgeStatus(pledge.id,owner,"accepted","Capacity confirmed",`serve-g2-pledge-accept-${suffix}`);
 assert.equal(accepted.status,"accepted");
 const stored=(await db.query("select status,actor_user_id,individual_user_id,organization_id from service_listing_pledge where id=$1",[pledge.id])).rows[0];
 assert.equal(stored.status,"accepted");
 assert.equal(stored.actor_user_id,pledger);
 assert.equal(stored.individual_user_id,pledger);
 assert.equal(stored.organization_id,null);
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
});
