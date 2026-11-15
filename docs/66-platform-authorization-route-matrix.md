# MPA API route-by-route authorization dispatch inventory

**Repository:** `mpaproject1/MPA-Professionals-Network`  
**Branch:** `feat/workstream-3-progress-members-workspace`  
**Source:** `server.js` at blob `ed753d7ba3415afd59aa85f402ac615b78c237d4`  
**Inventory generated:** 2026-11-15  
**Coverage:** 642 API route branches found by static inspection of `server.js` (all methods and dispatch predicates). This includes public, authenticated, privileged, and token/webhook routes. It does not claim that a route's service-level policy has been proven unless an explicit route helper is shown.

## How to read this matrix

- **Route dispatch gate** is what the route branch visibly applies in `server.js`; it is not a substitute for service-layer ownership, assignment, tenant, consent, or workflow checks.
- `auth(req)` proves session authentication/current-role loading, not authorization to the requested action.
- `anyRole`, `anyRoleOrPermission`, `requireRole`, and `assert…` are shown with their actual arguments where extractable. `anyRoleOrPermission` is OR semantics: any listed role **or** any listed direct permission passes that gate.
- **Phase 0 correction (2026-11-15):** the former `DEFECT CANDIDATE` label was based on a branch-local scan and did not account for the dispatcher-wide binding. `server.js:463` executes `const identity=await auth(req);` unconditionally inside the request handler's enclosing `try` block before the Network-Plus and subsequent protected route branches. Those branches share that lexical binding until the dispatcher catch. The 319 rows from the original identity-binding scan are therefore classified as **authenticated by the shared dispatcher binding**, not as missing-principal defects. This proves principal construction at dispatch level; it does not prove each route's action capability or service-level resource scope. Request-level smoke tests were not run as part of this documentation update.
- **Service policy unverified** means the handler calls a service that may enforce stronger authorization; this inventory has not inferred that policy from a route name.
- A dynamic matcher is recorded as a source predicate and line number rather than inventing a concrete URL template.

## Static dispatch summary

| Measure | Count |
|---|---:|
| API route branches inventoried | 642 |
| Branches containing `auth(req)` | 275 |
| Branches using optional identity | 8 |
| Branches flagged by the original branch-local identity scan | 319 | Reclassified in Phase 0: all are within the shared dispatcher-authenticated scope beginning at `server.js:463` |

These are syntactic counts from the checked-in source, not runtime success/failure counts. Phase 0 verified the enclosing lexical scope: the unconditional `auth(req)` call at `server.js:463` runs before the 319 flagged branches and binds `identity` for the remainder of the dispatcher `try` block. The 319 are false positives for missing-principal/`ReferenceError` risk. Do not add duplicate local authentication calls or alter public-route placement on the basis of the old scan. Route action authorization and service/resource scope remain separate work.


## Phase 0 classification — completed source-level validation (2026-11-15)

| Disposition | Count | Evidence / interpretation |
|---|---:|---|
| Original identity-binding candidates reviewed | 319 | The original static scan counted route branches that used the dispatcher principal without a branch-local declaration or `auth(req)` call |
| Authenticated by shared dispatcher binding | 319 | `server.js:463` unconditionally awaits `auth(req)` and binds `identity` in the enclosing request-handler `try` scope before these route branches |
| Confirmed missing-principal defects in this candidate set | 0 | No candidate branch is outside the lexical scope of the line-463 binding |
| Public/token/webhook exceptions within this candidate set | 0 | Public, optional-viewer and signed callback routes are dispatched before the unconditional authentication boundary; the 319 candidates occur after it |

**Classification rule:** the dispatcher-wide binding is the principal source for all 319 candidates. The matrix's former 296 explicit `DEFECT CANDIDATE` labels are corrected below; the remaining 23 candidates were represented by rows whose route-level gate already showed an `identity`-based helper or whose handler spans multiple source lines. Both groups inherit the same dispatcher binding. For every matrix row with a `server.js` source line at or after 464, the gate column shows the route-specific action check (if any); authentication is inherited from line 463 unless a route explicitly documents a different public/optional contract before that boundary.

**Evidence boundary:** this is a source/lexical-scope conclusion based on the checked-in `server.js` at blob `ed753d7ba3415afd59aa85f402ac615b78c237d4`. It is not a claim that every route's action authorization, tenant/resource check, or service policy is correct. No application was started and no request-level test or CI run was performed for this documentation-only update. Those runtime checks remain explicit follow-up validation, not grounds for adding duplicate authentication calls.

---
## Route matrix

