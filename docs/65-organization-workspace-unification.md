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

The folder shelf uses accessible tabs and a shared selected-folder panel. Each action opens the existing focused workflow. The original organization team and permission page is preserved at `/organizations/team`; the old `/organizations/workspace` path is now a compatibility redirect.

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

The overview summary counts are derived from the authenticated account's returned organization records: linked organizations, verified organizations, awaiting-review cases and correction-required cases. No illustrative recruitment counts, opportunity views, pipeline charts or impact figures are presented as production data. Detailed reports remain the source for authorized outcomes.

## Authorization and privacy

- The folder shelf is navigation, not an authorization boundary. Existing server routes and service functions remain authoritative.
- `listMyOrganizations` continues to expose active memberships only.
- `listMyOrganizationAccess` is a minimal account relationship index; it does not return email, phone, address, evidence, roster or reviewer-only information.
- Organization role assignments remain scoped to the organization. Multiple organizations remain separate records; the team workspace retains its organization selector.
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
