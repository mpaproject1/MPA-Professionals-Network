# PR #18 — Phase 4 human verification

Branch: `feat/workstream-3-progress-members-workspace`

## Existing behavior audited

- Registration already requested a human challenge, verified an answer, and passed the returned token to registration.
- Challenges expire after five minutes and successful proof tokens are hashed, time-limited and single-use.
- The UI already had a refresh control, but the flow did not expose the configured verification policy, and challenge failures were hard-limited to five attempts.
- The previous production override always forced human verification even when the environment variable was explicitly false.

## Implemented

- The failed-answer limit is now ten attempts per challenge. The eleventh verification attempt returns `CHALLENGE_ATTEMPTS_EXCEEDED`; failed counts remain persisted on the challenge row.
- Challenge issuance is rate-limited to 20 requests per IP per minute, allowing an initial load plus at least ten manual refreshes while retaining a bounded abuse control.
- The five-minute expiry and single-use proof-token consumption remain intact.
- `HUMAN_CHALLENGE_REQUIRED` is now parsed as a strict boolean. If unset, production defaults to enabled and non-production defaults to disabled. An explicit `true` or `false` overrides that default.
- The public challenge endpoint reports whether verification is required. The registration UI hides the challenge when the server explicitly disables it and skips token verification in that mode.
- The registration service consumes a proof token only when server configuration requires human verification. Invalid/expired/reused tokens remain rejected when verification is enabled.
- `.env.example` documents the switch and defaults it to `true`; set it to `false` only when an operator intentionally accepts the reduced anti-automation protection.

## Regression coverage authored

`e2e/registration-human-verification.spec.js` covers:
1. challenge loading;
2. correct answer and registration handoff;
3. incorrect answer and challenge refresh;
4. expired challenge and refresh;
5. repeated proof-token use;
6. ten failed attempts and rejection of the eleventh;
7. ten consecutive refreshes;
8. registration after successful verification;
9. registration without a valid token.

The Playwright tests stub HTTP responses to exercise the browser flow and request/response contracts. They are not a substitute for running the backend against PostgreSQL; the security service's real persistence, concurrency and single-use behavior must still be exercised by the complete backend CI suite.

## Validation status

- Source changes are committed to PR #18.
- The new Playwright suite and the complete PR Quality workflow have not been executed in this implementation pass.
- Do not treat the E2E assertions as passed until an Actions runner actually executes them.
- No database migration, production database change, deployment, or change to email verification, membership, identity, or authorization behavior was made.
