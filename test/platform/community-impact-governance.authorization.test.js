import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import * as membership from "../../src/membership/service.js";
import {closePool} from "../../src/platform/db.js";
import * as governance from "../../src/platform/community-impact-governance.js";

async function account(){
 const suffix=randomUUID(),digits=suffix.replace(/[^0-9]/g,"").slice(0,8).padEnd(8,"7");
 const result=await membership.register({email:`impact-governance-${suffix}@example.test`,password:"ImpactGovernancePassword!2026",firstName:"Impact",lastName:"Governance",phone:`08${digits}`},`impact-governance-test-${suffix}`);
 return result.user.id;
}
const forbidden=error=>error?.statusCode===403&&error?.code==="FORBIDDEN";

test("governance actions deny an authenticated account without the specific permission",async()=>{
 const userId=await account(),id=randomUUID(),other=randomUUID();
 const actions=[
  ()=>governance.listIdentityAssuranceQueue(userId),
  ()=>governance.decideIdentityAssurance(userId,id,{decision:"verified",reasonCode:"test_review",rationale:"This is a valid test rationale for the identity decision."}),
  ()=>governance.listOfflineAttributions(userId),
  ()=>governance.proposeOfflineAttribution(userId,id,{contributorUserId:other,contributionRole:"contributor",attributionShare:50,rationale:"This is a valid test attribution rationale.",evidenceFileIds:[randomUUID()]}),
  ()=>governance.assignOfflineAttribution(userId,id,other,"This is a valid test assignment rationale."),
  ()=>governance.decideOfflineAttribution(userId,id,{decision:"verified",rationale:"This is a valid test attribution decision."}),
  ()=>governance.listDetectionPolicies(userId),
  ()=>governance.proposeDetectionPolicy(userId,{sourceType:"offline_completed_project",rules:{enabled:true,sourceEventCodes:["completed"],categoryMap:{community_service:"community_care"}},rationale:"This is a valid test policy proposal rationale."}),
  ()=>governance.approveDetectionPolicy(userId,id,{approvalReference:"TEST-APPROVAL-2026",rationale:"This is a valid test policy approval rationale."}),
  ()=>governance.activateDetectionPolicy(userId,id,"This is a valid test activation rationale."),
  ()=>governance.reconcileClaimCandidate(userId,id,other,"This is a valid test reconciliation rationale."),
  ()=>governance.declareReviewerConflict(userId,id,{conflictType:"other",declaration:"This is a valid test conflict declaration."}),
  ()=>governance.proposeContributionAssessment(userId,id,{evidenceReferences:[randomUUID()],category:"community_care",contributionType:"project_delivery",contributionRole:"contributor",evidenceQuality:"adequate",outcomeMaturity:"output",attributionShare:100,riskLevel:"standard",rationale:"This is a valid test assessment rationale."}),
  ()=>governance.secondReviewAssessment(userId,id,{decision:"approved",rationale:"This is a valid test second-review rationale."}),
  ()=>governance.listPendingContributionAssessments(userId),
  ()=>governance.evaluateRetention(userId,{limit:1})
 ];
 for(const action of actions)await assert.rejects(action,forbidden);
});

test.after(async()=>{await closePool();});
