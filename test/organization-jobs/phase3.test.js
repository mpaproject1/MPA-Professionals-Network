import assert from "node:assert/strict";
import test from "node:test";
import {
  allowedApplicationTransition,
  allowedCandidateResponse,
  canCandidateAcceptOffer,
  ELIGIBILITY_RULES,
  isAllowedJobPostingScope,
  isEligibleVerifiedClaimForJobs,
  JOB_POSTING_SCOPES
} from "../../src/organization-jobs/service.js";

test("phase 3 eligibility engine exposes controlled rule vocabulary",()=>{
  assert.equal(ELIGIBILITY_RULES.includes("membership_active"),true);
  assert.equal(ELIGIBILITY_RULES.includes("professional_verified"),true);
  assert.equal(ELIGIBILITY_RULES.includes("years_experience"),true);
  assert.equal(ELIGIBILITY_RULES.includes("unknown_rule"),false);
});

test("candidate workflow follows contracted progression",()=>{
  assert.equal(allowedApplicationTransition("submitted","screening"),true);
  assert.equal(allowedApplicationTransition("screening","shortlisted"),true);
  assert.equal(allowedApplicationTransition("shortlisted","interview"),true);
  assert.equal(allowedApplicationTransition("interview","offer"),true);
  assert.equal(allowedApplicationTransition("offer","accepted"),true);
  assert.equal(allowedApplicationTransition("accepted","hired"),true);
  assert.equal(allowedApplicationTransition("submitted","hired"),false);
  assert.equal(allowedApplicationTransition("rejected","screening"),false);
});

test("candidate owns offer acceptance and withdrawal decisions",()=>{
  assert.equal(allowedCandidateResponse("offer","accepted"),true);
  assert.equal(allowedCandidateResponse("offer","withdrawn"),true);
  assert.equal(allowedCandidateResponse("submitted","withdrawn"),true);
  assert.equal(allowedCandidateResponse("hired","withdrawn"),false);
  assert.equal(allowedCandidateResponse("offer","rejected"),false);
});

test("professional eligibility is distinct from identity or membership verification",()=>{
  assert.equal(isEligibleVerifiedClaimForJobs("professional_certification"),true);
  assert.equal(isEligibleVerifiedClaimForJobs("education"),true);
  assert.equal(isEligibleVerifiedClaimForJobs("identity"),false);
  assert.equal(isEligibleVerifiedClaimForJobs("membership"),false);
});

test("job portal supports explicit public, member, internal and partner scopes",()=>{
  assert.deepEqual(JOB_POSTING_SCOPES,["public","mpa_members","organization_internal","partner_network"]);
  for(const scope of JOB_POSTING_SCOPES) assert.equal(isAllowedJobPostingScope(scope),true);
  assert.equal(isAllowedJobPostingScope("private_secret"),false);
});

test("candidate cannot accept an unapproved offer",()=>{
  assert.equal(canCandidateAcceptOffer({status:"offer",approval:"pending"}),false);
  assert.equal(canCandidateAcceptOffer({status:"offer",approval:"rejected"}),false);
  assert.equal(canCandidateAcceptOffer({status:"offer",approval:"approved"}),true);
  assert.equal(canCandidateAcceptOffer({status:"screening",approval:"approved"}),false);
});
test("application draft saving updates an existing draft and restores applicant-owned drafts in the UI",async()=>{
  const {readFile}=await import("node:fs/promises");
  const [service,page]=await Promise.all([
    readFile(new URL("../../src/organization-jobs/service.js",import.meta.url),"utf8"),
    readFile(new URL("../../web/app/jobs/page.tsx",import.meta.url),"utf8")
  ]);
  const save=service.slice(service.indexOf("export async function saveApplicationDraft"),service.indexOf("export async function updateApplicationDraft"));
  assert.match(save,/existing\?\.status==="draft"[\s\S]*?update job_application set cover_letter=\$1,profile_snapshot=\$2/);
  assert.match(save,/existing\?\.status==="withdrawn"/);
  assert.match(page,/\/api\/v1\/me\/job-applications/);
  assert.match(page,/saveFormalApplicationDraft/);
  assert.match(page,/Save draft changes/);
});

test("job seeker UX requires deliberate vacancy selection and separates future job interest",async()=>{
  const {readFile}=await import("node:fs/promises");
  const [jobs,publicInquiry]=await Promise.all([
    readFile(new URL("../../web/app/jobs/page.tsx",import.meta.url),"utf8"),
    readFile(new URL("../../web/app/apply/job/page.tsx",import.meta.url),"utf8")
  ]);
  assert.match(jobs,/\/apply\/job\?jobId=\$\{encodeURIComponent\(job\.id\)\}/);
  assert.match(jobs,/employmentType=\{filters\.employmentType\}/);
  assert.match(jobs,/value="full_time">Full-time/);
  assert.match(publicInquiry,/requestedJobId&&list\.some\(job=>job\.id===requestedJobId\)/);
  assert.doesNotMatch(publicInquiry,/if\(list\.length\)setJobId\(list\[0\]\.id\)/);
  assert.match(publicInquiry,/\/jobs\/interest/);
});

test("candidate tracking gives actionable next steps for each recruitment stage",async()=>{
  const {readFile}=await import("node:fs/promises");
  const tracking=await readFile(new URL("../../src/platform/application-tracking.js",import.meta.url),"utf8");
  for(const status of ["submitted","screening","shortlisted","interview","offer","accepted","hired","rejected","withdrawn"])
    assert.match(tracking,new RegExp("a\\.status='"+status+"'"));
  assert.match(tracking,/a\.offer_approval_status='pending'/);
  assert.match(tracking,/Review the offer terms and accept or withdraw your application/);
});

test("candidate pipeline mutations use the same job-scoped team authorization as pipeline reads",async()=>{
  const {readFile}=await import("node:fs/promises");
  const service=await readFile(new URL("../../src/organization-jobs/service.js",import.meta.url),"utf8");
  const list=service.slice(service.indexOf("export async function listCandidates"),service.indexOf("const APPLICATION_TRANSITIONS"));
  const update=service.slice(service.indexOf("export async function updateCandidate"),service.indexOf("export async function approveJobOffer"));
  assert.match(list,/jobRole\(db,jobId,userId,\["hiring_manager","recruiter"\]\)/);
  assert.match(update,/jobRole\(db,jobId,userId,\["hiring_manager","recruiter"\]\)/);
  assert.doesNotMatch(list,/orgRole\(db,j\.organization_id,userId,CANDIDATE_ROLES\)/);
  assert.doesNotMatch(update,/orgRole\(db,j\.organization_id,userId,CANDIDATE_ROLES\)/);
});
