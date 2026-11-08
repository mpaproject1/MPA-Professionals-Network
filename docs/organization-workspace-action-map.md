# Organization workspace action map

This document maps the existing `/organizations` page actions to the reconstructed guided onboarding and role-aware workspace. The work is intentionally additive at the UI layer: existing API contracts, server-side authorization, evidence privacy and decision boundaries remain authoritative.

## User journeys

### Before approval: guided onboarding

| Stage / action | User destination | Existing operation | Guard / expected behavior |
|---|---|---|---|
| Start registration | `/organizations#org-registration` | `POST /api/v1/organizations` after identity and representative steps | Signed-in account; creates the organization record/draft only |
| Identity | Step 1 in the onboarding stepper | Local form state; submitted with the registration request | Legal name, display name and organization type required |
| Representative contact | Step 2 in the onboarding stepper | Existing registration request fields: email, phone, address | Institutional email required; no unsupported representative identity or fee fields are fabricated |
| Save and continue | Step 3 · Documents | Existing create-registration operation | A draft is not a verified organization |
| Upload private evidence | `/organizations#org-evidence` | `POST /api/v1/files/uploads`, authorized `PUT`, `POST /api/v1/files/uploads/:id/confirm`, then `POST /api/v1/organizations/:id/verification-evidence` | Owner/administrator only; PDF, PNG, JPEG or text; 10 MiB maximum; upload authorization and server checks remain in force |
| Review checklist | Step 4 · Review | Existing organization response: `required_evidence`, `missing_evidence`, `tracking_reference` | Submission remains disabled in the UI when the service reports missing required evidence; server remains final authority |
| Submit for verification | Step 4 · Review | `POST /api/v1/organizations/:id/submit-verification` | Owner/administrator; no resubmission while submitted/in review/pending; approval is not promised |
| Track status | `/organizations#your-organizations` and status summary | `GET /api/v1/organizations`, `GET /api/v1/me/organization-access` | Shows reference, status, submission time, reviewer feedback, missing evidence and next action |
| Retry access lookup | Access-check gate | Re-runs organization and access lookups | No registration/workspace actions are exposed until both lookups succeed |

Draft recovery is tied to the signed-in account email, expires after 24 hours, and is best-effort browser storage. It does not replace server persistence or store uploaded documents.

### After approval: operational workspace

| Workspace | Existing destination / operation | Access rule |
|---|---|---|
| Overview | `/organizations`; organization outcomes endpoint `GET /api/v1/organizations/:id/outcomes` | Outcome data is displayed only when returned by the authorized API; no placeholder totals |
| Opportunities | `/recruitment`, `/services`, `/mentorship` | Folder and action visibility follows the existing organization role allowlists |
| Applications | `/recruitment#candidate-pipeline`, `/organizations#org-inquiries` | Candidate review and public inquiry decisions remain distinct |
| Discover | `/network`, `/network-plus`, `/organizations/directory` | Existing access checks in each destination remain authoritative |
| Impact | `/organizations/reports` | Existing role and endpoint authorization remain authoritative |
| Organization | `/organizations/team`, `/organizations#org-registration`, `/organizations#org-evidence` | Owner/administrator-only folder and evidence controls; the current registration UI does not expose an edit-existing-legal-profile API |
| Connections | `/service-demand`, `/mentorship`, `/network` | Only existing workflows are linked; organization-scoped volunteer drives/skill dispatch are not represented as implemented |

The Overview dashboard is the landing view; its five role-filtered workspace destinations are Opportunities, Applications, Discover, Impact and Organization. The former Connections actions are preserved within Discover. The organization selector passes the selected organization context to supported destinations using the existing `organizationId` query parameter.

### Reviewers: separate decision workflow

| Action | Existing operation | Guard |
|---|---|---|
| Load verification queue | `GET /api/v1/review/organizations` | Only accounts whose `/api/v1/me` roles include `reviewer` or `system_admin` request the queue |
| Open private evidence | `GET /api/v1/files/:fileObjectId` | Private file authorization enforced by the server |
| Record verification decision | `POST /api/v1/review/organizations` | Reviewer authorization, conflict-of-interest and state rules remain server-enforced; a reason is required |
| Review public inquiries | `GET /api/v1/opportunity-inquiries?type=job` and `PATCH /api/v1/opportunity-inquiries/:id` | Authorized organization users only; a public inquiry is not a formal job application |

## Non-regression constraints

- Do not change API routes, request shapes, role codes or server authorization.
- Do not expose owner/admin controls to recruiter, read-only, finance or event roles.
- Do not allow a pending case to be resubmitted.
- Do not equate account email verification with organization verification.
- Do not expose private evidence through public URLs.
- Do not invent TIN, representative-name/position or verification-fee collection fields when the current registration API does not persist them.
- Do not show invented recruitment metrics when the outcomes endpoint fails or denies access.
- Preserve the legacy workspace redirect, organization switcher, public inquiry decision form and reviewer decision queue.
