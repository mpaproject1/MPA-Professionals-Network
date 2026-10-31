import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");
const [migration,service,server,staffPage,publicPage,about,compatibility]=await Promise.all([
 read("../../db/migrations/20261031140000_serve_community_offline_completed_projects.sql"),
 read("../../src/platform/serve-community-offline-projects.js"),
 read("../../server.js"),
 read("../../web/app/admin/serve-community/offline-projects/page.tsx"),
 read("../../web/app/serve-community/page.tsx"),
 read("../../web/app/about/page.tsx"),
 read("../../scripts/check-new-migration-compatibility.js")
]);
test("offline project storage is additive and distinct from platform participation",()=>{
 assert.match(migration,/create table if not exists serve_community_offline_project/i);
 assert.match(migration,/create table if not exists serve_community_offline_project_event/i);
 assert.match(migration,/offline_source text not null default 'offline'/i);
 assert.doesNotMatch(migration,/insert into serve_community_initiative|insert into serve_community_participation|update serve_community_initiative|delete from serve_community_participation/i);
 assert.match(migration,/beneficiary_count_method/);assert.match(migration,/beneficiary_count_evidence/);
 assert.match(migration,/trg_sc_offline_project_event_immutable/);
 assert.match(compatibility,/20261031140000_serve_community_offline_completed_projects\.sql/);
});
test("staff entry and approval authority are separate and self-approval is blocked",()=>{
 assert.match(service,/supporting_staff/);assert.match(service,/serve_community\.projects\.manage/);
 assert.match(service,/serve_community\.projects\.approve/);assert.match(service,/SELF_REVIEW_FORBIDDEN/);
 assert.match(service,/row\.created_by===userId/);
 assert.match(service,/status='submitted'/);assert.match(service,/status='approved'/);
});
test("offline project claims require definitions, methodology and evidence",()=>{
 assert.match(service,/beneficiaryDefinition/);assert.match(service,/beneficiaryCountMethod/);assert.match(service,/beneficiaryCountEvidence/);
 assert.match(service,/outcomeMetrics/);assert.match(service,/Measurement method/);assert.match(service,/Evidence summary/);
 assert.match(service,/Outcome values must be numeric/);
});
test("media links require HTTPS, bounded counts, approved video hosts and matching image descriptions",()=>{
 assert.match(service,/u\.protocol!=="https:"/);assert.match(service,/UNSUPPORTED_VIDEO_HOST/);
 assert.match(service,/listUrls\(input\.imageUrls,"image",8\)/);assert.match(service,/listUrls\(input\.videoUrls,"video",3\)/);
 assert.match(service,/alt\\.length!==imageUrls\\.length/);assert.match(service,/consent_confirmed/);
 assert.match(staffPage,/consentConfirmed/);assert.match(staffPage,/imageAltText/);assert.match(staffPage,/YouTube\/Vimeo/);
});
test("public projection excludes internal evidence summaries and staff-only metadata",()=>{
 const fn=service.slice(service.indexOf("export async function listPublicOfflineProjects"));
 assert.match(fn,/status='approved' and public_visible=true/);
 assert.match(fn,/map\(\(\{label,value,unit\}\)=>\(\{label,value,unit\}\)\)/);
 assert.doesNotMatch(fn,/beneficiaryCountEvidence|beneficiary_count_evidence|methodology:r/);
 assert.match(fn,/source:"offline_staff_record"/);
});
test("API exposes staff draft, update, submit, independent review and unified public feed",()=>{
 for(const route of ["api/v1/admin/serve-community/offline-projects","api/v1/public/serve-community/completed-projects"])assert.ok(server.includes(route));
 assert.match(server,/createStaffProject/);assert.match(server,/updateStaffProject\(parts\[5\]/);
 assert.match(server,/submitStaffProject\(parts\[5\]/);assert.match(server,/reviewStaffProject\(parts\[5\]/);
 assert.match(server,/listPublicOfflineProjects/);assert.match(server,/listPublicCompletedProjects/);
});
test("staff UI defines required project, outcome, evidence and public-media fields",()=>{
 for(const field of ["title","category","summary","publicStory","completionDate","locationLabel","deliveryMode","activitySummary","outputSummary","beneficiaryCount","beneficiaryCountMethod","beneficiaryCountEvidence","outcomeMetrics","imageUrls","videoUrls","consentNote"])assert.ok(staffPage.includes(field),field);
 assert.match(staffPage,/Save as private draft/);assert.match(staffPage,/Submit for review/);assert.match(staffPage,/Approve & publish/);
});
test("About and Serve-Community display approved offline stories and media without treating them as member participation",()=>{
 assert.match(publicPage,/imageUrls\?\.length/);assert.match(publicPage,/videoUrls\?\.length/);assert.match(publicPage,/beneficiaryCount/);
 assert.match(about,/project\.imageUrls\?\.length/);assert.match(about,/project\.videoUrls\?\.length/);assert.match(about,/project\.beneficiaryCount/);
});
