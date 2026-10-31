# Community Impact Increment 6 and 7 — Member workspace and recognition operations

Status: implementation committed to `feat/workstream-3-progress-members-workspace`; CI and runtime acceptance are deliberately pending.

## Increment 6 — Member Community Impact workspace

The existing `/members` workspace now embeds `CommunityImpactWorkspacePanel`. It does not create a second member profile or replace the professional profile.

### Member experience

- Private score total, award/reversal counts, active policy version and evaluation-only/public-publication state.
- Five dimension weights sourced from the active policy version, not client constants.
- Category breakdown from immutable ledger explanations.
- Verified-claim progress based on database claim statuses.
- Verified contribution timeline and score details remain available at `/community-impact/score`.
- Reviewer-verified output and outcome summaries.
- Pending claims, missing-evidence and detected-contribution reminders, derived from the signed-in member's own records.
- Detected contributions display their source family, canonical category, attribution state and detection confidence. Detection is not verification and does not award points.
- The dashboard does not expose private evidence URLs, reviewer notes, identity-assurance artifacts, or other members' records.
- The existing claims page remains the action destination for claims and detected contribution follow-up.

### Sound and browser behavior

The dashboard includes an optional, subtle Web Audio cue. It is off by default and requires an explicit user gesture to enable. The browser may still block playback after navigation or when audio is unavailable. The UI never forces audio, repeatedly plays sounds, or uses sound as the only notification channel. The preference is stored locally and can be switched off.

### Profile visibility

The public achievement section is embedded in the existing professional profile route `/network/:id`. It reads only award rows with `public_opt_in=true`. Awards remain private by default; the recipient can enable or revoke public display in `/community-impact/recognition`. This does not publish the score, ledger, evidence, claims, reviewer rationale, or non-consented awards.

## Increment 7 — Recognition and engagement

### Recognition opportunities and criteria

- `community_impact_recognition_program` stores the title, description, criteria, eligible source families, nomination modes and active state.
- Authorized program managers can create/update criteria and activate/deactivate opportunities.
- Each program change is written to append-only `community_impact_recognition_program_event`; programs are deactivated rather than deleted.
- Initial program: Verified Community Impact Recognition, with criteria covering verified role, evidence, attributable responsibility, outputs/outcomes, sustainability and collaboration.

### Nominations and awards

- Members can self-nominate or nominate another member when the program permits it.
- Members can nominate non-member community contributors; non-members are not automatically enrolled or given MPA membership.
- Nominations include a contribution summary, evidence references and an optional related claim.
- Opportunities that require verified contribution cannot be approved without a linked claim whose status is `verified`.
- Only the assigned reviewer can decide an `under_review` nomination. The nominator and nominee cannot review or decide their own nomination.
- Approval creates an award record; it does not automatically award score points.
- Award provenance is immutable. Public profile display is separately consent-gated and revocable.
- Nomination, assignment, clarification, approval, decline and public-consent changes are appended to recognition event history.

### Notifications and reminders

- A claimant receives an in-app notification when a contribution claim becomes verified.
- Clarification requests generate an action-required notification.
- Nominees receive a notification when a member nomination is received; approved member nominees receive an award notification.
- The member dashboard derives reminders for pending claims, missing evidence and detected source records from live database state. These reminders are not treated as achievements or score entries.

## API surface

Member:
- `GET /api/v1/me/community-impact/workspace`
- `GET /api/v1/community-impact/recognition/programs`
- `GET /api/v1/me/community-impact/recognition`
- `POST /api/v1/me/community-impact/recognition/nominations`
- `POST /api/v1/me/community-impact/recognition/awards/:id/public-consent`

Administration:
- `GET /api/v1/admin/community-impact/recognition/programs`
- `POST /api/v1/admin/community-impact/recognition/programs`
- `GET /api/v1/admin/community-impact/recognition/queue`
- `GET /api/v1/admin/community-impact/recognition/summary`
- `POST /api/v1/admin/community-impact/recognition/nominations/:id/assign`
- `POST /api/v1/admin/community-impact/recognition/nominations/:id/decision`

## Permission boundary

The migration registers:
- `community_impact.recognition.manage`
- `community_impact.recognition.review`
- `community_impact.recognition.view_all`

System administrators retain access. Other staff require explicit permission grants. No broad role is silently granted reviewer or program-management authority by this increment. Review permission is checked on the server for listing, assignment and decisions. Program management and restricted queue summary have separate permissions.

## Migrations and validation

- `20261101240000_community_impact_recognition_and_engagement.sql`
- `20261101250000_community_impact_recognition_program_governance.sql`

The disposable migration compatibility checker now includes both migrations and required recognition tables. Source-contract tests were added in `test/platform/community-impact-workspace-recognition.test.js` and included in `npm run test:community-impact`.

### Acceptance gates intentionally not claimed as passed

- Run the complete Community Impact unit/source-contract suite.
- Run the Next.js production build and lint/type checks.
- Apply all pending migrations to a newly created disposable PostgreSQL database, exercise representative member/admin flows, then verify the rollback/rehearsal script removes only the disposable schema objects.
- Test concurrency for duplicate nominations, reviewer assignment/decision, and consent changes; test notification idempotency and permission-denied cases.
- Verify public profile privacy with member and non-member viewers, including awards without consent and revoked consent.
- Run the full branch CI only after the remaining workstream increments are complete, as requested.

No production migration, deployment, merge, branch change, role grant, or public score publication is part of this increment.
