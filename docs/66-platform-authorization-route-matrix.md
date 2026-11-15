# MPA API route-by-route authorization dispatch inventory

**Repository:** `mpaproject1/MPA-Professionals-Network`  
**Branch:** `feat/workstream-3-progress-members-workspace`  
**Source:** `server.js` at blob `410df8e0207a12340a43fd56475ac64a37ae475d` (Phase 1 authentication hardening)  
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

## Phase 1 — request principal and endpoint authentication integrity (implementation updated 2026-11-15)

The Phase 1 implementation hardens the shared authentication helper and the explicitly optional-viewer routes:

- `auth(req)` verifies the signed bearer token separately from database-backed session validation, requires a session ID, and checks that the session is active, unrevoked, unexpired, belongs to the token subject, and is attached to an active, email-verified account.
- Current roles and direct permissions are reloaded from PostgreSQL on each authenticated request. Existing administrator passkey enforcement, restricted recovery sessions, and password-reset route restrictions remain in force.
- Invalid/expired JWTs and missing/revoked/expired sessions return 401; email-verification and password-reset restrictions retain 403; missing authentication configuration returns 503. Transient database connectivity/capacity failures during authentication return 503 rather than being misreported as invalid credentials. Other unexpected server/database errors are not converted into 401.
- Optional-viewer routes remain public when no bearer token is supplied. When a bearer token is supplied, it must pass the same active-session authentication as protected routes. This applies to public job discovery/details, public opportunity inquiries, public service/mentor announcements and stories, service listing details and mentor profile details. The public support-bot route likewise remains anonymous without a token but no longer silently downgrades a supplied invalid token to guest access.
- `e2e/security-auth.spec.js` adds coverage for anonymous public job discovery, malformed bearer rejection, expired session rejection, revoked session rejection, and invalid bearer rejection on the public support-bot route.

**Validation status:** implementation and regression test source are committed; the application and Playwright tests were not executed in this repository session, and CI was not triggered. Therefore this is an implementation update, not a claim that the Phase 1 runtime exit gate has passed. The exact test results must be recorded after execution on the current branch head.

---

## Route matrix

