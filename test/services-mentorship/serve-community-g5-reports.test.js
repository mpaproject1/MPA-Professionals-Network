import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import * as membership from "../../src/membership/service.js";
import * as organizationJobs from "../../src/organization-jobs/service.js";
import {closePool,getPool} from "../../src/platform/db.js";
import * as services from "../../src/services-mentorship/service.js";
import {runImpactReport,toImpactExportData,MIN_GROUP_SIZE} from "../../src/platform/serve-community-impact-reports.js";
import {makePdf} from "../../src/platform/reports.js";

test.after(async()=>{await closePool();});
function identityInput(suffix){
 const digits=suffix.replace(/[^0-9]/g,"").slice(0,8).padEnd(8,"7");
 return {email:`serve-g5-${suffix}@example.test`,password:"ServeCommunityG5Password!2026",firstName:"Serve",lastName:`Gate${suffix.slice(0,8)}`,phone:`06${digits}`};
}
async function account(){
 const suffix=randomUUID().replaceAll("-","").slice(0,16);
 return (await membership.register(identityInput(suffix),`serve-community-g5-${suffix}`)).user.id;
}
async function setup(){
 const owner=await account(),suffix=randomUUID().replaceAll("-","").slice(0,12),db=getPool();
 const org=await organizationJobs.registerOrganization(owner,{legalName:`Serve Community G5 ${suffix}`,displayName:`Serve Community G5 ${suffix}`},`serve-g5-org-${suffix}`);
 await db.query("update organization set verification_status='verified',verified_at=now(),verified_by=$2,public_visible=true where id=$1",[org.id,owner]);
 const listing=await services.createServiceListing(owner,{organizationId:org.id,title:"Community impact reporting fixture",description:"A safe test listing for privacy-preserving impact reporting.",serviceCategory:"community",visibility:"public",pricingModel:"free",priceAmount:0,currency:"ETB",impactModel:"pro_bono"},`serve-g5-listing-${suffix}`,`serve-g5-listing-key-${suffix}-0123456789`);
 await db.query("update service_listing set moderation_status='approved',moderated_by=$2,moderated_at=now() where id=$1",[listing.id,owner]);
 await services.changeServiceListingStatus(listing.id,owner,"published",`serve-g5-publish-${suffix}`);
 return {owner,org,listing,db,suffix};
}

test("G5 database: listing owners can run aggregate reports; unrelated users cannot",async()=>{
 const {owner,listing,suffix}=await setup(),outsider=await account();
 const ownerIdentity={sub:owner,roles:[],permissions:[]};
 const report=await runImpactReport(ownerIdentity,listing.id,{},`serve-g5-report-${suffix}`);
 assert.equal(report.view,"owner");
 assert.equal(report.minimumGroupSize,MIN_GROUP_SIZE);
 const manager=await account();
 await (await import("../../src/platform/db.js")).getPool().query("insert into organization_membership(organization_id,user_id,role_code,status) values($1,$2,'project_manager','active')",[ (await (await import("../../src/services-mentorship/service.js")).getServiceListing(listing.id,owner)).organization_id, manager ]);
 const managed=await runImpactReport({sub:manager,roles:[],permissions:[]},listing.id,{},`serve-g5-manager-${suffix}`);
 assert.equal(managed.view,"owner","permitted organization managers can access their organization's listing report");
 await assert.rejects(runImpactReport({sub:outsider,roles:[],permissions:[]},listing.id,{},`serve-g5-denied-${suffix}`),e=>e.statusCode===403&&e.code==="IMPACT_REPORT_FORBIDDEN");
});

test("G5 database: small groups are suppressed and participant contact details never enter report output",async()=>{
 const {owner,listing,suffix}=await setup(),people=[];
 for(let i=0;i<4;i++)people.push(await account());
 for(let i=0;i<people.length;i++)await services.createServiceListingInterest(listing.id,people[i],{},`serve-g5-interest-${i}-${suffix}`);
 const identity={sub:owner,roles:[],permissions:[]};
 const small=await runImpactReport(identity,listing.id,{},`serve-g5-small-${suffix}`);
 assert.deepEqual(small.metrics.interested_users,{value:null,suppressed:true,minimumGroupSize:MIN_GROUP_SIZE});
 for(let i=4;i<5;i++){
  const person=await account();
  await services.createServiceListingInterest(listing.id,person,{},`serve-g5-interest-${i}-${suffix}`);
 }
 const large=await runImpactReport(identity,listing.id,{},`serve-g5-large-${suffix}`);
 assert.deepEqual(large.metrics.interested_users,{value:5,suppressed:false,minimumGroupSize:MIN_GROUP_SIZE});
 const serialized=JSON.stringify(large);
 for(const person of people)assert.equal(serialized.includes(person),false,"user IDs must not be present in reports");
 assert.equal(serialized.includes("@example.test"),false,"email addresses must not be present in reports");
 assert.equal(serialized.includes("06"),false,"phone-like personal data must not be present in reports");
 assert.equal("participants" in large,false,"report must not expose participant lists");
 assert.equal("rows" in large,false,"report must not expose raw records");
 const exportData=toImpactExportData(large,listing.id);
 const pdf=makePdf(exportData).toString("latin1");
 assert.equal(pdf.includes("@example.test"),false,"PDF export must not contain participant emails");
 for(const person of people)assert.equal(pdf.includes(person),false,"PDF export must not contain participant IDs");
 assert.ok(exportData.rows.every(row=>Object.keys(row).every(key=>!/(email|phone|address|contact|participant.?id|actor.?id)/i.test(key))),"export columns must exclude contact and identity fields");
 assert.ok(exportData.rows.every(row=>row.Suppressed==="Yes" ? row.Value==="Suppressed" : row.Value!=="Suppressed"),"suppressed groups must be labelled in exports");
});

test("G5 database: governance decision audit is separately permission-gated and aggregate-only",async()=>{
 const {owner,listing,suffix,db}=await setup();
 await db.query("insert into service_listing_lifecycle_event(listing_id,actor_user_id,from_status,to_status,reason,request_id) values($1,$2,'draft','pending_review','Governance audit fixture',$3)",[listing.id,owner,`serve-g5-decision-${suffix}`]);
 const ownerIdentity={sub:owner,roles:[],permissions:[]};
 await assert.rejects(runImpactReport(ownerIdentity,listing.id,{},`serve-g5-governance-denied-${suffix}`,"governance"),e=>e.statusCode===403&&e.code==="GOVERNANCE_REPORT_FORBIDDEN");
 const reviewer=await account();
 const governance=await runImpactReport({sub:reviewer,roles:["reviewer"],permissions:[]},listing.id,{},`serve-g5-governance-${suffix}`,"governance");
 assert.equal(governance.view,"governance");
 assert.ok(Array.isArray(governance.decisionAudit));
 assert.equal(JSON.stringify(governance).includes(owner),false,"governance report must not reveal decision actor IDs");
 assert.equal(JSON.stringify(governance).includes("Governance audit fixture"),false,"governance report must not expose free-text decision reasons");
});
