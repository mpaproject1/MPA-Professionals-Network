import {createHash} from "node:crypto";
import {getPool,withTransaction} from "./db.js";
import {policyError} from "./identity-policy.js";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=(status,message,code="COMMUNITY_IMPACT_SCORE_ERROR")=>{throw policyError(status,message,code)};
const clean=(value,min,max,label)=>{const v=String(value??"").trim();if(v.length<min||v.length>max)fail(400,label+" must be between "+min+" and "+max+" characters.","VALIDATION_ERROR");return v};
async function permission(db,userId,code){const q=await db.query("select exists(select 1 from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1 and r.role_code='system_admin') or exists(select 1 from app_user_permission where user_id=$1 and permission_code=$2) allowed",[userId,code]);if(!q.rows[0]?.allowed)fail(403,"The required Community Impact score permission is required.","FORBIDDEN")}
const hash=value=>createHash("sha256").update(value).digest("hex");
function classifyClaimSource(claim){
 const t=claim.contribution_type,c=claim.category;
 if(t==="initiative_participation")return "serve_community_participation";
 if(t==="project_delivery")return "offline_completed_project";
 if(t==="mentoring"||c==="mentorship_knowledge_sharing")return "mentorship";
 if(t==="professional_service"||c==="professional_pro_bono_services")return "professional_service";
 if(t==="referral"||c==="employment_referrals")return "employment_referral";
 if(t==="partnership"&&c==="partnerships_organizational_capacity")return "network_plus_partnership";
 if(t==="partnership"||c==="partnerships_organizational_capacity")return "network_plus_collaboration";
 return "historical_contribution";
}
function validatePolicy(policy){
 if(!policy||typeof policy!=="object"||!Array.isArray(policy.dimensions)||policy.dimensions.length!==5||policy.dimensions.some(d=>!d||typeof d!=="object"||Array.isArray(d)))fail(400,"A score policy must define exactly the five approved dimensions.","SCORE_POLICY_INVALID");
 const keys=["measurable_community_outcomes","quality_and_significance","verified_contribution_responsibility","sustainability","collaboration_knowledge_sharing"];
 const actual=policy.dimensions.map(x=>x.key);if(keys.some(k=>!actual.includes(k))||new Set(actual).size!==5)fail(400,"All five approved score dimensions must be present exactly once.","SCORE_POLICY_INVALID");
 const sum=policy.dimensions.reduce((n,x)=>n+Number(x.weight),0);if(!Number.isFinite(sum)||Math.abs(sum-100)>0.0001)fail(400,"Score dimension weights must total exactly 100%.","SCORE_POLICY_INVALID");
 const calc=policy.calculation;if(!calc||!Number.isFinite(Number(calc.basePoints))||Number(calc.basePoints)<=0||!calc.roleFactors||!Array.isArray(calc.eligibleSourceTypes))fail(400,"Score policy calculation settings are incomplete.","SCORE_POLICY_INVALID");
 if(!policy.publication||typeof policy.publication.enabled!=="boolean"||policy.publicScoreEnabled!==policy.publication.enabled||policy.publication.consentRequired!==true||!Number.isFinite(Number(policy.publication.minimumGroupSize))||Number(policy.publication.minimumGroupSize)<5)fail(400,"Publication policy must explicitly require consent and a minimum group size of at least five.","SCORE_POLICY_INVALID");
 if(!/^([0-8])dp$/.test(String(calc.rounding||""))||!calc.evidenceQualityRank||!calc.outcomeMaturityRank||!Object.hasOwn(calc.evidenceQualityRank,calc.minimumEvidenceQuality)||!Object.hasOwn(calc.outcomeMaturityRank,calc.minimumOutcomeMaturity)||!Array.isArray(calc.diminishingReturns)||!Array.isArray(calc.modifiers)||!Array.isArray(calc.decayRules))fail(400,"Policy must define rounding, evidence quality and outcome maturity scales.","SCORE_POLICY_INVALID");
 if(calc.eligibleSourceTypes.some(x=>!SCORE_SOURCE_TYPES.has(x))||new Set(calc.eligibleSourceTypes).size!==calc.eligibleSourceTypes.length)fail(400,"Policy contains an unsupported or duplicate source type.","SCORE_POLICY_INVALID");
 for(const value of Object.values(calc.roleFactors))if(!Number.isFinite(Number(value))||Number(value)<0)fail(400,"Policy role factors must be finite non-negative values.","SCORE_POLICY_INVALID");
 for(const value of Object.values(calc.evidenceQualityRank))if(!Number.isFinite(Number(value)))fail(400,"Evidence quality ranks must be finite numbers.","SCORE_POLICY_INVALID");
 for(const value of Object.values(calc.outcomeMaturityRank))if(!Number.isFinite(Number(value)))fail(400,"Outcome maturity ranks must be finite numbers.","SCORE_POLICY_INVALID");
 for(const caps of [calc.categoryCaps||{},calc.sourceCaps||{}])for(const value of Object.values(caps))if(!Number.isFinite(Number(value))||Number(value)<0)fail(400,"Policy score caps must be finite non-negative values.","SCORE_POLICY_INVALID");
 for(const value of Object.values(calc.periodCaps||{}))if(!value||!Number.isFinite(Number(value.points))||Number(value.points)<0||!Number.isFinite(Number(value.windowDays))||Number(value.windowDays)<=0)fail(400,"Policy period caps must include non-negative points and a positive window.","SCORE_POLICY_INVALID");
 for(const rule of calc.diminishingReturns||[])if(!rule||!SCORE_SOURCE_TYPES.has(rule.sourceType)||!Number.isFinite(Number(rule.afterCount))||Number(rule.afterCount)<0||!Number.isFinite(Number(rule.factor))||Number(rule.factor)<0||Number(rule.factor)>1)fail(400,"Policy diminishing-return rules are invalid.","SCORE_POLICY_INVALID");
 const modifierKeys=new Set();for(const rule of calc.modifiers){if(!rule||typeof rule.key!=="string"||!rule.key.trim()||modifierKeys.has(rule.key)||!["multiply","add"].includes(rule.operation)||!Number.isFinite(Number(rule.value))||Number(rule.value)<0||(rule.sourceType&&!SCORE_SOURCE_TYPES.has(rule.sourceType)))fail(400,"Policy scoring modifiers are invalid.","SCORE_POLICY_INVALID");modifierKeys.add(rule.key)}
 for(const rule of calc.decayRules){if(!rule||!SCORE_SOURCE_TYPES.has(rule.sourceType)||!Number.isFinite(Number(rule.afterDays))||Number(rule.afterDays)<=0||!Number.isFinite(Number(rule.factor))||Number(rule.factor)<0||Number(rule.factor)>1)fail(400,"Policy score decay rules are invalid.","SCORE_POLICY_INVALID")}
 for(const d of policy.dimensions)if(!Array.isArray(d.criteria)||d.criteria.some(x=>typeof x!=="string"||!x.trim())||!d.measurementRules||typeof d.measurementRules!=="object"||Array.isArray(d.measurementRules)||(d.measurementRules.requiresFollowUpEvidence===true&&(!Number.isFinite(Number(d.measurementRules.followUpDays))||Number(d.measurementRules.followUpDays)<0))||(d.measurementRules.minimumOutcomeMaturity&&!Object.hasOwn(calc.outcomeMaturityRank,d.measurementRules.minimumOutcomeMaturity))||(d.measurementRules.requiresRecipientConfirmation===true&&(!Array.isArray(d.measurementRules.recipientConfirmationSourceTypes)||d.measurementRules.recipientConfirmationSourceTypes.some(x=>!SCORE_SOURCE_TYPES.has(x)))))fail(400,"Every score dimension must define reviewer criteria and valid measurement rules.","SCORE_POLICY_INVALID");
 for(const d of policy.dimensions){if(!Number.isFinite(Number(d.weight))||Number(d.weight)<0||!d.ratings||!Number.isFinite(Number(d.ratings.min))||!Number.isFinite(Number(d.ratings.max))||Number(d.ratings.max)<=Number(d.ratings.min)||!Number.isFinite(Number(d.ratings.step||1))||Number(d.ratings.step||1)<=0||!Object.hasOwn(calc.evidenceQualityRank,d.minimumEvidenceQuality||calc.minimumEvidenceQuality))fail(400,"Each dimension needs a valid weight, rating range and evidence threshold.","SCORE_POLICY_INVALID")}
 return policy;
}
async function activePolicy(db){const row=(await db.query("select p.* from community_impact_score_active_policy a join community_impact_score_policy_version p on p.id=a.policy_version_id where a.singleton=true")).rows[0];if(!row)fail(409,"No active Community Impact score policy is configured.","SCORE_POLICY_MISSING");validatePolicy(row.policy);if(new Date(row.effective_at).getTime()>Date.now())fail(409,"The active score policy effective date is in the future.","SCORE_POLICY_NOT_EFFECTIVE");return row}
const normalizeFingerprintValue=value=>String(value??"").normalize("NFKC").trim().toLowerCase().replace(/\s+/g," ");
function historicalClaimFingerprint(claim){return hash(JSON.stringify({category:claim.category,type:claim.contribution_type,startDate:claim.start_date,endDate:claim.end_date||null,organization:normalizeFingerprintValue(claim.organization_name),project:normalizeFingerprintValue(claim.project_title),activity:normalizeFingerprintValue(claim.activity_summary),output:normalizeFingerprintValue(claim.output_summary),outcome:normalizeFingerprintValue(claim.outcome_summary),sustainedImpact:normalizeFingerprintValue(claim.sustained_impact_summary)}))}
const SCORE_SOURCE_TYPES=new Set(["serve_community_participation","offline_completed_project","mentorship","professional_service","employment_referral","network_plus_collaboration","network_plus_partnership","historical_contribution"]);
function safeSourceSnapshot(sourceType,row){
 if(sourceType==="employment_referral")return {status:row.status,referralType:"employment",jobOutcomeVerified:row.status==="employment_verified",sourceDate:row.employment_verified_at||row.created_at};
 if(sourceType==="mentorship")return {status:row.status,coordinationStatus:row.coordination_status,recipientConfirmed:Boolean(row.recipient_confirmed),contributorRole:"mentor",sourceDate:row.completed_at};
 if(sourceType==="professional_service")return {status:row.status,providerCompletionRecorded:Boolean(row.provider_completed_at),requesterAccepted:Boolean(row.requester_accepted_at),pricingModel:row.pricing_model,sourceDate:row.requester_accepted_at||row.provider_completed_at};
 if(sourceType==="network_plus_collaboration"||sourceType==="network_plus_partnership")return {status:row.status,intent:row.intent,participantConsent:row.consent_status,recipientConfirmed:Boolean(row.recipient_confirmed),sourceDate:row.completed_at};
 if(sourceType==="serve_community_participation")return {status:row.detection_status,attributionStatus:row.attribution_status,confidence:row.confidence,sourceDate:row.created_at};
 if(sourceType==="offline_completed_project")return {status:row.detection_status,attributionStatus:row.attribution_status,attributionDecision:row.status,contributorConfirmed:Boolean(row.contributor_confirmed_at),attributionShare:Number(row.attribution_share),sourceDate:row.created_at};
 return {claimStatus:row.claimStatus||"verified",source:"reviewer_verified_historical_claim",sourceDate:row.created_at};
}
async function verifySource(db,sourceType,sourceRecordId,subjectUserId,claim){
 let row;
 if(sourceType==="serve_community_participation")row=(await db.query("select id,source_system,source_type,source_record_id,source_event_id,contributor_user_id,attribution_status,detection_status,confidence,created_at from community_impact_detection_candidate where id=$1 and source_type='initiative_participation' and contributor_user_id=$2 and attribution_status='confirmed' and detection_status='detected'",[sourceRecordId,subjectUserId])).rows[0];
 else if(sourceType==="offline_completed_project")row=(await db.query("select c.id,c.source_system,c.source_type,c.source_record_id,c.source_event_id,c.detection_status,c.created_at,a.contributor_user_id,a.attribution_share,a.status attribution_status,a.contributor_confirmed_at from community_impact_detection_candidate c join community_impact_offline_attribution a on a.candidate_id=c.id where c.id=$1 and c.source_type='offline_completed_project' and c.detection_status='detected' and a.contributor_user_id=$2 and a.status='verified' and a.contributor_confirmed_at is not null",[sourceRecordId,subjectUserId])).rows[0];
 else if(sourceType==="employment_referral")row=(await db.query("select id,referrer_user_id,referred_user_id,status,job_id,job_application_id,employment_verified_at,created_at from member_referral_attribution where id=$1 and referral_type='employment' and referrer_user_id=$2 and status='employment_verified'",[sourceRecordId,subjectUserId])).rows[0];
 else if(sourceType==="mentorship")row=(await db.query("select s.id,s.status,s.coordination_status,m.mentor_user_id,m.mentee_user_id,s.completed_at,exists(select 1 from mentorship_feedback f where f.session_id=s.id and f.reviewer_user_id=m.mentee_user_id and f.target_role='mentor') recipient_confirmed from mentorship_session s join mentorship m on m.id=s.mentorship_id where s.id=$1 and s.status='completed' and s.coordination_status='accepted' and m.mentor_user_id=$2 and exists(select 1 from mentorship_feedback f where f.session_id=s.id and f.reviewer_user_id=m.mentee_user_id and f.target_role='mentor')",[sourceRecordId,subjectUserId])).rows[0];
 else if(sourceType==="professional_service")row=(await db.query("select r.id,r.status,r.provider_completed_at,r.requester_accepted_at,r.completed_at,r.provider_user_id,s.pricing_model,s.impact_model from service_request r join service_listing s on s.id=r.service_listing_id where r.id=$1 and r.status='completed' and r.provider_completed_at is not null and r.requester_accepted_at is not null and r.provider_user_id=$2 and (s.impact_model='pro_bono' or s.pricing_model='free' or exists(select 1 from service_payment sp where sp.request_id=r.id and sp.status='succeeded' and sp.verified_at is not null))",[sourceRecordId,subjectUserId])).rows[0];
 else if(sourceType==="network_plus_collaboration"||sourceType==="network_plus_partnership")row=(await db.query("select r.id,r.intent,r.status,r.completed_at,p.user_id,p.consent_status,exists(select 1 from network_plus_request_participant counterpart where counterpart.request_id=r.id and counterpart.user_id<>p.user_id and counterpart.consent_status='accepted') recipient_confirmed from network_plus_request r join network_plus_request_participant p on p.request_id=r.id where r.id=$1 and r.status='completed' and p.user_id=$2 and p.consent_status='accepted' and exists(select 1 from network_plus_request_participant counterpart where counterpart.request_id=r.id and counterpart.user_id<>p.user_id and counterpart.consent_status='accepted') and ((r.intent='collaboration_request' and $3='network_plus_collaboration') or (r.intent='partnership_proposal' and $3='network_plus_partnership'))",[sourceRecordId,subjectUserId,sourceType])).rows[0];
 else if(sourceType==="historical_contribution"&&["other","knowledge_resource"].includes(claim.contribution_type))row={id:claim.id,claimStatus:claim.status,claimantUserId:claim.claimant_user_id,created_at:claim.created_at,source:"reviewer_verified_historical_claim"};
 if(!row)fail(409,"The selected source record is not in an eligible verified state for this contributor.","SCORE_SOURCE_NOT_VERIFIED");
 return row;
}
export async function linkVerifiedSource(actor,claimId,input){
 await permission(getPool(),actor,"community_impact.score.recalculate");
 const sourceType=String(input?.sourceType||"");if(!SCORE_SOURCE_TYPES.has(sourceType))fail(400,"Choose a supported Community Impact source type.","VALIDATION_ERROR");
 const sourceRecordId=clean(input?.sourceRecordId,36,36,"Source record ID"),rationale=clean(input?.rationale,12,2000,"Source-link rationale");if(!UUID.test(sourceRecordId))fail(400,"Source record ID must be a valid UUID.","VALIDATION_ERROR");
 return withTransaction(async tx=>{
  const claim=(await tx.query("select * from community_impact_claim where id=$1 for update",[claimId])).rows[0];if(!claim)fail(404,"Contribution claim not found.","NOT_FOUND");
  if(claim.status!=="verified"||claim.current_decision_code!=="verified")fail(409,"Only a verified claim can be linked to a scoring source.","SCORE_SOURCE_NOT_VERIFIED");
  const assessment=(await tx.query("select id from community_impact_contribution_assessment where claim_id=$1 and status='approved' order by approved_at desc nulls last,created_at desc limit 1",[claimId])).rows[0];if(!assessment)fail(409,"An approved reviewer assessment is required before source reconciliation.","SCORE_ASSESSMENT_REQUIRED");
  const expected=classifyClaimSource(claim);
  if(sourceType==="historical_contribution"&&sourceRecordId!==claim.id)fail(409,"Historical contribution source reference must match the verified claim ID.","SCORE_SOURCE_REFERENCE_MISMATCH");
  if(sourceType!==expected&&!(sourceType==="network_plus_collaboration"&&claim.contribution_type==="partnership")&&!(sourceType==="network_plus_partnership"&&claim.contribution_type==="partnership"))fail(409,"The selected source family does not match the reviewed contribution type.","SCORE_SOURCE_TYPE_MISMATCH");
  if(["serve_community_participation","offline_completed_project"].includes(sourceType)){const reconciled=(await tx.query("select candidate_id from community_impact_claim_candidate_link where claim_id=$1 and candidate_id=$2",[claimId,sourceRecordId])).rowCount;if(!reconciled)fail(409,"Serve-Community and offline-project scores require an exact, already reviewed claim-to-detection reconciliation.","SCORE_CLAIM_SOURCE_NOT_RECONCILED")}
  const verifiedSnapshot=await verifySource(tx,sourceType,sourceRecordId,claim.claimant_user_id,claim),snapshot=safeSourceSnapshot(sourceType,verifiedSnapshot);
  const sourceFingerprint=sourceType==="historical_contribution"?historicalClaimFingerprint(claim):null;
  const row=(await tx.query("insert into community_impact_score_source_link(claim_id,subject_user_id,source_system,source_type,source_record_id,source_snapshot,source_fingerprint,linked_by,rationale) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict do nothing returning id",[claimId,claim.claimant_user_id,sourceType==="historical_contribution"?"community_impact_claim":sourceType==="serve_community_participation"||sourceType==="offline_completed_project"?"serve_community":sourceType==="employment_referral"?"member_referrals":sourceType==="mentorship"?"mentorship":sourceType==="professional_service"?"services":"network_plus",sourceType,sourceRecordId,snapshot,sourceFingerprint,actor,rationale])).rows[0];
  if(!row){const existing=(await tx.query("select id,source_type,source_record_id from community_impact_score_source_link where claim_id=$1",[claimId])).rows[0];if(existing?.source_type===sourceType&&existing?.source_record_id===sourceRecordId)return {...existing,status:"already_linked"};if(sourceFingerprint){const duplicate=(await tx.query("select id,claim_id from community_impact_score_source_link where subject_user_id=$1 and source_type='historical_contribution' and source_fingerprint=$2",[claim.claimant_user_id,sourceFingerprint])).rows[0];if(duplicate)fail(409,"This historical contribution matches an already linked claim for this contributor; review the existing record instead of awarding duplicate points.","SCORE_DUPLICATE_HISTORICAL_SOURCE")}fail(409,"This verified claim or source record is already linked. Use an independently reviewed claim only when it represents a distinct contribution.","SCORE_SOURCE_ALREADY_LINKED")}
  await tx.query("insert into community_impact_score_source_link_event(source_link_id,actor_user_id,event_code,rationale,metadata) values($1,$2,'linked',$3,$4)",[row.id,actor,rationale,{sourceType,sourceRecordId,assessmentId:assessment.id}]);
  return {id:row.id,claimId,sourceType,sourceRecordId,status:"linked"};
 });
}

