import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";

import * as membership from "../../src/membership/service.js";
import * as organizationJobs from "../../src/organization-jobs/service.js";
import {closePool,getPool} from "../../src/platform/db.js";
import * as initiatives from "../../src/platform/serve-community-initiatives.js";
import * as services from "../../src/services-mentorship/service.js";

test.after(async()=>{await closePool()});
function identity(suffix){const digits=suffix.replace(/[^0-9a-f]/gi,"").slice(0,8).split("").map(character=>String(parseInt(character,16)%10)).join("");return {email:`serve-i7-${suffix}@example.test`,password:"ServeCommunityI7Password!2026",firstName:"Serve",lastName:`Initiative${suffix.slice(0,8)}`,phone:`06${digits}`}}
async function account(){const suffix=randomUUID().replaceAll("-","").slice(0,16);return (await membership.register(identity(suffix),`serve-community-i7-${suffix}`)).user.id}
async function activeAccount(){const userId=await account();await getPool().query("insert into membership_record(user_id,status,start_date,source) values($1,'active',current_date,'admin')",[userId]);return userId}
async function reviewer(){const userId=await account();await getPool().query("insert into app_user_role(user_id,role_id) select $1,id from app_role where role_code='serve_community_reviewer' on conflict do nothing",[userId]);return userId}
function initiativeInput(suffix){return {title:`Community skills initiative ${suffix}`,category:"education",summary:"A practical community learning programme led by volunteers.",description:"The programme coordinates volunteers to provide accessible learning support and practical skills sessions for local community groups.",deliveryMode:"hybrid",locationLabel:"Addis Ababa community hubs",capacity:2,eligibility:"Active members with relevant experience.",expectedCommitment:"Two sessions each month"}}

test("database lifecycle: independent approval is required before public discovery and owners cannot self-review",async()=>{
 const owner=await activeAccount(),moderator=await reviewer(),suffix=randomUUID().slice(0,8);
 const draft=await initiatives.createInitiative(owner,initiativeInput(suffix),`serve-i7-create-${suffix}`,`serve-i7-create-key-${suffix}-123456`);
 assert.equal(draft.status,"draft");
 const replay=await initiatives.createInitiative(owner,initiativeInput(suffix),`serve-i7-replay-${suffix}`,`serve-i7-create-key-${suffix}-123456`);
 assert.equal(replay.id,draft.id);assert.equal(replay.idempotent,true);
 await assert.rejects(initiatives.getPublicInitiative(draft.id),e=>e.code==="NOT_FOUND");
 const submitted=await initiatives.submitInitiative(draft.id,owner,`serve-i7-submit-${suffix}`);assert.equal(submitted.status,"submitted");
 await getPool().query("insert into app_user_role(user_id,role_id) select $1,id from app_role where role_code='serve_community_reviewer' on conflict do nothing",[owner]);
 await assert.rejects(initiatives.reviewInitiative(draft.id,owner,{decision:"approve",reason:"Self review must not be allowed."},`serve-i7-self-review-${suffix}`),e=>e.code==="SELF_REVIEW_FORBIDDEN");
 const queue=await initiatives.listReviewQueue(moderator,{limit:20});assert.ok(queue.items.some(x=>x.id===draft.id));
 await initiatives.reviewInitiative(draft.id,moderator,{decision:"start_review",reason:"Independent reviewer started the review."},`serve-i7-start-review-${suffix}`);
 const approved=await initiatives.reviewInitiative(draft.id,moderator,{decision:"approve",reason:"The public benefit and participation scope are clear."},`serve-i7-approve-${suffix}`);
 assert.equal(approved.status,"approved");
 await assert.rejects(initiatives.getPublicInitiative(draft.id),e=>e.code==="NOT_FOUND");
 const published=await initiatives.reviewInitiative(draft.id,moderator,{decision:"publish",reason:"Approved initiative is ready for public discovery."},`serve-i7-publish-${suffix}`);
 assert.equal(published.status,"published");
 const publicResult=await initiatives.listPublicInitiatives({category:"education",q:"skills initiative"});
 const projection=publicResult.items.find(x=>x.id===draft.id);assert.ok(projection);assert.equal(projection.title,draft.title);
 assert.equal("owner_user_id" in projection,false);assert.equal("created_by" in projection,false);assert.equal("participant_user_id" in projection,false);
});

