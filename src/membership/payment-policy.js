export const MEMBERSHIP_PAYMENT_SUBMISSION_STATUSES = Object.freeze(["submitted","in_review","correction_required","approved","payment_pending"]);
export function canSubmitMembershipPayment(applicationStatus) {
  return MEMBERSHIP_PAYMENT_SUBMISSION_STATUSES.includes(applicationStatus);
}
export function applicationStatusAfterReview(decision, hasVerifiedPayment=false) {
  if(decision==="approved") return hasVerifiedPayment?"paid":"payment_pending";
  if(decision==="rejected") return "rejected";
  if(decision==="correction_required") return "correction_required";
  throw new Error("Invalid membership review decision.");
}
export function applicationStatusAfterPaymentVerification(applicationStatus, approvedAt, decision) {
  if(!["approved","payment_pending"].includes(applicationStatus)||!approvedAt) return applicationStatus;
  if(decision==="approved") return "paid";
  if(decision==="rejected"||decision==="needs_correction") return "payment_pending";
  throw new Error("Invalid payment verification decision.");
}

export function missingRequiredMembershipEvidence(requiredEvidence=[],submittedEvidence=[]) {
  const allowed=new Set(["identity_document","qualification_document","membership_evidence","supporting_document"]);
  const required=[...new Set((Array.isArray(requiredEvidence)?requiredEvidence:[]).map(value=>String(value||"").trim()).filter(Boolean))];
  const invalid=required.filter(value=>!allowed.has(value));
  if(invalid.length)throw new Error("Unsupported required membership evidence type: "+invalid.join(", "));
  const submitted=new Set((Array.isArray(submittedEvidence)?submittedEvidence:[]).map(value=>String(value||"").trim()));
  return required.filter(value=>!submitted.has(value));
}
