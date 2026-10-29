# Workstream 7 — Secure user-management operations

## Implemented API contract

- `POST /api/v1/admin/users/:id/revoke-sessions`: revokes all active sessions for the selected account; requires server-side user-management permission, a reason, target-account checks and an audit event.
- `POST /api/v1/admin/users/:id/one-time-session-link`: queues a short-lived, single-use recovery link to the currently authorized, verified recovery destination. It reports queue acceptance, not confirmed delivery.
- `POST /api/v1/admin/users/:id/one-time-password`: creates a cryptographically random one-time password, persists only the existing scrypt password verifier, revokes sessions and outstanding one-time links, sets forced credential replacement, marks it consumed atomically at first sign-in, and returns the credential only in the immediate authorized response. The response is rate-limited and marked `Cache-Control: no-store`; no retrieval endpoint exists.
- Legacy `POST /api/v1/admin/users/:id/reset-password` is retained for compatibility but no longer accepts an administrator-selected reusable password; it follows the one-time-password policy.
- `PATCH /api/v1/admin/users/:id/recovery-email`: requires a reason, matching email confirmation, server-side permission checks, privileged-target checks and a passkey-authenticated session. It creates a pending change; the current trusted recovery address remains active until verification.
- `POST /api/v1/auth/recovery-email/verify`: verifies the single-use token and promotes the pending address only when the 30-minute expiry has not passed.

## Secret and audit handling

- One-time passwords are generated from cryptographically secure random bytes and are never emailed or written to audit metadata.
- One-time password verifier is stored in `app_user.password_hash`; `credential_setup_required`, `credential_setup_expires_at` and `credential_setup_used_at` enforce replacement before normal use, single use at sign-in, and expiry after 24 hours.
- Recovery tokens are SHA-256 hashed in persistent account state. Recovery links place tokens in URL fragments, which are not sent in HTTP request URLs. The web page removes the fragment from the visible address bar before calling the verification API.
- Recovery-email changes keep the proposed address pending until proof of control. Duplicate sign-in/recovery/pending addresses are checked under a transaction advisory lock. A notice is queued to an existing verified email channel when available.
- Audit events record actor, target, action, request/correlation ID, outcome and reason where required. Recovery-email addresses are present only in protected audit metadata; ordinary service logs do not include request bodies, tokens or credentials. The one-time credential is not included in audit events, notifications, email payloads, or export fields.
- The recovery email dispatcher removes the secret URL from the queued notification payload after successful delivery and removes/invalidates it after terminal delivery failure.

## Validation matrix

The source-contract tests in `test/workstream7-user-management.test.js` protect the security-critical implementation structure. The disposable-PostgreSQL integration tests in `test/workstream7-user-management.integration.test.js` exercise denied actions, one-time credential expiry and use, session revocation, forced password replacement, recovery-link expiry/reuse, and recovery-email verification/audit. The PR quality workflow must also pass TypeScript, Biome, production build, browser acceptance and disposable-PostgreSQL migration/backend checks.

Required integration evidence before merging:
1. Non-admin and out-of-scope actors receive server-side 403 responses for every administrative action.
2. A one-time password can be used only before expiry; after sign-in, all normal API routes are blocked until password replacement. A replacement clears the requirement, and existing sessions stay revoked.
3. A recovery link cannot be reused, cannot be used after expiry/revocation, and revokes active sessions when redeemed.
4. Recovery-email verification fails for invalid, expired, replaced and reused tokens; the new address is not selected as a recovery destination until verified.
5. Audit and email exports contain no one-time password or raw token; the credential response is non-cacheable and cannot be fetched again.
6. Email queue acceptance is not represented as confirmed delivery; provider delivery status remains authoritative.

Do not deploy this branch or treat it as production-ready solely because source-contract tests pass. Confirm the final CI run and the integration evidence above before merge.
