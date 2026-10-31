# MPA shared visual system and UX consistency contract

**Scope:** `web/` application on `feat/workstream-3-progress-members-workspace`.

This document defines the shared visual contract for all member, organization, service, mentorship, Jobs, membership, Finance and Administration routes. It is a presentation contract only: it does not change API contracts, role permissions, record ownership, lifecycle transitions, or workflow decisions.

## Visual direction

- Use blue navy as the structural brand color; do not use pure black as the application brand or default dark surface.
- Use lemon as a restrained accent for emphasis, selected states and high-visibility calls to action. Do not use lemon as small body text on white.
- Light theme: cool, bright neutral page canvas, white surfaces, navy text and controls, clear muted text and borders.
- Dark theme: deep blue-navy canvas, lifted blue-navy surfaces, cool-white text, readable muted text and borders, lemon accent. Avoid flat black backgrounds and avoid using lemon for every foreground element.
- Maintain clear surface separation in both themes through tonal elevation and restrained borders; flatten nested cards and use one primary container where possible.
- Use lemon for primary actions and selected navigation, not as a general-purpose text or icon color. Secondary actions remain neutral.
- Use 44px minimum action controls (48px mobile navigation targets), predictable form spacing and horizontally scrollable data tables inside their own containers.
- Keep the page content and existing information architecture; do not change workflow order or hide existing actions as a styling shortcut.

## Typography

- Body and controls: Inter, 400; use 500 for labels/navigation and 600 for important actions.
- Headings: Manrope, normally 600. Avoid 700–900 weights except where a specific, tested visual treatment requires them.
- Ethiopic fallback: Noto Sans Ethiopic.
- Body text: 15–16px with approximately 1.55 line height. Supporting text should remain readable and not be reduced to tiny metadata.
- Use tabular numerals for counts, dates, currency values and progress metrics.
- Keep long-form copy to a readable measure (approximately 60–75 characters per line).

## Tokens and components

The canonical CSS custom properties live in `web/app/globals.css`; Tailwind aliases live in `web/tailwind.config.ts`.

- Colors: brand navy, lemon, page/surface levels, text/muted text, border, focus, semantic success/warning/error/info.
- Spacing: 4px base rhythm with named 4/8/12/16/20/24/32/40/48px steps.
- Radii: 7/10/14/18/24px.
- Shadows: low-contrast navy-tinted elevation; dark theme uses a deeper navy shadow, not black card fills.
- Shared `.card`, `.btn`, `.badge`, `.icon-btn`, inputs, `.operation-status` and navigation styles consume the token system; semantic badge tones distinguish success, waiting/review, in-progress, neutral and declined/error states.
- The mentorship progress journey uses distinct complete/current/waiting/upcoming labels and a visually emphasized current step. Membership application status badges distinguish approved/active, pending/review, in-progress and declined/failed outcomes.
- Next-action feedback separates the server-returned status from the next permitted action; it must not imply an action completed before confirmation.

## Source-level route coverage

The shared root layout and global design tokens were checked against the current workspace entry pages:
- Network-Plus and role workspaces: `/network-plus`, `/workspaces`.
- Member and organization context: `/profile`, `/organizations`.
- Opportunity and relationship journeys: `/jobs`, `/mentorship`, `/serve-community`.
- Governance and money workflows: `/membership`, `/admin`, `/admin/finance`.

These routes inherit the shared root typography, token palette, form controls, navigation and responsive shell. Page-specific refinements cover the landing and About experiences, dashboard, profile, Network-Plus, Jobs, Mentorship, Serve-Community directory/owner/reviewer, organization directory, membership application and verification/card experiences, Finance, Administration overview, Support Desk, reports, account tables, organization review and membership-card administration. Admin workspace navigation and shared data tables are also aligned. Routes without a dedicated CSS module inherit the shared shell and component styles. This is a source-level consistency pass; it does not replace the rendered page-by-page review in the validation gate.

