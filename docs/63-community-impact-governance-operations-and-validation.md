# Community Impact governance operations and validation

**Target repository:** `mpaproject1/MPA-Professionals-Network`  
**Target branch:** `feat/workstream-3-progress-members-workspace`  
**Scope:** Member identity assurance, administrator governance UI, individual offline-project attribution, reviewer independence, assessment, and disposable migration rollback rehearsal.

## 1. Implemented user experiences

### Member identity assurance

Route: `/community-impact/identity-assurance`

The signed-in navigation exposes this route under the additional destinations menu. The page:

- Creates an identity-assurance case using the authenticated account; it does not create a membership record or confer membership.
- Collects legal name, identity-document country and assurance level.
- Uploads supported private evidence through the existing private-file upload protocol (PDF, PNG, JPEG or plain text; maximum 10 MiB).
- Attaches evidence to the identity case and submits the case only after evidence exists.
- Shows case status and prevents duplicate open-case submission through backend constraints.
- Lets a named contributor confirm an offline attribution using its reference and a written confirmation note.

Identity evidence is private. A non-owner reviewer can read it only when they hold `community_impact.identity.review` and the case remains submitted/under review. Public profile and membership status are not changed by identity assurance.

### Administrator governance

Route: `/admin/community-impact/governance`

The administrator workspace exposes the route only to accounts with relevant Community Impact governance permissions (or system administrator role). The server remains the authority for every action.

The page provides:

1. **Identity assurance queue** — evidence review and verified / clarification / declined decisions. The claimant is excluded from the decision action.
2. **Offline attribution** — evidence-backed individual contributor proposals; contributor account, contribution role, attribution share and rationale; contributor confirmation gate; reviewer assignment; reviewer verification or decline.
3. **Detection policies** — versioned JSON rule proposals, independent approval with an approval reference, and separate activation. The policy proposer cannot approve or activate their own version.
4. **Reviewer conflicts and assessments** — conflict declarations for assigned reviewers, source reconciliation against an exact candidate, evidence-referenced assessment with category/type/role, evidence quality, outcome maturity, attribution share and risk level, plus a separate second-review action for elevated/high-risk cases.
5. **Retention evaluation** — due-date evaluation only. The UI explicitly states that it does not delete, anonymize, restrict or purge records.

The existing claim-review and retention-policy screens remain in place. This new governance screen complements rather than replaces them.

## 2. Authorization and privacy boundaries

- UI visibility is a convenience only; each API operation checks its own permission.
- Non-member identity assurance is independent of membership approval and payment.
- Offline contributor proposals require private evidence and the contributor's own identity assurance when the contributor is not an active member.
- A contributor must confirm their attribution before a reviewer can be assigned.
- The attribution reviewer must be distinct from the proposer and contributor.
- Claim reconciliation is exact and reviewer-controlled; fuzzy or cross-person matching is rejected.
- Conflict declaration is recorded in append-only governance history. Database triggers block conflicted reviewer assignment and decisions.
- Assessment evidence references must belong to the claim. Elevated/high-risk assessments require a second reviewer who is not the claimant, original reviewer, conflicted, or affiliated with the named organization.
- Assessment proposals do not issue global score points or mutate authoritative initiative/project records.
- Private identity and attribution evidence access remains permission-scoped and audited.

## 3. Disposable PostgreSQL migration/rollback rehearsal

The focused migration compatibility runner is `scripts/check-new-migration-compatibility.js`, invoked by:

```sh
npm run check:migrations:rollback
```

It now includes `20261101090000_community_impact_governance_completion.sql` and checks:

- All 13 new governance tables are created inside a transaction.
- The 11 expected conflict, immutability, activation and lifecycle triggers exist.
- Claim reconciliation has one-claim uniqueness without preventing multiple distinct contributors from being associated with one offline project.
- The new governance permissions are registered.
- The transaction is rolled back.
- All 13 governance tables and 11 associated triggers are absent after rollback.

The runner requires `DATABASE_URL`, `MIGRATION_CHECK_EXPECTED_DATABASE`, and `MIGRATION_CHECK_ALLOW_ROLLBACK=YES`. It refuses database names that look like production/live and requires the connected database name to exactly match the explicitly supplied disposable database name and include a test/sandbox/CI/verify marker.

**Important:** this is a rollback-only transactional rehearsal, not a production migration and not a destructive down-migration. It must run against a disposable PostgreSQL database that has the baseline schema required by the runner. No production URL or production database is acceptable.

## 4. Automated test commands

Focused source-contract and UI contract tests:

```sh
npm run test:community-impact
```

Full suite:

```sh
npm test
npm run web:build
```

Migration rehearsal:

```sh
npm run check:migrations:rollback
```

The new UI contract test covers member identity assurance, private upload integration, contributor confirmation, administrator operations, independent approval, reviewer eligibility checks and rollback inventory assertions. A database-backed authorization test now exercises the service permission gates for identity review, attribution, detection policy, reconciliation, conflict, assessment, second review and retention operations. The existing private-file integration suite continues to exercise owner/reviewer-scoped file access; the new source-contract test additionally checks the identity/offline-attribution reviewer scopes.

## 5. Validation status and acceptance gate

The source changes and focused test definitions are committed on the target branch. A test definition is not a test result.

Before marking the increment fully accepted, record evidence for all of the following:

- [ ] `npm run test:community-impact` passes.
- [ ] `npm test` passes.
- [ ] `npm run web:build` passes with strict TypeScript checking.
- [ ] Disposable PostgreSQL rehearsal passes against a named disposable database; capture migration and rollback output.
- [ ] Run the database-backed authorization test and capture a passing result for unprivileged access denial.
- [ ] Add/run a database-backed concurrent attribution test proving two simultaneous proposals cannot allocate more than 100% of one candidate's share. The service currently serializes proposals by locking the candidate row before summing committed/pending shares; a static contract assertion covers this ordering.
- [ ] Run private-file integration tests and add a dedicated runtime case for identity-assurance and offline-attribution reviewer access (the generic private-file isolation test and new source-contract checks are not a substitute for this targeted case).
- [ ] Manual UI walkthrough confirms responsive layout, empty/error/loading states, evidence upload, contributor confirmation, independent review and audit trail.
- [ ] CI results are checked on the target branch after the final commit.

No production migration, deployment, data deletion, anonymization, backup purge, branch change, merge, or force-push is authorized by this plan.
