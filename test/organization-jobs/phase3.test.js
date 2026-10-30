import assert from "node:assert/strict";
import test from "node:test";
import {
  allowedApplicationTransition,
  allowedCandidateResponse,
  allowedInterviewStatusTransition,
  canCandidateAcceptOffer,
  canRespondToInterview,
  ELIGIBILITY_RULES,
  isAllowedJobPostingScope,
  isEligibleVerifiedClaimForJobs,
  isValidScreeningAnswer,
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
  assert.match(jobs,/employmentType:string/);
  assert.match(jobs,/value=\{filters\.employmentType\} onChange=\{e=>setFilters\(\{\.\.\.filters,employmentType:e\.target\.value\}\)\}/);
  assert.match(jobs,/p\.set\(key,value\.trim\(\)\)/);
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

test("applicant progress exposes interview and offer actions without internal reviewer notes or participant identifiers",async()=>{
  const {readFile}=await import("node:fs/promises");
  const [service,tracking,server]=await Promise.all([
    readFile(new URL("../../src/organization-jobs/service.js",import.meta.url),"utf8"),
    readFile(new URL("../../web/app/track/page.tsx",import.meta.url),"utf8"),
    readFile(new URL("../../server.js",import.meta.url),"utf8")
  ]);
  const progress=service.slice(service.indexOf("export async function getMyApplicationProgress"),service.indexOf("export async function listApplicationAttachments"));
  assert.match(server,/api\/v1\/job-applications\/.*progress/);
  assert.match(progress,/events:events\.map\(\(\{from_status,to_status,created_at\}\)/);
  assert.match(progress,/participants:\(interview\.participants\|\|\[\]\)\.map\(\(\{role,response\}\)/);
  assert.match(tracking,/Confirm interview/);
  assert.match(tracking,/Accept approved offer/);
  assert.match(tracking,/Withdraw application/);
  assert.match(tracking,/job-applications\/.*\/progress/);
});

test("only open interviews accept participant responses",()=>{
  assert.equal(canRespondToInterview("scheduled"),true);
  assert.equal(canRespondToInterview("confirmed"),true);
  assert.equal(canRespondToInterview("reschedule_requested"),false);
  for(const status of ["completed","cancelled","no_show","unknown"]) assert.equal(canRespondToInterview(status),false);
});

test("employer screening and interview forms submit database-supported option values",async()=>{
  const {readFile}=await import("node:fs/promises");
  const [page,migration]=await Promise.all([
    readFile(new URL("../../web/app/recruitment/page.tsx",import.meta.url),"utf8"),
    readFile(new URL("../../db/migrations/013_comprehensive_job_portal.sql",import.meta.url),"utf8")
  ]);
  for(const value of ["text","yes_no","single_choice","multiple_choice","number"]) assert.match(page,new RegExp("value=\""+value+"\""));
  assert.match(migration,/question_type in \('text','yes_no','single_choice','multiple_choice','number'\)/);
  assert.match(page,/option value="onsite">On-site/);
  assert.match(migration,/mode in \('online','onsite','phone'\)/);
  assert.doesNotMatch(page,/value="single_select"|value="multi_select"|value="boolean"|value="in_person"/);
});

test("formal applications collect and persist required screening answers across draft and submit",async()=>{
  const {readFile}=await import("node:fs/promises");
  const [service,page]=await Promise.all([
    readFile(new URL("../../src/organization-jobs/service.js",import.meta.url),"utf8"),
    readFile(new URL("../../web/app/jobs/page.tsx",import.meta.url),"utf8")
  ]);
  const createDraft=service.slice(service.indexOf("export async function saveApplicationDraft"),service.indexOf("export async function updateApplicationDraft"));
  const updateDraft=service.slice(service.indexOf("export async function updateApplicationDraft"),service.indexOf("export async function submitApplication"));
  const screening=service.slice(service.indexOf("async function saveScreeningAnswers"),service.indexOf("export async function createRequisition"));
  assert.match(createDraft,/saveScreeningAnswers\(db,app\.id,jobId,input\.answers,false\)/);
  assert.match(updateDraft,/saveScreeningAnswers\(db,applicationId,a\.job_id,input\.answers,false\)/);
  assert.match(screening,/Array\.isArray\(answer\)&&answer\.length===0/);
  assert.match(service,/from job_application_answer aa where aa\.application_id=a\.id/);
  assert.match(service,/\) screening_answers from job_application a/);
  assert.match(page,/screeningQuestions/);
  assert.match(page,/answersFor\(job\.id\)/);
  assert.match(page,/Answer each required screening question/);
for(const type of ["text","number","multiple_choice"]) assert.ok(page.includes('question_type==="'+type+'"'));
  assert.ok(page.includes('["yes_no","single_choice"].includes(question.question_type)'));
  assert.ok(page.includes('question.question_type==="yes_no"?["yes","no"]:(question.options||[])'));
  assert.ok(page.includes("missingRequiredAnswers(job)"));
  assert.ok(page.includes("answers:answersFor(job.id)"));
  assert.ok(page.includes('question.required&&(answer===undefined||answer===null||answer===""||(Array.isArray(answer)&&answer.length===0))'));
});

test("employer interview status transitions preserve completed and cancelled terminal states",()=>{
  assert.equal(allowedInterviewStatusTransition("scheduled","completed"),true);
  assert.equal(allowedInterviewStatusTransition("confirmed","cancelled"),true);
  assert.equal(allowedInterviewStatusTransition("scheduled","no_show"),true);
  assert.equal(allowedInterviewStatusTransition("completed","scheduled"),false);
  assert.equal(allowedInterviewStatusTransition("cancelled","confirmed"),false);
  assert.equal(allowedInterviewStatusTransition("scheduled","unknown"),false);
  assert.equal(allowedInterviewStatusTransition("reschedule_requested","scheduled"),false);
});

test("employer interview management exposes authorized schedules and completed-interview feedback",async()=>{
  const {readFile}=await import("node:fs/promises");
  const [service,server,page]=await Promise.all([
    readFile(new URL("../../src/organization-jobs/service.js",import.meta.url),"utf8"),
    readFile(new URL("../../server.js",import.meta.url),"utf8"),
    readFile(new URL("../../web/app/recruitment/page.tsx",import.meta.url),"utf8")
  ]);
  assert.match(server,/api\/v1\/job-applications\/.*interviews/);
  assert.match(server,/api\/v1\/job-interviews\/.*status/);
  assert.match(service,/currentUserRole:canManage\?accessRole:participantRole\|\|accessRole/);
  assert.match(service,/participants:isApplicant\?/);
  assert.match(service,/INTERVIEW_NOT_COMPLETED/);
  assert.match(page,/View interview schedule/);
  assert.match(page,/Mark completed/);
  assert.match(page,/Save interview feedback/);
});

test("interview reschedule proposals are persisted, single-pending, auditable and participant-decided",async()=>{
  const {readFile}=await import("node:fs/promises");
  const [migration,service,server,candidatePage,employerPage]=await Promise.all([
    readFile(new URL("../../db/migrations/20261030110000_job_interview_change_proposals.sql",import.meta.url),"utf8"),
    readFile(new URL("../../src/organization-jobs/service.js",import.meta.url),"utf8"),
    readFile(new URL("../../server.js",import.meta.url),"utf8"),
    readFile(new URL("../../web/app/track/page.tsx",import.meta.url),"utf8"),
    readFile(new URL("../../web/app/recruitment/page.tsx",import.meta.url),"utf8")
  ]);
  assert.match(migration,/ux_job_interview_change_pending/);
  assert.match(migration,/where status='pending'/);
  assert.match(service,/export async function proposeInterviewChange/);
  assert.match(service,/export async function decideInterviewChange/);
  assert.match(service,/job\.interview_change_proposed/);
  assert.match(service,/job\.interview_change_decided/);
  assert.match(server,/job-interview-change-proposals/);
  assert.match(candidatePage,/Accept new time/);
  assert.match(candidatePage,/Propose a different time/);
  assert.match(employerPage,/Accept proposed time/);
  assert.match(employerPage,/Keep original time/);
});

test("interview schedule changes are offered only to participants and decisions are participant-scoped",async()=>{
  const {readFile}=await import("node:fs/promises");
  const [service,candidatePage,employerPage]=await Promise.all([
    readFile(new URL("../../src/organization-jobs/service.js",import.meta.url),"utf8"),
    readFile(new URL("../../web/app/track/page.tsx",import.meta.url),"utf8"),
    readFile(new URL("../../web/app/recruitment/page.tsx",import.meta.url),"utf8")
  ]);
  assert.match(service,/isParticipant,isInterviewer:participantRole==="interviewer"/);
  assert.match(service,/currentUserRole:canManage\?accessRole/);
  assert.match(service,/canDecide:isParticipant&&proposedBy!==userId/);
  assert.match(service,/const isApplicant=a\.applicant_user_id===userId/);
  assert.match(service,/participants:isApplicant\?/);
  assert.match(service,/\!isApplicant\?\{proposedBy\}:\{\}/);
  assert.match(service,/user_id<>\$3/);
  assert.match(candidatePage,/interview\.isParticipant&&\["scheduled","confirmed"\]/);
  assert.match(employerPage,/interview\.isParticipant&&\["scheduled","confirmed"\]/);
});

test("interview scheduling restricts interviewer assignment to active authorized job-team members",async()=>{
  const {readFile}=await import("node:fs/promises");
  const service=await readFile(new URL("../../src/organization-jobs/service.js",import.meta.url),"utf8");
  const schedule=service.slice(service.indexOf("export async function scheduleInterview"),service.indexOf("export async function respondInterview"));
  assert.match(schedule,/select 1 from app_user where id=\$1 and status='active'/);
  assert.match(schedule,/jobRole\(db,a\.job_id,interviewerUserId,\["hiring_manager","recruiter","interviewer"\]\)/);
  assert.doesNotMatch(schedule,/om\.role_code in/);
  assert.match(schedule,/jp\.user_id=any\(\$1::uuid\[\]\)/);
  assert.match(schedule,/interviewerUserId,a\.applicant_user_id/);
});

test("screening answers are validated against question type and configured options",()=>{
  assert.equal(isValidScreeningAnswer({question_type:"text"}, "Relevant experience"),true);
  assert.equal(isValidScreeningAnswer({question_type:"text"}, 12),false);
  assert.equal(isValidScreeningAnswer({question_type:"number"}, "4"),true);
  assert.equal(isValidScreeningAnswer({question_type:"number"}, "four"),false);
  assert.equal(isValidScreeningAnswer({question_type:"yes_no"}, "yes"),true);
  assert.equal(isValidScreeningAnswer({question_type:"yes_no"}, "maybe"),false);
  assert.equal(isValidScreeningAnswer({question_type:"single_choice",options:["a","b"]}, "b"),true);
  assert.equal(isValidScreeningAnswer({question_type:"single_choice",options:["a","b"]}, "c"),false);
  assert.equal(isValidScreeningAnswer({question_type:"multiple_choice",options:["a","b"]}, ["a","b"]),true);
  assert.equal(isValidScreeningAnswer({question_type:"multiple_choice",options:["a","b"]}, ["a","c"]),false);
  assert.equal(isValidScreeningAnswer({question_type:"multiple_choice",options:["a","b"]}, ["a","a"]),false);
});

test("interview change proposals enforce participant identity, overlap checks and applicant privacy",async()=>{
  const {readFile}=await import("node:fs/promises");
  const service=await readFile(new URL("../../src/organization-jobs/service.js",import.meta.url),"utf8");
  const propose=service.slice(service.indexOf("export async function proposeInterviewChange"),service.indexOf("export async function decideInterviewChange"));
  const decide=service.slice(service.indexOf("export async function decideInterviewChange"),service.indexOf("export async function updateInterviewStatus"));
  const list=service.slice(service.indexOf("export async function listApplicationInterviews"),service.indexOf("export async function getMyApplicationProgress"));
  assert.match(propose,/Only an interview participant may propose/);
  assert.match(propose,/user_id in \(select user_id from job_interview_participant where interview_id=\$1\)/);
  assert.match(decide,/user_id=\$2 and user_id<>\$3/);
  assert.match(list,/const isApplicant=a\.applicant_user_id===userId/);
  assert.match(list,/participants:isApplicant\?/);
  assert.match(list,/\!isApplicant\?\{proposedBy\}:\{\}/);
});