| server.js line | HTTP | Route matcher / path predicate | Dispatch access gate | First service handler |
|---:|---|---|---|---|
| 174 | GET | `p === "api/v1/admin/test-lab"` | anyRole(identity,["system_admin"]) | `testLab.listTestPortfolios` |
| 175 | POST | `p === "api/v1/admin/test-lab"` | anyRole(identity,["system_admin"]) | `testLab.createTestPortfolio` |
| 176 | POST | `p startsWith "api/v1/admin/test-lab/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `testLab.exportTestPortfolioAccounts` |
| 177 | GET | `p startsWith "api/v1/admin/test-lab/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `testLab.previewTestPortfolioReset` |
| 178 | GET | `p startsWith "api/v1/admin/test-lab/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `testLab.getTestPortfolioOperations` |
| 179 | GET | `p startsWith "api/v1/admin/test-lab/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `testLab.exportTestPortfolioScenarioWorkbook` |
| 180 | POST | `p startsWith "api/v1/admin/test-lab/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `testLab.simulateTestPayment` |
| 181 | DELETE | `p startsWith "api/v1/admin/test-lab/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `testLab.resetTestPortfolio` |
| 182 | POST | `p === "api/v1/public/community-campaigns/opt-in"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `communityCampaigns.createPublicCampaignOptIn` |
| 183 | POST | `p === "api/v1/public/community-campaigns/manage"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `communityCampaigns.managePublicCampaignOptIn` |
| 184 | POST | `p === "api/v1/payments/chapa/webhook"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `membership.handleChapaMembershipWebhook` |
| 185 | GET | `p === "api/v1/public/membership-verification"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `membershipCard.verifyMembershipCard` |
| 186 | POST | `p === "api/v1/public/support-bot/message"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `supportBot.answerPublicQuestion` |
| 187 | GET | `p === "api/v1/auth/human-challenge"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `—` |
| 188 | POST | `p === "api/v1/auth/human-challenge/verify"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `—` |
| 189 | POST | `p === "api/v1/auth/email-verification/resend"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `—` |
| 190 | POST | `p === "api/v1/auth/email-verification/verify"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `—` |
| 191 | POST | `p === "api/v1/auth/passkeys/options"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `—` |
| 192 | POST | `p === "api/v1/auth/passkeys/verify"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `—` |
| 193 | POST | `p === "api/v1/auth/passkeys/recovery"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `—` |
| 194 | POST | `p === "api/v1/admin/passkeys/registration/options"` | anyRole(identity,["system_admin","admin","platform_admin"]) | `—` |
| 195 | POST | `p === "api/v1/admin/passkeys/registration/verify"` | anyRole(identity,["system_admin","admin","platform_admin"]) | `—` |
| 196 | GET | `p === "api/v1/admin/passkeys"` | anyRole(identity,["system_admin","admin","platform_admin"]) | `—` |
| 197 | DELETE | `p startsWith "api/v1/admin/passkeys/" + path-segment constraints` | anyRole(identity,["system_admin","admin","platform_admin"]) | `—` |
| 198 | POST | `p === "api/v1/email/delivery-webhook"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `emailOperations.receiveDeliveryWebhook` |
| 205 | POST | `p === "api/v1/email/inbound-webhook"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `emailOperations.receiveInboundEmail` |
| 212 | GET | `p === "api/v1/admin/email/operations"` | anyRole(identity,["system_admin"]) | `emailOperations.getEmailOperations` |
| 213 | GET | `p === "api/v1/admin/email/messages"` | anyRole(identity,["system_admin"]) | `emailOperations.listEmailOutbox` |
| 214 | GET | `p === "api/v1/admin/email/recipient-holds"` | anyRole(identity,["system_admin"]) | `emailOperations.listEmailRecipientHolds` |
| 215 | POST | `p startsWith "api/v1/admin/email/recipient-holds/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `emailOperations.releaseEmailRecipientHold` |
| 216 | POST | `p === "api/v1/admin/email/preview"` | anyRole(identity,["system_admin"]) | `emailOperations.previewEmailTemplate` |
| 217 | GET | `p startsWith "api/v1/admin/email/templates/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `emailOperations.listEmailTemplateVersions` |
| 218 | POST | `p startsWith "api/v1/admin/email/templates/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `emailOperations.restoreEmailTemplateVersion` |
| 219 | GET | `p === "api/v1/admin/email/templates"` | anyRole(identity,["system_admin"]) | `emailOperations.listEmailTemplates` |
| 220 | PUT | `p startsWith "api/v1/admin/email/templates/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `emailOperations.saveEmailTemplate` |
| 221 | PUT | `p startsWith "api/v1/admin/email/drafts/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `emailOperations.updateEmailDraft` |
| 222 | POST | `p startsWith "api/v1/admin/email/drafts/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `emailOperations.cancelEmailDraft` |
| 223 | POST | `p === "api/v1/admin/email/drafts"` | anyRole(identity,["system_admin"]) | `emailOperations.saveEmailDraft` |
| 224 | POST | `p startsWith "api/v1/admin/email/drafts/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `emailOperations.queueEmailDraft` |
| 225 | POST | `p === "api/v1/admin/email/test"` | anyRole(identity,["system_admin"]) | `emailOperations.sendTestEmail` |
| 226 | POST | `p === "api/v1/admin/email/dispatch"` | anyRole(identity,["system_admin"]) | `emailOperations.dispatchEmailOutbox` |
| 227 | POST | `p startsWith "api/v1/admin/email/messages/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `emailOperations.retryFailedEmail` |
| 228 | POST | `p startsWith "api/v1/admin/email/verification-failures/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `emailOperations.retryVerificationEmail` |
| 229 | PATCH | `p startsWith "api/v1/admin/email/inbox/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `emailOperations.updateInbox` |
| 230 | POST | `p === "api/v1/public/opportunity-inquiries"` | Public route with optional authenticated viewer; service must enforce visibility | `publicOpportunity.createPublicInquiry` |
| 231 | GET | `p === "api/v1/public/opportunity-sharing-organizations"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `publicOpportunity.searchPublicSharingOrganizations` |
| 232 | POST | `p startsWith "api/v1/public/opportunity-inquiries/" + path-segment constraints` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `publicOpportunity.getPublicInquiry` |
| 233 | POST | `p startsWith "api/v1/public/opportunity-inquiries/" + path-segment constraints` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `publicOpportunity.getSharingHistory` |
| 234 | POST | `p startsWith "api/v1/public/opportunity-inquiries/" + path-segment constraints` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `publicOpportunity.updateSharingConsent` |
| 235 | GET | `p startsWith "api/v1/public/opportunity-inquiries/" + path-segment constraints` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `publicOpportunity.getPublicInquiry` |
| 236 | PATCH | `p startsWith "api/v1/public/opportunity-inquiries/" + path-segment constraints` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `publicOpportunity.updatePublicInquiryDetails` |
| 237 | POST | `p startsWith "api/v1/public/opportunity-inquiries/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.linkInquiryToAccount` |
| 238 | GET | `p === "api/v1/jobs"` | Public route with optional authenticated viewer; service must enforce visibility | `organizationJobs.listJobs` |
| 239 | GET | `p startsWith "api/v1/jobs/" + path-segment constraints` | Public route with optional authenticated viewer; service must enforce visibility | `organizationJobs.getJob` |
| 240 | GET | `p startsWith "api/v1/jobs/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `organizationJobs.listJobApplications` |
| 242 | GET | `dynamic parts predicate (see server.js line)` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `financeReceipts.verifyFinancePaymentVoucher` |
| 244 | GET | `p === "api/v1/me/community-impact/detected"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactDetection.listMyDetectedContributions` |
| 245 | POST | `p startsWith "api/v1/me/community-impact/detected/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactDetection.confirmMyDetectedAttribution` |
| 246 | POST | `p startsWith "api/v1/me/community-impact/detected/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactDetection.disputeMyDetectedAttribution` |
| 247 | GET | `p === "api/v1/admin/community-impact/detection/candidates"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactDetection.listDetectionCandidates` |
| 248 | GET | `p === "api/v1/me/community-impact/score/policy"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.getActiveScorePolicy` |
| 249 | GET | `p === "api/v1/me/community-impact/score"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.getMyScore` |
| 250 | GET | `p === "api/v1/me/community-impact/workspace"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.getMyImpactWorkspace` |
| 251 | GET | `p === "api/v1/me/community-impact/recognition"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRecognition.listMyRecognition` |
| 252 | GET | `p === "api/v1/community-impact/recognition/programs"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `communityImpactRecognition.listRecognitionPrograms` |
| 253 | POST | `p === "api/v1/me/community-impact/recognition/nominations"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRecognition.submitRecognitionNomination` |
| 254 | POST | `parts prefix "api/v1/me/community-impact/recognition/awards"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRecognition.setAwardPublicConsent` |
| 255 | GET | `p === "api/v1/admin/community-impact/recognition/programs"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRecognition.listRecognitionAdminPrograms` |
| 256 | POST | `p === "api/v1/admin/community-impact/recognition/programs"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRecognition.saveRecognitionProgram` |
| 257 | GET | `p === "api/v1/admin/community-impact/recognition/queue"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRecognition.listRecognitionQueue` |
| 258 | GET | `p === "api/v1/admin/community-impact/recognition/summary"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRecognition.getRecognitionAdminSummary` |
| 259 | POST | `parts prefix "api/v1/admin/community-impact/recognition/nominations"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRecognition.assignRecognitionNomination` |
| 260 | POST | `parts prefix "api/v1/admin/community-impact/recognition/nominations"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRecognition.decideRecognitionNomination` |
| 261 | GET | `p === "api/v1/admin/community-impact/score/policies"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.listScorePolicies` |
| 262 | POST | `p === "api/v1/admin/community-impact/score/policies"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.proposeScorePolicy` |
| 263 | POST | `parts prefix "api/v1/admin/community-impact/score/policies"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.approveScorePolicy` |
| 264 | POST | `parts prefix "api/v1/admin/community-impact/score/policies"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.activateScorePolicy` |
| 265 | POST | `parts prefix "api/v1/admin/community-impact/score/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.linkVerifiedSource` |
| 266 | POST | `parts prefix "api/v1/admin/community-impact/score/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.scoreVerifiedClaim` |
| 267 | POST | `parts prefix "api/v1/admin/community-impact/score/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.recalculateVerifiedClaim` |
| 268 | GET | `p === "api/v1/admin/community-impact/score/recalculations"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.listScoreRecalculations` |
| 269 | GET | `p === "api/v1/admin/community-impact/score/ledger"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.listScoreLedger` |
| 270 | POST | `parts prefix "api/v1/admin/community-impact/score/ledger"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.reverseScoreEntry` |
| 271 | GET | `p === "api/v1/admin/community-impact/identity-assurance"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.listIdentityAssuranceQueue` |
| 272 | GET | `p === "api/v1/admin/community-impact/offline-attributions"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.listOfflineAttributions` |
| 273 | GET | `p === "api/v1/admin/community-impact/detection/policies"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.listDetectionPolicies` |
| 274 | POST | `p === "api/v1/admin/community-impact/detection/scan"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactDetection.scanDetectionSources` |
| 275 | GET | `p === "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.listMyClaims` |
| 276 | POST | `p === "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.createClaim` |
| 277 | GET | `parts prefix "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.getMyClaim` |
| 278 | PATCH | `parts prefix "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.updateMyClaim` |
| 279 | POST | `parts prefix "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.attachClaimEvidenceUrl` |
| 280 | POST | `parts prefix "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.attachClaimEvidence` |
| 281 | POST | `parts prefix "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.removeClaimEvidence` |
| 282 | POST | `parts prefix "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.submitMyClaim` |
| 283 | POST | `parts prefix "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.withdrawMyClaim` |
| 284 | POST | `parts prefix "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.respondToClarification` |
| 285 | POST | `parts prefix "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.submitClaimAppeal` |
| 286 | GET | `p === "api/v1/admin/community-impact/claim-reviewers"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.listClaimReviewers` |
| 287 | GET | `p === "api/v1/admin/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.listReviewQueue` |
| 288 | POST | `parts prefix "api/v1/admin/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.assignClaim` |
| 289 | POST | `parts prefix "api/v1/admin/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.decideClaim` |
| 290 | GET | `p === "api/v1/admin/community-impact/claim-appeals"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.listClaimAppeals` |
| 291 | POST | `parts prefix "api/v1/admin/community-impact/claim-appeals"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.assignClaimAppeal` |
| 292 | POST | `parts prefix "api/v1/admin/community-impact/claim-appeals"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.decideClaimAppeal` |
| 293 | GET | `p === "api/v1/me/community-impact/identity-assurance"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.getMyIdentityAssurance` |
| 294 | POST | `p === "api/v1/me/community-impact/identity-assurance"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.submitIdentityAssurance` |
| 295 | POST | `parts prefix "api/v1/me/community-impact/identity-assurance"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.submitIdentityAssuranceCase` |
| 296 | POST | `parts prefix "api/v1/me/community-impact/identity-assurance"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.attachIdentityEvidence` |
| 297 | POST | `parts prefix "api/v1/admin/community-impact/identity-assurance"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.decideIdentityAssurance` |
| 298 | POST | `p === "api/v1/admin/community-impact/detection/policies"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.proposeDetectionPolicy` |
| 299 | POST | `parts prefix "api/v1/admin/community-impact/detection/policies"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.approveDetectionPolicy` |
| 300 | POST | `parts prefix "api/v1/admin/community-impact/detection/policies"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.activateDetectionPolicy` |
| 301 | POST | `parts prefix "api/v1/admin/community-impact/detection/candidates"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.proposeOfflineAttribution` |
| 302 | POST | `parts prefix "api/v1/me/community-impact/offline-attributions"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.confirmOfflineAttribution` |
| 303 | POST | `parts prefix "api/v1/admin/community-impact/offline-attributions"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.assignOfflineAttribution` |
| 304 | POST | `parts prefix "api/v1/admin/community-impact/offline-attributions"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.decideOfflineAttribution` |
| 305 | POST | `parts prefix "api/v1/admin/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.reconcileClaimCandidate` |
| 306 | POST | `parts prefix "api/v1/admin/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.declareReviewerConflict` |
| 307 | POST | `parts prefix "api/v1/admin/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.proposeContributionAssessment` |
| 308 | GET | `p === "api/v1/admin/community-impact/assessments"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.listPendingContributionAssessments` |
| 309 | POST | `parts prefix "api/v1/admin/community-impact/assessments"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.secondReviewAssessment` |
| 310 | POST | `p === "api/v1/admin/community-impact/retention/evaluate"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.evaluateRetention` |
| 311 | GET | `p === "api/v1/admin/community-impact/retention-policy"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRetention.getRetentionPolicyGovernance` |
| 312 | POST | `p === "api/v1/admin/community-impact/retention-policy"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRetention.proposeRetentionPolicy` |
| 313 | POST | `p startsWith "api/v1/admin/community-impact/retention-policy/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRetention.approveRetentionPolicy` |
| 314 | POST | `p startsWith "api/v1/admin/community-impact/retention-policy/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRetention.activateRetentionPolicy` |
| 315 | GET | `p === "api/v1/public/serve-community/completed-projects"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `serveCommunityInitiatives.listPublicCompletedProjects` |
| 316 | GET | `p === "api/v1/admin/serve-community/offline-projects"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityOfflineProjects.listStaffProjects` |
| 317 | POST | `p === "api/v1/admin/serve-community/offline-projects"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityOfflineProjects.createStaffProject` |
| 318 | PATCH | `p startsWith "api/v1/admin/serve-community/offline-projects/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityOfflineProjects.submitStaffProject` |
| 319 | PATCH | `p startsWith "api/v1/admin/serve-community/offline-projects/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityOfflineProjects.updateStaffProject` |
| 320 | PATCH | `p startsWith "api/v1/admin/serve-community/offline-projects/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityOfflineProjects.reviewStaffProject` |
| 321 | GET | `p === "api/v1/serve-community/initiatives"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `serveCommunityInitiatives.listPublicInitiatives` |
| 322 | GET | `p startsWith "api/v1/serve-community/initiatives/" + path-segment constraints` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `serveCommunityInitiatives.getPublicInitiative` |
| 323 | POST | `p === "api/v1/serve-community/initiatives"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.createInitiative` |
| 324 | PATCH | `p startsWith "api/v1/serve-community/initiatives/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.updateInitiative` |
| 325 | POST | `p startsWith "api/v1/serve-community/initiatives/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.submitInitiative` |
| 326 | GET | `p === "api/v1/me/serve-community/initiatives"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.listMyInitiatives` |
| 327 | GET | `p === "api/v1/me/serve-community/participations"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.listMyParticipations` |
| 328 | POST | `p startsWith "api/v1/serve-community/initiatives/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.applyToInitiative` |
| 329 | GET | `p startsWith "api/v1/serve-community/initiatives/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.listInitiativeParticipations` |
| 330 | POST | `p startsWith "api/v1/me/serve-community/participations/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.withdrawParticipation` |
| 331 | PATCH | `p startsWith "api/v1/serve-community/participations/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.decideParticipation` |
| 332 | GET | `p === "api/v1/admin/serve-community/initiatives"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.listReviewQueue` |
| 333 | PATCH | `p startsWith "api/v1/admin/serve-community/initiatives/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.reviewInitiative` |
| 334 | POST | `p === "api/v1/serve-community/legacy-classifications"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.proposeLegacyClassification` |
| 335 | GET | `p === "api/v1/admin/serve-community/legacy-classifications"` | anyRoleOrPermission(identity,["system_admin","serve_community_reviewer"],["serve_community.legacy.classify"]) | `—` |
| 336 | PATCH | `p startsWith "api/v1/admin/serve-community/legacy-classifications/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.reviewLegacyClassification` |
| 338 | GET | `p === "api/v1/service-announcements"` | Public route with optional authenticated viewer; service must enforce visibility | `servicesMentorship.listPublicServiceAnnouncements` |
| 339 | GET | `p === "api/v1/services"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `servicesMentorship.listServices` |
| 341 | GET | `dynamic parts predicate (see server.js line)` | auth(req); no explicit route helper — service must enforce capability and resource scope | `servicesMentorship.listPublicMediaStories` |
| 343 | GET | `p === "api/v1/me/public-media-stories"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `servicesMentorship.listMyPublicMediaStories` |
| 345 | GET | `p === "api/v1/admin/public-media-stories"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `servicesMentorship.listPublicMediaStoryReviewQueue` |
| 348 | GET | `p startsWith "api/v1/services/" + path-segment constraints` | Public route with optional authenticated viewer; service must enforce visibility | `servicesMentorship.getServiceListing` |
| 349 | GET | `p startsWith "api/v1/services/" + path-segment constraints` | Public route with optional authenticated viewer; service must enforce visibility | `servicesMentorship.listServiceListingAnnouncements` |
| 350 | GET | `p === "api/v1/mentors"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `servicesMentorship.listMentors` |
| 351 | GET | `p startsWith "api/v1/mentors/" + path-segment constraints` | Public route with optional authenticated viewer; service must enforce visibility | `servicesMentorship.getMentorProfile` |
| 352 | POST | `p === "api/v1/files/uploads"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 353 | PUT | `p startsWith "api/v1/files/uploads/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 354 | POST | `p startsWith "api/v1/files/uploads/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 355 | GET | `p startsWith "api/v1/files/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 356 | POST | `p === "api/v1/auth/member-invitation/claim"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `membershipAdminBulk.claimMemberInvitation` |
| 358 | POST | `p === "api/v1/auth/register"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `membership.register` |
| 359 | GET | `p === "api/v1/me/referrals"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `memberReferrals.listMyReferrals` |
| 360 | GET | `p === "api/v1/me/referrals/candidate-outcomes"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `memberReferrals.listMyCandidateReferrals` |
| 361 | POST | `p === "api/v1/me/referrals/code"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `memberReferrals.ensureMyReferralCode` |
| 363 | GET | `p === "api/v1/admin/referrals"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `memberReferrals.listReferralAdminQueue` |
| 365 | POST | `p === "api/v1/admin/referrals/scoring-policies"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `memberReferrals.proposeReferralScorePolicy` |
| 367 | GET | `p === "api/v1/membership/products"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `membership.listMembershipProducts` |
| 368 | GET | `p === "api/v1/membership/payment-methods"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membership.listMembershipPaymentMethods` |
| 369 | GET | `p === "api/v1/admin/membership/payment-methods"` | assertMembershipPaymentMethodAdmin(identity) | `membership.listMembershipPaymentMethods` |
| 373 | PUT | `p === "api/v1/admin/membership/payment-methods"` | assertMembershipPaymentMethodAdmin(identity) | `membership.saveMembershipPaymentMethod` |
| 377 | GET | `p === "api/v1/admin/membership/products"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `—` |
| 378 | GET | `p === "api/v1/admin/experience/guides"` | anyRoleOrPermission(identity,["system_admin","reviewer"],["members.view","members.manage"]) | `experience.listAdminGuides` |
| 383 | POST | `p === "api/v1/admin/membership/products"` | anyRoleOrPermission(identity,["system_admin"],["members.manage"]) | `membership.saveMembershipProduct` |
| 388 | PATCH | `p startsWith "api/v1/admin/membership/products/"` | anyRoleOrPermission(identity,["system_admin"],["members.manage"]) | `membership.saveMembershipProduct` |
| 393 | POST | `p === "api/v1/auth/one-time-session/redeem"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `accountSecurity.redeemOneTimeSessionLink` |
| 394 | POST | `p === "api/v1/auth/recovery-email/verify"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `accountSecurity.verifyRecoveryEmailChange` |
| 395 | POST | `p === "api/v1/auth/login"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `membership.login` |
| 399 | POST | `p === "api/v1/auth/logout"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `userAdmin.logout` |
| 400 | GET | `p === "api/v1/admin/reference-portfolio"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.listReferenceDatasets` |
| 401 | GET | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.listReferenceItems` |
| 402 | POST | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.saveReferenceItem` |
| 403 | PATCH | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.saveReferenceItem` |
| 404 | POST | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.previewReferenceCsv` |
| 405 | POST | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.importReferenceCsv` |
| 406 | POST | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.previewReferenceJson` |
| 407 | POST | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.importReferenceJson` |
| 408 | POST | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.previewReferenceXlsx` |
| 409 | POST | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.importReferenceXlsx` |
| 410 | POST | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.publishReferenceDataset` |
| 411 | GET | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.exportReferenceCsv` |
| 412 | GET | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.exportReferenceJson` |
| 413 | GET | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.exportReferenceXlsx` |
| 414 | GET | `p === "api/v1/admin/directory-export/fields"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 415 | POST | `p === "api/v1/admin/directory-export/preview"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `directoryExports.previewDirectoryExport` |
| 416 | POST | `p === "api/v1/admin/directory-export"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `directoryExports.exportDirectory` |
| 417 | GET | `p === "api/v1/admin/members/import-template"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 418 | GET | `p === "api/v1/admin/members/import-template.xlsx"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 419 | POST | `p === "api/v1/admin/members/import/preview"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipAdminBulk.previewMemberImport` |
| 420 | POST | `p startsWith "api/v1/admin/members/import/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipAdminBulk.applyMemberImport` |
| 421 | GET | `p === "api/v1/admin/members/catalog"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipAdminBulk.listMemberCatalog` |
| 422 | GET | `p === "api/v1/admin/members/export"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `directoryExports.exportDirectory` |
| 423 | GET | `p === "api/v1/me/report-saved-views"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `reports.listSavedViews` |
| 424 | POST | `p === "api/v1/me/report-saved-views"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `reports.saveSavedView` |
| 425 | DELETE | `p startsWith "api/v1/me/report-saved-views/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `reports.deleteSavedView` |
| 426 | PATCH | `p startsWith "api/v1/services/listings/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `servicesMentorship.configureServiceCompletionPolicy` |
| 427 | GET | `p startsWith "api/v1/services/listings/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityImpactReports.runImpactReport` |
| 432 | GET | `p startsWith "api/v1/services/listings/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityImpactReports.runImpactReport` |
| 443 | GET | `p === "api/v1/admin/reports"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `reports.listReportCatalogue` |
| 444 | POST | `p startsWith "api/v1/admin/reports/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `reports.runReport` |
| 445 | GET | `p startsWith "api/v1/admin/reports/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `reports.exportReport` |
| 446 | POST | `p startsWith "api/v1/admin/organizations/" + path-segment constraints` | anyRoleOrPermission(identity,["system_admin","admin"],["organizations.manage"]) | `organizationJobs.adminAddOrganizationUser` |
| 447 | PATCH | `p startsWith "api/v1/admin/organizations/" + path-segment constraints` | anyRoleOrPermission(identity,["system_admin","admin"],["organizations.manage"]) | `organizationJobs.adminUpdateOrganizationUser` |
| 448 | GET | `p === "api/v1/admin/organizations"` | anyRoleOrPermission(identity,["system_admin","admin"],["organizations.manage"]) | `organizationJobs.listOrganizationsForAdmin` |
| 449 | GET | `p === "api/v1/admin/account-governance"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `userAdmin.getAccountGovernance` |
| 450 | GET | `p === "api/v1/admin/users"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `userAdmin.listUsers` |
| 451 | GET | `p === "api/v1/admin/roles"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `userAdmin.listRoles` |
| 452 | GET | `p === "api/v1/admin/permissions"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `userAdmin.listPermissions` |
| 453 | PATCH | `p startsWith "api/v1/admin/users/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `userAdmin.updateUserPermissions` |
| 454 | PATCH | `p startsWith "api/v1/admin/users/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `userAdmin.updateUser` |
| 455 | POST | `p startsWith "api/v1/admin/users/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `userAdmin.revokeSessions` |
| 456 | POST | `p startsWith "api/v1/admin/users/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `userAdmin.issueOneTimePassword` |
| 457 | POST | `p startsWith "api/v1/admin/users/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `accountSecurity.createOneTimeSessionLink` |
| 458 | POST | `p startsWith "api/v1/admin/users/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `userAdmin.issueOneTimePassword` |
| 459 | PATCH | `p startsWith "api/v1/admin/users/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `accountSecurity.requestRecoveryEmailChange` |
| 460 | GET | `p === "api/v1/experience/demo-cases"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `experience.listDemoCases` |
| 461 | GET | `p startsWith "api/v1/experience/demo-cases/" + path-segment constraints` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `experience.getDemoCase` |
| 462 | GET | `p === "api/v1/experience/guides"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `experience.listGuides` |
| 464 | GET | `p === "api/v1/talent"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `talent.searchTalent` |
| 469 | GET | `p startsWith "api/v1/talent/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `talent.getTalent` |
| 474 | GET | `p === "api/v1/marketplace-demand/topics"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `marketplaceDemand.listPublishedTopics` |
| 475 | GET | `p === "api/v1/organization-mentorship-offers"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `organizationMentorshipOffers.listOrganizationMentorshipOffers` |
| 477 | GET | `p === "api/v1/network-plus/access"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `—` |
| 478 | GET | `p === "api/v1/network-plus/organizations"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listNetworkPlusOrganizations` |
| 483 | GET | `p === "api/v1/network-plus/listing-taxonomy"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.listNetworkPlusListingTaxonomy` |
| 484 | GET | `p === "api/v1/network-plus/geography-reference"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.listNetworkPlusListingTaxonomy` |
| 485 | GET | `p === "api/v1/network-plus/my/listings"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.listMyOpportunityListings` |
| 486 | GET | `p === "api/v1/network-plus/listings"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.listProfessionalServices` |
| 491 | GET | `p === "api/v1/network-plus/businesses"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.listBusinesses` |
| 496 | GET | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.getBusiness` |
| 499 | GET | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.getBusiness` |
| 500 | GET | `p === "api/v1/network-plus/services"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.listProfessionalServices` |
| 505 | GET | `p startsWith "api/v1/network-plus/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.getProfessionalService` |
| 506 | GET | `p === "api/v1/network-plus/my/businesses"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.listMyBusinesses` |
| 507 | POST | `p === "api/v1/network-plus/businesses"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.createBusiness` |
| 511 | PATCH | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.updateBusiness` |
| 512 | POST | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.addBusinessOwner` |
| 513 | POST | `p startsWith "api/v1/network-plus/business-ownership/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.respondBusinessOwnership` |
| 516 | POST | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.grantBusinessAccess` |
| 517 | GET | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.listBusinessVerificationEvidence` |
| 518 | POST | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.addBusinessVerificationEvidence` |
| 519 | GET | `p === "api/v1/admin/network-plus/businesses/verification-queue"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.listBusinessVerificationQueue` |
| 520 | GET | `p === "api/v1/admin/network-plus/businesses/moderation-queue"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.listBusinessModerationQueue` |
| 521 | GET | `p === "api/v1/admin/network-plus/services/moderation-queue"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.listProfessionalServiceModerationQueue` |
| 522 | GET | `p startsWith "api/v1/admin/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.listBusinessVerificationEvidence` |
| 523 | DELETE | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.revokeBusinessAccess` |
| 524 | POST | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.submitBusinessVerification` |
| 528 | POST | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.submitBusinessModeration` |
| 529 | POST | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.changeBusinessPublicationStatus` |
| 532 | POST | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.createOpportunityListingDraft` |
| 536 | PATCH | `p startsWith "api/v1/network-plus/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.saveOpportunityListingDraft` |
| 539 | POST | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.createProfessionalServiceListing` |
| 543 | PATCH | `p startsWith "api/v1/network-plus/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.updateProfessionalServiceListing` |
| 544 | POST | `p startsWith "api/v1/network-plus/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.changeProfessionalServiceStatus` |
| 545 | POST | `p startsWith "api/v1/network-plus/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.submitProfessionalServiceListing` |
| 549 | POST | `p startsWith "api/v1/admin/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.reviewBusinessVerification` |
| 550 | POST | `p startsWith "api/v1/admin/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.reviewBusinessModeration` |
| 551 | POST | `p startsWith "api/v1/admin/network-plus/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusBusiness.moderateProfessionalServiceListing` |
| 552 | GET | `p === "api/v1/network-plus/request-invitations"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.listNetworkPlusParticipantInvitations` |
| 553 | GET | `p === "api/v1/network-plus/requests"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.listNetworkPlusRequests` |
| 557 | POST | `p === "api/v1/network-plus/requests"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.createNetworkPlusRequest` |
| 561 | POST | `p startsWith "api/v1/admin/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.grantNetworkPlusSupportAccess` |
| 562 | DELETE | `p startsWith "api/v1/admin/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.revokeNetworkPlusSupportAccess` |
| 563 | GET | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.getNetworkPlusRequest` |
| 564 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.submitNetworkPlusRequest` |
| 565 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.transitionNetworkPlusRequest` |
| 566 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.updateNetworkPlusRequestDisposition` |
| 567 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.updateNetworkPlusContactConsent` |
| 568 | GET | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.getNetworkPlusContactHandoff` |
| 569 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.createNetworkPlusMeetingProposal` |
| 570 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.respondNetworkPlusMeeting` |
| 571 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.answerNetworkPlusQuestion` |
| 572 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.askNetworkPlusClarification` |
| 573 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.answerNetworkPlusClarification` |
| 574 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.addNetworkPlusRequestParticipant` |
| 575 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.respondNetworkPlusParticipant` |
| 576 | GET | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.getNetworkPlusWorkspace` |
| 577 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.createNetworkPlusWorkspace` |
| 578 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.addNetworkPlusWorkspaceMilestone` |
| 579 | PATCH | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.updateNetworkPlusWorkspaceMilestone` |
| 580 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `networkPlusRequests.addNetworkPlusWorkspaceEvent` |
| 581 | PATCH | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.updateNetworkPlusVisibility` |
| 584 | POST | `p === "api/v1/admin/experience/demo-cases"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `experience.createDemoCase` |
| 585 | PATCH | `p startsWith "api/v1/admin/experience/demo-cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `experience.updateDemoCase` |
| 586 | POST | `p === "api/v1/admin/experience/guides"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `experience.createGuide` |
| 587 | PATCH | `p startsWith "api/v1/admin/experience/guides/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `experience.updateGuide` |
| 589 | POST | `p === "api/v1/organizations"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.registerOrganization` |
| 590 | GET | `p === "api/v1/organizations"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listMyOrganizations` |
| 591 | GET | `p === "api/v1/me/organization-access"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listMyOrganizationAccess` |
| 592 | GET | `p === "api/v1/me/job-assignments"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listMyJobAssignments` |
| 593 | GET | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.getOrganization` |
| 594 | POST | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.addVerificationEvidence` |
| 595 | POST | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.submitOrganizationVerification` |
| 596 | POST | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.addOrganizationUser` |
| 597 | PATCH | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.updateOrganizationUser` |
| 598 | GET | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listOrganizationUsers` |
| 599 | GET | `p === "api/v1/review/organizations"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listOrganizationVerificationQueue` |
| 600 | POST | `p === "api/v1/review/organizations"` | anyRoleOrPermission(identity,["reviewer","system_admin"],["organizations.review"]) | `organizationJobs.reviewOrganization` |
| 601 | GET | `p === "api/v1/admin/organization-verification-requirements"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listOrganizationVerificationRequirements` |
| 602 | POST | `p === "api/v1/admin/organization-verification-requirements"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.createOrganizationVerificationRequirement` |
| 603 | PATCH | `p startsWith "api/v1/admin/organization-verification-requirements/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.updateOrganizationVerificationRequirement` |
| 605 | POST | `p === "api/v1/jobs"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.createJob` |
| 606 | POST | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.createRequisition` |
| 607 | GET | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listRequisitions` |
| 608 | POST | `p startsWith "api/v1/job-requisitions/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.decideRequisition` |
| 609 | GET | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listOrganizationJobs` |
| 610 | GET | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.organizationRecruitingDashboard` |
| 611 | GET | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `stakeholderOutcomes.getOrganizationOutcomeWorkspace` |
| 612 | GET | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.jobDashboard` |
| 613 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.addJobTeamMember` |
| 614 | GET | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listJobTeam` |
| 615 | DELETE | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.removeJobTeamMember` |
| 616 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.addScreeningQuestion` |
| 617 | GET | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listInterviewScorecards` |
| 618 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.createInterviewScorecard` |
| 619 | GET | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listScreeningQuestions` |
| 620 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.referCandidate` |
| 621 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.saveJob` |
| 622 | DELETE | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.unsaveJob` |
| 623 | GET | `p === "api/v1/me/saved-jobs"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listSavedJobs` |
| 624 | GET | `p === "api/v1/me/saved-items"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `savedDiscoveryItems.listDiscoveryItems` |
| 625 | POST | `p === "api/v1/me/saved-items"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `savedDiscoveryItems.saveDiscoveryItem` |
| 626 | DELETE | `p startsWith "api/v1/me/saved-items/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `savedDiscoveryItems.removeDiscoveryItem` |
| 627 | POST | `p === "api/v1/me/job-alerts"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.createJobAlert` |
| 628 | GET | `p === "api/v1/me/job-alerts"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listJobAlerts` |
| 629 | GET | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listApplicationNotes` |
| 630 | POST | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.addApplicationNote` |
| 631 | GET | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listApplicationInterviews` |
| 632 | POST | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.scheduleInterview` |
| 633 | POST | `p startsWith "api/v1/job-interviews/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.updateInterviewStatus` |
| 634 | POST | `p startsWith "api/v1/job-interviews/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.proposeInterviewChange` |
| 635 | POST | `p startsWith "api/v1/job-interview-change-proposals/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.decideInterviewChange` |
| 636 | POST | `p startsWith "api/v1/job-interviews/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.respondInterview` |
| 637 | POST | `p startsWith "api/v1/job-interviews/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.submitInterviewFeedback` |
| 638 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.recordJobOutcome` |
| 641 | POST | `p === "api/v1/marketplace-demand"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.createDemand` |
| 642 | POST | `p === "api/v1/marketplace-demand/public-topics"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.createPublicTopicSubmission` |
| 643 | GET | `p === "api/v1/me/marketplace-demand-public-topics"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.listMyPublicTopicSubmissions` |
| 644 | GET | `p === "api/v1/admin/marketplace-demand-public-topics"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.listPublicTopicSubmissionsForReview` |
| 645 | PATCH | `p startsWith "api/v1/admin/marketplace-demand-public-topics/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.reviewPublicTopicSubmission` |
| 646 | GET | `p === "api/v1/me/marketplace-demand"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.listMyDemand` |
| 647 | GET | `p === "api/v1/me/marketplace-demand-interests"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.listMyInterests` |
| 648 | POST | `p startsWith "api/v1/marketplace-demand/topics/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.joinDemandTopic` |
| 649 | POST | `p startsWith "api/v1/marketplace-demand/topics/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.withdrawDemandInterest` |
| 650 | GET | `p === "api/v1/admin/marketplace-match-candidates"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.listDemandMatchCandidates` |
| 651 | POST | `p startsWith "api/v1/admin/marketplace-demand/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.createDemandProviderMatch` |
| 652 | GET | `p === "api/v1/me/marketplace-demand-matches"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.listMyDemandProviderMatches` |
| 653 | POST | `p startsWith "api/v1/marketplace-demand-matches/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.respondToDemandProviderMatch` |
| 654 | GET | `p === "api/v1/admin/marketplace-demand"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.listReviewQueue` |
| 655 | GET | `p === "api/v1/admin/marketplace-demand-assessment"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.getDemandInterestAssessment` |
| 656 | POST | `p startsWith "api/v1/admin/marketplace-demand/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.mergeDemand` |
| 657 | PATCH | `p startsWith "api/v1/admin/marketplace-demand/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.reviewDemand` |
| 658 | GET | `p === "api/v1/admin/marketplace-listings"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.listAdminListings` |
| 659 | POST | `p startsWith "api/v1/admin/marketplace-listings/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.moderateListing` |
| 660 | GET | `p startsWith "api/v1/admin/marketplace-demand-topics/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `marketplaceDemand.getDemandSummary` |
| 661 | POST | `p === "api/v1/services"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.createServiceListing` |
| 662 | PATCH | `p startsWith "api/v1/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.updateServiceListing` |
| 663 | POST | `p startsWith "api/v1/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.changeServiceListingStatus` |
| 664 | POST | `p startsWith "api/v1/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.createServiceListingAnnouncement` |
| 665 | POST | `p startsWith "api/v1/service-listing-announcements/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.changeServiceListingAnnouncementStatus` |
| 666 | POST | `p startsWith "api/v1/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.createServiceListingInterest` |
| 667 | POST | `p startsWith "api/v1/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.createServiceListingPledge` |
| 668 | POST | `p startsWith "api/v1/service-listing-interests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.withdrawServiceListingInterest` |
| 669 | POST | `p startsWith "api/v1/service-listing-pledges/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.changeServiceListingPledgeStatus` |
| 670 | GET | `p === "api/v1/me/service-listings"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.listMyServiceListings` |
| 671 | GET | `p === "api/v1/me/service-listing-interest-summary"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.listMyServiceListingInterestSummary` |
| 672 | GET | `p === "api/v1/me/service-listing-pledges"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.listMyServiceListingPledges` |
| 673 | GET | `p === "api/v1/me/organization-mentorship-offers"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationMentorshipOffers.listMyOrganizationMentorshipOffers` |
| 674 | POST | `p === "api/v1/organization-mentorship-offers"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationMentorshipOffers.createOrganizationMentorshipOffer` |
| 675 | PATCH | `p startsWith "api/v1/organization-mentorship-offers/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationMentorshipOffers.updateOrganizationMentorshipOffer` |
| 676 | POST | `p startsWith "api/v1/organization-mentorship-offers/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationMentorshipOffers.changeOrganizationMentorshipOfferStatus` |
| 677 | POST | `p startsWith "api/v1/organization-mentorship-offers/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationMentorshipOffers.requestOrganizationMentorship` |
| 678 | GET | `p === "api/v1/me/organization-mentorship-requests"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationMentorshipOffers.listMyOrganizationMentorshipRequests` |
| 679 | POST | `p startsWith "api/v1/organization-mentorship-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationMentorshipOffers.respondOrganizationMentorshipRequest` |
| 680 | GET | `p === "api/v1/me/service-requests"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.listMyServiceRequests` |
| 681 | POST | `p startsWith "api/v1/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.requestService` |
| 682 | GET | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.listServiceRequestUpdates` |
| 683 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.createServiceRequestUpdate` |
| 684 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.changeServiceRequestStatus` |
| 685 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.acceptServiceAgreement` |
| 686 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.acceptServiceCompletion` |
| 687 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.reviewServiceCompletion` |
| 688 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.submitServicePayment` |
| 689 | POST | `p startsWith "api/v1/service-payments/" + path-segment constraints` | anyRoleOrPermission(identity,["finance_officer","reviewer","system_admin"],["finance.manage"]) | `servicesMentorship.verifyServicePayment` |
| 690 | GET | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.listServiceMilestones` |
| 691 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.createServiceMilestone` |
| 692 | GET | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.listServiceDeliveries` |
| 693 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.submitServiceDelivery` |
| 694 | POST | `p startsWith "api/v1/service-deliveries/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.reviewServiceDelivery` |
| 695 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.submitServiceFeedback` |
| 696 | GET | `p === "api/v1/mentors"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.listMentors` |
| 697 | GET | `p === "api/v1/me/mentor-profile"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.getMyMentorProfile` |
| 698 | POST | `p === "api/v1/me/mentor-profile"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.createMentorProfile` |
| 699 | PATCH | `p startsWith "api/v1/mentor-profiles/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.updateMentorProfile` |
| 700 | POST | `p startsWith "api/v1/mentor-profiles/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.changeMentorStatus` |
| 701 | GET | `p startsWith "api/v1/mentor-profiles/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.getMentorshipCircleSummary` |
| 702 | POST | `p startsWith "api/v1/mentor-profiles/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.joinMentorshipCircle` |
| 703 | DELETE | `p startsWith "api/v1/mentor-profiles/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.leaveMentorshipCircle` |
| 704 | PUT | `p startsWith "api/v1/mentor-profiles/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.setMentorAvailability` |
| 705 | DELETE | `p startsWith "api/v1/mentor-profiles/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.removeMentorTimeOff` |
| 706 | POST | `p startsWith "api/v1/mentor-profiles/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.addMentorTimeOff` |
| 707 | GET | `p startsWith "api/v1/mentorship/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.listMentorshipLearningActivities` |
| 708 | POST | `p startsWith "api/v1/mentorship/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.createMentorshipLearningActivity` |
| 709 | POST | `p startsWith "api/v1/mentorship-activities/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.submitMentorshipLearningActivity` |
| 710 | POST | `p startsWith "api/v1/mentorship-learning-submissions/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.reviewMentorshipLearningSubmission` |
| 711 | GET | `p === "api/v1/me/mentorship-learning-progress"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.listMyMentorshipLearningProgress` |
| 712 | GET | `p === "api/v1/me/mentorship-requests"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.listMyMentorshipRequests` |
| 713 | GET | `p === "api/v1/me/mentorship-interest"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.listMentorshipInterestPool` |
| 714 | GET | `p === "api/v1/me/mentorship-operations"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.getMentorshipOperationalReport` |
| 715 | GET | `p === "api/v1/me/mentorship-reports"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.listMyMentorshipParticipantReports` |
| 716 | GET | `p === "api/v1/admin/mentorship-reports"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.listMentorshipParticipantReports` |
| 717 | GET | `p === "api/v1/admin/service-mentorship-cases"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `serviceMentorshipSupportCases.listSupportCases` |
| 719 | GET | `p === "api/v1/admin/mentorship/pending-decisions"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `mentorshipOperations.listMentorshipProgrammePendingDecisions` |
| 720 | GET | `p === "api/v1/admin/mentorship/relationships"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `mentorshipOperations.listMentorshipProgrammeRelationships` |
| 721 | GET | `p === "api/v1/admin/mentorship/metrics"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `mentorshipOperations.getMentorshipProgrammeMetrics` |
| 722 | GET | `p === "api/v1/admin/mentorship-interest"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.listMentorshipInterestReviewQueue` |
| 723 | POST | `p startsWith "api/v1/admin/mentorship-interest/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.proposeMentorshipInterestMatch` |
| 724 | POST | `p startsWith "api/v1/admin/mentorship-interest/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.markMentorshipInterestReviewed` |
| 725 | PATCH | `p startsWith "api/v1/admin/mentorship-reports/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.updateMentorshipParticipantReport` |
| 726 | GET | `p === "api/v1/me/mentorship-matches"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.listMyMentorshipMatches` |
| 727 | GET | `p === "api/v1/me/mentorships"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.listMyMentorships` |
| 728 | POST | `p === "api/v1/mentorship/requests"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.createMentorshipRequest` |
| 729 | PATCH | `p startsWith "api/v1/mentorship/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.setMentorshipRequestSharing` |
| 730 | POST | `p startsWith "api/v1/mentorship/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.registerMentorshipInterest` |
| 731 | GET | `p startsWith "api/v1/mentorship/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.getMentorshipRequest` |
| 732 | GET | `p startsWith "api/v1/mentorship/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.findMentorMatches` |
| 733 | POST | `p startsWith "api/v1/mentorship/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.proposeMentorMatch` |
| 734 | POST | `p startsWith "api/v1/mentorship/matches/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.respondToMatch` |
| 735 | POST | `p startsWith "api/v1/mentorship/matches/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.respondToMenteeMatch` |
| 736 | GET | `p startsWith "api/v1/mentorship/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.getMentorship` |
| 737 | GET | `p startsWith "api/v1/mentorship/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.listMentorshipGoals` |
| 738 | POST | `p startsWith "api/v1/mentorship/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.createMentorshipGoal` |
| 739 | PATCH | `p startsWith "api/v1/mentorship-goals/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.updateMentorshipGoal` |
| 740 | POST | `p startsWith "api/v1/mentorship/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.changeMentorshipStatus` |
| 741 | GET | `p startsWith "api/v1/mentorship/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.listMentorshipSessions` |
| 742 | POST | `p startsWith "api/v1/mentorship/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.createMentorshipSession` |
| 743 | POST | `p startsWith "api/v1/mentorship/sessions/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.respondToSessionProposal` |
| 744 | POST | `p startsWith "api/v1/mentorship/sessions/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.proposeMentorshipSessionChange` |
| 745 | POST | `p startsWith "api/v1/mentorship/session-changes/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.respondToMentorshipSessionChange` |
| 746 | PATCH | `p startsWith "api/v1/mentorship/sessions/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.updateMentorshipSessionDetails` |
| 747 | POST | `p startsWith "api/v1/mentorship/sessions/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.changeMentorshipSession` |
| 748 | POST | `p startsWith "api/v1/mentorship/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `servicesMentorship.submitMentorshipFeedback` |
| 749 | POST | `p startsWith "api/v1/mentorship/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `mentorshipOperations.createMentorshipParticipantReport` |
| 750 | GET | `p === "api/v1/me/outcomes"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `stakeholderOutcomes.getMyOutcomeWorkspace` |
| 751 | GET | `p === "api/v1/support/job-seeker-demands/organizations"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.listShareableOrganizations` |
| 752 | GET | `p startsWith "api/v1/organizations/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.listSharedJobSeekerDemands` |
| 753 | POST | `p startsWith "api/v1/support/job-seeker-demands/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.shareJobSeekerDemand` |
| 754 | GET | `p === "api/v1/me/job-interests"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.listMyMemberJobInterests` |
| 755 | POST | `p === "api/v1/me/job-interests"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.createMemberJobInterest` |
| 756 | GET | `p startsWith "api/v1/me/job-interests/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.getMyMemberJobInterest` |
| 757 | GET | `p startsWith "api/v1/me/job-interests/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.getMyMemberJobInterestSharingHistory` |
| 758 | POST | `p startsWith "api/v1/me/job-interests/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.updateMyMemberJobInterestConsent` |
| 759 | GET | `p === "api/v1/me/job-interest-sharing-organizations"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.searchMemberJobInterestOrganizations` |
| 760 | GET | `p === "api/v1/me/opportunity-inquiries"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.listMyLinkedInquiries` |
| 761 | GET | `p startsWith "api/v1/me/opportunity-inquiries/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.getLinkedInquiryDetails` |
| 762 | PATCH | `p startsWith "api/v1/me/opportunity-inquiries/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.updateLinkedInquiryDetails` |
| 763 | GET | `p startsWith "api/v1/me/opportunity-inquiries/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.getLinkedSharingHistory` |
| 764 | POST | `p startsWith "api/v1/me/opportunity-inquiries/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.updateLinkedSharingConsent` |
| 765 | GET | `p === "api/v1/opportunity-inquiries"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.listInquiries` |
| 766 | PATCH | `p startsWith "api/v1/opportunity-inquiries/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.decideInquiry` |
| 767 | GET | `p === "api/v1/me/progress"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `Promise.allSettled` |
| 798 | GET | `p === "api/v1/me/application-tracking"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `applicationTracking.getApplicationTracking` |
| 799 | GET | `p === "api/v1/admin/support/knowledge"` | anyRoleOrPermission(identity,["system_admin","admin","platform_admin","supporting_staff"],["support.knowledge.manage","support.inquiries.manage"]) | `supportBot.adminGetKnowledge` |
| 800 | POST | `p === "api/v1/admin/support/knowledge/categories"` | anyRoleOrPermission(identity,["system_admin","admin","platform_admin"],["support.knowledge.manage"]) | `supportBot.adminSaveCategory` |
| 801 | POST | `p === "api/v1/admin/support/knowledge/articles"` | anyRoleOrPermission(identity,["system_admin","admin","platform_admin"],["support.knowledge.manage"]) | `supportBot.adminSaveArticle` |
| 802 | GET | `p === "api/v1/admin/support/colleagues"` | anyRoleOrPermission(identity,["system_admin","admin","platform_admin"],["support.inquiries.manage"]) | `supportBot.adminListSupportColleagues` |
| 803 | GET | `p === "api/v1/admin/support/inquiries"` | anyRoleOrPermission(identity,["system_admin","admin","platform_admin","supporting_staff"],["support.inquiries.view","support.inquiries.manage"]) | `supportBot.adminListConversations` |
| 804 | PATCH | `dynamic parts predicate (see server.js line)` | anyRoleOrPermission(identity,["system_admin","admin","platform_admin","supporting_staff"],["support.inquiries.manage"]) | `supportBot.adminUpdateConversation` |
| 805 | POST | `dynamic parts predicate (see server.js line)` | anyRoleOrPermission(identity,["system_admin","admin","platform_admin","supporting_staff"],["support.inquiries.manage"]) | `supportBot.escalateConversation` |
| 806 | POST | `dynamic parts predicate (see server.js line)` | anyRoleOrPermission(identity,["system_admin","admin","platform_admin","supporting_staff"],["support.inquiries.manage"]) | `supportBot.adminReplyToConversation` |
| 807 | GET | `p === "api/v1/membership/card"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipCard.getMyMembershipCard` |
| 808 | GET | `p === "api/v1/admin/membership-card"` | anyRoleOrPermission(identity,["system_admin","reviewer"],["members.view","members.manage"]) | `membershipCard.getMembershipCardForAdmin` |
| 809 | GET | `p === "api/v1/admin/membership-cards/eligible"` | anyRoleOrPermission(identity,["system_admin","reviewer"],["members.view","members.manage"]) | `membershipCard.listEligibleMembershipCardsForAdmin` |
| 810 | POST | `p === "api/v1/admin/membership-cards/batch"` | anyRoleOrPermission(identity,["system_admin","reviewer"],["members.view","members.manage"]) | `membershipCard.getMembershipCardsForAdmin` |
| 811 | POST | `p === "api/v1/admin/membership-cards/print"` | anyRoleOrPermission(identity,["system_admin","reviewer"],["members.view","members.manage"]) | `membershipCard.recordMembershipCardsPrintRequest` |
| 812 | PATCH | `p === "api/v1/me/profile-picture"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipCard.setMyProfilePicture` |
| 813 | DELETE | `p === "api/v1/me/profile-picture"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipCard.removeMyProfilePicture` |
| 814 | GET | `p === "api/v1/admin/audit-log"` | anyRoleOrPermission(identity,["system_admin"],["audit.view"]) | `adminAudit.listAdminAuditEvents` |
| 815 | GET | `p === "api/v1/admin/membership-card-settings"` | anyRoleOrPermission(identity,["system_admin","admin","platform_admin"],["members.manage"]) | `membershipCard.getMembershipCardSettings` |
| 816 | PATCH | `p === "api/v1/admin/membership-card-settings"` | anyRoleOrPermission(identity,["system_admin"],["members.manage"]) | `membershipCard.updateMembershipCardSettings` |
| 817 | POST | `dynamic parts predicate (see server.js line)` | anyRoleOrPermission(identity,["system_admin"],["members.manage"]) | `membershipCard.rotateMembershipCardVerification` |
| 818 | GET | `p === "api/v1/me"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `membership.getMe` |
| 819 | PATCH | `p === "api/v1/me/account"` | Inherited dispatcher authentication at server.js:463; self-account action policy remains separate | `accountSecurity.updateOwnCredentials` |
| 820 | PATCH | `p === "api/v1/me/profile"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `membership.updateProfile` |
| 821 | GET | `p === "api/v1/membership/history"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `membership.history` |
| 822 | GET | `p === "api/v1/membership/applications/me"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `membership.listMyApplications` |
| 823 | GET | `p === "api/v1/notifications/campaign-preferences"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 824 | PATCH | `p === "api/v1/notifications/campaign-preferences"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 825 | GET | `p === "api/v1/admin/community-campaigns/messages"` | anyRole(identity,["system_admin","admin","platform_admin"]) | `communityCampaigns.listCampaignMessages` |
| 826 | POST | `p === "api/v1/admin/community-campaigns/messages"` | anyRole(identity,["system_admin","admin","platform_admin"]) | `communityCampaigns.saveCampaignMessage` |
| 827 | POST | `p startsWith "api/v1/admin/community-campaigns/messages/" + path-segment constraints` | anyRole(identity,["system_admin","admin","platform_admin"]) | `communityCampaigns.submitCampaignMessage` |
| 828 | POST | `p startsWith "api/v1/admin/community-campaigns/messages/" + path-segment constraints` | anyRole(identity,["system_admin","admin","platform_admin"]) | `communityCampaigns.decideCampaignMessage` |
| 829 | GET | `p === "api/v1/admin/community-campaigns/schedules"` | anyRole(identity,["system_admin","admin","platform_admin"]) | `communityCampaigns.getCampaignSchedules` |
| 830 | PATCH | `p startsWith "api/v1/admin/community-campaigns/schedules/" + path-segment constraints` | anyRole(identity,["system_admin","admin","platform_admin"]) | `communityCampaigns.updateCampaignSchedule` |
| 831 | POST | `p === "api/v1/admin/community-campaigns/pause"` | anyRole(identity,["system_admin","admin","platform_admin"]) | `communityCampaigns.pauseCampaign` |
| 832 | GET | `p === "api/v1/admin/community-campaigns/monitoring"` | anyRole(identity,["system_admin","admin","platform_admin"]) | `communityCampaigns.getCampaignMonitoring` |
| 833 | GET | `p === "api/v1/notifications/push/public-key"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `—` |
| 834 | GET | `p === "api/v1/notifications/push/status"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `—` |
| 835 | POST | `p === "api/v1/notifications/push/subscriptions"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `—` |
| 836 | DELETE | `p === "api/v1/notifications/push/subscriptions"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `—` |
| 837 | GET | `p === "api/v1/notifications"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `notifications.getNotificationInbox` |
| 838 | POST | `p === "api/v1/notifications/read-all"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `notifications.markAllNotificationsRead` |
| 839 | PATCH | `p startsWith "api/v1/notifications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `notifications.markNotificationRead` |
| 840 | PATCH | `p startsWith "api/v1/notifications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `notifications.archiveNotification` |
| 841 | GET | `p === "api/v1/notifications/preferences"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `membership.notificationPreferences` |
| 842 | PATCH | `p === "api/v1/notifications/preferences"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `membership.notificationPreferences` |
| 843 | POST | `p === "api/v1/payments/chapa/verify"` | requireRole(identity,"member") | `membership.verifyChapaMembershipPayment` |
| 844 | POST | `p startsWith "api/v1/membership/applications/" + path-segment constraints` | requireRole(identity,"member") | `membership.initiateChapaMembershipPayment` |
| 845 | POST | `p === "api/v1/membership/applications"` | requireRole(identity,"member") | `membership.createApplication` |
| 848 | POST | `p startsWith "api/v1/membership/applications/" + path-segment constraints` | assertMembershipReviewAccess(identity) | `membership.reviewApplication` |
| 851 | POST | `p startsWith "api/v1/membership/applications/" + path-segment constraints` | requireRole(identity,"member") | `membership.respondCorrection` |
| 854 | POST | `p startsWith "api/v1/membership/applications/" + path-segment constraints` | requireRole(identity,"member") | `membership.attachApplicationFile` |
| 857 | POST | `p startsWith "api/v1/membership/applications/" + path-segment constraints` | requireRole(identity,"member") | `membership.createManualPayment` |
| 860 | POST | `p startsWith "api/v1/membership/applications/" + path-segment constraints` | assertMembershipActivationAccess(identity) | `membership.activateApplication` |
| 863 | POST | `p === "api/v1/membership/renew"` | requireRole(identity,"member") | `membership.renew` |
| 866 | POST | `dynamic parts predicate (see server.js line)` | assertPaymentVerificationAccess(identity) | `membership.verifyPayment` |
| 869 | POST | `dynamic parts predicate (see server.js line)` | assertPaymentReversalAccess(identity) | `membership.reverseMembershipPayment` |
| 873 | GET | `p === "api/v1/finance/payer-search"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `financeReceipts.searchFinancePayers` |
| 874 | GET | `p === "api/v1/finance/organization-search"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `financeReceipts.searchFinanceOrganizations` |
| 875 | GET | `p === "api/v1/finance/receipts"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `financeReceipts.listManualFinancePayments` |
| 876 | POST | `p === "api/v1/finance/receipts"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `financeReceipts.recordManualFinancePayment` |
| 877 | POST | `p startsWith "api/v1/finance/receipts/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `financeReceipts.decideManualFinancePayment` |
| 878 | POST | `p startsWith "api/v1/finance/receipts/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `financeReceipts.reverseManualFinancePayment` |
| 879 | POST | `p startsWith "api/v1/finance/receipts/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `financeReceipts.issueFinancePaymentVoucher` |
| 880 | POST | `p startsWith "api/v1/finance/membership/payments/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `financeReceipts.issueVerifiedMembershipPaymentVoucher` |
| 881 | GET | `p === "api/v1/finance/membership/fee-obligations/export.xlsx"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipFeeObligations.exportFeeObligations` |
| 882 | GET | `p === "api/v1/finance/membership/fee-obligations"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipFeeObligations.listFeeObligations` |
| 883 | POST | `p === "api/v1/finance/membership/receipts"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipFeeObligations.recordMembershipReceipt` |
| 884 | POST | `p startsWith "api/v1/finance/membership/receipts/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipFeeObligations.verifyMembershipReceipt` |
| 885 | POST | `p startsWith "api/v1/finance/membership/receipts/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipFeeObligations.reverseMembershipRecordReceipt` |
| 886 | GET | `p === "api/v1/finance/membership/sponsoring-organizations"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipFeeObligations.listSponsoringOrganizations` |
| 887 | POST | `p === "api/v1/finance/membership/obligations/dispositions"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipFeeObligations.recordBalanceDisposition` |
| 888 | POST | `p startsWith "api/v1/finance/membership/dispositions/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipFeeObligations.decideBalanceDisposition` |
| 889 | GET | `p === "api/v1/finance/membership/payment-import-template.xlsx"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 890 | GET | `p === "api/v1/finance/membership/payment-import-template.csv"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 891 | POST | `p === "api/v1/finance/membership/payment-import/preview"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipFeeObligations.previewMembershipPaymentImport` |
| 892 | POST | `p startsWith "api/v1/finance/membership/payment-import/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipFeeObligations.applyMembershipPaymentImport` |
| 893 | GET | `p === "api/v1/finance/membership/payments"` | assertFinancePaymentQueueAccess(identity) | `membership.listMembershipPaymentsForFinance` |
| 894 | GET | `p === "api/v1/finance/membership/legacy-payment-verification"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `legacyMembershipPayments.listLegacyMembershipPaymentVerificationQueue` |
| 895 | POST | `p startsWith "api/v1/finance/membership/legacy-payment-verification/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `legacyMembershipPayments.verifyLegacyMembershipPayment` |
| 896 | POST | `p startsWith "api/v1/finance/membership/legacy-payment-verification/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `legacyMembershipPayments.reverseLegacyMembershipPayment` |
| 897 | GET | `p === "api/v1/review/membership/applications"` | assertMembershipReviewQueueAccess(identity) | `membership.listApplicationsForReview` |
| 902 | GET | `p === "api/v1/admin/member-geography/summary"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipGeography.getMemberGeographySummary` |
| 903 | GET | `p === "api/v1/member-geography/reference"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipGeography.listMemberGeography` |
| 904 | GET | `p === "api/v1/me/residence"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `membershipGeography.getMyResidence` |
| 905 | PATCH | `p === "api/v1/me/residence"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `membershipGeography.saveMyResidence` |
| 906 | GET | `p === "api/v1/admin/member-geography/import-template"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 907 | GET | `p === "api/v1/admin/member-geography/export"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipGeography.exportPublishedMemberGeography` |
| 908 | POST | `p === "api/v1/admin/member-geography/import/preview"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipGeography.previewMemberGeographyImport` |
| 909 | POST | `p startsWith "api/v1/admin/member-geography/import/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipGeography.applyMemberGeographyImport` |
| 910 | POST | `p startsWith "api/v1/admin/member-geography/versions/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipGeography.publishMemberGeographyVersion` |
| 912 | GET | `p === "api/v1/professional-reference-data"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `referencePortfolio.listPublicReferenceSets` |
| 913 | GET | `p === "api/v1/me/cv"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.getMyCv` |
| 914 | PATCH | `p === "api/v1/me/cv"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.saveMyCv` |
| 915 | GET | `p === "api/v1/me/cv/shares"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.listMyCvShares` |
| 916 | POST | `p === "api/v1/me/cv/share"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.shareMyCvWithApplication` |
| 917 | DELETE | `p === "api/v1/me/cv/share"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.revokeMyCvShare` |
| 918 | GET | `p === "api/v1/me/education"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.getProfessionalEducation` |
| 919 | PUT | `p === "api/v1/me/education"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.saveProfessionalEducation` |
| 920 | GET | `p === "api/v1/me/portfolio"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.getProfessionalPortfolio` |
| 921 | POST | `p === "api/v1/me/portfolio"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.saveProfessionalPortfolioItem` |
| 922 | PATCH | `p startsWith "api/v1/me/portfolio/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.saveProfessionalPortfolioItem` |
| 923 | DELETE | `p startsWith "api/v1/me/portfolio/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.deleteProfessionalPortfolioItem` |
| 924 | GET | `p === "api/v1/me/talent-profile"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.getProfessionalProfile` |
| 925 | PATCH | `p === "api/v1/me/talent-profile"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.updateProfessionalProfile` |
| 926 | GET | `p === "api/v1/me/talent-visibility"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.getVisibility` |
| 927 | PATCH | `p === "api/v1/me/talent-visibility"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.updateVisibility` |
| 928 | POST | `p === "api/v1/talent/saved-searches"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.saveSearch` |
| 929 | GET | `p === "api/v1/talent/saved-searches"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.listSavedSearches` |
| 930 | POST | `p === "api/v1/talent/inquiries"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.createTalentInquiry` |
| 931 | GET | `p === "api/v1/talent/inquiries"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.listTalentInquiries` |
| 932 | POST | `p startsWith "api/v1/talent/inquiries/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.respondToTalentInquiry` |
| 933 | POST | `p startsWith "api/v1/talent/inquiries/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `talent.closeTalentInquiry` |
| 935 | POST | `p === "api/v1/ethics/cases"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `ethics.createEthicsCase` |
| 936 | GET | `p === "api/v1/me/ethics/cases"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `ethics.listMyEthicsCases` |
| 937 | POST | `p startsWith "api/v1/ethics/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `ethics.addEthicsCaseEvidence` |
| 938 | POST | `p startsWith "api/v1/ethics/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `ethics.submitEthicsRespondentResponse` |
| 939 | GET | `p === "api/v1/review/ethics/cases"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `ethics.listEthicsCases` |
| 940 | GET | `p === "api/v1/review/ethics/reviewers"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `ethics.listEthicsReviewers` |
| 941 | GET | `p startsWith "api/v1/review/ethics/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `ethics.getEthicsCase` |
| 942 | PATCH | `p startsWith "api/v1/review/ethics/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `ethics.updateEthicsCase` |
| 943 | POST | `p startsWith "api/v1/review/ethics/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `ethics.assignEthicsCase` |
| 944 | POST | `p startsWith "api/v1/review/ethics/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `ethics.assignEthicsPanelMember` |
| 945 | POST | `p startsWith "api/v1/review/ethics/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `ethics.declareEthicsConflict` |
| 946 | POST | `p startsWith "api/v1/review/ethics/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `ethics.recordEthicsReview` |
| 947 | POST | `p startsWith "api/v1/review/ethics/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `ethics.decideEthicsCase` |
| 949 | GET | `p === "api/v1/me/volunteer-pledges"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `volunteerPledges.listMyVolunteerPledges` |
| 950 | POST | `p === "api/v1/me/volunteer-pledges"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `volunteerPledges.saveVolunteerPledge` |
| 951 | PATCH | `p startsWith "api/v1/me/volunteer-pledges/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `volunteerPledges.updateVolunteerPledge` |
| 952 | DELETE | `p startsWith "api/v1/me/volunteer-pledges/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `volunteerPledges.withdrawVolunteerPledge` |
| 954 | GET | `p === "api/v1/verification/programs"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `verification.listPrograms` |
| 955 | GET | `p === "api/v1/verification/claim-types"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `verification.listClaimTypes` |
| 956 | GET | `p === "api/v1/me/verification/cases"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `verification.listCases` |
| 957 | GET | `p === "api/v1/me/verification/reference-requests"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `verification.listMyReferenceRequests` |
| 958 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `verification.requestReference` |
| 959 | POST | `p startsWith "api/v1/verification/reference-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `verification.respondReferenceRequest` |
| 960 | POST | `p startsWith "api/v1/verification/reference-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `verification.reviewReferenceRequest` |
| 961 | POST | `p === "api/v1/verification/cases"` | anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]); requireRole(identity,"member") | `verification.createCase` |
| 967 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `verification.giveConsent` |
| 968 | GET | `p startsWith "api/v1/verification/cases/"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `verification.getCase` |
| 972 | GET | `p === "api/v1/review/verification/appeals"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `verification.listAppealsForReview` |
| 973 | GET | `p === "api/v1/review/verification/cases"` | anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]) | `verification.listCases` |
| 978 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | anyRoleOrPermission(identity,["system_admin"],["verification.manage"]) | `verification.assignCase` |
| 982 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]) | `verification.transitionCase` |
| 986 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]) | `verification.getCase` |
| 991 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]) | `verification.getCase` |
| 996 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]) | `verification.decide` |
| 1000 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `verification.memberResponse` |
| 1001 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `verification.submitAppeal` |
| 1002 | POST | `p startsWith "api/v1/verification/appeals/" + path-segment constraints` | anyRoleOrPermission(identity,["appeal_reviewer","system_admin"],["verification.appeal.review"]) | `verification.decideAppeal` |
| 1006 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]) | `verification.setClaimStatus` |
| 1010 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]) | `verification.recordCheckResult` |
| 1015 | GET | `p === "api/v1/review/jobs"` | anyRoleOrPermission(identity,["reviewer","system_admin"],["jobs.review"]) | `organizationJobs.listJobsForReview` |
| 1016 | POST | `p startsWith "api/v1/review/jobs/" + path-segment constraints` | anyRoleOrPermission(identity,["reviewer","system_admin"],["jobs.review"]) | `organizationJobs.reviewJob` |
| 1017 | GET | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.evaluateEligibility` |
| 1018 | PATCH | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.updateJob` |
| 1019 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.publishJob` |
| 1020 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.changeJobStatus` |
| 1021 | GET | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listCandidates` |
| 1022 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.saveApplicationDraft` |
| 1023 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.applyToJob` |
| 1024 | PATCH | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.updateApplicationDraft` |
| 1025 | POST | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.submitApplication` |
| 1026 | GET | `p === "api/v1/me/job-applications"` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listMyApplications` |
| 1027 | GET | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.getMyApplicationProgress` |
| 1028 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.updateCandidate` |
| 1029 | POST | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.approveJobOffer` |
| 1030 | POST | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.respondToJobApplication` |
| 1031 | GET | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.listApplicationAttachments` |
| 1032 | POST | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:463; route action/scope policy remains separate | `organizationJobs.addApplicationAttachment` |

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
