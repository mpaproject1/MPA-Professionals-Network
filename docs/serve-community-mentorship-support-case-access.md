# Serve-Community and Mentorship: Support Case Access Contract

## Purpose

Provide authorized MPA Support Desk staff with full, case-specific participant context when investigating a service request, individual mentorship relationship, or organization mentorship programme request. This is not a general participant directory.

## Access boundary

Only users with the persisted `supporting_staff` or `system_admin` role may use the Support Desk case index or open a restricted case record. The server checks the persisted role on every request; frontend visibility is not an authorization control.

Opening a case requires a reason between 8 and 500 characters. The access and reason are recorded in `audit_log` as `support.case_detail_accessed`, with the case resource type, case reference, actor, request ID and participant account IDs. Searching the index is separately recorded as `support.case_search`.

## Supported case types

- **Service request:** requester and provider accounts, service listing context, request details, agreements, operational updates, delivery evidence, feedback and status events.
- **Individual mentorship relationship:** mentor and mentee accounts, original request and match consent, sessions, schedule-change proposals, goals, events, feedback and participant reports.
- **Organization mentorship request:** requester account, the relevant organization, and only its active owner, administrator and project-manager accounts; includes the offer and request record plus case-related audit events.

The case index contains only case references, status, names and relevant service/organization labels. It does not return participant email or phone fields. Full contact and professional information is returned only by the explicit case-access operation.

## Provider and mentor privacy

Provider and mentor workflow APIs remain scoped to their operational role. They do not return participant email or phone contact details. Organization mentorship request views do not expose requester email or phone. Provider impact reports remain aggregate and identity-free; participant IDs, email addresses and phone numbers are not part of provider report payloads.

Do not copy contact details from the restricted Support Desk case view into provider reports, public announcements or other participants' workspaces.

## API

- `GET /api/v1/admin/service-mentorship-cases?type=all|service|mentorship|organization_mentorship&status=&q=&limit=&offset=`
  - Support-role-only, paginated case index.
  - Search supports case reference, case title/programme, participant name and organization name.
  - Returns no email or phone contact fields.
- `POST /api/v1/admin/service-mentorship-cases/:type/:caseId/access`
  - Support-role-only, case-specific detail access.
  - JSON body: `{"reason":"A case-specific reason of at least eight characters"}`.
  - Returns the selected case, its participants and its workflow history after writing the access audit record.

## Mentorship member journey

The member workspace presents six persisted workflow stages:

1. Discover approved mentors and verified organization programmes.
2. Express interest and submit a request with explicit sharing consent.
3. Wait for authorized matching-team review.
4. Require mentor and mentee acceptance of the same proposal before activation.
5. Confirm sessions, schedule changes and shared progress goals.
6. Collect session feedback and record relationship outcomes before closure.

The progress indicator must not treat a request as a match, a proposed session as confirmed, or an active relationship as completed. Feedback history is loaded from the existing mentorship detail endpoint and shown with the participant's session and goal history.

## Validation

The PostgreSQL integration test `test/p1/service-mentorship-support-case-access.integration.test.js` covers support-role enforcement, mandatory access reasons, case scoping, service and individual/organization mentorship participant details, audit records, and absence of contact details from provider/mentor workflow responses and provider impact reports.

No schema migration is required for this access contract; access events use the existing audit log.
