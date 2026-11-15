# MPA API route-by-route authorization dispatch inventory

**Repository:** `mpaproject1/MPA-Professionals-Network`  
**Branch:** `feat/workstream-3-progress-members-workspace`  
**Source:** `server.js` at blob `7cef3c29efbd6c74d324c934879b1541954f036a` (Phase 1 authentication hardening)  
**Inventory generated:** 2026-11-15  
**Coverage:** 643 API route branches found by static inspection of `server.js` (all methods and dispatch predicates). This includes public, authenticated, privileged, and token/webhook routes. It does not claim that a route's service-level policy has been proven unless an explicit route helper is shown.

## How to read this matrix

- **Route dispatch gate** is what the route branch visibly applies in `server.js`; it is not a substitute for service-layer ownership, assignment, tenant, consent, or workflow checks.
- `auth(req)` proves session authentication/current-role loading, not authorization to the requested action.
- `anyRole`, `anyRoleOrPermission`, `requireRole`, and `assert…` are shown with their actual arguments where extractable. `anyRoleOrPermission` is OR semantics: any listed role **or** any listed direct permission passes that gate.
- **Phase 0 correction (2026-11-15):** the former `DEFECT CANDIDATE` label was based on a branch-local scan and did not account for the dispatcher-wide binding. `server.js:375` executes `const identity=await auth(req);` unconditionally inside the request handler's enclosing `try` block before the Network-Plus and subsequent protected route branches. Those branches share that lexical binding until the dispatcher catch. The 319 rows from the original identity-binding scan are therefore classified as **authenticated by the shared dispatcher binding**, not as missing-principal defects. This proves principal construction at dispatch level; it does not prove each route's action capability or service-level resource scope. Request-level smoke tests were not run as part of this documentation update.
- **Service policy unverified** means the handler calls a service that may enforce stronger authorization; this inventory has not inferred that policy from a route name.
- A dynamic matcher is recorded as a source predicate and line number rather than inventing a concrete URL template.

## Static dispatch summary

| Measure | Count |
|---|---:|
| API route branches inventoried | 643 |
| Branches containing `auth(req)` | 275 |
| Branches using optional identity | 8 |
| Branches flagged by the original branch-local identity scan | 319 | Reclassified in Phase 0: all are within the shared dispatcher-authenticated scope beginning at `server.js:375` |

These are syntactic counts from the checked-in source, not runtime success/failure counts. Phase 0 verified the enclosing lexical scope: the unconditional `auth(req)` call at `server.js:375` runs before the 319 flagged branches and binds `identity` for the remainder of the dispatcher `try` block. The 319 are false positives for missing-principal/`ReferenceError` risk. Do not add duplicate local authentication calls or alter public-route placement on the basis of the old scan. Route action authorization and service/resource scope remain separate work.


## Phase 0 classification — completed source-level validation (2026-11-15)

