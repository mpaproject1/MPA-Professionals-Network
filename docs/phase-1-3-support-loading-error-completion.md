# PR #18 — Phases 1–3 support, loading and error completion record

Branch: `feat/workstream-3-progress-members-workspace`

## Phase 1 — Support access and navigation

### Inventory and migration
- Manual route/source inventory identified a direct legacy `/contact` navigation in `web/app/members/page.tsx`; it has been replaced by the shared `SupportAction` button.
- Added the shared Support action to the profile role/access explanation, the route-level error boundary and the institutional 404 page.
- The only intended `/contact` route remaining is the compatibility redirect. The `/contact/privacy` legal/privacy route is intentionally preserved.
- `openSupport()` dispatches the established `mpa:open-support-contact` event. The single globally mounted SupportBot remains the only inquiry mechanism; no second inbox, API, contact table or duplicate inquiry workflow was added.
- The assistant now moves keyboard focus into its question field when opened and returns focus to its launcher when closed.
- Playwright coverage also verifies focus restoration after closing and confirms that a 403 response does not invent a required role or permission grantor.
- Added a repository-wide source regression test that detects direct navigation to the exact legacy `/contact` path outside the compatibility page. This test is authored but still needs execution; do not treat the automated inventory as passed until it runs.

## Phase 2 — Branded loading

- Root `web/app/loading.tsx` remains the global App Router fallback.
- Added nested route loading boundaries for Jobs, Mentorship, Serve-Community, Organizations, Membership, Admin, Notifications, Verification, Tracking, Members, Profile, Dashboard, Services, Recruitment, Network and Organization Directory.
- Updated `OperationStatus` so client-side data-loading states also use the branded P mark rather than a generic spinner. This is important because client-side API fetches do not trigger Next.js route loading boundaries.
- Reduced-motion behavior is supported by the loader CSS.
- Loading is scoped to route transitions or individual operations; no persistent global overlay is introduced.

## Phase 3 — Errors and empty states

- Preserved the existing API error contract: HTTP status, stable error code and request ID remain available to the web client.
- Existing status handling distinguishes 401, 403, 404, 409, 422, 429 and 5xx. Unsafe server messages are not displayed.
- Added the shared `EmptyState` to Saved Items, Verification Cases and Application Tracking. Each is guarded by a successful empty-result condition; failed requests retain their error and retry surfaces.
- Inspected the server authorization response: current 403 responses expose `FORBIDDEN` without an authoritative required-permission or grantor field. The client therefore does not invent a permission name or guess who can grant it. More specific permission guidance requires a deliberate server contract change and tests.
- No database/business schema change is required for these presentation and navigation changes.

## Regression coverage added

- Playwright: legacy `/contact` redirect opens the assistant and focuses the input.
- Playwright: 404 Support action is keyboard operable and focus moves into the assistant.
- Playwright: delayed Jobs API response exposes branded loading; reduced-motion preference disables the orbit animation; successful empty response remains distinct.
- Playwright: 503 response displays a safe generic message and request reference, does not expose internal server text, and does not render an empty-results message.
- Node test: recursive web-source scan for direct legacy support navigation.
- Node test: single SupportBot mount and established event/helper contract.
- Node test: shared empty states are guarded by successful empty-result conditions.
- Node test: branded operation and route-loading contracts.

## Validation status

- All changes were written to the existing PR #18 branch.
- The focused Node and Playwright tests are authored but **not executed yet** in this pass. Build, lint, TypeScript and browser acceptance therefore remain unverified.
- CI was not triggered because the workstream's agreed plan is to run the full CI suite at the final validation stage.
- Earlier Actions runner allocation failures (#560/#561) do not establish that the new tests pass or fail.

## Safety
- No auth, permission enforcement, membership lifecycle, organization privacy or API mutation behavior was weakened.
- No database schema/migration changes, production database changes or deployment.