test("database lifecycle: explicit consent, owner-only contact projection, capacity decisions and withdrawal",async()=>{
 const owner=await activeAccount(),moderator=await reviewer(),participant=await activeAccount(),outsider=await activeAccount(),suffix=randomUUID().slice(0,8);
 const draft=await initiatives.createInitiative(owner,initiativeInput(suffix),`serve-i7-p-create-${suffix}`,`serve-i7-p-key-${suffix}-123456`);
 await initiatives.submitInitiative(draft.id,owner,`serve-i7-p-submit-${suffix}`);
 await initiatives.reviewInitiative(draft.id,moderator,{decision:"approve",reason:"The programme is appropriate for the community."},`serve-i7-p-approve-${suffix}`);
 await initiatives.reviewInitiative(draft.id,moderator,{decision:"publish",reason:"The reviewed programme is ready to publish."},`serve-i7-p-publish-${suffix}`);
 const input={consent:true,contactConsent:true,consentVersion:initiatives.PARTICIPATION_CONSENT_VERSION,privacyNoticeVersion:initiatives.PARTICIPATION_PRIVACY_VERSION,applicationNote:"I can contribute digital learning experience.",availabilityNote:"Two evenings per month."};
 await assert.rejects(initiatives.applyToInitiative(draft.id,participant,{...input,contactConsent:false},`serve-i7-no-consent-${suffix}`,`serve-i7-no-consent-key-${suffix}-123456`),e=>e.code==="CONSENT_REQUIRED");
 const application=await initiatives.applyToInitiative(draft.id,participant,input,`serve-i7-apply-${suffix}`,`serve-i7-apply-key-${suffix}-123456`);
 const replay=await initiatives.applyToInitiative(draft.id,participant,input,`serve-i7-apply-retry-${suffix}`,`serve-i7-apply-key-${suffix}-123456`);
 assert.equal(replay.id,application.id);assert.equal(replay.idempotent,true);
 await assert.rejects(initiatives.listInitiativeParticipations(draft.id,outsider),e=>e.code==="INITIATIVE_OWNER_REQUIRED");
 const ownerView=await initiatives.listInitiativeParticipations(draft.id,owner);
 assert.equal(ownerView.items[0].applicant_email,(await getPool().query("select email from app_user where id=$1",[participant])).rows[0].email);
 assert.ok(ownerView.items[0].applicant_name);
 const accepted=await initiatives.decideParticipation(application.id,owner,{decision:"accepted",reason:"Your experience matches the programme's needs."},`serve-i7-accept-${suffix}`);
 assert.equal(accepted.status,"accepted");
 await assert.rejects(initiatives.decideParticipation(application.id,owner,{decision:"accepted",reason:"Duplicate acceptance attempt."},`serve-i7-accept-repeat-${suffix}`),e=>e.code==="INVALID_STATE");
 const withdrawn=await initiatives.withdrawParticipation(application.id,participant,"I can no longer participate and withdraw my consent.",`serve-i7-withdraw-${suffix}`);
 assert.equal(withdrawn.status,"withdrawn");
 const row=(await getPool().query("select status,contact_consent from serve_community_participation where id=$1",[application.id])).rows[0];
 assert.equal(row.contact_consent,false);
 const consentEvents=await getPool().query("select count(*)::int total,count(*) filter(where decision='withdrawn')::int withdrawn from serve_community_participation_consent_event where participation_id=$1",[application.id]);
 assert.equal(consentEvents.rows[0].total,5);
 assert.equal(consentEvents.rows[0].withdrawn,2);
 const ownerAfter=await initiatives.listInitiativeParticipations(draft.id,owner);
 assert.equal(ownerAfter.items[0].applicant_email,null);
 assert.equal((await initiatives.listMyParticipations(participant)).items[0].status,"withdrawn");
});

test("database lifecycle: owner-proposed legacy service classification requires independent approval and can be reversed",async()=>{
 const owner=await activeAccount(),moderator=await reviewer(),suffix=randomUUID().slice(0,8);
 const org=await organizationJobs.registerOrganization(owner,{legalName:`Serve I7 Legacy ${suffix}`,displayName:`Serve I7 Legacy ${suffix}`},`serve-i7-org-${suffix}`);
 await getPool().query("update organization set verification_status='verified',verified_at=now(),verified_by=$2,public_visible=true where id=$1",[org.id,owner]);
 const listing=await services.createServiceListing(owner,{organizationId:org.id,title:"Legacy community support service",description:"An existing listing proposed for individual community benefit review.",serviceCategory:"legal",visibility:"public",pricingModel:"free",priceAmount:0,currency:"ETB",impactModel:"standard"},`serve-i7-listing-${suffix}`,`serve-i7-listing-key-${suffix}-123456`);
 const initiative=await initiatives.createInitiative(owner,initiativeInput(suffix),`serve-i7-legacy-create-${suffix}`,`serve-i7-legacy-key-${suffix}-123456`);
 await getPool().query("insert into app_user_role(user_id,role_id) select $1,id from app_role where role_code='serve_community_reviewer' on conflict do nothing",[owner]);
 const proposal=await initiatives.proposeLegacyClassification(owner,listing.id,initiative.id,"Owner proposes a separate initiative after reviewing the legacy service purpose.",`serve-i7-classify-${suffix}`);
 assert.equal(proposal.status,"proposed");
 await assert.rejects(initiatives.reviewLegacyClassification(proposal.id,owner,{decision:"approve",reason:"Owner cannot approve own proposal."},`serve-i7-classify-self-${suffix}`),e=>e.code==="SELF_REVIEW_FORBIDDEN");
 const approved=await initiatives.reviewLegacyClassification(proposal.id,moderator,{decision:"approve",reason:"The initiative is separately described and the legacy mapping is justified."},`serve-i7-classify-approve-${suffix}`);
 assert.equal(approved.status,"approved");
 const reversed=await initiatives.reviewLegacyClassification(proposal.id,moderator,{decision:"reverse",reason:"Reversing the mapping after a governance review."},`serve-i7-classify-reverse-${suffix}`);
 assert.equal(reversed.status,"reversed");
 const unchanged=(await getPool().query("select title,visibility from service_listing where id=$1",[listing.id])).rows[0];
 assert.equal(unchanged.title,"Legacy community support service");assert.equal(unchanged.visibility,"public");
});
