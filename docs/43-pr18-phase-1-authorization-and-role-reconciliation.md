# PR #18 — Phase 1: Authorization and Role Reconciliation

## Scope and safety contract

This phase is implemented on \`feat/workstream-3-progress-members-workspace\`. It changes authorization boundaries and role-based workspace discovery only. It does not change membership/payment lifecycle state machines, payment records, migrations, production configuration, or deployment.

The server remains the authority. Navigation visibility is a usability aid and must never be treated as access control.

## Permission separation

Membership decisions and finance operations are distinct capabilities:

| Capability | Roles | Explicit permission | Not granted by |
| --- | --- | --- | --- |
| Review membership application | \`reviewer\`, \`membership_reviewer\`, \`system_admin\` | \`membership.review\` | \`finance_officer\`, \`finance.manage\` |
| Activate membership application | \`reviewer\`, \`membership_reviewer\`, \`system_admin\` | \`membership.activate\` | \`finance_officer\`, \`finance.manage\` |
| Verify payment | \`finance_officer\`, \`system_admin\` | \`finance.payment.verify\` or legacy \`finance.manage\` | membership reviewer role alone |
| Reverse payment | \`finance_officer\`, \`system_admin\` | \`finance.payment.reverse\` or legacy \`finance.manage\` | membership reviewer role alone |

The legacy \`finance.manage\` permission remains limited to payment verification/reversal routes. It is not accepted by membership review, activation, or membership review-queue routes. A payment verification event must not activate a membership; the existing activation workflow remains a separate action.

## Recruitment report scope

The \`job-application-funnel\` catalogue entry remains available to recruiters and project managers, but its query now requires the authenticated account to have an active organization membership with the relevant organization-level role or an active job-team assignment for that job.

- Recruiter organization membership: \`organization_membership.role_code = recruiter\`.
- Project manager organization membership: \`organization_membership.role_code = project_manager\`.
- Job-team scope: active \`job_team_member\` assignment with recruiter or hiring-manager role.
- Platform operations roles retain the pre-existing platform aggregate view.
- The query uses the authenticated identity supplied to \`runReport\`; no caller-supplied organization or user filter is trusted.

The report contains workflow aggregates only. It does not expose applicant identities, contact details, cover letters, or private profile snapshots.

## Frontend role reconciliation

The admin workspace now resolves roles and explicit permissions from the authenticated \`/api/v1/me\` response instead of relying on stale token claims. Navigation discovery is filtered by the current role/permission set:

- Finance users are offered Reports, not membership decision controls.
- Membership reviewers are offered membership operations and permitted reports.
- Recruiters and project managers can discover reports, with the server enforcing their actual organization/job scope.
- Support and review roles retain only their operationally relevant workspace links.
- Platform administrators retain the full administration navigation.

Direct URL access and every mutation still require backend authorization. Hiding a link does not replace API checks.

## Regression coverage added

- Static authorization contract verifies finance roles are absent from membership review and activation authorization.
- Static contract verifies payment verification and reversal retain finance-specific permissions.
- Static report contract verifies the authenticated identity is passed into report row retrieval and both organization and job-team scope predicates exist.
- PostgreSQL integration test creates two organizations, assigns a recruiter to one and a project manager to the other, and asserts each report contains only its authorized organization's vacancy.

## Verification status

The source and regression test changes are committed to the feature branch. The PostgreSQL integration test requires the disposable database used by PR Quality. No local database/browser test execution or CI result is claimed in this document. Phase 1 is not ready to be declared complete until syntax checks, targeted tests, the full PR quality workflow, and final branch-head review pass.
