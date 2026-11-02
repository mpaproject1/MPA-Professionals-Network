# MPA Member Workspace, Unified Progress and Mentorship Experience

## Purpose

This document is the implementation contract for the member-facing experience on PR #18. It establishes three connected destinations: `/members` (professional home), `/track` (all member-owned progress), and `/mentorship` (guided professional development).

The pages share the authenticated member identity and authoritative domain services. They are not separate portals and the progress projection is not a new case-management or approval system.

## Product responsibilities

- **`/members` — My Workspace:** the member's professional home, next step, compact functional destinations, membership setup and a summary of personal progress.
- **`/track` — My Progress:** requests, applications, claims, participation and responses belonging to the signed-in member, with filters for all records, member attention, waiting, active progress and history.
- **`/mentorship` — My Mentorship:** discovery before enrolment and a guided relationship experience after mutual acceptance. The active journey uses saved goals, confirmed sessions and feedback; it does not invent lessons, grades or progress.

## Unified progress API

Authenticated endpoint: `GET /api/v1/me/progress`.

Query parameters:
- `limit` (1–100, default 50)
- `offset` (non-negative, default 0)
- `view`: `all`, `attention`, `waiting`, `progress`, or `history`
- `category`: `all` or a returned category label

The response contains `items`, `counts`, a compatibility `summary`, `errors`, `availableSources`, `limit`, `offset`, `hasMore`, and `totalFiltered`. The existing `GET /api/v1/me/application-tracking` contract remains available to existing consumers.

Each projected item retains a domain and original record identifier, a member-safe title and description, source status and label, responsibility, timestamps, tracking reference where available, and a safe in-app destination. The projection deliberately omits raw domain payloads, evidence, reviewer notes, and contact details.

## Current source adapters

The endpoint composes existing authenticated domain services using independent settled calls:

- Existing membership, organization and job application tracking.
- Member service requests.
- Mentorship requests, matches, active relationships, member-owned session proposals and organization programme requests.
- Member verification cases and reference requests addressed to the member.
- Community-impact claims owned by the member.
- Talent/network inquiries.
- Network Plus collaboration requests.
- Serve-Community participations and member-owned initiatives.
- Member referrals and candidate employment referrals.
- Recognition nominations and awarded achievements.

A source that rejects is reported in `errors`; successful sources remain available. Missing or failed sources are not represented as completed or silently converted to successful empty results. Source-level errors are intentionally generic and do not expose database or reviewer details.

## Responsibility vocabulary

- `member_action`: the member must respond, provide information or accept/decline.
- `mpa_action`: MPA review or matching is outstanding.
- `external_response`: another participant or organization must respond.
- `in_progress`: an accepted engagement is active.
- `completed`: a completed or verified outcome.
- `closed`: declined, withdrawn, cancelled or expired.
- `unknown`: the source returned an unrecognized or unavailable status.

The original domain status remains authoritative. The responsibility value is presentation-only and must not be used to mutate a domain lifecycle.

## Privacy and authorization

All sources are invoked using the authenticated user's identity and existing service authorization. The aggregator does not accept a user ID from the request. It does not query another member's records by client-supplied identifier, create duplicate cases, copy private evidence, expose reviewer-only notes, or make approval decisions. Each domain continues to own its records, permissions, event history and notifications.

## Mentorship experience

Before mutual acceptance, members see discovery, programme details and the real request/matching lifecycle. A proposed mentor is not an assigned mentor. Active mentorship is shown only for a persisted active relationship.

The active programme surface presents the agreed goal and links to persisted learning goals, sessions, practical learning activities, versioned mentee submissions and append-only mentor reviews. Mentors publish activities; only the assigned mentee can submit; only the assigned mentor can review. A mentee can submit a new version after changes are requested, but cannot overwrite an accepted submission or submit another version while the current version awaits review. Completion counts derive from saved goal/session/feedback records only. Mentors and mentees continue to use the existing relationship-specific APIs; mentor access does not grant access to membership, finance or verification evidence. Learning activities are intentionally practical and goal-linked rather than a generic lesson catalogue. The additive schema records activity instructions, due dates, submission versions and review history without introducing grades or artificial points.

## Compatibility and release gates

- Keep `/api/v1/me/application-tracking` backward compatible.
- Do not introduce a second tracking database or duplicate domain records.
- Preserve membership approval/payment separation, verification evidence governance, mentorship mutual acceptance, organization scope, and Network Plus / volunteering boundaries.
- No production database changes, deployment, merge or main-branch edits are part of this work.
- Run the focused member-progress unit tests, full backend tests, Biome, TypeScript, production build, migration compatibility and browser acceptance against the final PR head.
- Do not mark PR #18 ready or merge until the full required CI and role/privacy/browser acceptance gates pass.
