import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { allowedTalentInquiryTransition, ELIGIBLE_VERIFICATION_CLAIMS,isEligibleVerifiedClaim} from "../../src/talent/service.js";
import { allowedTransition } from "../../src/verification/service.js";

test("verification lifecycle permits controlled forward transitions only",()=>{
  assert.equal(allowedTransition("submitted","review"),true);
  assert.equal(allowedTransition("review","decision_pending"),true);
  assert.equal(allowedTransition("decision_pending","approved"),true);
  assert.equal(allowedTransition("approved","rejected"),false);
  assert.equal(allowedTransition("closed","review"),false);
});

test("talent registry eligibility is limited to explicitly verified professional claims",()=>{
  assert.deepEqual(ELIGIBLE_VERIFICATION_CLAIMS,["professional_certification","education","employment","experience","service_capability"]);
  assert.equal(isEligibleVerifiedClaim("experience"),true);
  assert.equal(isEligibleVerifiedClaim("identity"),false);
  assert.equal(isEligibleVerifiedClaim("professional_certification"),true);
});

test("private verification evidence is not a talent eligibility signal",()=>{
  assert.equal(isEligibleVerifiedClaim("membership"),false);
  assert.equal(isEligibleVerifiedClaim(""),false);
});

test("talent eligibility filters reject non-professional claim types",()=>{
  assert.equal(isEligibleVerifiedClaim("identity"),false);
  assert.equal(isEligibleVerifiedClaim("membership"),false);
  assert.equal(isEligibleVerifiedClaim("professional_certification"),true);
  assert.equal(isEligibleVerifiedClaim("service_capability"),true);
});

test("consent boundary keeps substantive work closed until consent",()=>{
  assert.equal(allowedTransition("consent_pending","submitted"),true);
  assert.equal(allowedTransition("consent_pending","review"),false);
  assert.equal(allowedTransition("consent_pending","decision_pending"),false);
});

test("talent inquiry creates a controlled consent-based bridge",()=>{
  assert.equal(allowedTalentInquiryTransition("requested","accepted"),true);
  assert.equal(allowedTalentInquiryTransition("requested","declined"),true);
  assert.equal(allowedTalentInquiryTransition("requested","closed"),true);
  assert.equal(allowedTalentInquiryTransition("accepted","closed"),true);
  assert.equal(allowedTalentInquiryTransition("declined","accepted"),false);
  assert.equal(allowedTalentInquiryTransition("closed","accepted"),false);
});

test("reference workflow migration permits the persisted consent and assessment states used by the service",async()=>{
  const migration=await readFile(new URL("../../db/migrations/20261023110000_verification_reference_and_assignment_history.sql",import.meta.url),"utf8");
  const service=await readFile(new URL("../../src/verification/service.js",import.meta.url),"utf8");
  for(const value of ["pending","accepted","consented","declined","withdrawn"]) {
    assert.ok(migration.includes(`'${value}'`),`reference consent constraint must include ${value}`);
  }
  for(const value of ["pending","received","verified","insufficient","disputed","not_verified","needs_clarification"]) {
    assert.ok(migration.includes(`'${value}'`),`reference assessment constraint must include ${value}`);
  }
  assert.ok(service.includes('consent_status in (\'pending\',\'accepted\',\'consented\')'));
  assert.ok(service.includes('consent?"consented":"declined"'));
  assert.ok(service.includes('["verified","not_verified","needs_clarification"]'));
});
