# PR #18 — Phases 1–3 implementation record

Branch: `feat/workstream-3-progress-members-workspace`

## Audit baseline

Audited against branch head `73bc8e2b438850c5c639458bd67b6c4416691e26` on 2026-10-30.

- The application shell already mounts one global `SupportBot`.
- The assistant already listens for `mpa:open-support-contact` and exposes its optional contact-details panel.
- `web/app/error.tsx` already provides a retry action and warns users to check application tracking before resubmitting.
- `web/lib/api.ts` already maps stable API error codes to user-facing messages, rejects unsafe server messages, and includes response request IDs.
- The HTTP server already returns structured `error.code` and `error.message` payloads and propagates request IDs through the response helper.
- There was no root `web/app/not-found.tsx` or root `web/app/loading.tsx`.
- The legacy `/contact` segment had no page component (only the privacy sub-route).

## Implemented in this increment

### Phase 1 — Support access

- Added one `openSupport()` helper that reuses the existing global assistant event; it does not create a second inbox or navigate away from the current page.
- Added a reusable `SupportAction` button for support entry points.
- Added a legacy `/contact` page that opens the existing assistant and returns the visitor to the homepage. The globally mounted assistant remains the sole inquiry mechanism.
- Existing support backend, inquiry storage and consent behavior remain unchanged.

### Phase 2 — Branded loading

- Added a reusable branded loader: navy tile, custom P mark, and a revolving open lemon-lime circular stroke.
- Added reduced-motion behavior.
- Added the root App Router loading boundary for initial route loading and route transitions.
- This is a route fallback, not a permanent overlay; request errors remain handled by page/API error paths.

### Phase 3 — Friendly errors and empty states

- Added the root institutional 404 page with home and Support actions.
- Added a reusable empty-state component whose default message is exactly “No data to show.”
- Preserved the existing route error boundary and API error-code mapping; no error codes, authorization decisions, or server messages were weakened.
- No database migration is needed for these presentation and navigation changes.

## Explicit remaining work (not represented as complete)

- Inventory every existing support CTA/link across all routes and replace remaining direct `/contact` navigation or ad-hoc events with `openSupport()` / `SupportAction`. This increment establishes the shared contract and legacy route, but a repository-wide call-site migration remains.
- Apply `EmptyState` to each data-driven listing only after confirming loading, empty, and failed-request states are distinct. This increment adds the shared component but does not silently rewrite every page.
- Enrich permission-denied messages with the exact required permission and grantor only where the API supplies authoritative permission metadata. The browser must not guess a role or permission from the route.
- Add focused browser/accessibility regression coverage and execute the full CI workflow at the requested final validation stage.

## Safety

- No database schema or migration changes.
- No production database changes or deployment.
- No auth, membership, privacy, role, permission, or API mutation policy changes.
- Existing error boundary retry behavior and server-side authorization remain authoritative.
- CI intentionally not run in this increment per the requested final-stage validation plan.
