# P2 UX acceptance and final-stage validation

This change is intentionally separate from the CORS documentation/test PR. It builds on the P0/P1 navigation and role-journey branch and does not merge or deploy anything.

## Evidence-based implementation notes

- Service-demand private intake supports an explicit opt-in session draft. It is held in the current browser tab for up to 24 hours, never auto-submitted, and the UI warns against enabling it on shared devices. Successful submission clears the draft; recoverable errors keep the form values.
- Demand-interest, service-request, mentorship-request, service-provider save and selected membership actions have synchronous in-flight guards in addition to the existing disabled/busy UI states.
- Membership payment idempotency keys are retained in session storage per application so a refresh or uncertain network response reuses the same retry key. The server already validates idempotency keys; it remains authoritative.
- Membership application confirmation surfaces the backend tracking reference when returned. Service-request confirmation exposes a support reference from the returned record and distinguishes an already-existing active request.
- The server already deduplicates active service requests and upserts one interest row per user/topic. Those lifecycle rules are reused, not replaced.
- Membership administration remains guarded by server API role/permission checks. The UI route check is not treated as authorization.

## Required final-stage manual/browser acceptance

- [ ] Desktop, tablet and mobile viewport pass for /services, /service-demand, /mentorship, /membership and /admin/membership.
- [ ] Keyboard-only navigation reaches every link, form field, toggle and action; focus remains visible; labels and errors are announced by assistive technology.
- [ ] Private-demand draft opt-in survives refresh in the same tab, expires after 24 hours, clears after successful submit, and is not saved when opt-in is off.
- [ ] Simulate recoverable API/validation failures and confirm typed values remain present.
- [ ] Double-click/rapid-submit each create/transition action and verify one persisted outcome; inspect audit/status history rather than relying on the button state.
- [ ] Confirm request references and next actions after service, mentorship and membership submissions; retry after an uncertain network response and verify no duplicate record.
- [ ] Verify loading, empty, failed-load and permission-denied states separately. A failed API load must never be interpreted as an empty list.
- [ ] Exercise role accounts: public visitor, non-member, active member, service provider, mentor, organization owner, organization staff, reviewer, finance officer and system administrator.
- [ ] For each role, test direct route URLs and direct API calls, including access to unrelated organizations and private application evidence.
- [ ] Run the environment-backed Playwright suite in e2e/p2-role-journeys.spec.js only when MPA_E2E_ROLE_JOURNEYS=1 and dedicated non-production role accounts are configured.
- [ ] For the three rapid-submit mutation journeys (private demand, service request, mentorship request), also set MPA_E2E_ALLOW_MUTATIONS=1, use a dedicated active-member test account, and seed at least one published/approved service listing. These tests create records and must never run against production.
- [ ] Only after manual acceptance, run the full final test/CI stage. No tests or CI have been run for this change.

## Test-account environment variables

Set MPA_E2E_<ROLE>_EMAIL and MPA_E2E_<ROLE>_PASSWORD for each configured role, replacing <ROLE> with NON_MEMBER, ACTIVE_MEMBER, SERVICE_PROVIDER, MENTOR, ORG_OWNER, ORG_STAFF, REVIEWER, FINANCE or ADMIN. Use isolated test identities with no production data. Admin credentials subject to mandatory passkey enrollment need a dedicated browser-test policy/account before this suite can be considered executable.