## Workspace consistency requirements

| Workspace | Page-level UX consistency checks |
| --- | --- |
| Network-Plus and profile | Profile identity, visibility and organization context remain clear; private information remains permission-scoped. |
| Jobs | Vacancy discovery, inquiry, draft, submission, screening and tracking states remain distinct; filters and next actions remain usable on mobile. |
| Mentorship | Discovery, request, matching, mutual acceptance, sessions, feedback and outcomes remain visibly distinct lifecycle steps. |
| Serve-Community | Public reviewed initiatives remain distinct from private owner management and reviewer workflows; consent and impact reporting boundaries remain explicit. |
| Membership | Application review, activation and payment verification remain separate actions and roles. |
| Finance | Amounts and totals remain currency-separated; payment verification, reversal, receipts and reconciliation retain clear, audited states. |
| Administration and Support Desk | Queue counts remain server-authoritative; role-scoped records, audit details and destructive confirmations remain clear. |
| Shared member and organization workspaces | Role-authorized navigation, direct-route API authorization and record scoping remain unchanged. |

## States and accessibility

- Loading states communicate what is loading and expose `role=status`/busy semantics where appropriate.
- Errors use `role=alert`, explain what failed and provide a safe retry path where retry is supported.
- Empty states explain why no records are shown and give a relevant next action where one is permitted.
- Success messages confirm only a completed server action; pending or uncertain outcomes must not be styled as success.
- Status is conveyed by text and icon/shape as well as color.
- Keyboard focus remains visible; controls have labels; headings are hierarchical; dialogs remain operable by keyboard.
- Honor reduced-motion preferences and browser high-contrast/forced-colors mode.
- Test light and dark themes, 320px/360px mobile widths, tablet, desktop, zoom/text scaling and Ethiopic text.

## Validation gate

Automated smoke coverage is added in `e2e/visual-system.spec.js`: it checks WCAG AA contrast for text, muted text, lemon-on-navy primary actions, semantic status colors and focus indicators in both themes; it checks theme persistence, horizontal overflow across 10 workspace routes at 320px, 390px, 768px and 1280px, and minimum mobile touch-target dimensions. This test is committed but has not yet been executed. Before declaring the visual system complete, run the branch's full PR Quality workflow and browser acceptance suite. Add or update screenshot baselines only after reviewing intentional changes. Manually inspect every route in the workspace matrix above in both themes and at mobile/tablet/desktop widths; keyboard-test navigation, forms, dialogs, error/retry and empty states. Confirm WCAG AA contrast for text, controls, status indicators and focus in both themes.

This document is an acceptance contract, not evidence that visual regression, manual assistive-technology review or full browser validation has already passed. Do not mark the workstream release-ready until those checks are evidenced.


## Progress, dashboard charts and public portfolio additions

- Member profile completion uses a native, labelled progress element with a bounded 0–100 value and full-width mobile layout. It describes profile completeness only; it does not imply membership activation, professional verification or directory eligibility.
- The personal dashboard adds a pathway chart only for outcome arrays actually returned by the authenticated `/api/v1/me/outcomes` response. It counts records and labels them as activity, not beneficiaries or impact.
- Organization activity bars reuse the existing role-scoped organization dashboard response (applications, open jobs and recorded hires). They are not computed from client-side guesses.
- The About page includes a live Completed Projects showcase backed by `GET /api/v1/public/serve-community/completed-projects`. It displays only completed initiatives with at least five distinct completed member participation records and hides participant identities.
- Current Serve-Community data records completed participation, but does not provide an independently verified beneficiary count or outcome measure. The About page and API response state this limitation explicitly; no impact totals or testimonials are fabricated.
- Required validation: run unit/integration tests for query filters, deduplication, privacy suppression and authorization/rate limits; run the web production build; verify mobile widths and keyboard/screen-reader semantics for the progress and chart components. These checks have not yet been executed for this addition.