| Disposition | Count | Evidence / interpretation |
|---|---:|---|
| Original identity-binding candidates reviewed | 319 | The original static scan counted route branches that used the dispatcher principal without a branch-local declaration or `auth(req)` call |
| Authenticated by shared dispatcher binding | 319 | `server.js:375` unconditionally awaits `auth(req)` and binds `identity` in the enclosing request-handler `try` scope before these route branches |
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
| 170 | GET | `p === "api/v1/admin/test-lab"` | anyRole(identity,["system_admin"]) | `testLab.listTestPortfolios` |
| 171 | POST | `p === "api/v1/admin/test-lab"` | anyRole(identity,["system_admin"]) | `testLab.createTestPortfolio` |
| 172 | POST | `p startsWith "api/v1/admin/test-lab/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `testLab.exportTestPortfolioAccounts` |
| 173 | GET | `p startsWith "api/v1/admin/test-lab/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `testLab.previewTestPortfolioReset` |
| 174 | GET | `p startsWith "api/v1/admin/test-lab/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `testLab.getTestPortfolioOperations` |
| 175 | GET | `p startsWith "api/v1/admin/test-lab/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `testLab.exportTestPortfolioScenarioWorkbook` |
| 176 | POST | `p startsWith "api/v1/admin/test-lab/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `testLab.simulateTestPayment` |
| 177 | DELETE | `p startsWith "api/v1/admin/test-lab/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `testLab.resetTestPortfolio` |
| 178 | POST | `p === "api/v1/public/community-campaigns/opt-in"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `communityCampaigns.createPublicCampaignOptIn` |
| 179 | POST | `p === "api/v1/public/community-campaigns/manage"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `communityCampaigns.managePublicCampaignOptIn` |
| 180 | POST | `p === "api/v1/payments/chapa/webhook"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `membership.handleChapaMembershipWebhook` |
| 181 | GET | `p === "api/v1/public/membership-verification"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `membershipCard.verifyMembershipCard` |
| 182 | POST | `p === "api/v1/public/support-bot/message"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `supportBot.answerPublicQuestion` |
| 183 | GET | `p === "api/v1/auth/human-challenge"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `—` |
| 184 | POST | `p === "api/v1/auth/human-challenge/verify"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `—` |
| 185 | POST | `p === "api/v1/auth/email-verification/resend"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `—` |
| 186 | POST | `p === "api/v1/auth/email-verification/verify"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `—` |
| 187 | POST | `p === "api/v1/auth/passkeys/options"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `—` |
| 188 | POST | `p === "api/v1/auth/passkeys/verify"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `—` |
| 189 | POST | `p === "api/v1/auth/passkeys/recovery"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `—` |
| 190 | POST | `p === "api/v1/admin/passkeys/registration/options"` | anyRole(identity,["system_admin","admin","platform_admin"]) | `—` |
| 191 | POST | `p === "api/v1/admin/passkeys/registration/verify"` | anyRole(identity,["system_admin","admin","platform_admin"]) | `—` |
| 192 | GET | `p === "api/v1/admin/passkeys"` | anyRole(identity,["system_admin","admin","platform_admin"]) | `—` |
| 193 | DELETE | `p startsWith "api/v1/admin/passkeys/" + path-segment constraints` | anyRole(identity,["system_admin","admin","platform_admin"]) | `—` |
| 194 | POST | `p === "api/v1/email/delivery-webhook"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `emailOperations.receiveDeliveryWebhook` |
| 201 | POST | `p === "api/v1/email/inbound-webhook"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `emailOperations.receiveInboundEmail` |
| 208 | GET | `p === "api/v1/admin/email/operations"` | anyRole(identity,["system_admin"]) | `emailOperations.getEmailOperations` |
| 209 | GET | `p === "api/v1/admin/email/messages"` | anyRole(identity,["system_admin"]) | `emailOperations.listEmailOutbox` |
| 210 | GET | `p === "api/v1/admin/email/recipient-holds"` | anyRole(identity,["system_admin"]) | `emailOperations.listEmailRecipientHolds` |
| 211 | POST | `p startsWith "api/v1/admin/email/recipient-holds/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `emailOperations.releaseEmailRecipientHold` |
| 212 | POST | `p === "api/v1/admin/email/preview"` | anyRole(identity,["system_admin"]) | `emailOperations.previewEmailTemplate` |
| 213 | GET | `p startsWith "api/v1/admin/email/templates/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `emailOperations.listEmailTemplateVersions` |
| 214 | POST | `p startsWith "api/v1/admin/email/templates/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `emailOperations.restoreEmailTemplateVersion` |
| 215 | GET | `p === "api/v1/admin/email/templates"` | anyRole(identity,["system_admin"]) | `emailOperations.listEmailTemplates` |
| 216 | PUT | `p startsWith "api/v1/admin/email/templates/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `emailOperations.saveEmailTemplate` |
| 217 | PUT | `p startsWith "api/v1/admin/email/drafts/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `emailOperations.updateEmailDraft` |
| 218 | POST | `p startsWith "api/v1/admin/email/drafts/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `emailOperations.cancelEmailDraft` |
| 219 | POST | `p === "api/v1/admin/email/drafts"` | anyRole(identity,["system_admin"]) | `emailOperations.saveEmailDraft` |
| 220 | POST | `p startsWith "api/v1/admin/email/drafts/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `emailOperations.queueEmailDraft` |
| 221 | POST | `p === "api/v1/admin/email/test"` | anyRole(identity,["system_admin"]) | `emailOperations.sendTestEmail` |
| 222 | POST | `p === "api/v1/admin/email/dispatch"` | anyRole(identity,["system_admin"]) | `emailOperations.dispatchEmailOutbox` |
| 223 | POST | `p startsWith "api/v1/admin/email/messages/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `emailOperations.retryFailedEmail` |
| 224 | POST | `p startsWith "api/v1/admin/email/verification-failures/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `emailOperations.retryVerificationEmail` |
| 225 | PATCH | `p startsWith "api/v1/admin/email/inbox/" + path-segment constraints` | anyRole(identity,["system_admin"]) | `emailOperations.updateInbox` |
| 226 | POST | `p === "api/v1/public/opportunity-inquiries"` | Public route with optional authenticated viewer; service must enforce visibility | `publicOpportunity.createPublicInquiry` |
| 227 | GET | `p === "api/v1/public/opportunity-sharing-organizations"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `publicOpportunity.searchPublicSharingOrganizations` |
| 228 | POST | `p startsWith "api/v1/public/opportunity-inquiries/" + path-segment constraints` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `publicOpportunity.getPublicInquiry` |
| 229 | POST | `p startsWith "api/v1/public/opportunity-inquiries/" + path-segment constraints` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `publicOpportunity.getSharingHistory` |
| 230 | POST | `p startsWith "api/v1/public/opportunity-inquiries/" + path-segment constraints` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `publicOpportunity.updateSharingConsent` |
| 231 | GET | `p startsWith "api/v1/public/opportunity-inquiries/" + path-segment constraints` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `publicOpportunity.getPublicInquiry` |
| 232 | PATCH | `p startsWith "api/v1/public/opportunity-inquiries/" + path-segment constraints` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `publicOpportunity.updatePublicInquiryDetails` |
| 233 | POST | `p startsWith "api/v1/public/opportunity-inquiries/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.linkInquiryToAccount` |
| 234 | GET | `p === "api/v1/jobs"` | Public route with optional authenticated viewer; service must enforce visibility | `organizationJobs.listJobs` |
| 235 | GET | `p startsWith "api/v1/jobs/" + path-segment constraints` | Public route with optional authenticated viewer; service must enforce visibility | `organizationJobs.getJob` |
| 236 | GET | `p startsWith "api/v1/jobs/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `organizationJobs.listJobApplications` |
| 238 | GET | `dynamic parts predicate (see server.js line)` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `financeReceipts.verifyFinancePaymentVoucher` |
| 240 | GET | `p === "api/v1/me/community-impact/detected"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactDetection.listMyDetectedContributions` |
| 241 | POST | `p startsWith "api/v1/me/community-impact/detected/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactDetection.confirmMyDetectedAttribution` |
| 242 | POST | `p startsWith "api/v1/me/community-impact/detected/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactDetection.disputeMyDetectedAttribution` |
| 243 | GET | `p === "api/v1/admin/community-impact/detection/candidates"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactDetection.listDetectionCandidates` |
| 244 | GET | `p === "api/v1/me/community-impact/score/policy"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.getActiveScorePolicy` |
| 245 | GET | `p === "api/v1/me/community-impact/score"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.getMyScore` |
| 246 | GET | `p === "api/v1/me/community-impact/workspace"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.getMyImpactWorkspace` |
| 247 | GET | `p === "api/v1/me/community-impact/recognition"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRecognition.listMyRecognition` |
| 248 | GET | `p === "api/v1/community-impact/recognition/programs"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `communityImpactRecognition.listRecognitionPrograms` |
| 249 | POST | `p === "api/v1/me/community-impact/recognition/nominations"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRecognition.submitRecognitionNomination` |
| 250 | POST | `parts prefix "api/v1/me/community-impact/recognition/awards"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRecognition.setAwardPublicConsent` |
| 251 | GET | `p === "api/v1/admin/community-impact/recognition/programs"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRecognition.listRecognitionAdminPrograms` |
| 252 | POST | `p === "api/v1/admin/community-impact/recognition/programs"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRecognition.saveRecognitionProgram` |
| 253 | GET | `p === "api/v1/admin/community-impact/recognition/queue"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRecognition.listRecognitionQueue` |
| 254 | GET | `p === "api/v1/admin/community-impact/recognition/summary"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRecognition.getRecognitionAdminSummary` |
| 255 | POST | `parts prefix "api/v1/admin/community-impact/recognition/nominations"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRecognition.assignRecognitionNomination` |
| 256 | POST | `parts prefix "api/v1/admin/community-impact/recognition/nominations"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRecognition.decideRecognitionNomination` |
| 257 | GET | `p === "api/v1/admin/community-impact/score/policies"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.listScorePolicies` |
| 258 | POST | `p === "api/v1/admin/community-impact/score/policies"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.proposeScorePolicy` |
| 259 | POST | `parts prefix "api/v1/admin/community-impact/score/policies"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.approveScorePolicy` |
| 260 | POST | `parts prefix "api/v1/admin/community-impact/score/policies"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.activateScorePolicy` |
| 261 | POST | `parts prefix "api/v1/admin/community-impact/score/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.linkVerifiedSource` |
| 262 | POST | `parts prefix "api/v1/admin/community-impact/score/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.scoreVerifiedClaim` |
| 263 | POST | `parts prefix "api/v1/admin/community-impact/score/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.recalculateVerifiedClaim` |
| 264 | GET | `p === "api/v1/admin/community-impact/score/recalculations"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.listScoreRecalculations` |
| 265 | GET | `p === "api/v1/admin/community-impact/score/ledger"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.listScoreLedger` |
| 266 | POST | `parts prefix "api/v1/admin/community-impact/score/ledger"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactScore.reverseScoreEntry` |
| 267 | GET | `p === "api/v1/admin/community-impact/identity-assurance"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.listIdentityAssuranceQueue` |
| 268 | GET | `p === "api/v1/admin/community-impact/offline-attributions"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.listOfflineAttributions` |
| 269 | GET | `p === "api/v1/admin/community-impact/detection/policies"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.listDetectionPolicies` |
| 270 | POST | `p === "api/v1/admin/community-impact/detection/scan"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactDetection.scanDetectionSources` |
| 271 | GET | `p === "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.listMyClaims` |
| 272 | POST | `p === "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.createClaim` |
| 273 | GET | `parts prefix "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.getMyClaim` |
| 274 | PATCH | `parts prefix "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.updateMyClaim` |
| 275 | POST | `parts prefix "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.attachClaimEvidenceUrl` |
| 276 | POST | `parts prefix "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.attachClaimEvidence` |
| 277 | POST | `parts prefix "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.removeClaimEvidence` |
| 278 | POST | `parts prefix "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.submitMyClaim` |
| 279 | POST | `parts prefix "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.withdrawMyClaim` |
| 280 | POST | `parts prefix "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.respondToClarification` |
| 281 | POST | `parts prefix "api/v1/me/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.submitClaimAppeal` |
| 282 | GET | `p === "api/v1/admin/community-impact/claim-reviewers"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.listClaimReviewers` |
| 283 | GET | `p === "api/v1/admin/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.listReviewQueue` |
| 284 | POST | `parts prefix "api/v1/admin/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.assignClaim` |
| 285 | POST | `parts prefix "api/v1/admin/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.decideClaim` |
| 286 | GET | `p === "api/v1/admin/community-impact/claim-appeals"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.listClaimAppeals` |
| 287 | POST | `parts prefix "api/v1/admin/community-impact/claim-appeals"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.assignClaimAppeal` |
| 288 | POST | `parts prefix "api/v1/admin/community-impact/claim-appeals"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactClaims.decideClaimAppeal` |
| 289 | GET | `p === "api/v1/me/community-impact/identity-assurance"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.getMyIdentityAssurance` |
| 290 | POST | `p === "api/v1/me/community-impact/identity-assurance"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.submitIdentityAssurance` |
| 291 | POST | `parts prefix "api/v1/me/community-impact/identity-assurance"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.submitIdentityAssuranceCase` |
| 292 | POST | `parts prefix "api/v1/me/community-impact/identity-assurance"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.attachIdentityEvidence` |
| 293 | POST | `parts prefix "api/v1/admin/community-impact/identity-assurance"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.decideIdentityAssurance` |
| 294 | POST | `p === "api/v1/admin/community-impact/detection/policies"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.proposeDetectionPolicy` |
| 295 | POST | `parts prefix "api/v1/admin/community-impact/detection/policies"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.approveDetectionPolicy` |
| 296 | POST | `parts prefix "api/v1/admin/community-impact/detection/policies"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.activateDetectionPolicy` |
| 297 | POST | `parts prefix "api/v1/admin/community-impact/detection/candidates"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.proposeOfflineAttribution` |
| 298 | POST | `parts prefix "api/v1/me/community-impact/offline-attributions"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.confirmOfflineAttribution` |
| 299 | POST | `parts prefix "api/v1/admin/community-impact/offline-attributions"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.assignOfflineAttribution` |
| 300 | POST | `parts prefix "api/v1/admin/community-impact/offline-attributions"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.decideOfflineAttribution` |
| 301 | POST | `parts prefix "api/v1/admin/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.reconcileClaimCandidate` |
| 302 | POST | `parts prefix "api/v1/admin/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.declareReviewerConflict` |
| 303 | POST | `parts prefix "api/v1/admin/community-impact/claims"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.proposeContributionAssessment` |
| 304 | GET | `p === "api/v1/admin/community-impact/assessments"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.listPendingContributionAssessments` |
| 305 | POST | `parts prefix "api/v1/admin/community-impact/assessments"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.secondReviewAssessment` |
| 306 | POST | `p === "api/v1/admin/community-impact/retention/evaluate"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactGovernance.evaluateRetention` |
| 307 | GET | `p === "api/v1/admin/community-impact/retention-policy"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRetention.getRetentionPolicyGovernance` |
| 308 | POST | `p === "api/v1/admin/community-impact/retention-policy"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRetention.proposeRetentionPolicy` |
| 309 | POST | `p startsWith "api/v1/admin/community-impact/retention-policy/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRetention.approveRetentionPolicy` |
| 310 | POST | `p startsWith "api/v1/admin/community-impact/retention-policy/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `communityImpactRetention.activateRetentionPolicy` |
| 311 | GET | `p === "api/v1/public/serve-community/completed-projects"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `serveCommunityInitiatives.listPublicCompletedProjects` |
| 312 | GET | `p === "api/v1/admin/serve-community/offline-projects"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityOfflineProjects.listStaffProjects` |
| 313 | POST | `p === "api/v1/admin/serve-community/offline-projects"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityOfflineProjects.createStaffProject` |
| 314 | PATCH | `p startsWith "api/v1/admin/serve-community/offline-projects/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityOfflineProjects.submitStaffProject` |
| 315 | PATCH | `p startsWith "api/v1/admin/serve-community/offline-projects/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityOfflineProjects.updateStaffProject` |
| 316 | PATCH | `p startsWith "api/v1/admin/serve-community/offline-projects/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityOfflineProjects.reviewStaffProject` |
| 317 | GET | `p === "api/v1/serve-community/initiatives"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `serveCommunityInitiatives.listPublicInitiatives` |
| 318 | GET | `p startsWith "api/v1/serve-community/initiatives/" + path-segment constraints` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `serveCommunityInitiatives.getPublicInitiative` |
| 319 | POST | `p === "api/v1/serve-community/initiatives"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.createInitiative` |
| 320 | PATCH | `p startsWith "api/v1/serve-community/initiatives/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.updateInitiative` |
| 321 | POST | `p startsWith "api/v1/serve-community/initiatives/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.submitInitiative` |
| 322 | GET | `p === "api/v1/me/serve-community/initiatives"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.listMyInitiatives` |
| 323 | GET | `p === "api/v1/me/serve-community/participations"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.listMyParticipations` |
| 324 | POST | `p startsWith "api/v1/serve-community/initiatives/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.applyToInitiative` |
| 325 | GET | `p startsWith "api/v1/serve-community/initiatives/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.listInitiativeParticipations` |
| 326 | POST | `p startsWith "api/v1/me/serve-community/participations/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.withdrawParticipation` |
| 327 | PATCH | `p startsWith "api/v1/serve-community/participations/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.decideParticipation` |
| 328 | GET | `p === "api/v1/admin/serve-community/initiatives"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.listReviewQueue` |
| 329 | PATCH | `p startsWith "api/v1/admin/serve-community/initiatives/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.reviewInitiative` |
| 330 | POST | `p === "api/v1/serve-community/legacy-classifications"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.proposeLegacyClassification` |
| 331 | GET | `p === "api/v1/admin/serve-community/legacy-classifications"` | anyRoleOrPermission(identity,["system_admin","serve_community_reviewer"],["serve_community.legacy.classify"]) | `—` |
| 332 | PATCH | `p startsWith "api/v1/admin/serve-community/legacy-classifications/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityInitiatives.reviewLegacyClassification` |
| 334 | GET | `p === "api/v1/service-announcements"` | Public route with optional authenticated viewer; service must enforce visibility | `servicesMentorship.listPublicServiceAnnouncements` |
| 335 | GET | `p === "api/v1/services"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `servicesMentorship.listServices` |
| 337 | GET | `dynamic parts predicate (see server.js line)` | auth(req); no explicit route helper — service must enforce capability and resource scope | `servicesMentorship.listPublicMediaStories` |
| 339 | GET | `p === "api/v1/me/public-media-stories"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `servicesMentorship.listMyPublicMediaStories` |
| 341 | GET | `p === "api/v1/admin/public-media-stories"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `servicesMentorship.listPublicMediaStoryReviewQueue` |
| 344 | GET | `p startsWith "api/v1/services/" + path-segment constraints` | Public route with optional authenticated viewer; service must enforce visibility | `servicesMentorship.getServiceListing` |
| 345 | GET | `p startsWith "api/v1/services/" + path-segment constraints` | Public route with optional authenticated viewer; service must enforce visibility | `servicesMentorship.listServiceListingAnnouncements` |
| 346 | GET | `p === "api/v1/mentors"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `servicesMentorship.listMentors` |
| 347 | GET | `p startsWith "api/v1/mentors/" + path-segment constraints` | Public route with optional authenticated viewer; service must enforce visibility | `servicesMentorship.getMentorProfile` |
| 348 | POST | `p === "api/v1/files/uploads"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 349 | PUT | `p startsWith "api/v1/files/uploads/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 350 | POST | `p startsWith "api/v1/files/uploads/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 351 | GET | `p startsWith "api/v1/files/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 352 | POST | `p === "api/v1/auth/member-invitation/claim"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `membershipAdminBulk.claimMemberInvitation` |
| 354 | POST | `p === "api/v1/auth/register"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `membership.register` |
| 355 | GET | `p === "api/v1/me/referrals"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `memberReferrals.listMyReferrals` |
| 356 | GET | `p === "api/v1/me/referrals/candidate-outcomes"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `memberReferrals.listMyCandidateReferrals` |
| 357 | POST | `p === "api/v1/me/referrals/code"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `memberReferrals.ensureMyReferralCode` |
| 359 | GET | `p === "api/v1/admin/referrals"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `memberReferrals.listReferralAdminQueue` |
| 361 | POST | `p === "api/v1/admin/referrals/scoring-policies"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `memberReferrals.proposeReferralScorePolicy` |
| 363 | GET | `p === "api/v1/membership/products"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `membership.listMembershipProducts` |
| 364 | GET | `p === "api/v1/membership/payment-methods"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membership.listMembershipPaymentMethods` |
| 365 | GET | `p === "api/v1/admin/membership/payment-methods"` | assertMembershipPaymentMethodAdmin(identity) | `membership.listMembershipPaymentMethods` |
| 369 | PUT | `p === "api/v1/admin/membership/payment-methods"` | assertMembershipPaymentMethodAdmin(identity) | `membership.saveMembershipPaymentMethod` |
| 373 | GET | `p === "api/v1/admin/membership/products"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `—` |
| 374 | GET | `p === "api/v1/admin/experience/guides"` | anyRoleOrPermission(identity,["system_admin","reviewer"],["members.view","members.manage"]) | `experience.listAdminGuides` |
| 379 | POST | `p === "api/v1/admin/membership/products"` | anyRoleOrPermission(identity,["system_admin"],["members.manage"]) | `membership.saveMembershipProduct` |
| 384 | PATCH | `p startsWith "api/v1/admin/membership/products/"` | anyRoleOrPermission(identity,["system_admin"],["members.manage"]) | `membership.saveMembershipProduct` |
| 389 | POST | `p === "api/v1/auth/one-time-session/redeem"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `accountSecurity.redeemOneTimeSessionLink` |
| 390 | POST | `p === "api/v1/auth/recovery-email/verify"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `accountSecurity.verifyRecoveryEmailChange` |
| 391 | POST | `p === "api/v1/auth/login"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `membership.login` |
| 395 | POST | `p === "api/v1/auth/logout"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `userAdmin.logout` |
| 396 | GET | `p === "api/v1/admin/reference-portfolio"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.listReferenceDatasets` |
| 397 | GET | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.listReferenceItems` |
| 398 | POST | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.saveReferenceItem` |
| 399 | PATCH | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.saveReferenceItem` |
| 400 | POST | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.previewReferenceCsv` |
| 401 | POST | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.importReferenceCsv` |
| 402 | POST | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.previewReferenceJson` |
| 403 | POST | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.importReferenceJson` |
| 404 | POST | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.previewReferenceXlsx` |
| 405 | POST | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.importReferenceXlsx` |
| 406 | POST | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.publishReferenceDataset` |
| 407 | GET | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.exportReferenceCsv` |
| 408 | GET | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.exportReferenceJson` |
| 409 | GET | `p startsWith "api/v1/admin/reference-portfolio/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `referencePortfolio.exportReferenceXlsx` |
| 410 | GET | `p === "api/v1/admin/directory-export/fields"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 411 | POST | `p === "api/v1/admin/directory-export/preview"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `directoryExports.previewDirectoryExport` |
| 412 | POST | `p === "api/v1/admin/directory-export"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `directoryExports.exportDirectory` |
| 413 | GET | `p === "api/v1/admin/members/import-template"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 414 | GET | `p === "api/v1/admin/members/import-template.xlsx"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 415 | POST | `p === "api/v1/admin/members/import/preview"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipAdminBulk.previewMemberImport` |
| 416 | POST | `p startsWith "api/v1/admin/members/import/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipAdminBulk.applyMemberImport` |
| 417 | GET | `p === "api/v1/admin/members/catalog"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipAdminBulk.listMemberCatalog` |
| 418 | GET | `p === "api/v1/admin/members/export"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `directoryExports.exportDirectory` |
| 419 | GET | `p === "api/v1/me/report-saved-views"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `reports.listSavedViews` |
| 420 | POST | `p === "api/v1/me/report-saved-views"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `reports.saveSavedView` |
| 421 | DELETE | `p startsWith "api/v1/me/report-saved-views/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `reports.deleteSavedView` |
| 422 | PATCH | `p startsWith "api/v1/services/listings/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `servicesMentorship.configureServiceCompletionPolicy` |
| 423 | GET | `p startsWith "api/v1/services/listings/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityImpactReports.runImpactReport` |
| 428 | GET | `p startsWith "api/v1/services/listings/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `serveCommunityImpactReports.runImpactReport` |
| 439 | GET | `p === "api/v1/admin/reports"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `reports.listReportCatalogue` |
| 440 | POST | `p startsWith "api/v1/admin/reports/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `reports.runReport` |
| 441 | GET | `p startsWith "api/v1/admin/reports/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `reports.exportReport` |
| 442 | POST | `p startsWith "api/v1/admin/organizations/" + path-segment constraints` | anyRoleOrPermission(identity,["system_admin","admin"],["organizations.manage"]) | `organizationJobs.adminAddOrganizationUser` |
| 443 | PATCH | `p startsWith "api/v1/admin/organizations/" + path-segment constraints` | anyRoleOrPermission(identity,["system_admin","admin"],["organizations.manage"]) | `organizationJobs.adminUpdateOrganizationUser` |
| 444 | GET | `p === "api/v1/admin/organizations"` | anyRoleOrPermission(identity,["system_admin","admin"],["organizations.manage"]) | `organizationJobs.listOrganizationsForAdmin` |
| 445 | GET | `p === "api/v1/admin/account-governance"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `userAdmin.getAccountGovernance` |
| 446 | GET | `p === "api/v1/admin/users"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `userAdmin.listUsers` |
| 447 | GET | `p === "api/v1/admin/roles"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `userAdmin.listRoles` |
| 448 | GET | `p === "api/v1/admin/permissions"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `userAdmin.listPermissions` |
| 449 | PATCH | `p startsWith "api/v1/admin/users/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `userAdmin.updateUserPermissions` |
| 450 | PATCH | `p startsWith "api/v1/admin/users/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `userAdmin.updateUser` |
| 451 | POST | `p startsWith "api/v1/admin/users/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `userAdmin.revokeSessions` |
| 452 | POST | `p startsWith "api/v1/admin/users/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `userAdmin.issueOneTimePassword` |
| 453 | POST | `p startsWith "api/v1/admin/users/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `accountSecurity.createOneTimeSessionLink` |
| 454 | POST | `p startsWith "api/v1/admin/users/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `userAdmin.issueOneTimePassword` |
| 455 | PATCH | `p startsWith "api/v1/admin/users/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `accountSecurity.requestRecoveryEmailChange` |
| 456 | GET | `p === "api/v1/experience/demo-cases"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `experience.listDemoCases` |
| 457 | GET | `p startsWith "api/v1/experience/demo-cases/" + path-segment constraints` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `experience.getDemoCase` |
| 458 | GET | `p === "api/v1/experience/guides"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `experience.listGuides` |
| 460 | GET | `p === "api/v1/talent"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `talent.searchTalent` |
| 465 | GET | `p startsWith "api/v1/talent/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `talent.getTalent` |
| 470 | GET | `p === "api/v1/marketplace-demand/topics"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `marketplaceDemand.listPublishedTopics` |
| 471 | GET | `p === "api/v1/organization-mentorship-offers"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `organizationMentorshipOffers.listOrganizationMentorshipOffers` |
| 473 | GET | `p === "api/v1/network-plus/access"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `—` |
| 474 | GET | `p === "api/v1/network-plus/organizations"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.listNetworkPlusOrganizations` |
| 479 | GET | `p === "api/v1/network-plus/listing-taxonomy"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.listNetworkPlusListingTaxonomy` |
| 480 | GET | `p === "api/v1/network-plus/geography-reference"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.listNetworkPlusListingTaxonomy` |
| 481 | GET | `p === "api/v1/network-plus/my/listings"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.listMyOpportunityListings` |
| 482 | GET | `p === "api/v1/network-plus/listings"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.listProfessionalServices` |
| 487 | GET | `p === "api/v1/network-plus/businesses"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.listBusinesses` |
| 492 | GET | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.getBusiness` |
| 495 | GET | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.getBusiness` |
| 496 | GET | `p === "api/v1/network-plus/services"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.listProfessionalServices` |
| 501 | GET | `p startsWith "api/v1/network-plus/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.getProfessionalService` |
| 502 | GET | `p === "api/v1/network-plus/my/businesses"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.listMyBusinesses` |
| 503 | POST | `p === "api/v1/network-plus/businesses"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.createBusiness` |
| 507 | PATCH | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.updateBusiness` |
| 508 | POST | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.addBusinessOwner` |
| 509 | POST | `p startsWith "api/v1/network-plus/business-ownership/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.respondBusinessOwnership` |
| 512 | POST | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.grantBusinessAccess` |
| 513 | GET | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.listBusinessVerificationEvidence` |
| 514 | POST | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.addBusinessVerificationEvidence` |
| 515 | GET | `p === "api/v1/admin/network-plus/businesses/verification-queue"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.listBusinessVerificationQueue` |
| 516 | GET | `p === "api/v1/admin/network-plus/businesses/moderation-queue"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.listBusinessModerationQueue` |
| 517 | GET | `p === "api/v1/admin/network-plus/services/moderation-queue"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.listProfessionalServiceModerationQueue` |
| 518 | GET | `p startsWith "api/v1/admin/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.listBusinessVerificationEvidence` |
| 519 | DELETE | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.revokeBusinessAccess` |
| 520 | POST | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.submitBusinessVerification` |
| 524 | POST | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.submitBusinessModeration` |
| 525 | POST | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.changeBusinessPublicationStatus` |
| 528 | POST | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.createOpportunityListingDraft` |
| 532 | PATCH | `p startsWith "api/v1/network-plus/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.saveOpportunityListingDraft` |
| 535 | POST | `p startsWith "api/v1/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.createProfessionalServiceListing` |
| 539 | PATCH | `p startsWith "api/v1/network-plus/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.updateProfessionalServiceListing` |
| 540 | POST | `p startsWith "api/v1/network-plus/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.changeProfessionalServiceStatus` |
| 541 | POST | `p startsWith "api/v1/network-plus/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.submitProfessionalServiceListing` |
| 545 | POST | `p startsWith "api/v1/admin/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.reviewBusinessVerification` |
| 546 | POST | `p startsWith "api/v1/admin/network-plus/businesses/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.reviewBusinessModeration` |
| 547 | POST | `p startsWith "api/v1/admin/network-plus/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusBusiness.moderateProfessionalServiceListing` |
| 548 | GET | `p === "api/v1/network-plus/request-invitations"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusRequests.listNetworkPlusParticipantInvitations` |
| 549 | GET | `p === "api/v1/network-plus/requests"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusRequests.listNetworkPlusRequests` |
| 553 | POST | `p === "api/v1/network-plus/requests"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusRequests.createNetworkPlusRequest` |
| 557 | POST | `p startsWith "api/v1/admin/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusRequests.grantNetworkPlusSupportAccess` |
| 558 | DELETE | `p startsWith "api/v1/admin/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusRequests.revokeNetworkPlusSupportAccess` |
| 559 | GET | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusRequests.getNetworkPlusRequest` |
| 560 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusRequests.submitNetworkPlusRequest` |
| 561 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusRequests.transitionNetworkPlusRequest` |
| 562 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusRequests.updateNetworkPlusRequestDisposition` |
| 563 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusRequests.updateNetworkPlusContactConsent` |
| 564 | GET | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusRequests.getNetworkPlusContactHandoff` |
| 565 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusRequests.createNetworkPlusMeetingProposal` |
| 566 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusRequests.respondNetworkPlusMeeting` |
| 567 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusRequests.answerNetworkPlusQuestion` |
| 568 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusRequests.askNetworkPlusClarification` |
| 569 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusRequests.answerNetworkPlusClarification` |
| 570 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusRequests.addNetworkPlusRequestParticipant` |
| 571 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusRequests.respondNetworkPlusParticipant` |
| 572 | GET | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusRequests.getNetworkPlusWorkspace` |
| 573 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusRequests.createNetworkPlusWorkspace` |
| 574 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusRequests.addNetworkPlusWorkspaceMilestone` |
| 575 | PATCH | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusRequests.updateNetworkPlusWorkspaceMilestone` |
| 576 | POST | `p startsWith "api/v1/network-plus/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `networkPlusRequests.addNetworkPlusWorkspaceEvent` |
| 577 | PATCH | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.updateNetworkPlusVisibility` |
| 580 | POST | `p === "api/v1/admin/experience/demo-cases"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `experience.createDemoCase` |
| 581 | PATCH | `p startsWith "api/v1/admin/experience/demo-cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `experience.updateDemoCase` |
| 582 | POST | `p === "api/v1/admin/experience/guides"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `experience.createGuide` |
| 583 | PATCH | `p startsWith "api/v1/admin/experience/guides/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `experience.updateGuide` |
| 585 | POST | `p === "api/v1/organizations"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.registerOrganization` |
| 586 | GET | `p === "api/v1/organizations"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.listMyOrganizations` |
| 587 | GET | `p === "api/v1/me/organization-access"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.listMyOrganizationAccess` |
| 588 | GET | `p === "api/v1/me/job-assignments"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.listMyJobAssignments` |
| 589 | GET | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.getOrganization` |
| 590 | POST | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.addVerificationEvidence` |
| 591 | POST | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.submitOrganizationVerification` |
| 592 | POST | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.addOrganizationUser` |
| 593 | PATCH | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.updateOrganizationUser` |
| 594 | GET | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.listOrganizationUsers` |
| 595 | GET | `p === "api/v1/review/organizations"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.listOrganizationVerificationQueue` |
| 596 | POST | `p === "api/v1/review/organizations"` | anyRoleOrPermission(identity,["reviewer","system_admin"],["organizations.review"]) | `organizationJobs.reviewOrganization` |
| 597 | GET | `p === "api/v1/admin/organization-verification-requirements"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.listOrganizationVerificationRequirements` |
| 598 | POST | `p === "api/v1/admin/organization-verification-requirements"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.createOrganizationVerificationRequirement` |
| 599 | PATCH | `p startsWith "api/v1/admin/organization-verification-requirements/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.updateOrganizationVerificationRequirement` |
| 601 | POST | `p === "api/v1/jobs"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.createJob` |
| 602 | POST | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.createRequisition` |
| 603 | GET | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.listRequisitions` |
| 604 | POST | `p startsWith "api/v1/job-requisitions/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.decideRequisition` |
| 605 | GET | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.listOrganizationJobs` |
| 606 | GET | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.organizationRecruitingDashboard` |
| 607 | GET | `p startsWith "api/v1/organizations/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `stakeholderOutcomes.getOrganizationOutcomeWorkspace` |
| 608 | GET | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.jobDashboard` |
| 609 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.addJobTeamMember` |
| 610 | GET | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.listJobTeam` |
| 611 | DELETE | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.removeJobTeamMember` |
| 612 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.addScreeningQuestion` |
| 613 | GET | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.listInterviewScorecards` |
| 614 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.createInterviewScorecard` |
| 615 | GET | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.listScreeningQuestions` |
| 616 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.referCandidate` |
| 617 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.saveJob` |
| 618 | DELETE | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.unsaveJob` |
| 619 | GET | `p === "api/v1/me/saved-jobs"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.listSavedJobs` |
| 620 | GET | `p === "api/v1/me/saved-items"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `savedDiscoveryItems.listDiscoveryItems` |
| 621 | POST | `p === "api/v1/me/saved-items"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `savedDiscoveryItems.saveDiscoveryItem` |
| 622 | DELETE | `p startsWith "api/v1/me/saved-items/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `savedDiscoveryItems.removeDiscoveryItem` |
| 623 | POST | `p === "api/v1/me/job-alerts"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.createJobAlert` |
| 624 | GET | `p === "api/v1/me/job-alerts"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.listJobAlerts` |
| 625 | GET | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.listApplicationNotes` |
| 626 | POST | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.addApplicationNote` |
| 627 | GET | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.listApplicationInterviews` |
| 628 | POST | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.scheduleInterview` |
| 629 | POST | `p startsWith "api/v1/job-interviews/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.updateInterviewStatus` |
| 630 | POST | `p startsWith "api/v1/job-interviews/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.proposeInterviewChange` |
| 631 | POST | `p startsWith "api/v1/job-interview-change-proposals/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.decideInterviewChange` |
| 632 | POST | `p startsWith "api/v1/job-interviews/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.respondInterview` |
| 633 | POST | `p startsWith "api/v1/job-interviews/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.submitInterviewFeedback` |
| 634 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.recordJobOutcome` |
| 637 | POST | `p === "api/v1/marketplace-demand"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `marketplaceDemand.createDemand` |
| 638 | POST | `p === "api/v1/marketplace-demand/public-topics"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `marketplaceDemand.createPublicTopicSubmission` |
| 639 | GET | `p === "api/v1/me/marketplace-demand-public-topics"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `marketplaceDemand.listMyPublicTopicSubmissions` |
| 640 | GET | `p === "api/v1/admin/marketplace-demand-public-topics"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `marketplaceDemand.listPublicTopicSubmissionsForReview` |
| 641 | PATCH | `p startsWith "api/v1/admin/marketplace-demand-public-topics/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `marketplaceDemand.reviewPublicTopicSubmission` |
| 642 | GET | `p === "api/v1/me/marketplace-demand"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `marketplaceDemand.listMyDemand` |
| 643 | GET | `p === "api/v1/me/marketplace-demand-interests"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `marketplaceDemand.listMyInterests` |
| 644 | POST | `p startsWith "api/v1/marketplace-demand/topics/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `marketplaceDemand.joinDemandTopic` |
| 645 | POST | `p startsWith "api/v1/marketplace-demand/topics/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `marketplaceDemand.withdrawDemandInterest` |
| 646 | GET | `p === "api/v1/admin/marketplace-match-candidates"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `marketplaceDemand.listDemandMatchCandidates` |
| 647 | POST | `p startsWith "api/v1/admin/marketplace-demand/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `marketplaceDemand.createDemandProviderMatch` |
| 648 | GET | `p === "api/v1/me/marketplace-demand-matches"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `marketplaceDemand.listMyDemandProviderMatches` |
| 649 | POST | `p startsWith "api/v1/marketplace-demand-matches/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `marketplaceDemand.respondToDemandProviderMatch` |
| 650 | GET | `p === "api/v1/admin/marketplace-demand"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `marketplaceDemand.listReviewQueue` |
| 651 | GET | `p === "api/v1/admin/marketplace-demand-assessment"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `marketplaceDemand.getDemandInterestAssessment` |
| 652 | POST | `p startsWith "api/v1/admin/marketplace-demand/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `marketplaceDemand.mergeDemand` |
| 653 | PATCH | `p startsWith "api/v1/admin/marketplace-demand/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `marketplaceDemand.reviewDemand` |
| 654 | GET | `p === "api/v1/admin/marketplace-listings"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `marketplaceDemand.listAdminListings` |
| 655 | POST | `p startsWith "api/v1/admin/marketplace-listings/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `marketplaceDemand.moderateListing` |
| 656 | GET | `p startsWith "api/v1/admin/marketplace-demand-topics/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `marketplaceDemand.getDemandSummary` |
| 657 | POST | `p === "api/v1/services"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.createServiceListing` |
| 658 | PATCH | `p startsWith "api/v1/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.updateServiceListing` |
| 659 | POST | `p startsWith "api/v1/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.changeServiceListingStatus` |
| 660 | POST | `p startsWith "api/v1/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.createServiceListingAnnouncement` |
| 661 | POST | `p startsWith "api/v1/service-listing-announcements/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.changeServiceListingAnnouncementStatus` |
| 662 | POST | `p startsWith "api/v1/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.createServiceListingInterest` |
| 663 | POST | `p startsWith "api/v1/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.createServiceListingPledge` |
| 664 | POST | `p startsWith "api/v1/service-listing-interests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.withdrawServiceListingInterest` |
| 665 | POST | `p startsWith "api/v1/service-listing-pledges/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.changeServiceListingPledgeStatus` |
| 666 | GET | `p === "api/v1/me/service-listings"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.listMyServiceListings` |
| 667 | GET | `p === "api/v1/me/service-listing-interest-summary"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.listMyServiceListingInterestSummary` |
| 668 | GET | `p === "api/v1/me/service-listing-pledges"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.listMyServiceListingPledges` |
| 669 | GET | `p === "api/v1/me/organization-mentorship-offers"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationMentorshipOffers.listMyOrganizationMentorshipOffers` |
| 670 | POST | `p === "api/v1/organization-mentorship-offers"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationMentorshipOffers.createOrganizationMentorshipOffer` |
| 671 | PATCH | `p startsWith "api/v1/organization-mentorship-offers/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationMentorshipOffers.updateOrganizationMentorshipOffer` |
| 672 | POST | `p startsWith "api/v1/organization-mentorship-offers/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationMentorshipOffers.changeOrganizationMentorshipOfferStatus` |
| 673 | POST | `p startsWith "api/v1/organization-mentorship-offers/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationMentorshipOffers.requestOrganizationMentorship` |
| 674 | GET | `p === "api/v1/me/organization-mentorship-requests"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationMentorshipOffers.listMyOrganizationMentorshipRequests` |
| 675 | POST | `p startsWith "api/v1/organization-mentorship-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationMentorshipOffers.respondOrganizationMentorshipRequest` |
| 676 | GET | `p === "api/v1/me/service-requests"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.listMyServiceRequests` |
| 677 | POST | `p startsWith "api/v1/services/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.requestService` |
| 678 | GET | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.listServiceRequestUpdates` |
| 679 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.createServiceRequestUpdate` |
| 680 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.changeServiceRequestStatus` |
| 681 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.acceptServiceAgreement` |
| 682 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.acceptServiceCompletion` |
| 683 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.reviewServiceCompletion` |
| 684 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.submitServicePayment` |
| 685 | POST | `p startsWith "api/v1/service-payments/" + path-segment constraints` | anyRoleOrPermission(identity,["finance_officer","reviewer","system_admin"],["finance.manage"]) | `servicesMentorship.verifyServicePayment` |
| 686 | GET | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.listServiceMilestones` |
| 687 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.createServiceMilestone` |
| 688 | GET | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.listServiceDeliveries` |
| 689 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.submitServiceDelivery` |
| 690 | POST | `p startsWith "api/v1/service-deliveries/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.reviewServiceDelivery` |
| 691 | POST | `p startsWith "api/v1/service-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.submitServiceFeedback` |
| 692 | GET | `p === "api/v1/mentors"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.listMentors` |
| 693 | GET | `p === "api/v1/me/mentor-profile"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.getMyMentorProfile` |
| 694 | POST | `p === "api/v1/me/mentor-profile"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.createMentorProfile` |
| 695 | PATCH | `p startsWith "api/v1/mentor-profiles/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.updateMentorProfile` |
| 696 | POST | `p startsWith "api/v1/mentor-profiles/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.changeMentorStatus` |
| 697 | GET | `p startsWith "api/v1/mentor-profiles/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `mentorshipOperations.getMentorshipCircleSummary` |
| 698 | POST | `p startsWith "api/v1/mentor-profiles/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `mentorshipOperations.joinMentorshipCircle` |
| 699 | DELETE | `p startsWith "api/v1/mentor-profiles/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `mentorshipOperations.leaveMentorshipCircle` |
| 700 | PUT | `p startsWith "api/v1/mentor-profiles/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.setMentorAvailability` |
| 701 | DELETE | `p startsWith "api/v1/mentor-profiles/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.removeMentorTimeOff` |
| 702 | POST | `p startsWith "api/v1/mentor-profiles/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.addMentorTimeOff` |
| 703 | GET | `p startsWith "api/v1/mentorship/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.listMentorshipLearningActivities` |
| 704 | POST | `p startsWith "api/v1/mentorship/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.createMentorshipLearningActivity` |
| 705 | POST | `p startsWith "api/v1/mentorship-activities/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.submitMentorshipLearningActivity` |
| 706 | POST | `p startsWith "api/v1/mentorship-learning-submissions/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.reviewMentorshipLearningSubmission` |
| 707 | GET | `p === "api/v1/me/mentorship-learning-progress"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.listMyMentorshipLearningProgress` |
| 708 | GET | `p === "api/v1/me/mentorship-requests"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.listMyMentorshipRequests` |
| 709 | GET | `p === "api/v1/me/mentorship-interest"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `mentorshipOperations.listMentorshipInterestPool` |
| 710 | GET | `p === "api/v1/me/mentorship-operations"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `mentorshipOperations.getMentorshipOperationalReport` |
| 711 | GET | `p === "api/v1/me/mentorship-reports"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `mentorshipOperations.listMyMentorshipParticipantReports` |
| 712 | GET | `p === "api/v1/admin/mentorship-reports"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `mentorshipOperations.listMentorshipParticipantReports` |
| 713 | GET | `p === "api/v1/admin/service-mentorship-cases"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `serviceMentorshipSupportCases.listSupportCases` |
| 715 | GET | `p === "api/v1/admin/mentorship/pending-decisions"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `mentorshipOperations.listMentorshipProgrammePendingDecisions` |
| 716 | GET | `p === "api/v1/admin/mentorship/relationships"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `mentorshipOperations.listMentorshipProgrammeRelationships` |
| 717 | GET | `p === "api/v1/admin/mentorship/metrics"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `mentorshipOperations.getMentorshipProgrammeMetrics` |
| 718 | GET | `p === "api/v1/admin/mentorship-interest"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `mentorshipOperations.listMentorshipInterestReviewQueue` |
| 719 | POST | `p startsWith "api/v1/admin/mentorship-interest/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `mentorshipOperations.proposeMentorshipInterestMatch` |
| 720 | POST | `p startsWith "api/v1/admin/mentorship-interest/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `mentorshipOperations.markMentorshipInterestReviewed` |
| 721 | PATCH | `p startsWith "api/v1/admin/mentorship-reports/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `mentorshipOperations.updateMentorshipParticipantReport` |
| 722 | GET | `p === "api/v1/me/mentorship-matches"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.listMyMentorshipMatches` |
| 723 | GET | `p === "api/v1/me/mentorships"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.listMyMentorships` |
| 724 | POST | `p === "api/v1/mentorship/requests"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.createMentorshipRequest` |
| 725 | PATCH | `p startsWith "api/v1/mentorship/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `mentorshipOperations.setMentorshipRequestSharing` |
| 726 | POST | `p startsWith "api/v1/mentorship/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `mentorshipOperations.registerMentorshipInterest` |
| 727 | GET | `p startsWith "api/v1/mentorship/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.getMentorshipRequest` |
| 728 | GET | `p startsWith "api/v1/mentorship/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.findMentorMatches` |
| 729 | POST | `p startsWith "api/v1/mentorship/requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.proposeMentorMatch` |
| 730 | POST | `p startsWith "api/v1/mentorship/matches/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.respondToMatch` |
| 731 | POST | `p startsWith "api/v1/mentorship/matches/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.respondToMenteeMatch` |
| 732 | GET | `p startsWith "api/v1/mentorship/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.getMentorship` |
| 733 | GET | `p startsWith "api/v1/mentorship/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.listMentorshipGoals` |
| 734 | POST | `p startsWith "api/v1/mentorship/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.createMentorshipGoal` |
| 735 | PATCH | `p startsWith "api/v1/mentorship-goals/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.updateMentorshipGoal` |
| 736 | POST | `p startsWith "api/v1/mentorship/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.changeMentorshipStatus` |
| 737 | GET | `p startsWith "api/v1/mentorship/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.listMentorshipSessions` |
| 738 | POST | `p startsWith "api/v1/mentorship/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.createMentorshipSession` |
| 739 | POST | `p startsWith "api/v1/mentorship/sessions/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `mentorshipOperations.respondToSessionProposal` |
| 740 | POST | `p startsWith "api/v1/mentorship/sessions/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `mentorshipOperations.proposeMentorshipSessionChange` |
| 741 | POST | `p startsWith "api/v1/mentorship/session-changes/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `mentorshipOperations.respondToMentorshipSessionChange` |
| 742 | PATCH | `p startsWith "api/v1/mentorship/sessions/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.updateMentorshipSessionDetails` |
| 743 | POST | `p startsWith "api/v1/mentorship/sessions/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.changeMentorshipSession` |
| 744 | POST | `p startsWith "api/v1/mentorship/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `servicesMentorship.submitMentorshipFeedback` |
| 745 | POST | `p startsWith "api/v1/mentorship/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `mentorshipOperations.createMentorshipParticipantReport` |
| 746 | GET | `p === "api/v1/me/outcomes"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `stakeholderOutcomes.getMyOutcomeWorkspace` |
| 747 | GET | `p === "api/v1/support/job-seeker-demands/organizations"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.listShareableOrganizations` |
| 748 | GET | `p startsWith "api/v1/organizations/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.listSharedJobSeekerDemands` |
| 749 | POST | `p startsWith "api/v1/support/job-seeker-demands/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.shareJobSeekerDemand` |
| 750 | GET | `p === "api/v1/me/job-interests"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.listMyMemberJobInterests` |
| 751 | POST | `p === "api/v1/me/job-interests"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.createMemberJobInterest` |
| 752 | GET | `p startsWith "api/v1/me/job-interests/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.getMyMemberJobInterest` |
| 753 | GET | `p startsWith "api/v1/me/job-interests/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.getMyMemberJobInterestSharingHistory` |
| 754 | POST | `p startsWith "api/v1/me/job-interests/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.updateMyMemberJobInterestConsent` |
| 755 | GET | `p === "api/v1/me/job-interest-sharing-organizations"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.searchMemberJobInterestOrganizations` |
| 756 | GET | `p === "api/v1/me/opportunity-inquiries"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.listMyLinkedInquiries` |
| 757 | GET | `p startsWith "api/v1/me/opportunity-inquiries/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.getLinkedInquiryDetails` |
| 758 | PATCH | `p startsWith "api/v1/me/opportunity-inquiries/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.updateLinkedInquiryDetails` |
| 759 | GET | `p startsWith "api/v1/me/opportunity-inquiries/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.getLinkedSharingHistory` |
| 760 | POST | `p startsWith "api/v1/me/opportunity-inquiries/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.updateLinkedSharingConsent` |
| 761 | GET | `p === "api/v1/opportunity-inquiries"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.listInquiries` |
| 762 | PATCH | `p startsWith "api/v1/opportunity-inquiries/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `publicOpportunity.decideInquiry` |
| 763 | GET | `p === "api/v1/me/progress"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `Promise.allSettled` |
| 794 | GET | `p === "api/v1/me/application-tracking"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `applicationTracking.getApplicationTracking` |
| 795 | GET | `p === "api/v1/admin/support/knowledge"` | anyRoleOrPermission(identity,["system_admin","admin","platform_admin","supporting_staff"],["support.knowledge.manage","support.inquiries.manage"]) | `supportBot.adminGetKnowledge` |
| 796 | POST | `p === "api/v1/admin/support/knowledge/categories"` | anyRoleOrPermission(identity,["system_admin","admin","platform_admin"],["support.knowledge.manage"]) | `supportBot.adminSaveCategory` |
| 797 | POST | `p === "api/v1/admin/support/knowledge/articles"` | anyRoleOrPermission(identity,["system_admin","admin","platform_admin"],["support.knowledge.manage"]) | `supportBot.adminSaveArticle` |
| 798 | GET | `p === "api/v1/admin/support/colleagues"` | anyRoleOrPermission(identity,["system_admin","admin","platform_admin"],["support.inquiries.manage"]) | `supportBot.adminListSupportColleagues` |
| 799 | GET | `p === "api/v1/admin/support/inquiries"` | anyRoleOrPermission(identity,["system_admin","admin","platform_admin","supporting_staff"],["support.inquiries.view","support.inquiries.manage"]) | `supportBot.adminListConversations` |
| 800 | PATCH | `dynamic parts predicate (see server.js line)` | anyRoleOrPermission(identity,["system_admin","admin","platform_admin","supporting_staff"],["support.inquiries.manage"]) | `supportBot.adminUpdateConversation` |
| 801 | POST | `dynamic parts predicate (see server.js line)` | anyRoleOrPermission(identity,["system_admin","admin","platform_admin","supporting_staff"],["support.inquiries.manage"]) | `supportBot.escalateConversation` |
| 802 | POST | `dynamic parts predicate (see server.js line)` | anyRoleOrPermission(identity,["system_admin","admin","platform_admin","supporting_staff"],["support.inquiries.manage"]) | `supportBot.adminReplyToConversation` |
| 803 | GET | `p === "api/v1/membership/card"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipCard.getMyMembershipCard` |
| 804 | GET | `p === "api/v1/admin/membership-card"` | anyRoleOrPermission(identity,["system_admin","reviewer"],["members.view","members.manage"]) | `membershipCard.getMembershipCardForAdmin` |
| 805 | GET | `p === "api/v1/admin/membership-cards/eligible"` | anyRoleOrPermission(identity,["system_admin","reviewer"],["members.view","members.manage"]) | `membershipCard.listEligibleMembershipCardsForAdmin` |
| 806 | POST | `p === "api/v1/admin/membership-cards/batch"` | anyRoleOrPermission(identity,["system_admin","reviewer"],["members.view","members.manage"]) | `membershipCard.getMembershipCardsForAdmin` |
| 807 | POST | `p === "api/v1/admin/membership-cards/print"` | anyRoleOrPermission(identity,["system_admin","reviewer"],["members.view","members.manage"]) | `membershipCard.recordMembershipCardsPrintRequest` |
| 808 | PATCH | `p === "api/v1/me/profile-picture"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipCard.setMyProfilePicture` |
| 809 | DELETE | `p === "api/v1/me/profile-picture"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipCard.removeMyProfilePicture` |
| 810 | GET | `p === "api/v1/admin/audit-log"` | anyRoleOrPermission(identity,["system_admin"],["audit.view"]) | `adminAudit.listAdminAuditEvents` |
| 811 | GET | `p === "api/v1/admin/membership-card-settings"` | anyRoleOrPermission(identity,["system_admin","admin","platform_admin"],["members.manage"]) | `membershipCard.getMembershipCardSettings` |
| 812 | PATCH | `p === "api/v1/admin/membership-card-settings"` | anyRoleOrPermission(identity,["system_admin"],["members.manage"]) | `membershipCard.updateMembershipCardSettings` |
| 814 | POST | `dynamic parts predicate (see server.js line)` | anyRoleOrPermission(identity,["system_admin"],["members.manage"]) | `membershipCard.rotateMembershipCardVerification` |
| 815 | GET | `p === "api/v1/me"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `membership.getMe` |
| 816 | PATCH | `p === "api/v1/me/account"` | Inherited dispatcher authentication at server.js:375; self-account action policy remains separate | `accountSecurity.updateOwnCredentials` |
| 817 | PATCH | `p === "api/v1/me/profile"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `membership.updateProfile` |
| 818 | GET | `p === "api/v1/membership/history"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `membership.history` |
| 819 | GET | `p === "api/v1/membership/applications/me"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `membership.listMyApplications` |
| 820 | GET | `p === "api/v1/notifications/campaign-preferences"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 821 | PATCH | `p === "api/v1/notifications/campaign-preferences"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 822 | GET | `p === "api/v1/admin/community-campaigns/messages"` | anyRole(identity,["system_admin","admin","platform_admin"]) | `communityCampaigns.listCampaignMessages` |
| 823 | POST | `p === "api/v1/admin/community-campaigns/messages"` | anyRole(identity,["system_admin","admin","platform_admin"]) | `communityCampaigns.saveCampaignMessage` |
| 824 | POST | `p startsWith "api/v1/admin/community-campaigns/messages/" + path-segment constraints` | anyRole(identity,["system_admin","admin","platform_admin"]) | `communityCampaigns.submitCampaignMessage` |
| 825 | POST | `p startsWith "api/v1/admin/community-campaigns/messages/" + path-segment constraints` | anyRole(identity,["system_admin","admin","platform_admin"]) | `communityCampaigns.decideCampaignMessage` |
| 826 | GET | `p === "api/v1/admin/community-campaigns/schedules"` | anyRole(identity,["system_admin","admin","platform_admin"]) | `communityCampaigns.getCampaignSchedules` |
| 827 | PATCH | `p startsWith "api/v1/admin/community-campaigns/schedules/" + path-segment constraints` | anyRole(identity,["system_admin","admin","platform_admin"]) | `communityCampaigns.updateCampaignSchedule` |
| 828 | POST | `p === "api/v1/admin/community-campaigns/pause"` | anyRole(identity,["system_admin","admin","platform_admin"]) | `communityCampaigns.pauseCampaign` |
| 829 | GET | `p === "api/v1/admin/community-campaigns/monitoring"` | anyRole(identity,["system_admin","admin","platform_admin"]) | `communityCampaigns.getCampaignMonitoring` |
| 830 | GET | `p === "api/v1/notifications/push/public-key"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `—` |
| 831 | GET | `p === "api/v1/notifications/push/status"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `—` |
| 832 | POST | `p === "api/v1/notifications/push/subscriptions"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `—` |
| 833 | DELETE | `p === "api/v1/notifications/push/subscriptions"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `—` |
| 834 | GET | `p === "api/v1/notifications"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `notifications.getNotificationInbox` |
| 835 | POST | `p === "api/v1/notifications/read-all"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `notifications.markAllNotificationsRead` |
| 836 | PATCH | `p startsWith "api/v1/notifications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `notifications.markNotificationRead` |
| 837 | PATCH | `p startsWith "api/v1/notifications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `notifications.archiveNotification` |
| 838 | GET | `p === "api/v1/notifications/preferences"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `membership.notificationPreferences` |
| 839 | PATCH | `p === "api/v1/notifications/preferences"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `membership.notificationPreferences` |
| 840 | POST | `p === "api/v1/payments/chapa/verify"` | requireRole(identity,"member") | `membership.verifyChapaMembershipPayment` |
| 841 | POST | `p startsWith "api/v1/membership/applications/" + path-segment constraints` | requireRole(identity,"member") | `membership.initiateChapaMembershipPayment` |
| 842 | POST | `p === "api/v1/membership/applications"` | requireRole(identity,"member") | `membership.createApplication` |
| 845 | POST | `p startsWith "api/v1/membership/applications/" + path-segment constraints` | assertMembershipReviewAccess(identity) | `membership.reviewApplication` |
| 848 | POST | `p startsWith "api/v1/membership/applications/" + path-segment constraints` | requireRole(identity,"member") | `membership.respondCorrection` |
| 851 | POST | `p startsWith "api/v1/membership/applications/" + path-segment constraints` | requireRole(identity,"member") | `membership.attachApplicationFile` |
| 854 | POST | `p startsWith "api/v1/membership/applications/" + path-segment constraints` | requireRole(identity,"member") | `membership.createManualPayment` |
| 857 | POST | `p startsWith "api/v1/membership/applications/" + path-segment constraints` | assertMembershipActivationAccess(identity) | `membership.activateApplication` |
| 860 | POST | `p === "api/v1/membership/renew"` | requireRole(identity,"member") | `membership.renew` |
| 863 | POST | `dynamic parts predicate (see server.js line)` | assertPaymentVerificationAccess(identity) | `membership.verifyPayment` |
| 866 | POST | `dynamic parts predicate (see server.js line)` | assertPaymentReversalAccess(identity) | `membership.reverseMembershipPayment` |
| 870 | GET | `p === "api/v1/finance/payer-search"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `financeReceipts.searchFinancePayers` |
| 871 | GET | `p === "api/v1/finance/organization-search"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `financeReceipts.searchFinanceOrganizations` |
| 872 | GET | `p === "api/v1/finance/receipts"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `financeReceipts.listManualFinancePayments` |
| 873 | POST | `p === "api/v1/finance/receipts"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `financeReceipts.recordManualFinancePayment` |
| 874 | POST | `p startsWith "api/v1/finance/receipts/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `financeReceipts.decideManualFinancePayment` |
| 875 | POST | `p startsWith "api/v1/finance/receipts/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `financeReceipts.reverseManualFinancePayment` |
| 876 | POST | `p startsWith "api/v1/finance/receipts/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `financeReceipts.issueFinancePaymentVoucher` |
| 877 | POST | `p startsWith "api/v1/finance/membership/payments/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `financeReceipts.issueVerifiedMembershipPaymentVoucher` |
| 878 | GET | `p === "api/v1/finance/membership/fee-obligations/export.xlsx"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipFeeObligations.exportFeeObligations` |
| 879 | GET | `p === "api/v1/finance/membership/fee-obligations"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipFeeObligations.listFeeObligations` |
| 880 | POST | `p === "api/v1/finance/membership/receipts"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipFeeObligations.recordMembershipReceipt` |
| 881 | POST | `p startsWith "api/v1/finance/membership/receipts/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipFeeObligations.verifyMembershipReceipt` |
| 882 | POST | `p startsWith "api/v1/finance/membership/receipts/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipFeeObligations.reverseMembershipRecordReceipt` |
| 883 | GET | `p === "api/v1/finance/membership/sponsoring-organizations"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipFeeObligations.listSponsoringOrganizations` |
| 884 | POST | `p === "api/v1/finance/membership/obligations/dispositions"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipFeeObligations.recordBalanceDisposition` |
| 885 | POST | `p startsWith "api/v1/finance/membership/dispositions/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipFeeObligations.decideBalanceDisposition` |
| 886 | GET | `p === "api/v1/finance/membership/payment-import-template.xlsx"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 887 | GET | `p === "api/v1/finance/membership/payment-import-template.csv"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 888 | POST | `p === "api/v1/finance/membership/payment-import/preview"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipFeeObligations.previewMembershipPaymentImport` |
| 889 | POST | `p startsWith "api/v1/finance/membership/payment-import/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipFeeObligations.applyMembershipPaymentImport` |
| 890 | GET | `p === "api/v1/finance/membership/payments"` | assertFinancePaymentQueueAccess(identity) | `membership.listMembershipPaymentsForFinance` |
| 891 | GET | `p === "api/v1/finance/membership/legacy-payment-verification"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `legacyMembershipPayments.listLegacyMembershipPaymentVerificationQueue` |
| 892 | POST | `p startsWith "api/v1/finance/membership/legacy-payment-verification/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `legacyMembershipPayments.verifyLegacyMembershipPayment` |
| 893 | POST | `p startsWith "api/v1/finance/membership/legacy-payment-verification/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `legacyMembershipPayments.reverseLegacyMembershipPayment` |
| 894 | GET | `p === "api/v1/review/membership/applications"` | assertMembershipReviewQueueAccess(identity) | `membership.listApplicationsForReview` |
| 899 | GET | `p === "api/v1/admin/member-geography/summary"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipGeography.getMemberGeographySummary` |
| 900 | GET | `p === "api/v1/member-geography/reference"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipGeography.listMemberGeography` |
| 901 | GET | `p === "api/v1/me/residence"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `membershipGeography.getMyResidence` |
| 902 | PATCH | `p === "api/v1/me/residence"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `membershipGeography.saveMyResidence` |
| 903 | GET | `p === "api/v1/admin/member-geography/import-template"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `—` |
| 904 | GET | `p === "api/v1/admin/member-geography/export"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipGeography.exportPublishedMemberGeography` |
| 905 | POST | `p === "api/v1/admin/member-geography/import/preview"` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipGeography.previewMemberGeographyImport` |
| 906 | POST | `p startsWith "api/v1/admin/member-geography/import/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipGeography.applyMemberGeographyImport` |
| 907 | POST | `p startsWith "api/v1/admin/member-geography/versions/" + path-segment constraints` | auth(req); no explicit route helper — service must enforce capability and resource scope | `membershipGeography.publishMemberGeographyVersion` |
| 909 | GET | `p === "api/v1/professional-reference-data"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `referencePortfolio.listPublicReferenceSets` |
| 910 | GET | `p === "api/v1/me/cv"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `talent.getMyCv` |
| 911 | PATCH | `p === "api/v1/me/cv"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `talent.saveMyCv` |
| 912 | GET | `p === "api/v1/me/cv/shares"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `talent.listMyCvShares` |
| 913 | POST | `p === "api/v1/me/cv/share"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `talent.shareMyCvWithApplication` |
| 914 | DELETE | `p === "api/v1/me/cv/share"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `talent.revokeMyCvShare` |
| 915 | GET | `p === "api/v1/me/education"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `talent.getProfessionalEducation` |
| 916 | PUT | `p === "api/v1/me/education"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `talent.saveProfessionalEducation` |
| 917 | GET | `p === "api/v1/me/portfolio"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `talent.getProfessionalPortfolio` |
| 918 | POST | `p === "api/v1/me/portfolio"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `talent.saveProfessionalPortfolioItem` |
| 919 | PATCH | `p startsWith "api/v1/me/portfolio/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `talent.saveProfessionalPortfolioItem` |
| 920 | DELETE | `p startsWith "api/v1/me/portfolio/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `talent.deleteProfessionalPortfolioItem` |
| 921 | GET | `p === "api/v1/me/talent-profile"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `talent.getProfessionalProfile` |
| 922 | PATCH | `p === "api/v1/me/talent-profile"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `talent.updateProfessionalProfile` |
| 923 | GET | `p === "api/v1/me/talent-visibility"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `talent.getVisibility` |
| 924 | PATCH | `p === "api/v1/me/talent-visibility"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `talent.updateVisibility` |
| 925 | POST | `p === "api/v1/talent/saved-searches"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `talent.saveSearch` |
| 926 | GET | `p === "api/v1/talent/saved-searches"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `talent.listSavedSearches` |
| 927 | POST | `p === "api/v1/talent/inquiries"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `talent.createTalentInquiry` |
| 928 | GET | `p === "api/v1/talent/inquiries"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `talent.listTalentInquiries` |
| 929 | POST | `p startsWith "api/v1/talent/inquiries/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `talent.respondToTalentInquiry` |
| 930 | POST | `p startsWith "api/v1/talent/inquiries/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `talent.closeTalentInquiry` |
| 932 | POST | `p === "api/v1/ethics/cases"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `ethics.createEthicsCase` |
| 933 | GET | `p === "api/v1/me/ethics/cases"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `ethics.listMyEthicsCases` |
| 934 | POST | `p startsWith "api/v1/ethics/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `ethics.addEthicsCaseEvidence` |
| 935 | POST | `p startsWith "api/v1/ethics/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `ethics.submitEthicsRespondentResponse` |
| 936 | GET | `p === "api/v1/review/ethics/cases"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `ethics.listEthicsCases` |
| 937 | GET | `p === "api/v1/review/ethics/reviewers"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `ethics.listEthicsReviewers` |
| 938 | GET | `p startsWith "api/v1/review/ethics/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `ethics.getEthicsCase` |
| 939 | PATCH | `p startsWith "api/v1/review/ethics/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `ethics.updateEthicsCase` |
| 940 | POST | `p startsWith "api/v1/review/ethics/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `ethics.assignEthicsCase` |
| 941 | POST | `p startsWith "api/v1/review/ethics/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `ethics.assignEthicsPanelMember` |
| 942 | POST | `p startsWith "api/v1/review/ethics/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `ethics.declareEthicsConflict` |
| 943 | POST | `p startsWith "api/v1/review/ethics/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `ethics.recordEthicsReview` |
| 944 | POST | `p startsWith "api/v1/review/ethics/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `ethics.decideEthicsCase` |
| 946 | GET | `p === "api/v1/me/volunteer-pledges"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `volunteerPledges.listMyVolunteerPledges` |
| 947 | POST | `p === "api/v1/me/volunteer-pledges"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `volunteerPledges.saveVolunteerPledge` |
| 948 | PATCH | `p startsWith "api/v1/me/volunteer-pledges/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `volunteerPledges.updateVolunteerPledge` |
| 949 | DELETE | `p startsWith "api/v1/me/volunteer-pledges/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `volunteerPledges.withdrawVolunteerPledge` |
| 951 | GET | `p === "api/v1/verification/programs"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `verification.listPrograms` |
| 952 | GET | `p === "api/v1/verification/claim-types"` | No auth helper in dispatch branch; public/token/webhook or service-level proof must be verified | `verification.listClaimTypes` |
| 953 | GET | `p === "api/v1/me/verification/cases"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `verification.listCases` |
| 954 | GET | `p === "api/v1/me/verification/reference-requests"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `verification.listMyReferenceRequests` |
| 955 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `verification.requestReference` |
| 956 | POST | `p startsWith "api/v1/verification/reference-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `verification.respondReferenceRequest` |
| 957 | POST | `p startsWith "api/v1/verification/reference-requests/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `verification.reviewReferenceRequest` |
| 958 | POST | `p === "api/v1/verification/cases"` | anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]); requireRole(identity,"member") | `verification.createCase` |
| 964 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `verification.giveConsent` |
| 965 | GET | `p startsWith "api/v1/verification/cases/"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `verification.getCase` |
| 969 | GET | `p === "api/v1/review/verification/appeals"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `verification.listAppealsForReview` |
| 970 | GET | `p === "api/v1/review/verification/cases"` | anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]) | `verification.listCases` |
| 975 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | anyRoleOrPermission(identity,["system_admin"],["verification.manage"]) | `verification.assignCase` |
| 979 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]) | `verification.transitionCase` |
| 983 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]) | `verification.getCase` |
| 988 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]) | `verification.getCase` |
| 993 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]) | `verification.decide` |
| 997 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `verification.memberResponse` |
| 998 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `verification.submitAppeal` |
| 999 | POST | `p startsWith "api/v1/verification/appeals/" + path-segment constraints` | anyRoleOrPermission(identity,["appeal_reviewer","system_admin"],["verification.appeal.review"]) | `verification.decideAppeal` |
| 1003 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]) | `verification.setClaimStatus` |
| 1007 | POST | `p startsWith "api/v1/verification/cases/" + path-segment constraints` | anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]) | `verification.recordCheckResult` |
| 1012 | GET | `p === "api/v1/review/jobs"` | anyRoleOrPermission(identity,["reviewer","system_admin"],["jobs.review"]) | `organizationJobs.listJobsForReview` |
| 1013 | POST | `p startsWith "api/v1/review/jobs/" + path-segment constraints` | anyRoleOrPermission(identity,["reviewer","system_admin"],["jobs.review"]) | `organizationJobs.reviewJob` |
| 1014 | GET | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.evaluateEligibility` |
| 1015 | PATCH | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.updateJob` |
| 1016 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.publishJob` |
| 1017 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.changeJobStatus` |
| 1018 | GET | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.listCandidates` |
| 1019 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.saveApplicationDraft` |
| 1020 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.applyToJob` |
| 1021 | PATCH | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.updateApplicationDraft` |
| 1022 | POST | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.submitApplication` |
| 1023 | GET | `p === "api/v1/me/job-applications"` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.listMyApplications` |
| 1024 | GET | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.getMyApplicationProgress` |
| 1025 | POST | `p startsWith "api/v1/jobs/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.updateCandidate` |
| 1026 | POST | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.approveJobOffer` |
| 1027 | POST | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.respondToJobApplication` |
| 1028 | GET | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.listApplicationAttachments` |
| 1029 | POST | `p startsWith "api/v1/job-applications/" + path-segment constraints` | Inherited dispatcher authentication at server.js:375; route action/scope policy remains separate | `organizationJobs.addApplicationAttachment` |

## Phase 2 addition — effective capabilities endpoint

| 814 | GET | `p === "api/v1/me/capabilities"` | Inherited dispatcher authentication at server.js:375; returns current roles, direct permissions and derived capabilities | — |

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
