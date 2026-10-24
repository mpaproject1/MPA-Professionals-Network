# P2 UX acceptance checklist

- [ ] Check the home and About pages plus services, private demand, mentorship and membership at desktop, tablet and mobile widths.
- [ ] Verify keyboard access, visible focus, labels, errors and reduced-motion behavior.
- [ ] Test loading, empty, failed-load, retry and permission-denied states separately.
- [ ] Confirm private demand drafts are opt-in, scoped to the current browser tab/session, expire after 24 hours and never submit automatically.
- [ ] Confirm successful submission clears the draft while recoverable errors preserve entered values.
- [ ] Test public visitor, non-member, active member, provider, mentor, organization owner/staff, reviewer, finance and administrator journeys.
- [ ] Test direct route/API authorization and unrelated organization/private file access.
- [ ] Rapid-submit create and transition actions; inspect persisted records and status history.
- [ ] Retry uncertain responses and verify idempotency and retained input.
- [ ] Run the opt-in Playwright suite only with dedicated non-production test identities and its explicit environment flags. Never run mutation journeys against live user data.
- [ ] Run full CI on the reconciled branch, inspect every failure, and do not weaken tests to obtain a pass.
- [ ] Do not merge or deploy until CI and manual acceptance evidence are recorded.
