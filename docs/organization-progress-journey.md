# Organization workspace — progress-based journey

**Branch:** `feat/workstream-3-progress-members-workspace`  
**Purpose:** make the organization workspace explain current server-confirmed progress and the next safe action, without manufacturing completion states or bypassing authorization.

## Journey model

1. **Register** — an authenticated account creates an organization registration draft. Registration is not verification and does not unlock publishing.
2. **Prepare verification evidence** — the organization uploads supported private evidence through the existing upload authorization, confirmation, and evidence-attachment endpoints.
3. **Submit / await review** — only the server's current case state determines whether the case is awaiting review. The UI must not invite resubmission while a case is awaiting review.
4. **Correct or review the decision** — when the server returns a correction-required state, show the recorded decision reason and missing-evidence checklist when present. A rejected/not-approved case is not represented as complete.
5. **Manage approved work** — only when the server reports verified/approved status, link to the existing recruitment and organization-scoped workflows. This is eligibility to use those workflows, not proof that a vacancy is published or recruitment is complete.
6. **Review outcomes** — use the existing organization outcome report, which must continue to display only server-returned authorized data. Do not infer counts or invent service/volunteer impact metrics.

## UI contract

- The organization entry reads `GET /api/v1/organizations` with the signed-in user's token for active organization memberships and current verification state. It does not accept organization IDs from the URL as authority and does not make client-side permission decisions.
- It also reads `GET /api/v1/me/organization-access`, a minimal account-scoped relationship index, to distinguish a genuinely unregistered account from a suspended or removed organization membership. This index contains no organization contact details, address, private evidence, reviewer notes or roster.
- Each organization is shown separately with its display name, tracking reference when returned, verification status, case status, and a state-specific next action.
- Loading, empty, and request-error states are distinct. A failed request is never shown as “no organizations,” “verified,” or zero activity.
- Status labels derive from server-returned fields. Unknown states remain non-complete and direct the user to inspect the existing verification workflow.
- Evidence and reviewer-only data remain behind existing API authorization. The progress component does not fetch private evidence, applicant records, or reviewer queues.
- Recruitment, mentorship, Serve-Community, and reports remain their existing task-specific destinations. The progress panel must not mark these stages complete until their own persisted service state is available.
- Keep the registration and evidence forms, their private upload protocol, the review queue's role checks, and existing organization workspace hub intact.

## Regression acceptance matrix

| Scenario | Expected UI behavior |
|---|---|
| Signed out | No private organization status is requested; benefits and sign-in guidance remain visible. |
| Authenticated account with no prior relationship | Explicit “Register organization” next action; no approval or activity is implied. |
| Suspended or removed organization relationship | Explain that access is inactive; do not misclassify the account as unregistered or offer duplicate registration. |
| Organization access lookup fails | Retry state; do not infer an empty account or offer registration until both access views resolve. |
| Draft/unverified organization | Verification/evidence next action; publishing is not described as available. |
| Submitted/pending case | “Awaiting review”; no claim of approval and no instruction to resubmit while pending. |
| Correction required | Display recorded reviewer reason when present and link to the evidence checklist. |
| Rejected/not approved | Explicit not-approved state; never style it as completed/verified. |
| Verified/approved | Show eligibility to open existing recruitment workflow; do not claim any vacancy or report stage is complete. |
| API failure or non-array response | Error/retry state; do not misrepresent failure as an empty organization list. |
| Multiple organizations | Separate progress cards keyed by organization ID; no merging of statuses across organizations. |
| Private evidence / reviewer queue | Existing upload and reviewer paths remain unchanged; the journey does not expose evidence contents or reviewer-only records. |

## Validation still required

Run the branch's normal CI after implementation, including TypeScript, lint/format, production build, browser acceptance, and backend authorization/privacy tests. Browser acceptance should cover the matrix above with authenticated fixtures and mocked server responses; backend tests must continue to prove organization scoping. Source edits alone do not prove these checks passed. No production deployment or database mutation is part of this change.
