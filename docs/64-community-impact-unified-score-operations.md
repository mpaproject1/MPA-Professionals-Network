# Increment 5 — Unified Community Impact Score: operations and validation

**Repository:** `mpaproject1/MPA-Professionals-Network`  
**Branch:** `feat/workstream-3-progress-members-workspace`  
**Master design:** `docs/62-community-impact-and-recognition-design.md`

## Operating model

1. A source workflow reaches its authoritative completed/verified state.
2. A claimant has a corresponding Community Impact claim that has been verified by an assigned reviewer.
3. A reviewer creates an approved assessment with evidence references and all five policy-defined dimension ratings. Elevated/high-risk assessments must pass independent second review.
4. An authorized score operator links the claim to its exact authoritative source record. The adapter rechecks source lifecycle and contributor identity.
5. The operator calculates the score under the active immutable policy version.
6. The ledger records the award and a human-readable calculation snapshot. A duplicate request returns the existing award rather than issuing points again.
7. Source invalidation, corrected evidence or a new policy requires an explicit reversal/recalculation. Existing ledger rows are never edited or deleted.

## Source adapter contract

- Serve-Community participation: candidate ID from the detection queue; contributor must match and be confirmed.
- Offline completed project: candidate ID; the named contributor must have a verified attribution and explicit confirmation.
- Mentorship: completed session ID; session coordination accepted; claimant is the mentor.
- Professional/pro-bono service: service request ID; provider completion and requester acceptance; payment success required for paid engagements.
- Employment referral: referral attribution ID in `employment_verified`; claimant must be the referrer, not the referred candidate.
- Network-Plus collaboration: completed request ID, intent `collaboration_request`, accepted participant consent.
- Network-Plus partnership: completed request ID, intent `partnership_proposal`, accepted participant consent.
- Approved historical contribution: verified claim of type `other`; its review and evidence are the source assurance. It does not accept a fabricated external source reference.

Source adapters reject stale/reversed/disputed/unconfirmed sources. The source link is immutable and unique per claim and source/contributor pair.

## Policy administration

The initial plan baseline was first seeded as version 1. Operational version 3 is active for private evaluation, preserves the same five weights and adds configurable evidence-quality ranks, outcome-maturity ranks, rating steps, reviewer criteria, modifiers and decay rules. Public publication remains disabled. Administrators may propose a new JSON policy version. The API validates:

- exactly the five approved dimensions;
- weights total exactly 100%;
- valid rating ranges and base-point configuration;
- role factors and eligible source types;
- explicit publication settings, consent requirement and minimum group size of at least five.

A proposer cannot approve or activate their own version. Approval requires a reference and rationale. Activation is separate. Public publication can only be enabled by activating a separately approved version whose publication policy requires consent and the privacy group threshold. Existing ledger entries remain tied to the policy version used at calculation time.

## Calculation contract

For each dimension, the reviewer rating is normalized to the policy's configured rating range and multiplied by the policy weight. The weighted result is multiplied by policy-configured base points, role factor and attribution share. Policy-configured category/source/period caps, diminishing returns, conditional modifiers and source-age decay rules are applied. The service rejects missing ratings, unknown roles, unverified source states, insufficient evidence, unsupported outcomes, or missing policy configuration.

The initial baseline does not embed its weights in application code. The member UI shows the active dimension weights and the ledger explanations show each dimension's rating, weight, weighted contribution, role, share, policy version and final points.

## API reference

| Operation | Endpoint |
|---|---|
| My private score | `GET /api/v1/me/community-impact/score` |
| Active methodology | `GET /api/v1/me/community-impact/score/policy` |
| List/propose policy | `GET/POST /api/v1/admin/community-impact/score/policies` |
| Approve / activate | `POST /api/v1/admin/community-impact/score/policies/:id/approve`, `.../:id/activate` |
| Link verified source | `POST /api/v1/admin/community-impact/score/claims/:id/source-link` |
| Calculate / recalculate | `POST /api/v1/admin/community-impact/score/claims/:id/calculate`, `.../:id/recalculate` |
| Restricted ledger | `GET /api/v1/admin/community-impact/score/ledger` |
| Recalculation history | `GET /api/v1/admin/community-impact/score/recalculations` |
| Reverse an award | `POST /api/v1/admin/community-impact/score/ledger/:id/reverse` |

## UI

- Member: `/community-impact/score` — private score, policy dimensions, award explanations and compensating reversal history.
- Administrator: `/admin/community-impact/scoring` — policy versioning, source reconciliation, calculation, reversal and restricted ledger/recalculation history.
- Reviewer dimension ratings are entered in the existing Community Impact governance assessment flow and derive rating ranges from the active policy endpoint.

Each reviewer assessment stores the exact score policy version used for its five ratings. An explicit recalculation may apply a newer active policy to a prior assessment only when all five ratings remain valid under the new policy's ranges and thresholds; incompatible ratings fail closed and require a new evidence-backed assessment. Legacy assessments without a policy binding remain traceable as legacy records.

## Database migrations

- `20261101110000_community_impact_unified_score.sql`
- `20261101120000_community_impact_score_source_adapters.sql`
- `20261101130000_community_impact_score_history_guards.sql`
- `20261101140000_community_impact_score_policy_transition_guard.sql`
- `20261101150000_community_impact_score_single_reversal.sql`
- `20261101160000_community_impact_score_policy_rubric_config.sql`
- `20261101170000_community_impact_assessment_score_policy.sql`
- `20261101180000_community_impact_score_modifiers_and_rubrics.sql`
- `20261101190000_community_impact_score_effective_date_guard.sql`

The migration runner verifies the active evaluation-only policy v3, the exact five weights, policy thresholds, source-link uniqueness, one-reversal constraint, append-only triggers, assessment policy binding and complete rollback of the score schema changes.

## Commands

```sh
npm run test:community-impact
npm test
npm run web:build
npm run check:migrations:rollback
```

The rollback command requires the exact disposable PostgreSQL database name and explicit `MIGRATION_CHECK_ALLOW_ROLLBACK=YES`; it refuses production/live database names. Do not provide production credentials.

## Remaining acceptance evidence

Source-contract tests and authorization tests are included, but have not been executed in this delivery. Runtime PostgreSQL source-adapter, concurrent duplicate prevention, reversal/recalculation reconciliation, private member visibility, full build and CI evidence must be recorded before Increment 5 is marked accepted. No test result is inferred from a committed test file.

No production migration, deployment, public score publication, permission assignment, branch change, merge, force-push or destructive data operation is part of this increment.
