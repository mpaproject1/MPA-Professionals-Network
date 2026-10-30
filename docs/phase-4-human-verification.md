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
2. correct answer returns a proof token;
3. incorrect answer and automatic challenge refresh;
4. expired challenge and refresh;
5. repeated proof-token use is rejected;
6. ten failed attempts are permitted and the eleventh is rejected;
7. ten consecutive manual refreshes;
8. registration after successful verification;
9. explicit server-side opt-out submits without requesting a challenge proof;
10. registration without a valid token is rejected.

The Playwright tests stub HTTP responses to exercise the browser flow and request/response contracts. A separate PostgreSQL integration suite now exercises actual challenge issuance, correct and incorrect answers, ten persisted failed attempts, expiry, single-use token consumption, and missing-token rejection against the migrated CI database.

## Validation status

- Source changes are committed to PR #18.
- The Playwright suite and PostgreSQL integration tests are authored but have not been executed in this implementation pass.
- GitHub automatically created PR Quality runs after the branch updates. The latest observed run (#669) had all four jobs fail before exposing any steps or log URLs (`steps: null`, `logs_url: null`); the job-log endpoints returned `BlobNotFound`. No test output is available. This is not evidence of a source-code failure or a passing validation run.
- Do not treat the E2E assertions as passed until an Actions runner actually executes them.
- No database migration, production database change, deployment, or change to email verification, membership, identity, or authorization behavior was made.
