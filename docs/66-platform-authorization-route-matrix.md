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
- **DEFECT CANDIDATE** means the branch references `identity` without declaring it locally or calling `auth(req)` in that branch. JavaScript `const` declarations inside sibling route blocks are block-scoped and cannot satisfy that reference. This must be resolved and covered by request-level tests before treating those routes as usable.
- **Service policy unverified** means the handler calls a service that may enforce stronger authorization; this inventory has not inferred that policy from a route name.
- A dynamic matcher is recorded as a source predicate and line number rather than inventing a concrete URL template.

## Static dispatch summary

| Measure | Count |
|---|---:|
| API route branches inventoried | 642 |
| Branches containing `auth(req)` | 275 |
| Branches using optional identity | 8 |
| Branches referencing `identity` without a local identity/auth binding | 319 |

These are syntactic counts from the checked-in source, not runtime success/failure counts. The 317 count is a high-priority static defect candidate; confirm with request-level tests and fix systematically rather than assuming each endpoint is independently exploitable.

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
| 464 | GET | `p === "api/v1/network-plus/access"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `—` |
| 465 | GET | `p === "api/v1/network-plus/organizations"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.listNetworkPlusOrganizations` |
| 470 | GET | `p === "api/v1/network-plus/listing-taxonomy"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.listNetworkPlusListingTaxonomy` |
| 471 | GET | `p === "api/v1/network-plus/geography-reference"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.listNetworkPlusListingTaxonomy` |
| 472 | GET | `p === "api/v1/network-plus/my/listings"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.listMyOpportunityListings` |
| 473 | GET | `p === "api/v1/network-plus/listings"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.listProfessionalServices` |
| 478 | GET | `p === "api/v1/network-plus/businesses"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.listBusinesses` |
| 483 | GET | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.getBusiness` |
| 486 | GET | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.getBusiness` |
| 487 | GET | `p === "api/v1/network-plus/services"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.listProfessionalServices` |
| 492 | GET | `p startsWith "api/v1/network-plus/services/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.getProfessionalService` |
| 493 | GET | `p === "api/v1/network-plus/my/businesses"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.listMyBusinesses` |
| 494 | POST | `p === "api/v1/network-plus/businesses"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.createBusiness` |
| 498 | PATCH | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.updateBusiness` |
| 499 | POST | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.addBusinessOwner` |
| 500 | POST | `p startsWith "api/v1/network-plus/business-ownership/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.respondBusinessOwnership` |
| 503 | POST | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.grantBusinessAccess` |
| 504 | GET | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.listBusinessVerificationEvidence` |
| 505 | POST | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.addBusinessVerificationEvidence` |
| 506 | GET | `p === "api/v1/admin/network-plus/businesses/verification-queue"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.listBusinessVerificationQueue` |
| 507 | GET | `p === "api/v1/admin/network-plus/businesses/moderation-queue"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.listBusinessModerationQueue` |
| 508 | GET | `p === "api/v1/admin/network-plus/services/moderation-queue"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.listProfessionalServiceModerationQueue` |
| 509 | GET | `p startsWith "api/v1/admin/network-plus/businesses/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.listBusinessVerificationEvidence` |
| 510 | DELETE | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.revokeBusinessAccess` |
| 511 | POST | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.submitBusinessVerification` |
| 515 | POST | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.submitBusinessModeration` |
| 516 | POST | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.changeBusinessPublicationStatus` |
| 519 | POST | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.createOpportunityListingDraft` |
| 523 | PATCH | `p startsWith "api/v1/network-plus/services/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.saveOpportunityListingDraft` |
| 526 | POST | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.createProfessionalServiceListing` |
| 530 | PATCH | `p startsWith "api/v1/network-plus/services/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.updateProfessionalServiceListing` |
| 531 | POST | `p startsWith "api/v1/network-plus/services/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.changeProfessionalServiceStatus` |
| 532 | POST | `p startsWith "api/v1/network-plus/services/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.submitProfessionalServiceListing` |
| 536 | POST | `p startsWith "api/v1/admin/network-plus/businesses/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.reviewBusinessVerification` |
| 537 | POST | `p startsWith "api/v1/admin/network-plus/businesses/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.reviewBusinessModeration` |
| 538 | POST | `p startsWith "api/v1/admin/network-plus/services/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusBusiness.moderateProfessionalServiceListing` |
| 539 | GET | `p === "api/v1/network-plus/request-invitations"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusRequests.listNetworkPlusParticipantInvitations` |
| 540 | GET | `p === "api/v1/network-plus/requests"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusRequests.listNetworkPlusRequests` |
| 544 | POST | `p === "api/v1/network-plus/requests"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusRequests.createNetworkPlusRequest` |
| 548 | POST | `p startsWith "api/v1/admin/network-plus/requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusRequests.grantNetworkPlusSupportAccess` |
| 549 | DELETE | `p startsWith "api/v1/admin/network-plus/requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusRequests.revokeNetworkPlusSupportAccess` |
| 550 | GET | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusRequests.getNetworkPlusRequest` |
| 551 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusRequests.submitNetworkPlusRequest` |
| 552 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusRequests.transitionNetworkPlusRequest` |
| 553 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusRequests.updateNetworkPlusRequestDisposition` |
| 554 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusRequests.updateNetworkPlusContactConsent` |
| 555 | GET | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusRequests.getNetworkPlusContactHandoff` |
| 556 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusRequests.createNetworkPlusMeetingProposal` |
| 557 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusRequests.respondNetworkPlusMeeting` |
| 558 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusRequests.answerNetworkPlusQuestion` |
| 559 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusRequests.askNetworkPlusClarification` |
| 560 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusRequests.answerNetworkPlusClarification` |
| 561 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusRequests.addNetworkPlusRequestParticipant` |
| 562 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusRequests.respondNetworkPlusParticipant` |
| 563 | GET | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusRequests.getNetworkPlusWorkspace` |
| 564 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusRequests.createNetworkPlusWorkspace` |
| 565 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusRequests.addNetworkPlusWorkspaceMilestone` |
| 566 | PATCH | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusRequests.updateNetworkPlusWorkspaceMilestone` |
| 567 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `networkPlusRequests.addNetworkPlusWorkspaceEvent` |
| 568 | PATCH | `p startsWith "api/v1/organizations/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.updateNetworkPlusVisibility` |
| 571 | POST | `p === "api/v1/admin/experience/demo-cases"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `experience.createDemoCase` |
| 572 | PATCH | `p startsWith "api/v1/admin/experience/demo-cases/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `experience.updateDemoCase` |
| 573 | POST | `p === "api/v1/admin/experience/guides"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `experience.createGuide` |
| 574 | PATCH | `p startsWith "api/v1/admin/experience/guides/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `experience.updateGuide` |
| 576 | POST | `p === "api/v1/organizations"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.registerOrganization` |
| 577 | GET | `p === "api/v1/organizations"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.listMyOrganizations` |
| 578 | GET | `p === "api/v1/me/organization-access"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.listMyOrganizationAccess` |
| 579 | GET | `p === "api/v1/me/job-assignments"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.listMyJobAssignments` |
| 580 | GET | `p startsWith "api/v1/organizations/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.getOrganization` |
| 581 | POST | `p startsWith "api/v1/organizations/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.addVerificationEvidence` |
| 582 | POST | `p startsWith "api/v1/organizations/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.submitOrganizationVerification` |
| 583 | POST | `p startsWith "api/v1/organizations/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.addOrganizationUser` |
| 584 | PATCH | `p startsWith "api/v1/organizations/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.updateOrganizationUser` |
| 585 | GET | `p startsWith "api/v1/organizations/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.listOrganizationUsers` |
| 586 | GET | `p === "api/v1/review/organizations"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.listOrganizationVerificationQueue` |
| 587 | POST | `p === "api/v1/review/organizations"` | anyRoleOrPermission(identity,["reviewer","system_admin"],["organizations.review"]) | `organizationJobs.reviewOrganization` |
| 588 | GET | `p === "api/v1/admin/organization-verification-requirements"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.listOrganizationVerificationRequirements` |
| 589 | POST | `p === "api/v1/admin/organization-verification-requirements"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.createOrganizationVerificationRequirement` |
| 590 | PATCH | `p startsWith "api/v1/admin/organization-verification-requirements/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.updateOrganizationVerificationRequirement` |
| 592 | POST | `p === "api/v1/jobs"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.createJob` |
| 593 | POST | `p startsWith "api/v1/organizations/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.createRequisition` |
| 594 | GET | `p startsWith "api/v1/organizations/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.listRequisitions` |
| 595 | POST | `p startsWith "api/v1/job-requisitions/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.decideRequisition` |
| 596 | GET | `p startsWith "api/v1/organizations/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.listOrganizationJobs` |
| 597 | GET | `p startsWith "api/v1/organizations/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.organizationRecruitingDashboard` |
| 598 | GET | `p startsWith "api/v1/organizations/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `stakeholderOutcomes.getOrganizationOutcomeWorkspace` |
| 599 | GET | `p startsWith "api/v1/jobs/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.jobDashboard` |
| 600 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.addJobTeamMember` |
| 601 | GET | `p startsWith "api/v1/jobs/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.listJobTeam` |
| 602 | DELETE | `p startsWith "api/v1/jobs/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.removeJobTeamMember` |
| 603 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.addScreeningQuestion` |
| 604 | GET | `p startsWith "api/v1/jobs/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.listInterviewScorecards` |
| 605 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.createInterviewScorecard` |
| 606 | GET | `p startsWith "api/v1/jobs/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.listScreeningQuestions` |
| 607 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.referCandidate` |
| 608 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.saveJob` |
| 609 | DELETE | `p startsWith "api/v1/jobs/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.unsaveJob` |
| 610 | GET | `p === "api/v1/me/saved-jobs"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.listSavedJobs` |
| 611 | GET | `p === "api/v1/me/saved-items"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `savedDiscoveryItems.listDiscoveryItems` |
| 612 | POST | `p === "api/v1/me/saved-items"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `savedDiscoveryItems.saveDiscoveryItem` |
| 613 | DELETE | `p startsWith "api/v1/me/saved-items/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `savedDiscoveryItems.removeDiscoveryItem` |
| 614 | POST | `p === "api/v1/me/job-alerts"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.createJobAlert` |
| 615 | GET | `p === "api/v1/me/job-alerts"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.listJobAlerts` |
| 616 | GET | `p startsWith "api/v1/job-applications/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.listApplicationNotes` |
| 617 | POST | `p startsWith "api/v1/job-applications/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.addApplicationNote` |
| 618 | GET | `p startsWith "api/v1/job-applications/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.listApplicationInterviews` |
| 619 | POST | `p startsWith "api/v1/job-applications/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.scheduleInterview` |
| 620 | POST | `p startsWith "api/v1/job-interviews/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.updateInterviewStatus` |
| 621 | POST | `p startsWith "api/v1/job-interviews/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.proposeInterviewChange` |
| 622 | POST | `p startsWith "api/v1/job-interview-change-proposals/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.decideInterviewChange` |
| 623 | POST | `p startsWith "api/v1/job-interviews/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.respondInterview` |
| 624 | POST | `p startsWith "api/v1/job-interviews/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.submitInterviewFeedback` |
| 625 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.recordJobOutcome` |
| 628 | POST | `p === "api/v1/marketplace-demand"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `marketplaceDemand.createDemand` |
| 629 | POST | `p === "api/v1/marketplace-demand/public-topics"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `marketplaceDemand.createPublicTopicSubmission` |
| 630 | GET | `p === "api/v1/me/marketplace-demand-public-topics"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `marketplaceDemand.listMyPublicTopicSubmissions` |
| 631 | GET | `p === "api/v1/admin/marketplace-demand-public-topics"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `marketplaceDemand.listPublicTopicSubmissionsForReview` |
| 632 | PATCH | `p startsWith "api/v1/admin/marketplace-demand-public-topics/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `marketplaceDemand.reviewPublicTopicSubmission` |
| 633 | GET | `p === "api/v1/me/marketplace-demand"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `marketplaceDemand.listMyDemand` |
| 634 | GET | `p === "api/v1/me/marketplace-demand-interests"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `marketplaceDemand.listMyInterests` |
| 635 | POST | `p startsWith "api/v1/marketplace-demand/topics/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `marketplaceDemand.joinDemandTopic` |
| 636 | POST | `p startsWith "api/v1/marketplace-demand/topics/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `marketplaceDemand.withdrawDemandInterest` |
| 637 | GET | `p === "api/v1/admin/marketplace-match-candidates"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `marketplaceDemand.listDemandMatchCandidates` |
| 638 | POST | `p startsWith "api/v1/admin/marketplace-demand/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `marketplaceDemand.createDemandProviderMatch` |
| 639 | GET | `p === "api/v1/me/marketplace-demand-matches"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `marketplaceDemand.listMyDemandProviderMatches` |
| 640 | POST | `p startsWith "api/v1/marketplace-demand-matches/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `marketplaceDemand.respondToDemandProviderMatch` |
| 641 | GET | `p === "api/v1/admin/marketplace-demand"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `marketplaceDemand.listReviewQueue` |
| 642 | GET | `p === "api/v1/admin/marketplace-demand-assessment"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `marketplaceDemand.getDemandInterestAssessment` |
| 643 | POST | `p startsWith "api/v1/admin/marketplace-demand/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `marketplaceDemand.mergeDemand` |
| 644 | PATCH | `p startsWith "api/v1/admin/marketplace-demand/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `marketplaceDemand.reviewDemand` |
| 645 | GET | `p === "api/v1/admin/marketplace-listings"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `marketplaceDemand.listAdminListings` |
| 646 | POST | `p startsWith "api/v1/admin/marketplace-listings/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `marketplaceDemand.moderateListing` |
| 647 | GET | `p startsWith "api/v1/admin/marketplace-demand-topics/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `marketplaceDemand.getDemandSummary` |
| 648 | POST | `p === "api/v1/services"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.createServiceListing` |
| 649 | PATCH | `p startsWith "api/v1/services/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.updateServiceListing` |
| 650 | POST | `p startsWith "api/v1/services/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.changeServiceListingStatus` |
| 651 | POST | `p startsWith "api/v1/services/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.createServiceListingAnnouncement` |
| 652 | POST | `p startsWith "api/v1/service-listing-announcements/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.changeServiceListingAnnouncementStatus` |
| 653 | POST | `p startsWith "api/v1/services/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.createServiceListingInterest` |
| 654 | POST | `p startsWith "api/v1/services/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.createServiceListingPledge` |
| 655 | POST | `p startsWith "api/v1/service-listing-interests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.withdrawServiceListingInterest` |
| 656 | POST | `p startsWith "api/v1/service-listing-pledges/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.changeServiceListingPledgeStatus` |
| 657 | GET | `p === "api/v1/me/service-listings"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.listMyServiceListings` |
| 658 | GET | `p === "api/v1/me/service-listing-interest-summary"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.listMyServiceListingInterestSummary` |
| 659 | GET | `p === "api/v1/me/service-listing-pledges"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.listMyServiceListingPledges` |
| 660 | GET | `p === "api/v1/me/organization-mentorship-offers"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationMentorshipOffers.listMyOrganizationMentorshipOffers` |
| 661 | POST | `p === "api/v1/organization-mentorship-offers"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationMentorshipOffers.createOrganizationMentorshipOffer` |
| 662 | PATCH | `p startsWith "api/v1/organization-mentorship-offers/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationMentorshipOffers.updateOrganizationMentorshipOffer` |
| 663 | POST | `p startsWith "api/v1/organization-mentorship-offers/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationMentorshipOffers.changeOrganizationMentorshipOfferStatus` |
| 664 | POST | `p startsWith "api/v1/organization-mentorship-offers/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationMentorshipOffers.requestOrganizationMentorship` |
| 665 | GET | `p === "api/v1/me/organization-mentorship-requests"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationMentorshipOffers.listMyOrganizationMentorshipRequests` |
| 666 | POST | `p startsWith "api/v1/organization-mentorship-requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationMentorshipOffers.respondOrganizationMentorshipRequest` |
| 667 | GET | `p === "api/v1/me/service-requests"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.listMyServiceRequests` |
| 668 | POST | `p startsWith "api/v1/services/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.requestService` |
| 669 | GET | `p startsWith "api/v1/service-requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.listServiceRequestUpdates` |
| 670 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.createServiceRequestUpdate` |
| 671 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.changeServiceRequestStatus` |
| 672 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.acceptServiceAgreement` |
| 673 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.acceptServiceCompletion` |
| 674 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.reviewServiceCompletion` |
| 675 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.submitServicePayment` |
| 676 | POST | `p startsWith "api/v1/service-payments/" + path-segment constraints` | anyRoleOrPermission(identity,["finance_officer","reviewer","system_admin"],["finance.manage"]) | `servicesMentorship.verifyServicePayment` |
| 677 | GET | `p startsWith "api/v1/service-requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.listServiceMilestones` |
| 678 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.createServiceMilestone` |
| 679 | GET | `p startsWith "api/v1/service-requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.listServiceDeliveries` |
| 680 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.submitServiceDelivery` |
| 681 | POST | `p startsWith "api/v1/service-deliveries/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.reviewServiceDelivery` |
| 682 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.submitServiceFeedback` |
| 683 | GET | `p === "api/v1/mentors"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.listMentors` |
| 684 | GET | `p === "api/v1/me/mentor-profile"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.getMyMentorProfile` |
| 685 | POST | `p === "api/v1/me/mentor-profile"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.createMentorProfile` |
| 686 | PATCH | `p startsWith "api/v1/mentor-profiles/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.updateMentorProfile` |
| 687 | POST | `p startsWith "api/v1/mentor-profiles/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.changeMentorStatus` |
| 688 | GET | `p startsWith "api/v1/mentor-profiles/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `mentorshipOperations.getMentorshipCircleSummary` |
| 689 | POST | `p startsWith "api/v1/mentor-profiles/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `mentorshipOperations.joinMentorshipCircle` |
| 690 | DELETE | `p startsWith "api/v1/mentor-profiles/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `mentorshipOperations.leaveMentorshipCircle` |
| 691 | PUT | `p startsWith "api/v1/mentor-profiles/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.setMentorAvailability` |
| 692 | DELETE | `p startsWith "api/v1/mentor-profiles/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.removeMentorTimeOff` |
| 693 | POST | `p startsWith "api/v1/mentor-profiles/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.addMentorTimeOff` |
| 694 | GET | `p startsWith "api/v1/mentorship/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.listMentorshipLearningActivities` |
| 695 | POST | `p startsWith "api/v1/mentorship/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.createMentorshipLearningActivity` |
| 696 | POST | `p startsWith "api/v1/mentorship-activities/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.submitMentorshipLearningActivity` |
| 697 | POST | `p startsWith "api/v1/mentorship-learning-submissions/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.reviewMentorshipLearningSubmission` |
| 698 | GET | `p === "api/v1/me/mentorship-learning-progress"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.listMyMentorshipLearningProgress` |
| 699 | GET | `p === "api/v1/me/mentorship-requests"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.listMyMentorshipRequests` |
| 700 | GET | `p === "api/v1/me/mentorship-interest"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `mentorshipOperations.listMentorshipInterestPool` |
| 701 | GET | `p === "api/v1/me/mentorship-operations"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `mentorshipOperations.getMentorshipOperationalReport` |
| 702 | GET | `p === "api/v1/me/mentorship-reports"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `mentorshipOperations.listMyMentorshipParticipantReports` |
| 703 | GET | `p === "api/v1/admin/mentorship-reports"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `mentorshipOperations.listMentorshipParticipantReports` |
| 704 | GET | `p === "api/v1/admin/service-mentorship-cases"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `serviceMentorshipSupportCases.listSupportCases` |
| 706 | GET | `p === "api/v1/admin/mentorship/pending-decisions"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `mentorshipOperations.listMentorshipProgrammePendingDecisions` |
| 707 | GET | `p === "api/v1/admin/mentorship/relationships"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `mentorshipOperations.listMentorshipProgrammeRelationships` |
| 708 | GET | `p === "api/v1/admin/mentorship/metrics"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `mentorshipOperations.getMentorshipProgrammeMetrics` |
| 709 | GET | `p === "api/v1/admin/mentorship-interest"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `mentorshipOperations.listMentorshipInterestReviewQueue` |
| 710 | POST | `p startsWith "api/v1/admin/mentorship-interest/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `mentorshipOperations.proposeMentorshipInterestMatch` |
| 711 | POST | `p startsWith "api/v1/admin/mentorship-interest/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `mentorshipOperations.markMentorshipInterestReviewed` |
| 712 | PATCH | `p startsWith "api/v1/admin/mentorship-reports/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `mentorshipOperations.updateMentorshipParticipantReport` |
| 713 | GET | `p === "api/v1/me/mentorship-matches"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.listMyMentorshipMatches` |
| 714 | GET | `p === "api/v1/me/mentorships"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.listMyMentorships` |
| 715 | POST | `p === "api/v1/mentorship/requests"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.createMentorshipRequest` |
| 716 | PATCH | `p startsWith "api/v1/mentorship/requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `mentorshipOperations.setMentorshipRequestSharing` |
| 717 | POST | `p startsWith "api/v1/mentorship/requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `mentorshipOperations.registerMentorshipInterest` |
| 718 | GET | `p startsWith "api/v1/mentorship/requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.getMentorshipRequest` |
| 719 | GET | `p startsWith "api/v1/mentorship/requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.findMentorMatches` |
| 720 | POST | `p startsWith "api/v1/mentorship/requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.proposeMentorMatch` |
| 721 | POST | `p startsWith "api/v1/mentorship/matches/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.respondToMatch` |
| 722 | POST | `p startsWith "api/v1/mentorship/matches/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.respondToMenteeMatch` |
| 723 | GET | `p startsWith "api/v1/mentorship/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.getMentorship` |
| 724 | GET | `p startsWith "api/v1/mentorship/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.listMentorshipGoals` |
| 725 | POST | `p startsWith "api/v1/mentorship/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.createMentorshipGoal` |
| 726 | PATCH | `p startsWith "api/v1/mentorship-goals/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.updateMentorshipGoal` |
| 727 | POST | `p startsWith "api/v1/mentorship/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.changeMentorshipStatus` |
| 728 | GET | `p startsWith "api/v1/mentorship/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.listMentorshipSessions` |
| 729 | POST | `p startsWith "api/v1/mentorship/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.createMentorshipSession` |
| 730 | POST | `p startsWith "api/v1/mentorship/sessions/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `mentorshipOperations.respondToSessionProposal` |
| 731 | POST | `p startsWith "api/v1/mentorship/sessions/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `mentorshipOperations.proposeMentorshipSessionChange` |
| 732 | POST | `p startsWith "api/v1/mentorship/session-changes/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `mentorshipOperations.respondToMentorshipSessionChange` |
| 733 | PATCH | `p startsWith "api/v1/mentorship/sessions/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.updateMentorshipSessionDetails` |
| 734 | POST | `p startsWith "api/v1/mentorship/sessions/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.changeMentorshipSession` |
| 735 | POST | `p startsWith "api/v1/mentorship/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `servicesMentorship.submitMentorshipFeedback` |
| 736 | POST | `p startsWith "api/v1/mentorship/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `mentorshipOperations.createMentorshipParticipantReport` |
| 737 | GET | `p === "api/v1/me/outcomes"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `stakeholderOutcomes.getMyOutcomeWorkspace` |
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
| 805 | GET | `p === "api/v1/me"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `membership.getMe` |
| 806 | PATCH | `p === "api/v1/me/account"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `accountSecurity.updateOwnCredentials` |
| 807 | PATCH | `p === "api/v1/me/profile"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `membership.updateProfile` |
| 808 | GET | `p === "api/v1/membership/history"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `membership.history` |
| 809 | GET | `p === "api/v1/membership/applications/me"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `membership.listMyApplications` |
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
| 821 | GET | `p === "api/v1/notifications/push/status"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `—` |
| 822 | POST | `p === "api/v1/notifications/push/subscriptions"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `—` |
| 823 | DELETE | `p === "api/v1/notifications/push/subscriptions"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `—` |
| 824 | GET | `p === "api/v1/notifications"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `notifications.getNotificationInbox` |
| 825 | POST | `p === "api/v1/notifications/read-all"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `notifications.markAllNotificationsRead` |
| 826 | PATCH | `p startsWith "api/v1/notifications/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `notifications.markNotificationRead` |
| 827 | PATCH | `p startsWith "api/v1/notifications/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `notifications.archiveNotification` |
| 828 | GET | `p === "api/v1/notifications/preferences"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `membership.notificationPreferences` |
| 829 | PATCH | `p === "api/v1/notifications/preferences"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `membership.notificationPreferences` |
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
| 891 | GET | `p === "api/v1/me/residence"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `membershipGeography.getMyResidence` |
| 892 | PATCH | `p === "api/v1/me/residence"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `membershipGeography.saveMyResidence` |
| 893 | GET | `p === "api/v1/admin/member-geography/import-template"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 894 | GET | `p === "api/v1/admin/member-geography/export"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipGeography.exportPublishedMemberGeography` |
| 895 | POST | `p === "api/v1/admin/member-geography/import/preview"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipGeography.previewMemberGeographyImport` |
| 896 | POST | `p startsWith "api/v1/admin/member-geography/import/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipGeography.applyMemberGeographyImport` |
| 897 | POST | `p startsWith "api/v1/admin/member-geography/versions/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipGeography.publishMemberGeographyVersion` |
| 899 | GET | `p === "api/v1/professional-reference-data"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `referencePortfolio.listPublicReferenceSets` |
| 900 | GET | `p === "api/v1/me/cv"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `talent.getMyCv` |
| 901 | PATCH | `p === "api/v1/me/cv"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `talent.saveMyCv` |
| 902 | GET | `p === "api/v1/me/cv/shares"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `talent.listMyCvShares` |
| 903 | POST | `p === "api/v1/me/cv/share"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `talent.shareMyCvWithApplication` |
| 904 | DELETE | `p === "api/v1/me/cv/share"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `talent.revokeMyCvShare` |
| 905 | GET | `p === "api/v1/me/education"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `talent.getProfessionalEducation` |
| 906 | PUT | `p === "api/v1/me/education"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `talent.saveProfessionalEducation` |
| 907 | GET | `p === "api/v1/me/portfolio"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `talent.getProfessionalPortfolio` |
| 908 | POST | `p === "api/v1/me/portfolio"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `talent.saveProfessionalPortfolioItem` |
| 909 | PATCH | `p startsWith "api/v1/me/portfolio/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `talent.saveProfessionalPortfolioItem` |
| 910 | DELETE | `p startsWith "api/v1/me/portfolio/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `talent.deleteProfessionalPortfolioItem` |
| 911 | GET | `p === "api/v1/me/talent-profile"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `talent.getProfessionalProfile` |
| 912 | PATCH | `p === "api/v1/me/talent-profile"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `talent.updateProfessionalProfile` |
| 913 | GET | `p === "api/v1/me/talent-visibility"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `talent.getVisibility` |
| 914 | PATCH | `p === "api/v1/me/talent-visibility"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `talent.updateVisibility` |
| 915 | POST | `p === "api/v1/talent/saved-searches"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `talent.saveSearch` |
| 916 | GET | `p === "api/v1/talent/saved-searches"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `talent.listSavedSearches` |
| 917 | POST | `p === "api/v1/talent/inquiries"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `talent.createTalentInquiry` |
| 918 | GET | `p === "api/v1/talent/inquiries"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `talent.listTalentInquiries` |
| 919 | POST | `p startsWith "api/v1/talent/inquiries/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `talent.respondToTalentInquiry` |
| 920 | POST | `p startsWith "api/v1/talent/inquiries/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `talent.closeTalentInquiry` |
| 922 | POST | `p === "api/v1/ethics/cases"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `ethics.createEthicsCase` |
| 923 | GET | `p === "api/v1/me/ethics/cases"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `ethics.listMyEthicsCases` |
| 924 | POST | `p startsWith "api/v1/ethics/cases/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `ethics.addEthicsCaseEvidence` |
| 925 | POST | `p startsWith "api/v1/ethics/cases/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `ethics.submitEthicsRespondentResponse` |
| 926 | GET | `p === "api/v1/review/ethics/cases"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `ethics.listEthicsCases` |
| 927 | GET | `p === "api/v1/review/ethics/reviewers"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `ethics.listEthicsReviewers` |
| 928 | GET | `p startsWith "api/v1/review/ethics/cases/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `ethics.getEthicsCase` |
| 929 | PATCH | `p startsWith "api/v1/review/ethics/cases/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `ethics.updateEthicsCase` |
| 930 | POST | `p startsWith "api/v1/review/ethics/cases/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `ethics.assignEthicsCase` |
| 931 | POST | `p startsWith "api/v1/review/ethics/cases/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `ethics.assignEthicsPanelMember` |
| 932 | POST | `p startsWith "api/v1/review/ethics/cases/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `ethics.declareEthicsConflict` |
| 933 | POST | `p startsWith "api/v1/review/ethics/cases/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `ethics.recordEthicsReview` |
| 934 | POST | `p startsWith "api/v1/review/ethics/cases/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `ethics.decideEthicsCase` |
| 936 | GET | `p === "api/v1/me/volunteer-pledges"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `volunteerPledges.listMyVolunteerPledges` |
| 937 | POST | `p === "api/v1/me/volunteer-pledges"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `volunteerPledges.saveVolunteerPledge` |
| 938 | PATCH | `p startsWith "api/v1/me/volunteer-pledges/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `volunteerPledges.updateVolunteerPledge` |
| 939 | DELETE | `p startsWith "api/v1/me/volunteer-pledges/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `volunteerPledges.withdrawVolunteerPledge` |
| 941 | GET | `p === "api/v1/verification/programs"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `verification.listPrograms` |
| 942 | GET | `p === "api/v1/verification/claim-types"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `verification.listClaimTypes` |
| 943 | GET | `p === "api/v1/me/verification/cases"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `verification.listCases` |
| 944 | GET | `p === "api/v1/me/verification/reference-requests"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `verification.listMyReferenceRequests` |
| 945 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `verification.requestReference` |
| 946 | POST | `p startsWith "api/v1/verification/reference-requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `verification.respondReferenceRequest` |
| 947 | POST | `p startsWith "api/v1/verification/reference-requests/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `verification.reviewReferenceRequest` |
| 948 | POST | `p === "api/v1/verification/cases"` | anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]); requireRole(identity,"member") | `verification.createCase` |
| 954 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `verification.giveConsent` |
| 955 | GET | `p startsWith "api/v1/verification/cases/"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `verification.getCase` |
| 959 | GET | `p === "api/v1/review/verification/appeals"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `verification.listAppealsForReview` |
| 960 | GET | `p === "api/v1/review/verification/cases"` | anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]) | `verification.listCases` |
| 965 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | anyRoleOrPermission(identity,["system_admin"],["verification.manage"]) | `verification.assignCase` |
| 969 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]) | `verification.transitionCase` |
| 973 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]) | `verification.getCase` |
| 978 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]) | `verification.getCase` |
| 983 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]) | `verification.decide` |
| 987 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `verification.memberResponse` |
| 988 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `verification.submitAppeal` |
| 989 | POST | `p startsWith "api/v1/verification/appeals/" + path-segment constraints` | anyRoleOrPermission(identity,["appeal_reviewer","system_admin"],["verification.appeal.review"]) | `verification.decideAppeal` |
| 993 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]) | `verification.setClaimStatus` |
| 997 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]) | `verification.recordCheckResult` |
| 1002 | GET | `p === "api/v1/review/jobs"` | anyRoleOrPermission(identity,["reviewer","system_admin"],["jobs.review"]) | `organizationJobs.listJobsForReview` |
| 1003 | POST | `p startsWith "api/v1/review/jobs/" + path-segment constraints` | anyRoleOrPermission(identity,["reviewer","system_admin"],["jobs.review"]) | `organizationJobs.reviewJob` |
| 1004 | GET | `p startsWith "api/v1/jobs/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.evaluateEligibility` |
| 1005 | PATCH | `p startsWith "api/v1/jobs/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.updateJob` |
| 1006 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.publishJob` |
| 1007 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.changeJobStatus` |
| 1008 | GET | `p startsWith "api/v1/jobs/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.listCandidates` |
| 1009 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.saveApplicationDraft` |
| 1010 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.applyToJob` |
| 1011 | PATCH | `p startsWith "api/v1/job-applications/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.updateApplicationDraft` |
| 1012 | POST | `p startsWith "api/v1/job-applications/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.submitApplication` |
| 1013 | GET | `p === "api/v1/me/job-applications"` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.listMyApplications` |
| 1014 | GET | `p startsWith "api/v1/job-applications/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.getMyApplicationProgress` |
| 1015 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.updateCandidate` |
| 1016 | POST | `p startsWith "api/v1/job-applications/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.approveJobOffer` |
| 1017 | POST | `p startsWith "api/v1/job-applications/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.respondToJobApplication` |
| 1018 | GET | `p startsWith "api/v1/job-applications/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.listApplicationAttachments` |
| 1019 | POST | `p startsWith "api/v1/job-applications/" + path-segment constraints` | DEFECT CANDIDATE: references identity without local auth/identity binding | `organizationJobs.addApplicationAttachment` |

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
