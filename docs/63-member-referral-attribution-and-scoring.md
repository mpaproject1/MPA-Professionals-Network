# Member referral attribution and employment outcomes

## Purpose
A shared referral service supports two distinct processes: membership acquisition and job-specific employment referrals. It does not create duplicate user, membership, vacancy or application records.

## Member invitation
- A member can generate a unique MPA-XXXXXXXX code only while they have a current active membership record.
- Share /register?ref=CODE; registration captures the code in the same transaction as account creation.
- The first valid member code recorded for an account wins. Self-referrals are rejected.
- The new user can optionally consent to show their name and limited membership progress to the referrer. Without consent, the referrer sees a private/anonymous row and aggregate counts only.
- Existing membership application, review, payment verification and activation remain authoritative. Referral attribution does not approve, pay for or activate membership.
- Milestones include registration, membership application submitted, membership approved, declined and activated.

## Employment referral
- A member shares the same code alongside a specific job vacancy.
- The authenticated candidate enters the code on the vacancy application. The code is persisted with the existing job application draft and captured when the formal application is submitted.
- One attribution is allowed per job application; the first recorded code is retained. The candidate cannot refer themselves.
- Existing hiring workflow events update referral progress: shortlisted, interview, candidate offer acceptance, employer-recorded hired status, rejection and withdrawal.
- An employer-recorded hired status is only an outcome reported for review. It does not automatically become verified.
- The candidate must confirm the outcome and consent to MPA verification using the candidate outcome workspace. The candidate separately chooses whether the referrer may see their name and limited referral progress. An authorized MPA reviewer then records an independent verification method and evidence/confirmation reference. Only this decision sets employment_verified and makes the event eligible for score policy rules.

## Scoring governance
- There is no default scoring policy and no points are issued until MPA approves and activates a version.
- A system administrator proposes event-to-point values. A different system administrator must approve; activation retires the previous active policy.
- Score ledger entries are append-only and unique by attribution, event and policy version. Later policy changes do not rewrite historic points.
- Supported event keys: membership application submitted, membership approved, membership activated, shortlisted, interview, offer accepted and employment verified.
- MPA should ordinarily reserve substantive employment-impact recognition for independently verified outcomes. Registration by itself cannot earn points. Values remain an MPA governance decision.

## Privacy, authorization and audit
- Referral codes are tied to active memberships. Schema supports suspension/revocation states.
- Referrers never receive private evidence, payment details, application documents, employer contacts or candidate contact information.
- Identity/progress disclosure is controlled by the referred user's optional status visibility consent.
- Employment verification is performed by MPA authority, not by the referrer. Verification references should point to an authorized private record or documented employer confirmation; do not store sensitive employment documents in referral metadata.
- Referral event history and score ledger are immutable. Attribution is protected against self-referral and duplicate membership/job attribution.
- Existing job hiring-team authorization and membership review/activation permissions are unchanged.

## API surface
- POST /api/v1/me/referrals/code — generate/retrieve the active member's code.
- GET /api/v1/me/referrals — member counts, consent-filtered details and score totals.
- GET /api/v1/admin/referrals — authorized referral review queue.
- POST /api/v1/admin/referrals/:id/verify-employment — independently verify a candidate-confirmed employment outcome.
- POST /api/v1/admin/referrals/scoring-policies — propose a scoring policy.
- POST /api/v1/admin/referrals/scoring-policies/:id/approve — different system administrator approves and optionally activates.
- Registration accepts optional referralCode and referralStatusConsent.
- Formal job application draft/submit accepts optional referralCode.

## Rollout boundaries
This change is source/schema work only. Apply migrations only through the approved deployment process after CI and disposable PostgreSQL migration checks pass. No production database change, deployment or PR merge is authorized by this implementation task. Full browser and role-matrix acceptance remains a required gate.
