import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import * as membership from "../../src/membership/service.js";
import * as businessDiscovery from "../../src/network-plus/business-discovery.js";
import * as requestCollaboration from "../../src/network-plus/request-collaboration.js";
import { closePool, getPool } from "../../src/platform/db.js";

function accountInput(label){
 const suffix=randomUUID(),digits=suffix.replace(/\D/g,"").slice(0,8).padEnd(8,"7");
 return {email:"np-opportunity-"+label+"-"+suffix+"@example.test",password:"NetworkPlusOpportunityPassword!2026",firstName:"Network",lastName:"Opportunity"+label,phone:"09"+digits,accountType:"professional"};
}
async function register(label){return membership.register(accountInput(label),"np-opportunity-register-"+label+"-"+randomUUID());}
async function setMembership(userId){
 const db=getPool(),product=(await db.query("select id from membership_product where product_code='BASIC'")).rows[0];assert.ok(product);
 await db.query("insert into membership_record(user_id,membership_product_id,membership_number,status,start_date,end_date,source) values($1,$2,$3,'active',current_date,current_date+365,'online')",[userId,product.id,"MPA-NPO-"+randomUUID().slice(0,12).toUpperCase()]);
}
test("Needs and Offers persist guided drafts, validate taxonomy, moderate listings and expose only approved discovery profiles",async t=>{
 if(!process.env.DATABASE_URL){t.skip("requires the disposable PostgreSQL database configured by PR Quality");return;}
 const db=getPool(),suffix=randomUUID().replace(/-/g,"");
 const owner=await register("owner-"+suffix),reviewer=await register("moderator-"+suffix),outsider=await register("outsider-"+suffix);
 await Promise.all([setMembership(owner.user.id),setMembership(reviewer.user.id),setMembership(outsider.user.id)]);
 const role=(await db.query("select id from app_role where role_code='business_moderator'")).rows[0];assert.ok(role,"Phase 1 migration must register the independent listing moderator role");
 await db.query("insert into app_user_role(user_id,role_id) values($1,$2) on conflict do nothing",[reviewer.user.id,role.id]);
 const business=(await db.query("insert into network_plus_business(business_kind,display_name,description,verification_status,moderation_status,publication_status,verified_at,verified_by,created_by) values('individual',$1,$2,'verified','approved','published',now(),$3,$3) returning id",["Phase 1 Test Business "+suffix.slice(0,8),"A verified synthetic business for the Network-Plus opportunity directory integration test.",owner.user.id])).rows[0];
 await db.query("insert into network_plus_business_ownership(business_id,owner_type,owner_user_id,owner_role,consent_status,status,consented_at,created_by) values($1,'member',$2,'primary_owner','accepted','active',now(),$2)",[business.id,owner.user.id]);

 const taxonomy=await businessDiscovery.listNetworkPlusListingTaxonomy(owner.user.id);
 assert.ok(taxonomy.some(row=>row.code==="technology"&&row.listing_kinds.includes("offer")));
 assert.ok(taxonomy.some(row=>row.code==="software_development"&&row.parent_code==="technology"));
 const key=randomUUID()+randomUUID(),initial={listingKind:"offer",wizardStep:1};
 const draft=await businessDiscovery.createOpportunityListingDraft(business.id,owner.user.id,initial,"np-create-"+suffix,key);
 assert.equal(draft.status,"draft");assert.equal(draft.listing_kind,"offer");assert.equal(draft.wizard_step,1);
 const replay=await businessDiscovery.createOpportunityListingDraft(business.id,owner.user.id,initial,"np-create-replay-"+suffix,key);
 assert.equal(replay.id,draft.id);assert.equal(replay.idempotent,true);
 await assert.rejects(()=>businessDiscovery.createOpportunityListingDraft(business.id,owner.user.id,{...initial,listingKind:"need"},"np-create-conflict-"+suffix,key),e=>e.code==="IDEMPOTENCY_CONFLICT");

 const base={listingKind:"offer",categoryCode:"technology",subcategoryCode:"software_development",title:"Verified data engineering capacity",summary:"Experienced team available for structured data engineering work.",description:"A synthetic offer describing data pipeline design, implementation and support for organizations seeking reliable analytics foundations.",wizardStep:4,audience:"both",deliveryMode:"hybrid",locationLabel:"Addis Ababa",structuredAttributes:{},pricingModel:"quote"};
 await businessDiscovery.saveOpportunityListingDraft(draft.id,owner.user.id,base,"np-autosave-"+suffix);
 const persisted=(await db.query("select wizard_step,title,subcategory_code,structured_attributes,draft_saved_at,status from network_plus_service_listing where id=$1",[draft.id])).rows[0];
 assert.equal(persisted.wizard_step,4);assert.equal(persisted.title,base.title);assert.equal(persisted.subcategory_code,"software_development");assert.ok(persisted.draft_saved_at);assert.equal(persisted.status,"draft");
 await assert.rejects(()=>businessDiscovery.submitProfessionalServiceListing(draft.id,owner.user.id,"np-incomplete-"+suffix),e=>e.code==="LISTING_CATEGORY_FIELD_REQUIRED");
 await assert.rejects(()=>businessDiscovery.saveOpportunityListingDraft(draft.id,outsider.user.id,{title:"Unauthorized edit"},"np-outsider-"+suffix),e=>e.code==="BUSINESS_FORBIDDEN");
 await businessDiscovery.saveOpportunityListingDraft(draft.id,owner.user.id,{structuredAttributes:{technology_area:["data"],platform:["web"]},wizardStep:7},"np-complete-"+suffix);
 const submitted=await businessDiscovery.submitProfessionalServiceListing(draft.id,owner.user.id,"np-submit-"+suffix);
 assert.equal(submitted.status,"pending_review");
 const published=await businessDiscovery.moderateProfessionalServiceListing(draft.id,reviewer.user.id,{status:"published",reason:"Taxonomy and business evidence reviewed."},"np-moderate-"+suffix);
 assert.equal(published.status,"published");
 const found=await businessDiscovery.listProfessionalServices(owner.user.id,{q:"data engineering",category:"technology",subcategory:"software_development",listingKind:"offer",location:"Addis Ababa"});
 assert.ok(found.items.some(row=>row.id===draft.id));
 const detail=await businessDiscovery.getProfessionalService(draft.id,owner.user.id);
 assert.equal(detail.listing_kind,"offer");assert.equal(detail.structured_attributes.platform[0],"web");

 await businessDiscovery.saveOpportunityListingDraft(draft.id,owner.user.id,{summary:"Updated offer summary after the first public review, with new availability." ,wizardStep:3},"np-edit-published-"+suffix);
 const edited=(await db.query("select status from network_plus_service_listing where id=$1",[draft.id])).rows[0];
 assert.equal(edited.status,"draft","editing a published listing returns it to private draft and requires another review");
 await assert.rejects(()=>businessDiscovery.getProfessionalService(draft.id,owner.user.id),e=>e.code==="NOT_FOUND");

 const productKey=randomUUID()+randomUUID();
 const product=await businessDiscovery.createOpportunityListingDraft(business.id,owner.user.id,{listingKind:"product_profile",wizardStep:1},"np-product-"+suffix,productKey);
 await businessDiscovery.saveOpportunityListingDraft(product.id,owner.user.id,{listingKind:"product_profile",categoryCode:"products_supply",title:"Locally manufactured irrigation pump",summary:"Discovery profile for irrigation equipment and supply capabilities.",description:"Product profile only. Buyers can discover the equipment and initiate a separate connection; the platform does not process orders, payments or delivery.",structuredAttributes:{product_type:"equipment",unit:"piece"},remoteAvailable:true,wizardStep:7},"np-product-save-"+suffix);
 await businessDiscovery.submitProfessionalServiceListing(product.id,owner.user.id,"np-product-submit-"+suffix);
 await businessDiscovery.moderateProfessionalServiceListing(product.id,reviewer.user.id,{status:"published",reason:"Product discovery profile reviewed and approved."},"np-product-review-"+suffix);
 const catalog=await businessDiscovery.listProfessionalServices(owner.user.id,{listingKind:"product_profile",category:"products_supply"});
 assert.ok(catalog.items.some(row=>row.id===product.id));
 assert.equal(catalog.items.find(row=>row.id===product.id).listing_kind,"product_profile");
 await assert.rejects(()=>requestCollaboration.createNetworkPlusRequest(outsider.user.id,{intent:"service_request",recipientUserId:owner.user.id,serviceListingId:product.id,subject:"Order irrigation equipment",summary:"Attempt to turn a discovery profile into a product order.",details:{},terms:{scope:"Supply irrigation pumps",deliverables:["Deliver ten pumps"],pricing:{proposal:"Fixed quotation requested"},schedule:{requested:"To be agreed"}}},"np-product-order-"+suffix,randomUUID()+randomUUID()),e=>e.code==="PRODUCT_PROFILE_DISCOVERY_ONLY");
 const inquiry=await requestCollaboration.createNetworkPlusRequest(outsider.user.id,{intent:"supplier_inquiry",recipientUserId:owner.user.id,serviceListingId:product.id,subject:"Question about irrigation pump",summary:"Please share the available pump specifications and supply capacity.",details:{question:"Which models are currently available?"},terms:{}},"np-product-inquiry-"+suffix,randomUUID()+randomUUID());
 assert.ok(inquiry.id,"product discovery supports a supplier inquiry connection, not a checkout or order");


 await businessDiscovery.changeProfessionalServiceStatus(product.id,owner.user.id,"paused","Owner temporarily pauses the catalog profile","np-product-pause-"+suffix);
 assert.ok(!(await businessDiscovery.listProfessionalServices(owner.user.id,{listingKind:"product_profile"})).items.some(row=>row.id===product.id));
 await businessDiscovery.changeProfessionalServiceStatus(product.id,owner.user.id,"archived","Owner closes the product discovery profile","np-product-close-"+suffix);
 assert.equal((await db.query("select status from network_plus_service_listing where id=$1",[product.id])).rows[0].status,"archived");
});
after(async()=>{await closePool();});