| server.js line | HTTP | Route matcher / path predicate | Dispatch access gate | First service handler |
|---:|---|---|---|---|
| 161 | GET | `p === "api/v1/admin/test-lab"` | anyRole(identity,["system_admin"]) | `testLab.listTestPortfolios` |
| 162 | POST | `p === "api/v1/admin/test-lab"` | anyRole(identity,["system_admin"]) | `testLab.createTestPortfolio` |
| 163 | POST | `p startsWith "api/v1/admin/test-lab/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `testLab.exportTestPortfolioAccounts` |
| 164 | GET | `p startsWith "api/v1/admin/test-lab/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `testLab.previewTestPortfolioReset` |
| 165 | GET | `p startsWith "api/v1/admin/test-lab/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `testLab.getTestPortfolioOperations` |
| 166 | GET | `p startsWith "api/v1/admin/test-lab/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `testLab.exportTestPortfolioScenarioWorkbook` |
| 167 | POST | `p startsWith "api/v1/admin/test-lab/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `testLab.simulateTestPayment` |
| 168 | DELETE | `p startsWith "api/v1/admin/test-lab/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `testLab.resetTestPortfolio` |
| 169 | POST | `p === "api/v1/public/community-campaigns/opt-in"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `communityCampaigns.createPublicCampaignOptIn` |
| 170 | POST | `p === "api/v1/public/community-campaigns/manage"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `communityCampaigns.managePublicCampaignOptIn` |
| 171 | POST | `p === "api/v1/payments/chapa/webhook"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `membership.handleChapaMembershipWebhook` |
| 172 | GET | `p === "api/v1/public/membership-verification"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `membershipCard.verifyMembershipCard` |
| 173 | POST | `p === "api/v1/public/support-bot/message"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `supportBot.answerPublicQuestion` |
| 174 | GET | `p === "api/v1/auth/human-challenge"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `—` |
| 175 | POST | `p === "api/v1/auth/human-challenge/verify"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `—` |
| 176 | POST | `p === "api/v1/auth/email-verification/resend"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `—` |
| 177 | POST | `p === "api/v1/auth/email-verification/verify"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `—` |
| 178 | POST | `p === "api/v1/auth/passkeys/options"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `—` |
| 179 | POST | `p === "api/v1/auth/passkeys/verify"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `—` |
| 180 | POST | `p === "api/v1/auth/passkeys/recovery"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `—` |
| 181 | POST | `p === "api/v1/admin/passkeys/registration/options"` | anyRole(identity,["system_admin","admin","platform_admin"]) | `—` |
| 182 | POST | `p === "api/v1/admin/passkeys/registration/verify"` | anyRole(identity,["system_admin","admin","platform_admin"]) | `—` |
| 183 | GET | `p === "api/v1/admin/passkeys"` | anyRole(identity,["system_admin","admin","platform_admin"]) | `—` |
| 184 | DELETE | `p startsWith "api/v1/admin/passkeys/" + path-segment constraints` | anyRole(identity,["system_admin","admin","platform_admin"]) | `—` |
| 185 | POST | `p === "api/v1/email/delivery-webhook"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `emailOperations.receiveDeliveryWebhook` |
| 192 | POST | `p === "api/v1/email/inbound-webhook"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `emailOperations.receiveInboundEmail` |
| 199 | GET | `p === "api/v1/admin/email/operations"` | anyRole(identity,["system_admin"]) | `emailOperations.getEmailOperations` |
| 200 | GET | `p === "api/v1/admin/email/messages"` | anyRole(identity,["system_admin"]) | `emailOperations.listEmailOutbox` |
| 201 | GET | `p === "api/v1/admin/email/recipient-holds"` | anyRole(identity,["system_admin"]) | `emailOperations.listEmailRecipientHolds` |
| 202 | POST | `p startsWith "api/v1/admin/email/recipient-holds/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `emailOperations.releaseEmailRecipientHold` |
| 203 | POST | `p === "api/v1/admin/email/preview"` | anyRole(identity,["system_admin"]) | `emailOperations.previewEmailTemplate` |
| 204 | GET | `p startsWith "api/v1/admin/email/templates/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `emailOperations.listEmailTemplateVersions` |
| 205 | POST | `p startsWith "api/v1/admin/email/templates/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `emailOperations.restoreEmailTemplateVersion` |
| 206 | GET | `p === "api/v1/admin/email/templates"` | anyRole(identity,["system_admin"]) | `emailOperations.listEmailTemplates` |
| 207 | PUT | `p startsWith "api/v1/admin/email/templates/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `emailOperations.saveEmailTemplate` |
| 208 | PUT | `p startsWith "api/v1/admin/email/drafts/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `emailOperations.updateEmailDraft` |
| 209 | POST | `p startsWith "api/v1/admin/email/drafts/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `emailOperations.cancelEmailDraft` |
| 210 | POST | `p === "api/v1/admin/email/drafts"` | anyRole(identity,["system_admin"]) | `emailOperations.saveEmailDraft` |
| 211 | POST | `p startsWith "api/v1/admin/email/drafts/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `emailOperations.queueEmailDraft` |
| 212 | POST | `p === "api/v1/admin/email/test"` | anyRole(identity,["system_admin"]) | `emailOperations.sendTestEmail` |
| 213 | POST | `p === "api/v1/admin/email/dispatch"` | anyRole(identity,["system_admin"]) | `emailOperations.dispatchEmailOutbox` |
| 214 | POST | `p startsWith "api/v1/admin/email/messages/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `emailOperations.retryFailedEmail` |
| 215 | POST | `p startsWith "api/v1/admin/email/verification-failures/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `emailOperations.retryVerificationEmail` |
| 216 | PATCH | `p startsWith "api/v1/admin/email/inbox/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `emailOperations.updateInbox` |
| 217 | POST | `p === "api/v1/public/opportunity-inquiries"` | Public route with optional authenticated viewer; service must enforce visibility | `publicOpportunity.createPublicInquiry` |
| 218 | GET | `p === "api/v1/public/opportunity-sharing-organizations"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `publicOpportunity.searchPublicSharingOrganizations` |
| 219 | POST | `p startsWith "api/v1/public/opportunity-inquiries/" + path-segment constraints` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `publicOpportunity.getPublicInquiry` |
| 220 | POST | `p startsWith "api/v1/public/opportunity-inquiries/" + path-segment constraints` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `publicOpportunity.getSharingHistory` |
| 221 | POST | `p startsWith "api/v1/public/opportunity-inquiries/" + path-segment constraints` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `publicOpportunity.updateSharingConsent` |
| 222 | GET | `p startsWith "api/v1/public/opportunity-inquiries/" + path-segment constraints` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `publicOpportunity.getPublicInquiry` |
| 223 | PATCH | `p startsWith "api/v1/public/opportunity-inquiries/" + path-segment constraints` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `publicOpportunity.updatePublicInquiryDetails` |
| 224 | POST | `p startsWith "api/v1/public/opportunity-inquiries/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.linkInquiryToAccount` |
| 225 | GET | `p === "api/v1/jobs"` | Public route with optional authenticated viewer; service must enforce visibility | `organizationJobs.listJobs` |
| 226 | GET | `p startsWith "api/v1/jobs/" + path-segment constraints` | Public route with optional authenticated viewer; service must enforce visibility | `organizationJobs.getJob` |
| 227 | GET | `p startsWith "api/v1/jobs/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `organizationJobs.listJobApplications` |
| 229 | GET | `dynamic parts predicate (see server.js line)` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `financeReceipts.verifyFinancePaymentVoucher` |
| 231 | GET | `p === "api/v1/me/community-impact/detected"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactDetection.listMyDetectedContributions` |
| 232 | POST | `p startsWith "api/v1/me/community-impact/detected/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactDetection.confirmMyDetectedAttribution` |
| 233 | POST | `p startsWith "api/v1/me/community-impact/detected/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactDetection.disputeMyDetectedAttribution` |
| 234 | GET | `p === "api/v1/admin/community-impact/detection/candidates"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactDetection.listDetectionCandidates` |
| 235 | GET | `p === "api/v1/me/community-impact/score/policy"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.getActiveScorePolicy` |
| 236 | GET | `p === "api/v1/me/community-impact/score"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.getMyScore` |
| 237 | GET | `p === "api/v1/me/community-impact/workspace"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.getMyImpactWorkspace` |
| 238 | GET | `p === "api/v1/me/community-impact/recognition"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRecognition.listMyRecognition` |
| 239 | GET | `p === "api/v1/community-impact/recognition/programs"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `communityImpactRecognition.listRecognitionPrograms` |
| 240 | POST | `p === "api/v1/me/community-impact/recognition/nominations"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRecognition.submitRecognitionNomination` |
| 241 | POST | `parts prefix "api/v1/me/community-impact/recognition/awards"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRecognition.setAwardPublicConsent` |
| 242 | GET | `p === "api/v1/admin/community-impact/recognition/programs"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRecognition.listRecognitionAdminPrograms` |
| 243 | POST | `p === "api/v1/admin/community-impact/recognition/programs"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRecognition.saveRecognitionProgram` |
| 244 | GET | `p === "api/v1/admin/community-impact/recognition/queue"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRecognition.listRecognitionQueue` |
| 245 | GET | `p === "api/v1/admin/community-impact/recognition/summary"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRecognition.getRecognitionAdminSummary` |
| 246 | POST | `parts prefix "api/v1/admin/community-impact/recognition/nominations"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRecognition.assignRecognitionNomination` |
| 247 | POST | `parts prefix "api/v1/admin/community-impact/recognition/nominations"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRecognition.decideRecognitionNomination` |
| 248 | GET | `p === "api/v1/admin/community-impact/score/policies"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.listScorePolicies` |
| 249 | POST | `p === "api/v1/admin/community-impact/score/policies"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.proposeScorePolicy` |
| 250 | POST | `parts prefix "api/v1/admin/community-impact/score/policies"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.approveScorePolicy` |
| 251 | POST | `parts prefix "api/v1/admin/community-impact/score/policies"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.activateScorePolicy` |
| 252 | POST | `parts prefix "api/v1/admin/community-impact/score/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.linkVerifiedSource` |
| 253 | POST | `parts prefix "api/v1/admin/community-impact/score/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.scoreVerifiedClaim` |
| 254 | POST | `parts prefix "api/v1/admin/community-impact/score/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.recalculateVerifiedClaim` |
| 255 | GET | `p === "api/v1/admin/community-impact/score/recalculations"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.listScoreRecalculations` |
| 256 | GET | `p === "api/v1/admin/community-impact/score/ledger"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.listScoreLedger` |
| 257 | POST | `parts prefix "api/v1/admin/community-impact/score/ledger"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.reverseScoreEntry` |
| 258 | GET | `p === "api/v1/admin/community-impact/identity-assurance"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.listIdentityAssuranceQueue` |
| 259 | GET | `p === "api/v1/admin/community-impact/offline-attributions"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.listOfflineAttributions` |
| 260 | GET | `p === "api/v1/admin/community-impact/detection/policies"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.listDetectionPolicies` |
| 261 | POST | `p === "api/v1/admin/community-impact/detection/scan"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactDetection.scanDetectionSources` |
| 262 | GET | `p === "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.listMyClaims` |
| 263 | POST | `p === "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.createClaim` |
| 264 | GET | `parts prefix "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.getMyClaim` |
| 265 | PATCH | `parts prefix "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.updateMyClaim` |
| 266 | POST | `parts prefix "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.attachClaimEvidenceUrl` |
| 267 | POST | `parts prefix "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.attachClaimEvidence` |
| 268 | POST | `parts prefix "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.removeClaimEvidence` |
| 269 | POST | `parts prefix "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.submitMyClaim` |
| 270 | POST | `parts prefix "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.withdrawMyClaim` |
| 271 | POST | `parts prefix "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.respondToClarification` |
| 272 | POST | `parts prefix "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.submitClaimAppeal` |
| 273 | GET | `p === "api/v1/admin/community-impact/claim-reviewers"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.listClaimReviewers` |
| 274 | GET | `p === "api/v1/admin/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.listReviewQueue` |
| 275 | POST | `parts prefix "api/v1/admin/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.assignClaim` |
| 276 | POST | `parts prefix "api/v1/admin/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.decideClaim` |
| 277 | GET | `p === "api/v1/admin/community-impact/claim-appeals"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.listClaimAppeals` |
| 278 | POST | `parts prefix "api/v1/admin/community-impact/claim-appeals"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.assignClaimAppeal` |
| 279 | POST | `parts prefix "api/v1/admin/community-impact/claim-appeals"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.decideClaimAppeal` |
| 280 | GET | `p === "api/v1/me/community-impact/identity-assurance"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.getMyIdentityAssurance` |
| 281 | POST | `p === "api/v1/me/community-impact/identity-assurance"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.submitIdentityAssurance` |
| 282 | POST | `parts prefix "api/v1/me/community-impact/identity-assurance"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.submitIdentityAssuranceCase` |
| 283 | POST | `parts prefix "api/v1/me/community-impact/identity-assurance"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.attachIdentityEvidence` |
| 284 | POST | `parts prefix "api/v1/admin/community-impact/identity-assurance"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.decideIdentityAssurance` |
| 285 | POST | `p === "api/v1/admin/community-impact/detection/policies"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.proposeDetectionPolicy` |
| 286 | POST | `parts prefix "api/v1/admin/community-impact/detection/policies"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.approveDetectionPolicy` |
| 287 | POST | `parts prefix "api/v1/admin/community-impact/detection/policies"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.activateDetectionPolicy` |
| 288 | POST | `parts prefix "api/v1/admin/community-impact/detection/candidates"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.proposeOfflineAttribution` |
| 289 | POST | `parts prefix "api/v1/me/community-impact/offline-attributions"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.confirmOfflineAttribution` |
| 290 | POST | `parts prefix "api/v1/admin/community-impact/offline-attributions"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.assignOfflineAttribution` |
| 291 | POST | `parts prefix "api/v1/admin/community-impact/offline-attributions"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.decideOfflineAttribution` |
| 292 | POST | `parts prefix "api/v1/admin/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.reconcileClaimCandidate` |
| 293 | POST | `parts prefix "api/v1/admin/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.declareReviewerConflict` |
| 294 | POST | `parts prefix "api/v1/admin/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.proposeContributionAssessment` |
| 295 | GET | `p === "api/v1/admin/community-impact/assessments"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.listPendingContributionAssessments` |
| 296 | POST | `parts prefix "api/v1/admin/community-impact/assessments"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.secondReviewAssessment` |
| 297 | POST | `p === "api/v1/admin/community-impact/retention/evaluate"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.evaluateRetention` |
| 298 | GET | `p === "api/v1/admin/community-impact/retention-policy"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRetention.getRetentionPolicyGovernance` |
| 299 | POST | `p === "api/v1/admin/community-impact/retention-policy"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRetention.proposeRetentionPolicy` |
| 300 | POST | `p startsWith "api/v1/admin/community-impact/retention-policy/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRetention.approveRetentionPolicy` |
| 301 | POST | `p startsWith "api/v1/admin/community-impact/retention-policy/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRetention.activateRetentionPolicy` |
| 302 | GET | `p === "api/v1/public/serve-community/completed-projects"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `serveCommunityInitiatives.listPublicCompletedProjects` |
| 303 | GET | `p === "api/v1/admin/serve-community/offline-projects"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityOfflineProjects.listStaffProjects` |
| 304 | POST | `p === "api/v1/admin/serve-community/offline-projects"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityOfflineProjects.createStaffProject` |
| 305 | PATCH | `p startsWith "api/v1/admin/serve-community/offline-projects/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityOfflineProjects.submitStaffProject` |
| 306 | PATCH | `p startsWith "api/v1/admin/serve-community/offline-projects/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityOfflineProjects.updateStaffProject` |
| 307 | PATCH | `p startsWith "api/v1/admin/serve-community/offline-projects/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityOfflineProjects.reviewStaffProject` |
| 308 | GET | `p === "api/v1/serve-community/initiatives"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `serveCommunityInitiatives.listPublicInitiatives` |
| 309 | GET | `p startsWith "api/v1/serve-community/initiatives/" + path-segment constraints` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `serveCommunityInitiatives.getPublicInitiative` |
| 310 | POST | `p === "api/v1/serve-community/initiatives"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.createInitiative` |
| 311 | PATCH | `p startsWith "api/v1/serve-community/initiatives/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.updateInitiative` |
| 312 | POST | `p startsWith "api/v1/serve-community/initiatives/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.submitInitiative` |
| 313 | GET | `p === "api/v1/me/serve-community/initiatives"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.listMyInitiatives` |
| 314 | GET | `p === "api/v1/me/serve-community/participations"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.listMyParticipations` |
| 315 | POST | `p startsWith "api/v1/serve-community/initiatives/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.applyToInitiative` |
| 316 | GET | `p startsWith "api/v1/serve-community/initiatives/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.listInitiativeParticipations` |
| 317 | POST | `p startsWith "api/v1/me/serve-community/participations/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.withdrawParticipation` |
| 318 | PATCH | `p startsWith "api/v1/serve-community/participations/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.decideParticipation` |
| 319 | GET | `p === "api/v1/admin/serve-community/initiatives"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.listReviewQueue` |
| 320 | PATCH | `p startsWith "api/v1/admin/serve-community/initiatives/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.reviewInitiative` |
| 321 | POST | `p === "api/v1/serve-community/legacy-classifications"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.proposeLegacyClassification` |
| 322 | GET | `p === "api/v1/admin/serve-community/legacy-classifications"` | anyRoleOrPermission(identity,["system_admin","serve_community_reviewer"],["serve_community.legacy.classify"]) | `—` |
| 323 | PATCH | `p startsWith "api/v1/admin/serve-community/legacy-classifications/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.reviewLegacyClassification` |
| 325 | GET | `p === "api/v1/service-announcements"` | Public route with optional authenticated viewer; service must enforce visibility | `servicesMentorship.listPublicServiceAnnouncements` |
| 326 | GET | `p === "api/v1/services"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `servicesMentorship.listServices` |
| 328 | GET | `dynamic parts predicate (see server.js line)` | auth(req); no explicit route helper — service must enforce capability and resource scope | `servicesMentorship.listPublicMediaStories` |
| 330 | GET | `p === "api/v1/me/public-media-stories"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `servicesMentorship.listMyPublicMediaStories` |
| 332 | GET | `p === "api/v1/admin/public-media-stories"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `servicesMentorship.listPublicMediaStoryReviewQueue` |
| 335 | GET | `p startsWith "api/v1/services/" + path-segment constraints` | Public route with optional authenticated viewer; service must enforce visibility | `servicesMentorship.getServiceListing` |
| 336 | GET | `p startsWith "api/v1/services/" + path-segment constraints` | Public route with optional authenticated viewer; service must enforce visibility | `servicesMentorship.listServiceListingAnnouncements` |
| 337 | GET | `p === "api/v1/mentors"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `servicesMentorship.listMentors` |
| 338 | GET | `p startsWith "api/v1/mentors/" + path-segment constraints` | Public route with optional authenticated viewer; service must enforce visibility | `servicesMentorship.getMentorProfile` |
| 339 | POST | `p === "api/v1/files/uploads"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 340 | PUT | `p startsWith "api/v1/files/uploads/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 341 | POST | `p startsWith "api/v1/files/uploads/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 342 | GET | `p startsWith "api/v1/files/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 343 | POST | `p === "api/v1/auth/member-invitation/claim"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `membershipAdminBulk.claimMemberInvitation` |
| 345 | POST | `p === "api/v1/auth/register"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `membership.register` |
| 346 | GET | `p === "api/v1/me/referrals"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `memberReferrals.listMyReferrals` |
| 347 | GET | `p === "api/v1/me/referrals/candidate-outcomes"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `memberReferrals.listMyCandidateReferrals` |
| 348 | POST | `p === "api/v1/me/referrals/code"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `memberReferrals.ensureMyReferralCode` |
| 350 | GET | `p === "api/v1/admin/referrals"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `memberReferrals.listReferralAdminQueue` |
| 352 | POST | `p === "api/v1/admin/referrals/scoring-policies"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `memberReferrals.proposeReferralScorePolicy` |
| 354 | GET | `p === "api/v1/membership/products"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `membership.listMembershipProducts` |
| 355 | GET | `p === "api/v1/membership/payment-methods"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membership.listMembershipPaymentMethods` |
| 356 | GET | `p === "api/v1/admin/membership/payment-methods"` | assertMembershipPaymentMethodAdmin(identity) | `membership.listMembershipPaymentMethods` |
| 360 | PUT | `p === "api/v1/admin/membership/payment-methods"` | assertMembershipPaymentMethodAdmin(identity) | `membership.saveMembershipPaymentMethod` |
| 364 | GET | `p === "api/v1/admin/membership/products"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `—` |
| 365 | GET | `p === "api/v1/admin/experience/guides"` | anyRoleOrPermission(identity,["system_admin","reviewer"],["members.view","members.manage"]) | `experience.listAdminGuides` |
| 370 | POST | `p === "api/v1/admin/membership/products"` | anyRoleOrPermission(identity,["system_admin"],["members.manage"]) | `membership.saveMembershipProduct` |
| 375 | PATCH | `p startsWith "api/v1/admin/membership/products/"` | anyRoleOrPermission(identity,["system_admin"],["members.manage"]) | `membership.saveMembershipProduct` |
| 380 | POST | `p === "api/v1/auth/one-time-session/redeem"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `accountSecurity.redeemOneTimeSessionLink` |
| 381 | POST | `p === "api/v1/auth/recovery-email/verify"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `accountSecurity.verifyRecoveryEmailChange` |
| 382 | POST | `p === "api/v1/auth/login"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `membership.login` |
| 386 | POST | `p === "api/v1/auth/logout"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `userAdmin.logout` |
| 387 | GET | `p === "api/v1/admin/reference-portfolio"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.listReferenceDatasets` |
| 388 | GET | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.listReferenceItems` |
| 389 | POST | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.saveReferenceItem` |
| 390 | PATCH | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.saveReferenceItem` |
| 391 | POST | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.previewReferenceCsv` |
| 392 | POST | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.importReferenceCsv` |
| 393 | POST | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.previewReferenceJson` |
| 394 | POST | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.importReferenceJson` |
| 395 | POST | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.previewReferenceXlsx` |
| 396 | POST | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.importReferenceXlsx` |
| 397 | POST | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.publishReferenceDataset` |
| 398 | GET | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.exportReferenceCsv` |
| 399 | GET | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.exportReferenceJson` |
| 400 | GET | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.exportReferenceXlsx` |
| 401 | GET | `p === "api/v1/admin/directory-export/fields"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 402 | POST | `p === "api/v1/admin/directory-export/preview"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `directoryExports.previewDirectoryExport` |
| 403 | POST | `p === "api/v1/admin/directory-export"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `directoryExports.exportDirectory` |
| 404 | GET | `p === "api/v1/admin/members/import-template"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 405 | GET | `p === "api/v1/admin/members/import-template.xlsx"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 406 | POST | `p === "api/v1/admin/members/import/preview"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipAdminBulk.previewMemberImport` |
| 407 | POST | `p startsWith "api/v1/admin/members/import/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipAdminBulk.applyMemberImport` |
| 408 | GET | `p === "api/v1/admin/members/catalog"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipAdminBulk.listMemberCatalog` |
| 409 | GET | `p === "api/v1/admin/members/export"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `directoryExports.exportDirectory` |
| 410 | GET | `p === "api/v1/me/report-saved-views"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `reports.listSavedViews` |
| 411 | POST | `p === "api/v1/me/report-saved-views"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `reports.saveSavedView` |
| 412 | DELETE | `p startsWith "api/v1/me/report-saved-views/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `reports.deleteSavedView` |
| 413 | PATCH | `p startsWith "api/v1/services/listings/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `servicesMentorship.configureServiceCompletionPolicy` |
| 414 | GET | `p startsWith "api/v1/services/listings/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityImpactReports.runImpactReport` |
| 419 | GET | `p startsWith "api/v1/services/listings/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityImpactReports.runImpactReport` |
| 430 | GET | `p === "api/v1/admin/reports"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `reports.listReportCatalogue` |
| 431 | POST | `p startsWith "api/v1/admin/reports/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `reports.runReport` |
| 432 | GET | `p startsWith "api/v1/admin/reports/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `reports.exportReport` |
| 433 | POST | `p startsWith "api/v1/admin/organizations/" + path-segment constraints` | anyRoleOrPermission(identity,["system_admin","admin"],["organizations.manage"]) | `organizationJobs.adminAddOrganizationUser` |
| 434 | PATCH | `p startsWith "api/v1/admin/organizations/" + path-segment constraints` | anyRoleOrPermission(identity,["system_admin","admin"],["organizations.manage"]) | `organizationJobs.adminUpdateOrganizationUser` |
| 435 | GET | `p === "api/v1/admin/organizations"` | anyRoleOrPermission(identity,["system_admin","admin"],["organizations.manage"]) | `organizationJobs.listOrganizationsForAdmin` |
| 436 | GET | `p === "api/v1/admin/account-governance"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `userAdmin.getAccountGovernance` |
| 437 | GET | `p === "api/v1/admin/users"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `userAdmin.listUsers` |
| 438 | GET | `p === "api/v1/admin/roles"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `userAdmin.listRoles` |
| 439 | GET | `p === "api/v1/admin/permissions"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `userAdmin.listPermissions` |
| 440 | PATCH | `p startsWith "api/v1/admin/users/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `userAdmin.updateUserPermissions` |
| 441 | PATCH | `p startsWith "api/v1/admin/users/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `userAdmin.updateUser` |
| 442 | POST | `p startsWith "api/v1/admin/users/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `userAdmin.revokeSessions` |
| 443 | POST | `p startsWith "api/v1/admin/users/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `userAdmin.issueOneTimePassword` |
| 444 | POST | `p startsWith "api/v1/admin/users/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `accountSecurity.createOneTimeSessionLink` |
| 445 | POST | `p startsWith "api/v1/admin/users/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `userAdmin.issueOneTimePassword` |
| 446 | PATCH | `p startsWith "api/v1/admin/users/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `accountSecurity.requestRecoveryEmailChange` |
| 447 | GET | `p === "api/v1/experience/demo-cases"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `experience.listDemoCases` |
| 448 | GET | `p startsWith "api/v1/experience/demo-cases/" + path-segment constraints` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `experience.getDemoCase` |
| 449 | GET | `p === "api/v1/experience/guides"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `experience.listGuides` |
| 451 | GET | `p === "api/v1/talent"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `talent.searchTalent` |
| 456 | GET | `p startsWith "api/v1/talent/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `talent.getTalent` |
| 461 | GET | `p === "api/v1/marketplace-demand/topics"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `marketplaceDemand.listPublishedTopics` |
| 462 | GET | `p === "api/v1/organization-mentorship-offers"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `organizationMentorshipOffers.listOrganizationMentorshipOffers` |
| 464 | GET | `p === "api/v1/network-plus/access"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `—` |
| 465 | GET | `p === "api/v1/network-plus/organizations"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listNetworkPlusOrganizations` |
| 470 | GET | `p === "api/v1/network-plus/listing-taxonomy"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.listNetworkPlusListingTaxonomy` |
| 471 | GET | `p === "api/v1/network-plus/geography-reference"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.listNetworkPlusListingTaxonomy` |
| 472 | GET | `p === "api/v1/network-plus/my/listings"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.listMyOpportunityListings` |
| 473 | GET | `p === "api/v1/network-plus/listings"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.listProfessionalServices` |
| 478 | GET | `p === "api/v1/network-plus/businesses"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.listBusinesses` |
| 483 | GET | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.getBusiness` |
| 486 | GET | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.getBusiness` |
| 487 | GET | `p === "api/v1/network-plus/services"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.listProfessionalServices` |
| 492 | GET | `p startsWith "api/v1/network-plus/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.getProfessionalService` |
| 493 | GET | `p === "api/v1/network-plus/my/businesses"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.listMyBusinesses` |
| 494 | POST | `p === "api/v1/network-plus/businesses"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.createBusiness` |
| 498 | PATCH | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.updateBusiness` |
| 499 | POST | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.addBusinessOwner` |
| 500 | POST | `p startsWith "api/v1/network-plus/business-ownership/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.respondBusinessOwnership` |
| 503 | POST | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.grantBusinessAccess` |
| 504 | GET | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.listBusinessVerificationEvidence` |
| 505 | POST | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.addBusinessVerificationEvidence` |
| 506 | GET | `p === "api/v1/admin/network-plus/businesses/verification-queue"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.listBusinessVerificationQueue` |
| 507 | GET | `p === "api/v1/admin/network-plus/businesses/moderation-queue"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.listBusinessModerationQueue` |
| 508 | GET | `p === "api/v1/admin/network-plus/services/moderation-queue"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.listProfessionalServiceModerationQueue` |
| 509 | GET | `p startsWith "api/v1/admin/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.listBusinessVerificationEvidence` |
| 510 | DELETE | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.revokeBusinessAccess` |
| 511 | POST | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.submitBusinessVerification` |
| 515 | POST | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.submitBusinessModeration` |
| 516 | POST | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.changeBusinessPublicationStatus` |
| 519 | POST | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.createOpportunityListingDraft` |
| 523 | PATCH | `p startsWith "api/v1/network-plus/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.saveOpportunityListingDraft` |
| 526 | POST | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.createProfessionalServiceListing` |
| 530 | PATCH | `p startsWith "api/v1/network-plus/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.updateProfessionalServiceListing` |
| 531 | POST | `p startsWith "api/v1/network-plus/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.changeProfessionalServiceStatus` |
| 532 | POST | `p startsWith "api/v1/network-plus/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.submitProfessionalServiceListing` |
| 536 | POST | `p startsWith "api/v1/admin/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.reviewBusinessVerification` |
| 537 | POST | `p startsWith "api/v1/admin/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.reviewBusinessModeration` |
| 538 | POST | `p startsWith "api/v1/admin/network-plus/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.moderateProfessionalServiceListing` |
| 539 | GET | `p === "api/v1/network-plus/request-invitations"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.listNetworkPlusParticipantInvitations` |
| 540 | GET | `p === "api/v1/network-plus/requests"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.listNetworkPlusRequests` |
| 544 | POST | `p === "api/v1/network-plus/requests"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.createNetworkPlusRequest` |
| 548 | POST | `p startsWith "api/v1/admin/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.grantNetworkPlusSupportAccess` |
| 549 | DELETE | `p startsWith "api/v1/admin/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.revokeNetworkPlusSupportAccess` |
| 550 | GET | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.getNetworkPlusRequest` |
| 551 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.submitNetworkPlusRequest` |
| 552 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.transitionNetworkPlusRequest` |
| 553 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.updateNetworkPlusRequestDisposition` |
| 554 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.updateNetworkPlusContactConsent` |
| 555 | GET | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.getNetworkPlusContactHandoff` |
| 556 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.createNetworkPlusMeetingProposal` |
| 557 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.respondNetworkPlusMeeting` |
| 558 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.answerNetworkPlusQuestion` |
| 559 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.askNetworkPlusClarification` |
| 560 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.answerNetworkPlusClarification` |
| 561 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.addNetworkPlusRequestParticipant` |
| 562 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.respondNetworkPlusParticipant` |
| 563 | GET | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.getNetworkPlusWorkspace` |
| 564 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.createNetworkPlusWorkspace` |
| 565 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.addNetworkPlusWorkspaceMilestone` |
| 566 | PATCH | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.updateNetworkPlusWorkspaceMilestone` |
| 567 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.addNetworkPlusWorkspaceEvent` |
| 568 | PATCH | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.updateNetworkPlusVisibility` |
| 571 | POST | `p === "api/v1/admin/experience/demo-cases"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `experience.createDemoCase` |
| 572 | PATCH | `p startsWith "api/v1/admin/experience/demo-cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `experience.updateDemoCase` |
| 573 | POST | `p === "api/v1/admin/experience/guides"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `experience.createGuide` |
| 574 | PATCH | `p startsWith "api/v1/admin/experience/guides/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `experience.updateGuide` |
| 576 | POST | `p === "api/v1/organizations"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.registerOrganization` |
| 577 | GET | `p === "api/v1/organizations"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listMyOrganizations` |
| 578 | GET | `p === "api/v1/me/organization-access"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listMyOrganizationAccess` |
| 579 | GET | `p === "api/v1/me/job-assignments"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listMyJobAssignments` |
| 580 | GET | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.getOrganization` |
| 581 | POST | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.addVerificationEvidence` |
| 582 | POST | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.submitOrganizationVerification` |
| 583 | POST | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.addOrganizationUser` |
| 584 | PATCH | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.updateOrganizationUser` |
| 585 | GET | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listOrganizationUsers` |
| 586 | GET | `p === "api/v1/review/organizations"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listOrganizationVerificationQueue` |
| 587 | POST | `p === "api/v1/review/organizations"` | anyRoleOrPermission(identity,["reviewer","system_admin"],["organizations.review"]) | `organizationJobs.reviewOrganization` |
| 588 | GET | `p === "api/v1/admin/organization-verification-requirements"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listOrganizationVerificationRequirements` |
| 589 | POST | `p === "api/v1/admin/organization-verification-requirements"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.createOrganizationVerificationRequirement` |
| 590 | PATCH | `p startsWith "api/v1/admin/organization-verification-requirements/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.updateOrganizationVerificationRequirement` |
| 592 | POST | `p === "api/v1/jobs"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.createJob` |
| 593 | POST | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.createRequisition` |
| 594 | GET | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listRequisitions` |
| 595 | POST | `p startsWith "api/v1/job-requisitions/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.decideRequisition` |
| 596 | GET | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listOrganizationJobs` |
| 597 | GET | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.organizationRecruitingDashboard` |
| 598 | GET | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `stakeholderOutcomes.getOrganizationOutcomeWorkspace` |
| 599 | GET | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.jobDashboard` |
| 600 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.addJobTeamMember` |
| 601 | GET | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listJobTeam` |
| 602 | DELETE | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.removeJobTeamMember` |
| 603 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.addScreeningQuestion` |
| 604 | GET | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listInterviewScorecards` |
| 605 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.createInterviewScorecard` |
| 606 | GET | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listScreeningQuestions` |
| 607 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.referCandidate` |
| 608 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.saveJob` |
| 609 | DELETE | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.unsaveJob` |
| 610 | GET | `p === "api/v1/me/saved-jobs"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listSavedJobs` |
| 611 | GET | `p === "api/v1/me/saved-items"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `savedDiscoveryItems.listDiscoveryItems` |
| 612 | POST | `p === "api/v1/me/saved-items"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `savedDiscoveryItems.saveDiscoveryItem` |
| 613 | DELETE | `p startsWith "api/v1/me/saved-items/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `savedDiscoveryItems.removeDiscoveryItem` |
| 614 | POST | `p === "api/v1/me/job-alerts"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.createJobAlert` |
| 615 | GET | `p === "api/v1/me/job-alerts"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listJobAlerts` |
| 616 | GET | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listApplicationNotes` |
| 617 | POST | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.addApplicationNote` |
| 618 | GET | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listApplicationInterviews` |
| 619 | POST | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.scheduleInterview` |
| 620 | POST | `p startsWith "api/v1/job-interviews/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.updateInterviewStatus` |
| 621 | POST | `p startsWith "api/v1/job-interviews/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.proposeInterviewChange` |
| 622 | POST | `p startsWith "api/v1/job-interview-change-proposals/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.decideInterviewChange` |
| 623 | POST | `p startsWith "api/v1/job-interviews/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.respondInterview` |
| 624 | POST | `p startsWith "api/v1/job-interviews/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.submitInterviewFeedback` |
| 625 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.recordJobOutcome` |
| 628 | POST | `p === "api/v1/marketplace-demand"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.createDemand` |
| 629 | POST | `p === "api/v1/marketplace-demand/public-topics"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.createPublicTopicSubmission` |
| 630 | GET | `p === "api/v1/me/marketplace-demand-public-topics"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.listMyPublicTopicSubmissions` |
| 631 | GET | `p === "api/v1/admin/marketplace-demand-public-topics"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.listPublicTopicSubmissionsForReview` |
| 632 | PATCH | `p startsWith "api/v1/admin/marketplace-demand-public-topics/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.reviewPublicTopicSubmission` |
| 633 | GET | `p === "api/v1/me/marketplace-demand"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.listMyDemand` |
| 634 | GET | `p === "api/v1/me/marketplace-demand-interests"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.listMyInterests` |
| 635 | POST | `p startsWith "api/v1/marketplace-demand/topics/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.joinDemandTopic` |
| 636 | POST | `p startsWith "api/v1/marketplace-demand/topics/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.withdrawDemandInterest` |
| 637 | GET | `p === "api/v1/admin/marketplace-match-candidates"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.listDemandMatchCandidates` |
| 638 | POST | `p startsWith "api/v1/admin/marketplace-demand/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.createDemandProviderMatch` |
| 639 | GET | `p === "api/v1/me/marketplace-demand-matches"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.listMyDemandProviderMatches` |
| 640 | POST | `p startsWith "api/v1/marketplace-demand-matches/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.respondToDemandProviderMatch` |
| 641 | GET | `p === "api/v1/admin/marketplace-demand"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.listReviewQueue` |
| 642 | GET | `p === "api/v1/admin/marketplace-demand-assessment"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.getDemandInterestAssessment` |
| 643 | POST | `p startsWith "api/v1/admin/marketplace-demand/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.mergeDemand` |
| 644 | PATCH | `p startsWith "api/v1/admin/marketplace-demand/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.reviewDemand` |
| 645 | GET | `p === "api/v1/admin/marketplace-listings"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.listAdminListings` |
| 646 | POST | `p startsWith "api/v1/admin/marketplace-listings/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.moderateListing` |
| 647 | GET | `p startsWith "api/v1/admin/marketplace-demand-topics/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.getDemandSummary` |
| 648 | POST | `p === "api/v1/services"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.createServiceListing` |
| 649 | PATCH | `p startsWith "api/v1/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.updateServiceListing` |
| 650 | POST | `p startsWith "api/v1/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.changeServiceListingStatus` |
| 651 | POST | `p startsWith "api/v1/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.createServiceListingAnnouncement` |
| 652 | POST | `p startsWith "api/v1/service-listing-announcements/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.changeServiceListingAnnouncementStatus` |
| 653 | POST | `p startsWith "api/v1/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.createServiceListingInterest` |
| 654 | POST | `p startsWith "api/v1/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.createServiceListingPledge` |
| 655 | POST | `p startsWith "api/v1/service-listing-interests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.withdrawServiceListingInterest` |
| 656 | POST | `p startsWith "api/v1/service-listing-pledges/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.changeServiceListingPledgeStatus` |
| 657 | GET | `p === "api/v1/me/service-listings"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.listMyServiceListings` |
| 658 | GET | `p === "api/v1/me/service-listing-interest-summary"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.listMyServiceListingInterestSummary` |
| 659 | GET | `p === "api/v1/me/service-listing-pledges"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.listMyServiceListingPledges` |
| 660 | GET | `p === "api/v1/me/organization-mentorship-offers"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationMentorshipOffers.listMyOrganizationMentorshipOffers` |
| 661 | POST | `p === "api/v1/organization-mentorship-offers"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationMentorshipOffers.createOrganizationMentorshipOffer` |
| 662 | PATCH | `p startsWith "api/v1/organization-mentorship-offers/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationMentorshipOffers.updateOrganizationMentorshipOffer` |
| 663 | POST | `p startsWith "api/v1/organization-mentorship-offers/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationMentorshipOffers.changeOrganizationMentorshipOfferStatus` |
| 664 | POST | `p startsWith "api/v1/organization-mentorship-offers/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationMentorshipOffers.requestOrganizationMentorship` |
| 665 | GET | `p === "api/v1/me/organization-mentorship-requests"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationMentorshipOffers.listMyOrganizationMentorshipRequests` |
| 666 | POST | `p startsWith "api/v1/organization-mentorship-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationMentorshipOffers.respondOrganizationMentorshipRequest` |
| 667 | GET | `p === "api/v1/me/service-requests"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.listMyServiceRequests` |
| 668 | POST | `p startsWith "api/v1/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.requestService` |
| 669 | GET | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.listServiceRequestUpdates` |
| 670 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.createServiceRequestUpdate` |
| 671 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.changeServiceRequestStatus` |
| 672 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.acceptServiceAgreement` |
| 673 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.acceptServiceCompletion` |
| 674 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.reviewServiceCompletion` |
| 675 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.submitServicePayment` |
| 676 | POST | `p startsWith "api/v1/service-payments/" + path-segment constraints` | anyRoleOrPermission(identity,["finance_officer","reviewer","system_admin"],["finance.manage"]) | `servicesMentorship.verifyServicePayment` |
| 677 | GET | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.listServiceMilestones` |
| 678 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.createServiceMilestone` |
| 679 | GET | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.listServiceDeliveries` |
| 680 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.submitServiceDelivery` |
| 681 | POST | `p startsWith "api/v1/service-deliveries/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.reviewServiceDelivery` |
| 682 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.submitServiceFeedback` |
| 683 | GET | `p === "api/v1/mentors"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.listMentors` |
| 684 | GET | `p === "api/v1/me/mentor-profile"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.getMyMentorProfile` |
| 685 | POST | `p === "api/v1/me/mentor-profile"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.createMentorProfile` |
| 686 | PATCH | `p startsWith "api/v1/mentor-profiles/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.updateMentorProfile` |
| 687 | POST | `p startsWith "api/v1/mentor-profiles/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.changeMentorStatus` |
| 688 | GET | `p startsWith "api/v1/mentor-profiles/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.getMentorshipCircleSummary` |
| 689 | POST | `p startsWith "api/v1/mentor-profiles/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.joinMentorshipCircle` |
| 690 | DELETE | `p startsWith "api/v1/mentor-profiles/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.leaveMentorshipCircle` |
| 691 | PUT | `p startsWith "api/v1/mentor-profiles/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.setMentorAvailability` |
| 692 | DELETE | `p startsWith "api/v1/mentor-profiles/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.removeMentorTimeOff` |
| 693 | POST | `p startsWith "api/v1/mentor-profiles/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.addMentorTimeOff` |
| 694 | GET | `p startsWith "api/v1/mentorship/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.listMentorshipLearningActivities` |
| 695 | POST | `p startsWith "api/v1/mentorship/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.createMentorshipLearningActivity` |
| 696 | POST | `p startsWith "api/v1/mentorship-activities/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.submitMentorshipLearningActivity` |
| 697 | POST | `p startsWith "api/v1/mentorship-learning-submissions/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.reviewMentorshipLearningSubmission` |
| 698 | GET | `p === "api/v1/me/mentorship-learning-progress"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.listMyMentorshipLearningProgress` |
| 699 | GET | `p === "api/v1/me/mentorship-requests"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.listMyMentorshipRequests` |
| 700 | GET | `p === "api/v1/me/mentorship-interest"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.listMentorshipInterestPool` |
| 701 | GET | `p === "api/v1/me/mentorship-operations"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.getMentorshipOperationalReport` |
| 702 | GET | `p === "api/v1/me/mentorship-reports"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.listMyMentorshipParticipantReports` |
| 703 | GET | `p === "api/v1/admin/mentorship-reports"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.listMentorshipParticipantReports` |
| 704 | GET | `p === "api/v1/admin/service-mentorship-cases"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `serviceMentorshipSupportCases.listSupportCases` |
| 706 | GET | `p === "api/v1/admin/mentorship/pending-decisions"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `mentorshipOperations.listMentorshipProgrammePendingDecisions` |
| 707 | GET | `p === "api/v1/admin/mentorship/relationships"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `mentorshipOperations.listMentorshipProgrammeRelationships` |
| 708 | GET | `p === "api/v1/admin/mentorship/metrics"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `mentorshipOperations.getMentorshipProgrammeMetrics` |
| 709 | GET | `p === "api/v1/admin/mentorship-interest"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.listMentorshipInterestReviewQueue` |
| 710 | POST | `p startsWith "api/v1/admin/mentorship-interest/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.proposeMentorshipInterestMatch` |
| 711 | POST | `p startsWith "api/v1/admin/mentorship-interest/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.markMentorshipInterestReviewed` |
| 712 | PATCH | `p startsWith "api/v1/admin/mentorship-reports/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.updateMentorshipParticipantReport` |
| 713 | GET | `p === "api/v1/me/mentorship-matches"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.listMyMentorshipMatches` |
| 714 | GET | `p === "api/v1/me/mentorships"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.listMyMentorships` |
| 715 | POST | `p === "api/v1/mentorship/requests"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.createMentorshipRequest` |
| 716 | PATCH | `p startsWith "api/v1/mentorship/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.setMentorshipRequestSharing` |
| 717 | POST | `p startsWith "api/v1/mentorship/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.registerMentorshipInterest` |
| 718 | GET | `p startsWith "api/v1/mentorship/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.getMentorshipRequest` |
| 719 | GET | `p startsWith "api/v1/mentorship/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.findMentorMatches` |
| 720 | POST | `p startsWith "api/v1/mentorship/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.proposeMentorMatch` |
| 721 | POST | `p startsWith "api/v1/mentorship/matches/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.respondToMatch` |
| 722 | POST | `p startsWith "api/v1/mentorship/matches/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.respondToMenteeMatch` |
| 723 | GET | `p startsWith "api/v1/mentorship/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.getMentorship` |
| 724 | GET | `p startsWith "api/v1/mentorship/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.listMentorshipGoals` |
| 725 | POST | `p startsWith "api/v1/mentorship/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.createMentorshipGoal` |
| 726 | PATCH | `p startsWith "api/v1/mentorship-goals/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.updateMentorshipGoal` |
| 727 | POST | `p startsWith "api/v1/mentorship/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.changeMentorshipStatus` |
| 728 | GET | `p startsWith "api/v1/mentorship/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.listMentorshipSessions` |
| 729 | POST | `p startsWith "api/v1/mentorship/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.createMentorshipSession` |
| 730 | POST | `p startsWith "api/v1/mentorship/sessions/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.respondToSessionProposal` |
| 731 | POST | `p startsWith "api/v1/mentorship/sessions/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.proposeMentorshipSessionChange` |
| 732 | POST | `p startsWith "api/v1/mentorship/session-changes/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.respondToMentorshipSessionChange` |
| 733 | PATCH | `p startsWith "api/v1/mentorship/sessions/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.updateMentorshipSessionDetails` |
| 734 | POST | `p startsWith "api/v1/mentorship/sessions/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.changeMentorshipSession` |
| 735 | POST | `p startsWith "api/v1/mentorship/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.submitMentorshipFeedback` |
| 736 | POST | `p startsWith "api/v1/mentorship/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.createMentorshipParticipantReport` |
| 737 | GET | `p === "api/v1/me/outcomes"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `stakeholderOutcomes.getMyOutcomeWorkspace` |
| 738 | GET | `p === "api/v1/support/job-seeker-demands/organizations"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.listShareableOrganizations` |
| 739 | GET | `p startsWith "api/v1/organizations/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.listSharedJobSeekerDemands` |
| 740 | POST | `p startsWith "api/v1/support/job-seeker-demands/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.shareJobSeekerDemand` |
| 741 | GET | `p === "api/v1/me/job-interests"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.listMyMemberJobInterests` |
| 742 | POST | `p === "api/v1/me/job-interests"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.createMemberJobInterest` |
| 743 | GET | `p startsWith "api/v1/me/job-interests/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.getMyMemberJobInterest` |
| 744 | GET | `p startsWith "api/v1/me/job-interests/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.getMyMemberJobInterestSharingHistory` |
| 745 | POST | `p startsWith "api/v1/me/job-interests/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.updateMyMemberJobInterestConsent` |
| 746 | GET | `p === "api/v1/me/job-interest-sharing-organizations"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.searchMemberJobInterestOrganizations` |
| 747 | GET | `p === "api/v1/me/opportunity-inquiries"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.listMyLinkedInquiries` |
| 748 | GET | `p startsWith "api/v1/me/opportunity-inquiries/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.getLinkedInquiryDetails` |
| 749 | PATCH | `p startsWith "api/v1/me/opportunity-inquiries/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.updateLinkedInquiryDetails` |
| 750 | GET | `p startsWith "api/v1/me/opportunity-inquiries/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.getLinkedSharingHistory` |
| 751 | POST | `p startsWith "api/v1/me/opportunity-inquiries/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.updateLinkedSharingConsent` |
| 752 | GET | `p === "api/v1/opportunity-inquiries"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.listInquiries` |
| 753 | PATCH | `p startsWith "api/v1/opportunity-inquiries/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.decideInquiry` |
| 754 | GET | `p === "api/v1/me/progress"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `Promise.allSettled` |
| 785 | GET | `p === "api/v1/me/application-tracking"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `applicationTracking.getApplicationTracking` |
| 786 | GET | `p === "api/v1/admin/support/knowledge"` | anyRoleOrPermission(identity,["system_admin","admin","platform_admin","supporting_staff"],["support.knowledge.manage","support.inquiries.manage"]) | `supportBot.adminGetKnowledge` |
| 787 | POST | `p === "api/v1/admin/support/knowledge/categories"` | anyRoleOrPermission(identity,["system_admin","admin","platform_admin"],["support.knowledge.manage"]) | `supportBot.adminSaveCategory` |
| 788 | POST | `p === "api/v1/admin/support/knowledge/articles"` | anyRoleOrPermission(identity,["system_admin","admin","platform_admin"],["support.knowledge.manage"]) | `supportBot.adminSaveArticle` |
| 789 | GET | `p === "api/v1/admin/support/colleagues"` | anyRoleOrPermission(identity,["system_admin","admin","platform_admin"],["support.inquiries.manage"]) | `supportBot.adminListSupportColleagues` |
| 790 | GET | `p === "api/v1/admin/support/inquiries"` | anyRoleOrPermission(identity,["system_admin","admin","platform_admin","supporting_staff"],["support.inquiries.view","support.inquiries.manage"]) | `supportBot.adminListConversations` |
| 791 | PATCH | `dynamic parts predicate (see server.js line)` | anyRoleOrPermission(identity,["system_admin","admin","platform_admin","supporting_staff"],["support.inquiries.manage"]) | `supportBot.adminUpdateConversation` |
| 792 | POST | `dynamic parts predicate (see server.js line)` | anyRoleOrPermission(identity,["system_admin","admin","platform_admin","supporting_staff"],["support.inquiries.manage"]) | `supportBot.escalateConversation` |
| 793 | POST | `dynamic parts predicate (see server.js line)` | anyRoleOrPermission(identity,["system_admin","admin","platform_admin","supporting_staff"],["support.inquiries.manage"]) | `supportBot.adminReplyToConversation` |
| 794 | GET | `p === "api/v1/membership/card"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipCard.getMyMembershipCard` |
| 795 | GET | `p === "api/v1/admin/membership-card"` | anyRoleOrPermission(identity,["system_admin","reviewer"],["members.view","members.manage"]) | `membershipCard.getMembershipCardForAdmin` |
| 796 | GET | `p === "api/v1/admin/membership-cards/eligible"` | anyRoleOrPermission(identity,["system_admin","reviewer"],["members.view","members.manage"]) | `membershipCard.listEligibleMembershipCardsForAdmin` |
| 797 | POST | `p === "api/v1/admin/membership-cards/batch"` | anyRoleOrPermission(identity,["system_admin","reviewer"],["members.view","members.manage"]) | `membershipCard.getMembershipCardsForAdmin` |
| 798 | POST | `p === "api/v1/admin/membership-cards/print"` | anyRoleOrPermission(identity,["system_admin","reviewer"],["members.view","members.manage"]) | `membershipCard.recordMembershipCardsPrintRequest` |
| 799 | PATCH | `p === "api/v1/me/profile-picture"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipCard.setMyProfilePicture` |
| 800 | DELETE | `p === "api/v1/me/profile-picture"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipCard.removeMyProfilePicture` |
| 801 | GET | `p === "api/v1/admin/audit-log"` | anyRoleOrPermission(identity,["system_admin"],["audit.view"]) | `adminAudit.listAdminAuditEvents` |
| 802 | GET | `p === "api/v1/admin/membership-card-settings"` | anyRoleOrPermission(identity,["system_admin","admin","platform_admin"],["members.manage"]) | `membershipCard.getMembershipCardSettings` |
| 803 | PATCH | `p === "api/v1/admin/membership-card-settings"` | anyRoleOrPermission(identity,["system_admin"],["members.manage"]) | `membershipCard.updateMembershipCardSettings` |
| 804 | POST | `dynamic parts predicate (see server.js line)` | anyRoleOrPermission(identity,["system_admin"],["members.manage"]) | `membershipCard.rotateMembershipCardVerification` |
| 805 | GET | `p === "api/v1/me"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `membership.getMe` |
| 806 | PATCH | `p === "api/v1/me/account"` | Inherited dispatcher authentication at server.js:463; self-account action policy remains separate | `accountSecurity.updateOwnCredentials` |
| 807 | PATCH | `p === "api/v1/me/profile"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `membership.updateProfile` |
| 808 | GET | `p === "api/v1/membership/history"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `membership.history` |
| 809 | GET | `p === "api/v1/membership/applications/me"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `membership.listMyApplications` |
| 810 | GET | `p === "api/v1/notifications/campaign-preferences"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 811 | PATCH | `p === "api/v1/notifications/campaign-preferences"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 812 | GET | `p === "api/v1/admin/community-campaigns/messages"` | anyRole(identity,["system_admin","admin","platform_admin"]) | `communityCampaigns.listCampaignMessages` |
| 813 | POST | `p === "api/v1/admin/community-campaigns/messages"` | anyRole(identity,["system_admin","admin","platform_admin"]) | `communityCampaigns.saveCampaignMessage` |
| 814 | POST | `p startsWith "api/v1/admin/community-campaigns/messages/" + path-segment constraints` | anyRole(identity,["system_admin","admin","platform_admin"]) | `communityCampaigns.submitCampaignMessage` |
| 815 | POST | `p startsWith "api/v1/admin/community-campaigns/messages/" + path-segment constraints` | anyRole(identity,["system_admin","admin","platform_admin"]) | `communityCampaigns.decideCampaignMessage` |
| 816 | GET | `p === "api/v1/admin/community-campaigns/schedules"` | anyRole(identity,["system_admin","admin","platform_admin"]) | `communityCampaigns.getCampaignSchedules` |
| 817 | PATCH | `p startsWith "api/v1/admin/community-campaigns/schedules/" + path-segment constraints` | anyRole(identity,["system_admin","admin","platform_admin"]) | `communityCampaigns.updateCampaignSchedule` |
| 818 | POST | `p === "api/v1/admin/community-campaigns/pause"` | anyRole(identity,["system_admin","admin","platform_admin"]) | `communityCampaigns.pauseCampaign` |
| 819 | GET | `p === "api/v1/admin/community-campaigns/monitoring"` | anyRole(identity,["system_admin","admin","platform_admin"]) | `communityCampaigns.getCampaignMonitoring` |
| 820 | GET | `p === "api/v1/notifications/push/public-key"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `—` |
| 821 | GET | `p === "api/v1/notifications/push/status"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `—` |
| 822 | POST | `p === "api/v1/notifications/push/subscriptions"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `—` |
| 823 | DELETE | `p === "api/v1/notifications/push/subscriptions"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `—` |
| 824 | GET | `p === "api/v1/notifications"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `notifications.getNotificationInbox` |
| 825 | POST | `p === "api/v1/notifications/read-all"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `notifications.markAllNotificationsRead` |
| 826 | PATCH | `p startsWith "api/v1/notifications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `notifications.markNotificationRead` |
| 827 | PATCH | `p startsWith "api/v1/notifications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `notifications.archiveNotification` |
| 828 | GET | `p === "api/v1/notifications/preferences"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `membership.notificationPreferences` |
| 829 | PATCH | `p === "api/v1/notifications/preferences"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `membership.notificationPreferences` |
| 830 | POST | `p === "api/v1/payments/chapa/verify"` | requireRole(identity,"member") | `membership.verifyChapaMembershipPayment` |
| 831 | POST | `p startsWith "api/v1/membership/applications/" + path-segment constraints` | requireRole(identity,"member") | `membership.initiateChapaMembershipPayment` |
| 832 | POST | `p === "api/v1/membership/applications"` | requireRole(identity,"member") | `membership.createApplication` |
| 835 | POST | `p startsWith "api/v1/membership/applications/" + path-segment constraints` | assertMembershipReviewAccess(identity) | `membership.reviewApplication` |
| 838 | POST | `p startsWith "api/v1/membership/applications/" + path-segment constraints` | requireRole(identity,"member") | `membership.respondCorrection` |
| 841 | POST | `p startsWith "api/v1/membership/applications/" + path-segment constraints` | requireRole(identity,"member") | `membership.attachApplicationFile` |
| 844 | POST | `p startsWith "api/v1/membership/applications/" + path-segment constraints` | requireRole(identity,"member") | `membership.createManualPayment` |
| 847 | POST | `p startsWith "api/v1/membership/applications/" + path-segment constraints` | assertMembershipActivationAccess(identity) | `membership.activateApplication` |
| 850 | POST | `p === "api/v1/membership/renew"` | requireRole(identity,"member") | `membership.renew` |
| 853 | POST | `dynamic parts predicate (see server.js line)` | assertPaymentVerificationAccess(identity) | `membership.verifyPayment` |
| 856 | POST | `dynamic parts predicate (see server.js line)` | assertPaymentReversalAccess(identity) | `membership.reverseMembershipPayment` |
| 860 | GET | `p === "api/v1/finance/payer-search"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `financeReceipts.searchFinancePayers` |
| 861 | GET | `p === "api/v1/finance/organization-search"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `financeReceipts.searchFinanceOrganizations` |
| 862 | GET | `p === "api/v1/finance/receipts"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `financeReceipts.listManualFinancePayments` |
| 863 | POST | `p === "api/v1/finance/receipts"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `financeReceipts.recordManualFinancePayment` |
| 864 | POST | `p startsWith "api/v1/finance/receipts/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `financeReceipts.decideManualFinancePayment` |
| 865 | POST | `p startsWith "api/v1/finance/receipts/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `financeReceipts.reverseManualFinancePayment` |
| 866 | POST | `p startsWith "api/v1/finance/receipts/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `financeReceipts.issueFinancePaymentVoucher` |
| 867 | POST | `p startsWith "api/v1/finance/membership/payments/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `financeReceipts.issueVerifiedMembershipPaymentVoucher` |
| 868 | GET | `p === "api/v1/finance/membership/fee-obligations/export.xlsx"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipFeeObligations.exportFeeObligations` |
| 869 | GET | `p === "api/v1/finance/membership/fee-obligations"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipFeeObligations.listFeeObligations` |
| 870 | POST | `p === "api/v1/finance/membership/receipts"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipFeeObligations.recordMembershipReceipt` |
| 871 | POST | `p startsWith "api/v1/finance/membership/receipts/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipFeeObligations.verifyMembershipReceipt` |
| 872 | POST | `p startsWith "api/v1/finance/membership/receipts/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipFeeObligations.reverseMembershipRecordReceipt` |
| 873 | GET | `p === "api/v1/finance/membership/sponsoring-organizations"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipFeeObligations.listSponsoringOrganizations` |
| 874 | POST | `p === "api/v1/finance/membership/obligations/dispositions"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipFeeObligations.recordBalanceDisposition` |
| 875 | POST | `p startsWith "api/v1/finance/membership/dispositions/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipFeeObligations.decideBalanceDisposition` |
| 876 | GET | `p === "api/v1/finance/membership/payment-import-template.xlsx"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 877 | GET | `p === "api/v1/finance/membership/payment-import-template.csv"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 878 | POST | `p === "api/v1/finance/membership/payment-import/preview"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipFeeObligations.previewMembershipPaymentImport` |
| 879 | POST | `p startsWith "api/v1/finance/membership/payment-import/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipFeeObligations.applyMembershipPaymentImport` |
| 880 | GET | `p === "api/v1/finance/membership/payments"` | assertFinancePaymentQueueAccess(identity) | `membership.listMembershipPaymentsForFinance` |
| 881 | GET | `p === "api/v1/finance/membership/legacy-payment-verification"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `legacyMembershipPayments.listLegacyMembershipPaymentVerificationQueue` |
| 882 | POST | `p startsWith "api/v1/finance/membership/legacy-payment-verification/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `legacyMembershipPayments.verifyLegacyMembershipPayment` |
| 883 | POST | `p startsWith "api/v1/finance/membership/legacy-payment-verification/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `legacyMembershipPayments.reverseLegacyMembershipPayment` |
| 884 | GET | `p === "api/v1/review/membership/applications"` | assertMembershipReviewQueueAccess(identity) | `membership.listApplicationsForReview` |
| 889 | GET | `p === "api/v1/admin/member-geography/summary"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipGeography.getMemberGeographySummary` |
| 890 | GET | `p === "api/v1/member-geography/reference"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipGeography.listMemberGeography` |
| 891 | GET | `p === "api/v1/me/residence"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `membershipGeography.getMyResidence` |
| 892 | PATCH | `p === "api/v1/me/residence"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `membershipGeography.saveMyResidence` |
| 893 | GET | `p === "api/v1/admin/member-geography/import-template"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 894 | GET | `p === "api/v1/admin/member-geography/export"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipGeography.exportPublishedMemberGeography` |
| 895 | POST | `p === "api/v1/admin/member-geography/import/preview"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipGeography.previewMemberGeographyImport` |
| 896 | POST | `p startsWith "api/v1/admin/member-geography/import/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipGeography.applyMemberGeographyImport` |
| 897 | POST | `p startsWith "api/v1/admin/member-geography/versions/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipGeography.publishMemberGeographyVersion` |
| 899 | GET | `p === "api/v1/professional-reference-data"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `referencePortfolio.listPublicReferenceSets` |
| 900 | GET | `p === "api/v1/me/cv"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.getMyCv` |
| 901 | PATCH | `p === "api/v1/me/cv"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.saveMyCv` |
| 902 | GET | `p === "api/v1/me/cv/shares"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.listMyCvShares` |
| 903 | POST | `p === "api/v1/me/cv/share"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.shareMyCvWithApplication` |
| 904 | DELETE | `p === "api/v1/me/cv/share"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.revokeMyCvShare` |
| 905 | GET | `p === "api/v1/me/education"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.getProfessionalEducation` |
| 906 | PUT | `p === "api/v1/me/education"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.saveProfessionalEducation` |
| 907 | GET | `p === "api/v1/me/portfolio"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.getProfessionalPortfolio` |
| 908 | POST | `p === "api/v1/me/portfolio"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.saveProfessionalPortfolioItem` |
| 909 | PATCH | `p startsWith "api/v1/me/portfolio/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.saveProfessionalPortfolioItem` |
| 910 | DELETE | `p startsWith "api/v1/me/portfolio/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.deleteProfessionalPortfolioItem` |
| 911 | GET | `p === "api/v1/me/talent-profile"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.getProfessionalProfile` |
| 912 | PATCH | `p === "api/v1/me/talent-profile"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.updateProfessionalProfile` |
| 913 | GET | `p === "api/v1/me/talent-visibility"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.getVisibility` |
| 914 | PATCH | `p === "api/v1/me/talent-visibility"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.updateVisibility` |
| 915 | POST | `p === "api/v1/talent/saved-searches"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.saveSearch` |
| 916 | GET | `p === "api/v1/talent/saved-searches"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.listSavedSearches` |
| 917 | POST | `p === "api/v1/talent/inquiries"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.createTalentInquiry` |
| 918 | GET | `p === "api/v1/talent/inquiries"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.listTalentInquiries` |
| 919 | POST | `p startsWith "api/v1/talent/inquiries/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.respondToTalentInquiry` |
| 920 | POST | `p startsWith "api/v1/talent/inquiries/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.closeTalentInquiry` |
| 922 | POST | `p === "api/v1/ethics/cases"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `ethics.createEthicsCase` |
| 923 | GET | `p === "api/v1/me/ethics/cases"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `ethics.listMyEthicsCases` |
| 924 | POST | `p startsWith "api/v1/ethics/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `ethics.addEthicsCaseEvidence` |
| 925 | POST | `p startsWith "api/v1/ethics/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `ethics.submitEthicsRespondentResponse` |
| 926 | GET | `p === "api/v1/review/ethics/cases"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `ethics.listEthicsCases` |
| 927 | GET | `p === "api/v1/review/ethics/reviewers"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `ethics.listEthicsReviewers` |
| 928 | GET | `p startsWith "api/v1/review/ethics/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `ethics.getEthicsCase` |
| 929 | PATCH | `p startsWith "api/v1/review/ethics/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `ethics.updateEthicsCase` |
| 930 | POST | `p startsWith "api/v1/review/ethics/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `ethics.assignEthicsCase` |
| 931 | POST | `p startsWith "api/v1/review/ethics/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `ethics.assignEthicsPanelMember` |
| 932 | POST | `p startsWith "api/v1/review/ethics/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `ethics.declareEthicsConflict` |
| 933 | POST | `p startsWith "api/v1/review/ethics/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `ethics.recordEthicsReview` |
| 934 | POST | `p startsWith "api/v1/review/ethics/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `ethics.decideEthicsCase` |
| 936 | GET | `p === "api/v1/me/volunteer-pledges"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `volunteerPledges.listMyVolunteerPledges` |
| 937 | POST | `p === "api/v1/me/volunteer-pledges"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `volunteerPledges.saveVolunteerPledge` |
| 938 | PATCH | `p startsWith "api/v1/me/volunteer-pledges/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `volunteerPledges.updateVolunteerPledge` |
| 939 | DELETE | `p startsWith "api/v1/me/volunteer-pledges/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `volunteerPledges.withdrawVolunteerPledge` |
| 941 | GET | `p === "api/v1/verification/programs"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `verification.listPrograms` |
| 942 | GET | `p === "api/v1/verification/claim-types"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `verification.listClaimTypes` |
| 943 | GET | `p === "api/v1/me/verification/cases"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `verification.listCases` |
| 944 | GET | `p === "api/v1/me/verification/reference-requests"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `verification.listMyReferenceRequests` |
| 945 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `verification.requestReference` |
| 946 | POST | `p startsWith "api/v1/verification/reference-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `verification.respondReferenceRequest` |
| 947 | POST | `p startsWith "api/v1/verification/reference-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `verification.reviewReferenceRequest` |
| 948 | POST | `p === "api/v1/verification/cases"` | anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]); requireRole(identity,"member") | `verification.createCase` |
| 954 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `verification.giveConsent` |
| 955 | GET | `p startsWith "api/v1/verification/cases/"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `verification.getCase` |
| 959 | GET | `p === "api/v1/review/verification/appeals"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `verification.listAppealsForReview` |
| 960 | GET | `p === "api/v1/review/verification/cases"` | anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]) | `verification.listCases` |
| 965 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | anyRoleOrPermission(identity,["system_admin"],["verification.manage"]) | `verification.assignCase` |
| 969 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]) | `verification.transitionCase` |
| 973 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]) | `verification.getCase` |
| 978 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]) | `verification.getCase` |
| 983 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]) | `verification.decide` |
| 987 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `verification.memberResponse` |
| 988 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `verification.submitAppeal` |
| 989 | POST | `p startsWith "api/v1/verification/appeals/" + path-segment constraints` | anyRoleOrPermission(identity,["appeal_reviewer","system_admin"],["verification.appeal.review"]) | `verification.decideAppeal` |
| 993 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]) | `verification.setClaimStatus` |
| 997 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]) | `verification.recordCheckResult` |
| 1002 | GET | `p === "api/v1/review/jobs"` | anyRoleOrPermission(identity,["reviewer","system_admin"],["jobs.review"]) | `organizationJobs.listJobsForReview` |
| 1003 | POST | `p startsWith "api/v1/review/jobs/" + path-segment constraints` | anyRoleOrPermission(identity,["reviewer","system_admin"],["jobs.review"]) | `organizationJobs.reviewJob` |
| 1004 | GET | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.evaluateEligibility` |
| 1005 | PATCH | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.updateJob` |
| 1006 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.publishJob` |
| 1007 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.changeJobStatus` |
| 1008 | GET | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listCandidates` |
| 1009 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.saveApplicationDraft` |
| 1010 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.applyToJob` |
| 1011 | PATCH | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.updateApplicationDraft` |
| 1012 | POST | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.submitApplication` |
| 1013 | GET | `p === "api/v1/me/job-applications"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listMyApplications` |
| 1014 | GET | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.getMyApplicationProgress` |
| 1015 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.updateCandidate` |
| 1016 | POST | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.approveJobOffer` |
| 1017 | POST | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.respondToJobApplication` |
| 1018 | GET | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listApplicationAttachments` |
| 1019 | POST | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.addApplicationAttachment` |

## Required follow-through to make this an effective-policy matrix

For each row, inspect the named service function and its downstream repository/query helpers for:
1. principal ownership checks (`user_id`, `created_by`, `owner_user_id`);
2. organization tenant checks against the exact requested `organization_id`;
3. job/project/team assignment checks against the exact resource ID;
4. reviewer/case assignment and self-review/conflict checks;
5. participant membership and consent;
6. membership entitlement and lifecycle status;
7. private-file purpose, owner, relationship and retention authorization;
8. action-specific permission checks for writes, exports, bulk actions and decisions.

Until that trace is completed, rows marked auth-only or no-helper remain **Unreconciled** at the effective-policy layer. The static dispatch matrix must not be read as approval to broaden access.
