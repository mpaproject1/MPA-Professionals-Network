# Organization workspace — unified app experience

**Branch:** `feat/workstream-3-progress-members-workspace`  
**Canonical entry:** `/organizations`  
**Compatibility route:** `/organizations/workspace` → redirect to `/organizations`

## Product structure

The organization experience is one registration-first app entry with six functional folders. The folders are navigation categories over existing MPA capabilities; they do not create duplicate business modules or APIs.

| Folder | Existing destinations | Existing capability |
|---|---|---|
| Publishing | `/recruitment`, `/services`, `/mentorship` | Jobs/requisitions, professional-service listings and mentorship offers |
| Reviewing | `/recruitment#candidate-pipeline`, `/organizations#org-inquiries` | Candidate lifecycle, interviews, offers and public inquiry intake |
| Exploring | `/network`, `/network-plus`, `/organizations/directory` | Professional network, opted-in organization discovery and public organization directory |
| Reports | `/organizations/reports` | Organization-scoped recruitment and requisition outcomes |
| Organization | `/organizations/team`, `/organizations#org-registration`, `/organizations#org-evidence` | Team roles, profile registration, private verification evidence and status |
| Connections | `/service-demand`, `/mentorship`, `/network` | Community needs, mentorship and professional connections |

The folder shelf uses accessible tabs and a shared selected-folder panel. Publishing presents one Job / Professional service / Mentorship type selector; Reviewing presents one Candidate pipeline / Public inquiries selector. These selectors route into the existing type-specific forms and review workflows, preserving their validation and lifecycle rules rather than duplicating them in a new form implementation. Other folders use the same focused action-panel pattern. When an account has multiple verified organizations, the dashboard selector scopes the selected folder's links to that organization; recruitment, reports and team administration accept the selected `organizationId` query as an initial selection while retaining the user's ability to change it in the destination page. Folder visibility is recalculated for the selected organization's role rather than unioning permissions across organizations. The original organization team and permission page is preserved at `/organizations/team`; the old `/organizations/workspace` path is now a query-preserving compatibility redirect.

## Registration and access gate

The UI resolves two server-backed views before offering registration or operational workspace actions:

- `GET /api/v1/organizations` returns the authenticated account's active organization memberships and the registration/verification fields permitted for that role.
- `GET /api/v1/me/organization-access` returns a minimal relationship index, including active, suspended and removed memberships. It intentionally omits organization contact details, addresses, private evidence and reviewer notes.

The second endpoint prevents a suspended or removed organization member from being misclassified as an unregistered user and encouraged to create a duplicate registration. If either access lookup fails or returns an unexpected shape, the UI shows a retry state rather than a registration CTA.

### State behavior

| Server state | Organization entry behavior |
|---|---|
| No prior relationship and no active organization | Show short MPA benefits and the single registration CTA |
| Active draft / unverified organization | Show the application and evidence next action; do not expose operational folders |
| Submitted / pending verification | Show awaiting-review status; do not invite resubmission |
| Correction required | Show recorded reviewer feedback and outstanding evidence when returned |
| Rejected | Show not-approved state; do not style as completed |
| At least one active verified organization | Show the dashboard and folder tabs; existing APIs continue enforcing the selected organization's role and scope |
| Suspended / removed relationship without active membership | Show access unavailable and a support/organization-owner next step; do not offer new registration |
| Access lookup failure | Show a retry state; do not infer an empty account |

Verification remains a server decision. A completed profile, folder visit or progress indicator cannot grant verified status.

## Dashboard data integrity

The overview registration counts are derived from the authenticated account's returned organization records: linked organizations, verified organizations, awaiting-review cases and correction-required/rejected cases. For the selected verified organization, the dashboard also calls `GET /api/v1/organizations/:id/outcomes` and displays server-returned aggregate published-job, application, active-pipeline and hire totals. Applicant identities are not loaded into the dashboard. If the endpoint is unavailable or denied, no placeholder figures are displayed. The current outcomes API does not provide equivalent organization-scoped aggregate counts for service and mentorship activity, so those figures are not fabricated; detailed reports remain the source for authorized outcomes.

## Authorization and privacy

- The folder shelf is navigation, not an authorization boundary. Existing server routes and service functions remain authoritative.
- `listMyOrganizations` continues to expose active memberships only.
- `listMyOrganizationAccess` is a minimal account relationship index; it does not return email, phone, address, evidence, roster or reviewer-only information.
- Organization role assignments remain scoped to the organization. Multiple organizations remain separate records; the dashboard, recruitment, reporting and team workspaces provide organization selection without treating membership in one organization as authority over another.
- Folder visibility uses the existing organization role vocabulary: publishing is limited to owner/administrator/recruiter/project-manager, reviewing to owner/administrator/recruiter, and team administration to owner/administrator. Read-only, event-manager and finance roles retain only the general discovery, organization outcome-report and connection destinations currently supported by their server-side access. Existing API/service authorization remains authoritative even when a folder is visible.
- Verification evidence upload and submission controls are shown only to active owners/administrators. The UI does not offer an action that the existing API will reject for recruiter, project-manager or read-only members.
- Candidate, evidence, report and service/mentorship data continue to use their existing role and organization-scope checks.
- No database migration, data rewrite, role grant or deployment is part of this UI consolidation.

## Browser and backend acceptance

The organization workspace browser suite covers:
- authenticated account with no organization;
- inactive/suspended prior membership;
- pending verification;
- verified organization and all six keyboard-accessible folder tabs;
- mobile viewport overflow;
- compatibility redirect;
- preservation of the focused team and permission destination.

The PostgreSQL membership regression verifies that a suspended membership disappears from the active organization list while remaining visible in the minimal access index, without returning private organization contact fields. CI includes this browser spec alongside the existing workspace acceptance suite.
