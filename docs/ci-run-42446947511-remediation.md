# CI run 42446947511 — failure analysis and remediation

Run: https://github.com/mpaproject1/MPA-Professionals-Network/actions/runs/42446947511  
Tested revision: `5711cc5addbfa1add1bb5dbcc113423c5c1910b1`  
Branch: `feat/workstream-3-progress-members-workspace`

## Findings

- Production build and the standalone TypeScript job both found the same strict type error in `web/app/membership/workspace.tsx`: a card's optional `memberName` could assign `undefined` to the required string `displayName`.
- Backend migrations and the separate legacy-schema upgrade completed successfully. Backend tests then exposed a missing import in `src/membership/service.js`: `getMe` interpolated the shared eligibility SQL helpers without importing them. This caused multiple downstream membership, profile, registration and authorization tests to fail.
- The geography integration test replaced the same member's single residence record with a city residence before asserting that the prior regional residence was still counted. The assertion was moved to immediately after the regional residence is saved.
- Several source-contract tests still asserted obsolete UI copy or old navigation restrictions after the five-step organization stepper, mobile hub and Serve-Community professional-services destination were implemented. Their assertions now target the current implemented structure and preserve checks for the actual workflow boundaries.
- The referral test expected a literal membership-type branch that the component does not need: membership counts are explicitly aggregated by type and non-employment rows are labelled as membership referrals. The test now verifies those actual separate aggregates and labels.
- The PWA test expected a heading to be one contiguous source string even though JSX deliberately splits it across a line break.
- Biome reported three parser errors in `e2e/members-responsive.spec.js` caused by an accidentally literal `\\n` sequence and an over-escaped slash regex, plus seven import-order diagnostics.

## Remediation applied

- Imported `membershipIsCurrentlyActiveSql` and `legacyMembershipPaymentVerificationRequiredSql` from the shared `eligibility.js` module.
- Kept `displayName` strictly typed by applying the optional card name only when it exists.
- Repaired the responsive Playwright spec syntax without removing its nine-destination and viewport assertions.
- Corrected the geography test ordering to match the one-current-residence-per-member data model.
- Updated stale UI/source assertions to verify the current organization stepper, Serve-Community services destination, mobile headline, and referral separation.
- Reordered the seven imports flagged by Biome.

No workflow gate, lint rule, test, authorization check, or migration safeguard was disabled or relaxed. The original run did not reach browser acceptance because its build and backend prerequisites failed.

## Validation status

The original run is a historical result for the tested SHA above. The remediation commits are on the same branch. A new CI run against the final remediation head is required before declaring the build, type-check, backend suite, lint or browser acceptance green.