async function scoreClaim(tx,actorUserId,claimId,rationale,policy){
 const claim=(await tx.query("select * from community_impact_claim where id=$1 for update",[claimId])).rows[0];if(!claim)fail(404,"Contribution claim not found.","NOT_FOUND");
 if(claim.status!=="verified"||claim.current_decision_code!=="verified")fail(409,"Only a reviewer-verified contribution can be scored.","SCORE_SOURCE_NOT_VERIFIED");
 const assessment=(await tx.query("select * from community_impact_contribution_assessment where claim_id=$1 and status='approved' order by approved_at desc nulls last,created_at desc limit 1 for update",[claimId])).rows[0];
 if(!assessment||!assessment.approved_at)fail(409,"An approved reviewer assessment is required before scoring.","SCORE_ASSESSMENT_REQUIRED");
 const sourceLink=(await tx.query("select * from community_impact_score_source_link where claim_id=$1 and subject_user_id=$2",[claimId,claim.claimant_user_id])).rows[0];
 const source=sourceLink?.source_type||classifyClaimSource(claim),calc=policy.policy.calculation;
 const roundingDigits=Number(String(calc.rounding).match(/^([0-8])dp$/)?.[1]);
 if(!sourceLink)fail(409,"A reviewer must link this verified claim to its exact authoritative source record or historical-claim fingerprint before scoring.","SCORE_SOURCE_LINK_REQUIRED");
 if(!calc.eligibleSourceTypes.includes(source))fail(409,"This contribution source is not enabled by the active scoring policy.","SCORE_SOURCE_NOT_ELIGIBLE");
 const verifiedSource=safeSourceSnapshot(source,await verifySource(tx,source,sourceLink.source_record_id,claim.claimant_user_id,claim));
 const qualityRank=Number(calc.evidenceQualityRank[assessment.evidence_quality]),minimumQuality=Math.max(...policy.policy.dimensions.map(d=>Number(calc.evidenceQualityRank[d.minimumEvidenceQuality||calc.minimumEvidenceQuality])));
 if(!Number.isFinite(qualityRank)||!Number.isFinite(minimumQuality)||qualityRank<minimumQuality)fail(409,"Evidence quality does not meet the active score policy threshold for every scoring dimension.","SCORE_EVIDENCE_THRESHOLD");
 const maturityRank=Number(calc.outcomeMaturityRank[assessment.outcome_maturity]),minimumMaturity=Number(calc.outcomeMaturityRank[calc.minimumOutcomeMaturity]);
 if(!Number.isFinite(maturityRank)||maturityRank<minimumMaturity)fail(409,"Contribution outcome maturity does not meet the active score policy threshold.","SCORE_OUTCOME_THRESHOLD");
 const candidateLink=(await tx.query("select c.* from community_impact_claim_candidate_link l join community_impact_detection_candidate c on c.id=l.candidate_id where l.claim_id=$1 order by l.created_at desc limit 1",[claimId])).rows[0];
 if(candidateLink&&candidateLink.detection_status!=="detected")fail(409,"The linked detected source has been reversed and cannot be scored.","SCORE_SOURCE_REVERSED");
 if(candidateLink&&candidateLink.source_type==="initiative_participation"&&candidateLink.attribution_status!=="confirmed")fail(409,"Serve-Community participation attribution is not confirmed.","SCORE_ATTRIBUTION_UNCONFIRMED");
 if(candidateLink&&candidateLink.contributor_user_id&&candidateLink.contributor_user_id!==claim.claimant_user_id)fail(409,"The claim claimant does not match the verified source contributor.","SCORE_ATTRIBUTION_MISMATCH");
 if(sourceLink&&["serve_community_participation","offline_completed_project"].includes(sourceLink.source_type)&&(!candidateLink||candidateLink.id!==sourceLink.source_record_id))fail(409,"The score source link no longer matches an exact claim-to-detection reconciliation.","SCORE_SOURCE_MISMATCH");
 const rubric=assessment.rubric||{},ratings=rubric.dimensions||rubric;
 const explanations=[];let weighted=0;
 for(const d of policy.policy.dimensions){
  if(d.measurementRules?.requiresEvidenceReferences){const evidenceCount=Number((await tx.query("select count(*)::int count from community_impact_claim_evidence where claim_id=$1 and id=any($2::uuid[]) and removed_at is null",[claimId,assessment.evidence_references||[]])).rows[0].count);if(evidenceCount===0)fail(409,"The active policy requires current evidence references for "+d.label+".","SCORE_EVIDENCE_REFERENCE_REQUIRED")}
  if(d.measurementRules?.requiresFollowUpEvidence){const followUpDays=Number(d.measurementRules.followUpDays);const evidenceCount=Number((await tx.query("select count(*)::int count from community_impact_claim_evidence where claim_id=$1 and evidence_type='metric_source' and source_date is not null and source_date<=current_date-$2::int and removed_at is null",[claimId,followUpDays])).rows[0].count);if(evidenceCount===0)fail(409,"The active policy requires dated follow-up metric evidence for "+d.label+".","SCORE_FOLLOW_UP_EVIDENCE_REQUIRED")}
  if(d.measurementRules?.minimumOutcomeMaturity){const dimensionMinimum=Number(calc.outcomeMaturityRank[d.measurementRules.minimumOutcomeMaturity]);if(!Number.isFinite(dimensionMinimum)||maturityRank<dimensionMinimum)fail(409,"The active policy requires a higher outcome maturity for "+d.label+".","SCORE_DIMENSION_OUTCOME_MATURITY_REQUIRED")}
  if(d.measurementRules?.requiresRecipientConfirmation&&d.measurementRules.recipientConfirmationSourceTypes.includes(source)){const confirmed=verifiedSource.participantConsent==="accepted"||verifiedSource.requesterAccepted===true||verifiedSource.recipientConfirmed===true||verifiedSource.jobOutcomeVerified===true;if(!confirmed)fail(409,"The active policy requires a recipient or partner confirmation for "+d.label+".","SCORE_RECIPIENT_CONFIRMATION_REQUIRED")}
  const rating=Number(ratings[d.key]);if(!Number.isFinite(rating)||rating<Number(d.ratings.min)||rating>Number(d.ratings.max)||Math.abs((rating-Number(d.ratings.min))/Number(d.ratings.step||1)-Math.round((rating-Number(d.ratings.min))/Number(d.ratings.step||1)))>0.000001)fail(409,"Assessment is missing a valid reviewer rating for "+d.label+".","SCORE_RUBRIC_INCOMPLETE");
  const normalized=(rating-Number(d.ratings.min))/(Number(d.ratings.max)-Number(d.ratings.min));
  weighted+=normalized*Number(d.weight)/100;
  explanations.push({dimension:d.key,label:d.label,rating,minimum:Number(d.ratings.min),maximum:Number(d.ratings.max),weight:Number(d.weight),weightedContribution:Number((normalized*Number(d.weight)/100).toFixed(roundingDigits))});
 }
 const role=assessment.contribution_role||claim.contribution_role||"other",roleFactor=Number(calc.roleFactors[role]);
 if(!Number.isFinite(roleFactor)||roleFactor<0)fail(409,"The active policy has no valid role factor for this contribution.","SCORE_ROLE_FACTOR_MISSING");
 const share=Number(assessment.attribution_share);if(!Number.isFinite(share)||share<=0||share>100)fail(409,"The reviewer attribution share is invalid.","SCORE_ATTRIBUTION_SHARE_INVALID");
 if(source==="offline_completed_project"&&Math.abs(share-Number(verifiedSource.attributionShare))>0.0001)fail(409,"Reviewer score attribution must match the verified individual offline-project attribution share.","SCORE_ATTRIBUTION_SHARE_MISMATCH");
 let points=weighted*Number(calc.basePoints)*roleFactor*(share/100);
 const appliedModifiers=[];
 for(const rule of calc.modifiers){if((!rule.sourceType||rule.sourceType===source)&&(!rule.category||rule.category===assessment.category)&&(!rule.role||rule.role===role)&&(!rule.evidenceQuality||rule.evidenceQuality===assessment.evidence_quality)&&(!rule.outcomeMaturity||rule.outcomeMaturity===assessment.outcome_maturity)){if(rule.operation==="multiply")points*=Number(rule.value);else points+=Number(rule.value);appliedModifiers.push({key:rule.key,operation:rule.operation,value:Number(rule.value)})}}
 const appliedDecayRules=[];
 for(const rule of calc.decayRules){if(rule.sourceType===source&&(!rule.category||rule.category===assessment.category)){const sourceTime=verifiedSource.sourceDate?new Date(verifiedSource.sourceDate).getTime():new Date(claim.created_at).getTime();if(!Number.isFinite(sourceTime))fail(409,"The source date required by the active score decay policy is unavailable.","SCORE_SOURCE_DATE_REQUIRED");const ageDays=(Date.now()-sourceTime)/86400000;if(ageDays>=Number(rule.afterDays)){points*=Number(rule.factor);appliedDecayRules.push({sourceType:rule.sourceType,afterDays:Number(rule.afterDays),factor:Number(rule.factor),ageDays:Number(ageDays.toFixed(2))})}}}
 const categoryCap=calc.categoryCaps?.[assessment.category],sourceCap=calc.sourceCaps?.[source];
 if(Number.isFinite(Number(categoryCap))){const used=Number((await tx.query("select coalesce(sum(points),0)::numeric total from community_impact_score_ledger where subject_user_id=$1 and explanation->>'category'=$2",[claim.claimant_user_id,assessment.category])).rows[0].total);points=Math.min(points,Math.max(0,Number(categoryCap)-used))}
 if(Number.isFinite(Number(sourceCap))){const used=Number((await tx.query("select coalesce(sum(points),0)::numeric total from community_impact_score_ledger where subject_user_id=$1 and source_type=$2",[claim.claimant_user_id,source])).rows[0].total);points=Math.min(points,Math.max(0,Number(sourceCap)-used))}
 const periodCap=calc.periodCaps?.[source];if(periodCap&&Number.isFinite(Number(periodCap.points))&&Number.isFinite(Number(periodCap.windowDays))&&Number(periodCap.windowDays)>0){const used=Number((await tx.query("select coalesce(sum(points),0)::numeric total from community_impact_score_ledger where subject_user_id=$1 and source_type=$2 and created_at>=now()-($3::text||' days')::interval",[claim.claimant_user_id,source,String(periodCap.windowDays)])).rows[0].total);points=Math.min(points,Math.max(0,Number(periodCap.points)-used))}
 for(const rule of Array.isArray(calc.diminishingReturns)?calc.diminishingReturns:[]){if(rule.sourceType===source&&Number.isFinite(Number(rule.afterCount))&&Number.isFinite(Number(rule.factor))&&Number(rule.factor)>=0&&Number(rule.factor)<=1){const count=Number((await tx.query("select count(*)::int count from community_impact_score_ledger l where subject_user_id=$1 and source_type=$2 and entry_type='award' and not exists(select 1 from community_impact_score_ledger r where r.reverses_entry_id=l.id)",[claim.claimant_user_id,source])).rows[0].count);if(count>=Number(rule.afterCount))points*=Number(rule.factor)}}
 if(!Number.isFinite(points)||points<=0)fail(409,"The calculated score is not a positive eligible value after configured caps and diminishing returns.","SCORE_CALCULATION_INVALID");
 points=Number(points.toFixed(roundingDigits));
 const sourceRecord=sourceLink.source_record_id,sourceSystem=sourceLink.source_system;
 const idempotency=hash(["award",claim.claimant_user_id,source,sourceRecord,policy.id,assessment.id].join(":"));
 const existing=(await tx.query("select id,points from community_impact_score_ledger where idempotency_key=$1",[idempotency])).rows[0];if(existing)return {ledgerEntryId:existing.id,points:Number(existing.points),status:"already_recorded"};
 const explanation={sourceType:source,sourceSystem,sourceRecordId:sourceRecord,sourceLinkId:sourceLink?.id||null,verifiedSourceSnapshot:verifiedSource,claimId,assessmentId:assessment.id,assessmentPolicyVersionId:assessment.score_policy_version_id,assessmentStatus:assessment.status,evidenceQuality:assessment.evidence_quality,evidenceQualityRank:qualityRank,outcomeMaturity:assessment.outcome_maturity,outcomeMaturityRank:maturityRank,category:assessment.category,contributionRole:role,roleFactor,attributionShare:share,dimensions:explanations,appliedModifiers,appliedDecayRules,weightedDimensionScore:Number(weighted.toFixed(roundingDigits)),basePoints:Number(calc.basePoints),categoryCap:categoryCap??null,sourceCap:sourceCap??null,points,policyVersion:policy.version,policyVersionId:policy.id,policyEffectiveAt:policy.effective_at,evaluationOnly:policy.evaluation_only,publicScoreEnabled:policy.public_score_enabled===true,rationale};
 const entry=(await tx.query("insert into community_impact_score_ledger(subject_user_id,source_system,source_type,source_record_id,claim_id,assessment_id,policy_version_id,entry_type,points,idempotency_key,explanation,created_by) values($1,$2,$3,$4,$5,$6,$7,'award',$8,$9,$10,$11) returning id,points",[claim.claimant_user_id,sourceSystem,source,sourceRecord,claimId,assessment.id,policy.id,points,idempotency,explanation,actorUserId])).rows[0];
 return {ledgerEntryId:entry.id,points:Number(entry.points),status:"awarded",evaluationOnly:policy.evaluation_only};
}
export async function getActiveScorePolicy(){const row=await activePolicy(getPool());return {version:row.version,effectiveAt:row.effective_at,evaluationOnly:row.evaluation_only,publicScoreEnabled:row.public_score_enabled,dimensions:row.policy.dimensions,publication:row.policy.publication};}
export async function getMyImpactWorkspace(userId){
 const db=getPool(),score=await getMyScore(userId);
 const [claims,candidates,category,counts]=await Promise.all([
  db.query("select c.id,c.tracking_reference,c.category,c.contribution_type,c.contribution_role,c.project_title,c.activity_summary,c.output_summary,c.outcome_summary,c.status,c.updated_at,c.created_at,(select count(*)::int from community_impact_claim_evidence e where e.claim_id=c.id and e.removed_at is null) evidence_count from community_impact_claim c where c.claimant_user_id=$1 and c.status not in('withdrawn','rejected') order by c.updated_at desc limit 100",[userId]),
  db.query("select c.id,c.source_type,c.source_record_id,c.canonical_category,c.contribution_role,c.attribution_status,c.detection_status,c.confidence,c.created_at from community_impact_detection_candidate c where c.contributor_user_id=$1 and c.detection_status='detected' union all select c.id,c.source_type,c.source_record_id,c.canonical_category,a.contribution_role,'confirmed' attribution_status,c.detection_status,c.confidence,c.created_at from community_impact_detection_candidate c join community_impact_offline_attribution a on a.candidate_id=c.id where a.contributor_user_id=$1 and a.status='verified' and a.contributor_confirmed_at is not null and c.detection_status='detected' order by created_at desc limit 100",[userId]),
  db.query("select coalesce(explanation->>'category','uncategorized') category,coalesce(sum(points),0)::numeric(14,4) points,count(*)::int entries from community_impact_score_ledger where subject_user_id=$1 group by 1 order by points desc",[userId]),
  db.query("select count(*) filter(where status in('submitted','under_review','clarification_requested'))::int pending,count(*) filter(where status='verified')::int verified,count(*)::int total from community_impact_claim where claimant_user_id=$1",[userId])
 ]);
 const pendingClaims=claims.rows.filter(x=>['draft','submitted','under_review','clarification_requested','pending_review'].includes(x.status));
 const missingEvidence=claims.rows.filter(x=>['draft','clarification_requested'].includes(x.status)&&Number(x.evidence_count)===0);
 return {score:score.score,awards:score.awards,reversals:score.reversals,policyVersion:score.policyVersion,evaluationOnly:score.evaluationOnly,publicScoreEnabled:score.publicScoreEnabled,dimensions:score.dimensions,items:score.items,categoryBreakdown:category.rows,claims:claims.rows,pendingClaims,detectedContributions:candidates.rows,verifiedClaimCount:Number(counts.rows[0]?.verified||0),pendingClaimCount:Number(counts.rows[0]?.pending||0),totalClaimCount:Number(counts.rows[0]?.total||0),progressPercent:Number(counts.rows[0]?.total||0)?Math.round(Number(counts.rows[0]?.verified||0)/Number(counts.rows[0]?.total||1)*100):0,missingEvidenceCount:missingEvidence.length,reminders:[...(pendingClaims.length?[{code:"pending_claims",count:pendingClaims.length,title:"Continue your contribution claims",message:"Review submitted or draft claims and respond to any clarification request.",href:"/community-impact/claims"}]:[]),...(missingEvidence.length?[{code:"missing_evidence",count:missingEvidence.length,title:"Add supporting evidence",message:"Some claims need evidence before reviewers can verify them.",href:"/community-impact/claims"}]:[]),...(candidates.rows.length?[{code:"detected_contributions",count:candidates.rows.length,title:"Review detected contributions",message:"Confirm or dispute contributions detected from authoritative source records.",href:"/community-impact/claims"}]:[])]};
}
export async function getMyScore(userId){
 const db=getPool(),policy=await activePolicy(db);
 const totals=(await db.query("select coalesce(sum(points),0)::numeric(14,4) total,count(*) filter(where points>0)::int awards,count(*) filter(where points<0)::int reversals from community_impact_score_ledger where subject_user_id=$1",[userId])).rows[0];
 const rows=(await db.query("select id,source_type,entry_type,points,explanation,created_at from community_impact_score_ledger where subject_user_id=$1 order by created_at desc limit 100",[userId])).rows.map(row=>{const explanation={...(row.explanation||{})};for(const key of ["sourceRecordId","sourceLinkId","verifiedSourceSnapshot","claimId","assessmentId","rationale"])delete explanation[key];return {...row,explanation}});
 return {score:Number(totals.total),awards:totals.awards,reversals:totals.reversals,policyVersion:policy.version,dimensions:policy.policy.dimensions,evaluationOnly:policy.evaluation_only,publicScoreEnabled:policy.public_score_enabled,publicationStatus:"private_evaluation",items:rows};
}
export async function listScorePolicies(actor){const db=getPool();await permission(db,actor,"community_impact.score.policy.manage").catch(async error=>{if(error.code!=="FORBIDDEN")throw error;await permission(db,actor,"community_impact.score.policy.approve")});const rows=await db.query("select id,version,status,evaluation_only,public_score_enabled,rationale,change_summary,created_by,approved_by,approval_reference,effective_at,created_at,policy from community_impact_score_policy_version order by version desc");return {items:rows.rows}}
export async function proposeScorePolicy(actor,input){
 await permission(getPool(),actor,"community_impact.score.policy.manage");
 const policy=validatePolicy(input?.policy),rationale=clean(input?.rationale,12,2000,"Policy rationale"),summary=clean(input?.changeSummary,8,1000,"Change summary");
 return withTransaction(async tx=>{
  await tx.query("lock table community_impact_score_policy_version in exclusive mode");
  const latest=await tx.query("select coalesce(max(version),0)::int version from community_impact_score_policy_version");
  const version=latest.rows[0].version+1,serialized=JSON.stringify(policy),digest=hash(serialized);
  const row=(await tx.query("insert into community_impact_score_policy_version(version,schema_version,policy_hash,policy,status,evaluation_only,public_score_enabled,rationale,change_summary,created_by) values($1,1,$2,$3,'in_review',true,false,$4,$5,$6) returning id,version,status",[version,digest,policy,rationale,summary,actor])).rows[0];
  await tx.query("insert into community_impact_score_policy_event(policy_version_id,actor_user_id,event_code,rationale,metadata) values($1,$2,'proposed',$3,$4)",[row.id,actor,rationale,{version,policyHash:digest}]);
  return row;
 });
}
export async function approveScorePolicy(actor,id,input){
 await permission(getPool(),actor,"community_impact.score.policy.approve");
 const reference=clean(input?.approvalReference,8,240,"Approval reference"),rationale=clean(input?.rationale,12,2000,"Approval rationale");
 return withTransaction(async tx=>{
  const row=(await tx.query("select * from community_impact_score_policy_version where id=$1 for update",[id])).rows[0];if(!row||row.status!=="in_review")fail(409,"Only a policy under review can be approved.","INVALID_STATE");if(row.created_by===actor)fail(403,"The policy proposer cannot approve their own policy.","SELF_APPROVAL");
  await tx.query("update community_impact_score_policy_version set status='approved',approved_by=$2,approval_reference=$3,approved_at=now() where id=$1",[id,actor,reference]);
  await tx.query("insert into community_impact_score_policy_event(policy_version_id,actor_user_id,event_code,rationale,metadata) values($1,$2,'approved',$3,$4)",[id,actor,rationale,{approvalReference:reference}]);
  return {id,status:"approved"};
 });
}
export async function activateScorePolicy(actor,id,rationale){
 await permission(getPool(),actor,"community_impact.score.policy.approve");
 const why=clean(rationale,12,2000,"Activation rationale");
 return withTransaction(async tx=>{
  const row=(await tx.query("select * from community_impact_score_policy_version where id=$1 for update",[id])).rows[0];if(!row||row.status!=="approved")fail(409,"Only an independently approved score policy can be activated.","INVALID_STATE");if(row.created_by===actor)fail(403,"The policy proposer cannot activate their own policy.","SELF_ACTIVATION");
  const active=(await tx.query("select policy_version_id from community_impact_score_active_policy where singleton=true for update")).rows[0];
  if(active)await tx.query("update community_impact_score_policy_version set status='superseded' where id=$1",[active.policy_version_id]);
  await tx.query("update community_impact_score_policy_version set status='active',effective_at=now(),evaluation_only=case when policy->'publication'->>'enabled' = 'true' then false else true end,public_score_enabled=case when policy->'publication'->>'enabled' = 'true' then true else false end where id=$1",[id]);
  await tx.query("update community_impact_score_active_policy set policy_version_id=$1,activated_by=$2,activated_at=now() where singleton=true",[id,actor]);
  await tx.query("insert into community_impact_score_policy_event(policy_version_id,actor_user_id,event_code,rationale,metadata) values($1,$2,'activated',$3,$4)",[id,actor,why,{version:row.version}]);
  return {id,status:"active",version:row.version};
 });
}
export async function scoreVerifiedClaim(actor,claimId,rationale){
 await permission(getPool(),actor,"community_impact.score.recalculate");
 const why=clean(rationale,12,2000,"Scoring rationale");
 return withTransaction(async tx=>{const locked=(await tx.query("select id from community_impact_claim where id=$1 for update",[claimId])).rows[0];if(!locked)fail(404,"Contribution claim not found.","NOT_FOUND");const policy=await activePolicy(tx);const existing=(await tx.query("select l.id,l.policy_version_id,l.assessment_id,l.points from community_impact_score_ledger l where l.claim_id=$1 and l.entry_type='award' and not exists(select 1 from community_impact_score_ledger r where r.reverses_entry_id=l.id) order by l.created_at desc",[claimId])).rows;if(existing.length){const assessment=(await tx.query("select id from community_impact_contribution_assessment where claim_id=$1 and status='approved' order by approved_at desc nulls last,created_at desc limit 1",[claimId])).rows[0];if(existing.length===1&&existing[0].policy_version_id===policy.id&&existing[0].assessment_id===assessment?.id)return {status:"already_recorded",ledgerEntryId:existing[0].id,points:Number(existing[0].points)};fail(409,"This contribution already has an active ledger award. Use the explicit recalculation operation to preserve reversal history before replacing it.","SCORE_RECALCULATION_REQUIRED")}return scoreClaim(tx,actor,claimId,why,policy)});
}
async function reverseEntry(tx,actor,entry,reason,reasonCode){
 const idempotency=hash(["reversal",entry.id,reasonCode,reason].join(":"));
 const exists=(await tx.query("select id from community_impact_score_ledger where idempotency_key=$1",[idempotency])).rows[0];if(exists)return exists;
 const row=(await tx.query("insert into community_impact_score_ledger(subject_user_id,source_system,source_type,source_record_id,claim_id,assessment_id,policy_version_id,entry_type,points,reverses_entry_id,idempotency_key,explanation,created_by) values($1,$2,$3,$4,$5,$6,$7,'reversal',$8,$9,$10,$11,$12) returning id",[entry.subject_user_id,entry.source_system,entry.source_type,entry.source_record_id,entry.claim_id,entry.assessment_id,entry.policy_version_id,-Math.abs(Number(entry.points)),entry.id,idempotency,{reversesEntryId:entry.id,originalPoints:Number(entry.points),category:entry.explanation?.category||null,reasonCode,rationale:reason},actor])).rows[0];
 await tx.query("insert into community_impact_score_adjustment_event(ledger_entry_id,actor_user_id,event_code,reason_code,rationale,before_snapshot,after_snapshot) values($1,$2,'reversed',$3,$4,$5,$6)",[row.id,actor,reasonCode,reason,{originalEntryId:entry.id,points:Number(entry.points)},{reversalEntryId:row.id,points:-Math.abs(Number(entry.points))}]);
 return row;
}
export async function reverseScoreEntry(actor,entryId,input){
 await permission(getPool(),actor,"community_impact.score.reverse");
 const reason=clean(input?.rationale,12,2000,"Reversal rationale"),code=clean(input?.reasonCode,3,80,"Reversal reason code");
 return withTransaction(async tx=>{
  const entry=(await tx.query("select * from community_impact_score_ledger where id=$1 for update",[entryId])).rows[0];if(!entry||entry.entry_type!=="award")fail(404,"Award ledger entry not found.","NOT_FOUND");
  const prior=(await tx.query("select 1 from community_impact_score_ledger where reverses_entry_id=$1",[entryId])).rowCount;if(prior)fail(409,"This ledger award has already been reversed.","ALREADY_REVERSED");
  const reversal=await reverseEntry(tx,actor,entry,reason,code);return {originalEntryId:entryId,reversalEntryId:reversal.id,reversedPoints:Math.abs(Number(entry.points))};
 });
}
export async function recalculateVerifiedClaim(actor,claimId,input){
 await permission(getPool(),actor,"community_impact.score.recalculate");
 const rationale=clean(input?.rationale,12,2000,"Recalculation rationale");
 return withTransaction(async tx=>{
  const locked=(await tx.query("select id from community_impact_claim where id=$1 for update",[claimId])).rows[0];if(!locked)fail(404,"Contribution claim not found.","NOT_FOUND");
  const policy=await activePolicy(tx);
  const prior=(await tx.query("select * from community_impact_score_ledger where claim_id=$1 and entry_type='award' and not exists(select 1 from community_impact_score_ledger r where r.reverses_entry_id=community_impact_score_ledger.id) order by created_at desc for update",[claimId])).rows;
  const currentAssessment=(await tx.query("select id from community_impact_contribution_assessment where claim_id=$1 and status='approved' order by approved_at desc nulls last,created_at desc limit 1",[claimId])).rows[0];
  if(prior.length===1&&prior[0].policy_version_id===policy.id&&prior[0].assessment_id===currentAssessment?.id)return {status:"no_change",ledgerEntryId:prior[0].id,points:Number(prior[0].points),message:"The current approved assessment has already been scored under the active policy."};
  for(const entry of prior)await reverseEntry(tx,actor,entry,rationale,"policy_recalculation");
  let result;try{result=await scoreClaim(tx,actor,claimId,rationale,policy)}catch(error){if(prior.length===0)throw error;result={status:"blocked",reason:error.code||"SCORE_RECALCULATION_BLOCKED"}}
  const sourceMeta=(await tx.query("select source_type,source_record_id from community_impact_score_source_link where claim_id=$1",[claimId])).rows[0];
  const claimMeta=(await tx.query("select * from community_impact_claim where id=$1",[claimId])).rows[0];
  const log=(await tx.query("insert into community_impact_score_recalculation(subject_user_id,source_type,source_record_id,prior_policy_version_id,target_policy_version_id,initiated_by,rationale,status,summary) select c.claimant_user_id,$2,$3,$4,$5,$6,$7,$8,$9 from community_impact_claim c where c.id=$1 returning id",[claimId,prior[0]?.source_type||sourceMeta?.source_type||classifyClaimSource(claimMeta),prior[0]?.source_record_id||sourceMeta?.source_record_id||claimId,prior[0]?.policy_version_id||null,policy.id,actor,rationale,result?.status==="blocked"?"blocked":prior.length?"completed":result?.status==="already_recorded"?"no_change":"completed",{reversed:prior.length,newEntry:result||null}])).rows[0];
  return {recalculationId:log.id,...(result||{})};
 });
}
export async function listScoreRecalculations(actor){await permission(getPool(),actor,"community_impact.score.view_all");const rows=await getPool().query("select r.*,u.email initiated_by_email from community_impact_score_recalculation r join app_user u on u.id=r.initiated_by order by r.created_at desc limit 200");return {items:rows.rows}}
export async function listScoreLedger(actor,filters={}){
 await permission(getPool(),actor,"community_impact.score.view_all");
 const values=[],where=[];if(filters.userId){values.push(filters.userId);where.push("l.subject_user_id=$"+values.length)}if(filters.sourceType){values.push(filters.sourceType);where.push("l.source_type=$"+values.length)}
 const rows=await getPool().query("select l.*,u.email subject_email from community_impact_score_ledger l join app_user u on u.id=l.subject_user_id "+(where.length?"where "+where.join(" and "):"")+" order by l.created_at desc limit 200",values);return {items:rows.rows};
}
