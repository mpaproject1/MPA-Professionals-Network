import assert from "node:assert/strict";
import test from "node:test";
import { applicationStatusAfterPaymentVerification, applicationStatusAfterReview, canSubmitMembershipPayment, missingRequiredMembershipEvidence } from "../../src/membership/payment-policy.js";

test("payment evidence can be submitted before approval without changing application status",()=>{
  for(const status of ["submitted","in_review","correction_required","approved","payment_pending"]) assert.equal(canSubmitMembershipPayment(status),true,status);
  for(const status of ["rejected","activated","paid","cancelled","draft"]) assert.equal(canSubmitMembershipPayment(status),false,status);
});

test("review approval recognizes an already verified early payment",()=>{
  assert.equal(applicationStatusAfterReview("approved",false),"payment_pending");
  assert.equal(applicationStatusAfterReview("approved",true),"paid");
  assert.equal(applicationStatusAfterReview("rejected",true),"rejected");
  assert.equal(applicationStatusAfterReview("correction_required",true),"correction_required");
  assert.throws(()=>applicationStatusAfterReview("unknown",false),/Invalid membership review decision/);
});

test("early payment verification never approves or advances a pending application",()=>{
  for(const status of ["submitted","in_review","correction_required"]){
    assert.equal(applicationStatusAfterPaymentVerification(status,null,"approved"),status);
    assert.equal(applicationStatusAfterPaymentVerification(status,null,"rejected"),status);
  }
});

test("payment verification advances only an already-approved application",()=>{
  assert.equal(applicationStatusAfterPaymentVerification("payment_pending","2026-10-28T10:00:00Z","approved"),"paid");
  assert.equal(applicationStatusAfterPaymentVerification("approved","2026-10-28T10:00:00Z","approved"),"paid");
  assert.equal(applicationStatusAfterPaymentVerification("payment_pending","2026-10-28T10:00:00Z","rejected"),"payment_pending");
  assert.equal(applicationStatusAfterPaymentVerification("payment_pending","2026-10-28T10:00:00Z","needs_correction"),"payment_pending");
  assert.equal(applicationStatusAfterPaymentVerification("paid","2026-10-28T10:00:00Z","approved"),"paid");
});

test("required membership evidence blocks approval until each configured private evidence type exists",()=>{
  assert.deepEqual(missingRequiredMembershipEvidence(["identity_document","qualification_document"],["identity_document"]),["qualification_document"]);
  assert.deepEqual(missingRequiredMembershipEvidence(["membership_evidence"],["membership_evidence"]),[]);
  assert.deepEqual(missingRequiredMembershipEvidence([],[]),[]);
  assert.throws(()=>missingRequiredMembershipEvidence(["passport_scan"],[]),/Unsupported required membership evidence type/);
});
