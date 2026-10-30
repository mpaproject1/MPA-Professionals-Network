import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("member job-interest requests require current active membership and account ownership",async()=>{
 const service=await readFile(new URL("../../src/platform/public-opportunity.js",import.meta.url),"utf8");
 assert.match(service,/u\.status='active'/);
 assert.match(service,/mr\.status='active'/);
 assert.match(service,/mr\.start_date<=current_date/);
 assert.match(service,/mr\.end_date is null or mr\.end_date>=current_date/);
 assert.match(service,/where i\.app_user_id=\$1 and i\.inquiry_type='job' and i\.job_id is null/);
 assert.match(service,/submission_idempotency_hash/);
 assert.match(service,/randomBytes\(32\)\.toString\("base64url"\)/);
 assert.match(service,/continuation_token_hash/);
 assert.match(service,/job_interest\.submitted/);
 assert.match(service,/where public_reference=\$1 and app_user_id=\$2 and inquiry_type='job' and job_id is null/);
 assert.doesNotMatch(service.slice(service.indexOf("function memberJobInterestPayload"),service.indexOf("export async function createMemberJobInterest")),/continuationToken/);
});

test("job-interest public token endpoints are closed while mentorship token intake remains separate",async()=>{
 const service=await readFile(new URL("../../src/platform/public-opportunity.js",import.meta.url),"utf8");
 assert.match(service,/if\(type==="job"&&!clean\(input\.jobId,100\)\) throw error\(403/);
 assert.match(service,/if\(r\.inquiry_type==="job"&&!r\.job_id\) throw error\(403/);
 assert.match(service,/inquiry_type<>'job'/);
});

test("member job-interest APIs authenticate and delegate to membership-guarded services",async()=>{
 const server=await readFile(new URL("../../server.js",import.meta.url),"utf8");
 for(const route of ["api/v1/me/job-interests","api/v1/me/job-interest-sharing-organizations"])assert.ok(server.includes(route));
 assert.match(server,/auth\(req\).*publicOpportunity\.listMyMemberJobInterests/s);
 assert.match(server,/auth\(req\).*publicOpportunity\.createMemberJobInterest/s);
 assert.match(server,/auth\(req\).*publicOpportunity\.getMyMemberJobInterest/s);
 assert.match(server,/auth\(req\).*publicOpportunity\.updateMyMemberJobInterestConsent/s);
});

test("member-facing job-interest page never requests or displays a continuation token",async()=>{
 const page=await readFile(new URL("../../web/app/jobs/interest/page.tsx",import.meta.url),"utf8");
 assert.match(page,/useUiStore\(s=>s\.token\)/);
 assert.match(page,/My job interests/);
 assert.match(page,/Check membership status or application/);
 assert.match(page,/MPA-JI/);
 assert.doesNotMatch(page,/continuationToken|Private continuation token|lookupToken/);
 assert.match(page,/api<Interest\[]>\("\/api\/v1\/me\/job-interests"/);
});

test("status decisions for member job interests require a hashed idempotency key and retain audit history",async()=>{
 const service=await readFile(new URL("../../src/platform/public-opportunity.js",import.meta.url),"utf8");
 const migration=await readFile(new URL("../../db/migrations/20261030130000_member_job_interest_access.sql",import.meta.url),"utf8");
 assert.match(service,/public_opportunity_inquiry_decision_idempotency/);
 assert.match(service,/public_opportunity\.inquiry_decision/);
 assert.match(service,/IDEMPOTENCY_KEY_REQUIRED/);
 const server=await readFile(new URL("../../server.js",import.meta.url),"utf8");
 assert.match(server,/decideInquiry\(parts\[3\],identity\.sub,b,requestId,req\.headers\["x-idempotency-key"\]\)/);
 assert.match(migration,/unique\(inquiry_id,actor_user_id,idempotency_key_hash\)/);
});
