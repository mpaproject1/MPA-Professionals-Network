# Production API CORS Regression and Release Checklist

**Tracking issue:** [#3 — Restore and regression-test production API CORS headers](https://github.com/jtestcoder/MPA-Professionals-Network/issues/3)  
**Status:** Open; production root cause not yet confirmed.  
**Observed:** 2026-10-21.

## Production context

- Portal origin: `https://portal.muslimprofession.org`
- API origin: `https://api.muslimprofession.org`
- cPanel application root: `/home/muslimjq/ET-Professionals-Network`
- Startup file: `server.js`
- Runtime: Node.js 22.23.3 under cPanel/Passenger

## Observed failure

Public checks on 2026-10-21 found that:

- `GET /healthz` returned HTTP 200 without `Access-Control-Allow-Origin`.
- `GET /api/v1/membership/products` returned HTTP 200 without `Access-Control-Allow-Origin`.
- `OPTIONS /api/v1/membership/products` returned HTTP 204 with allowed methods, allowed headers and max-age, but without `Access-Control-Allow-Origin`.
- cPanel showed the application running and the expected `CORS_ORIGIN` value configured. The API subdomain `.htaccess` also contained a matching `SetEnv CORS_ORIGIN` directive.

This confirms the externally observable header failure, not its root cause. Do not assume that a value shown in cPanel or `.htaccess` is available to the currently running Node process.

## Why this matters

Browsers can block portal JavaScript from reading API responses even when the API returns HTTP 200. Membership product loading, authentication/account flows, and membership/payment journeys may be affected if their API calls are blocked. A CORS failure alone does not prove a data breach or replace server-side authentication and authorization.

## Required behavior

For requests whose `Origin` is exactly `https://portal.muslimprofession.org`:

- Normal API responses include `Access-Control-Allow-Origin: https://portal.muslimprofession.org`.
- Normal responses include `Vary: Origin`.
- A valid preflight to `/api/v1/membership/products` returns HTTP 204 and includes the allow-origin header, permitted methods and permitted request headers.
- The existing explicit origin allow-list remains enforced. Do not blindly reflect arbitrary origins or enable `*` for credentialed/private API access.

For an origin not in the allow-list, the response must not include `Access-Control-Allow-Origin`.

## Automated tests

### Unit tests (run in CI)

The `test/cors-origin-config.test.js` suite covers production-origin matching, configured-origin parsing and rejection of an untrusted origin.

Run:

```bash
node --test test/cors-origin-config.test.js
```

### Deployed HTTP smoke test

The opt-in `test/cors-production-smoke.test.js` checks the actual HTTP response headers for a deployed API. It is skipped unless `CORS_SMOKE_BASE_URL` is set, so ordinary local/CI test runs do not silently contact production.

Run against the release candidate or production only when explicitly intended:

```bash
CORS_SMOKE_BASE_URL=https://api.muslimprofession.org \
CORS_SMOKE_ORIGIN=https://portal.muslimprofession.org \
node --test test/cors-production-smoke.test.js
```

The test checks:
1. `GET /healthz` returns HTTP 200, the exact allow-origin value and `Vary: Origin`.
2. `OPTIONS /api/v1/membership/products` returns HTTP 204 and includes the expected CORS preflight headers.
3. An untrusted origin does not receive an allow-origin header.

Do not treat skipped smoke tests as production validation. Run the command explicitly and retain its output with the release evidence.

## Release checklist

- [ ] Identify and document the actual cause of the missing header in the Passenger runtime.
- [ ] Correct the runtime configuration or application behavior without weakening the origin allow-list.
- [ ] Run the unit tests and the full backend test suite.
- [ ] Run the deployed HTTP smoke test against the release candidate.
- [ ] In a real browser, open the portal and confirm membership products load without CORS errors in DevTools Console/Network.
- [ ] Exercise login/account and membership flows; validate payment journeys in an approved test mode before claiming they work.
- [ ] Confirm health and readiness checks remain healthy.
- [ ] Preserve the existing backup and rollback directory; do not remove deployment artifacts.
- [ ] Do not run database migrations or change portal deployment as part of this CORS-only fix unless separately planned and approved.
- [ ] Attach test output and deployment evidence to issue #3 before closing it.

## Operational safety

Do not paste `.env`, credentials, JWT secrets, database URLs or full environment dumps into issues or logs. When diagnosing environment propagation, report only whether the expected variable is present and whether the origin matches; never print unrelated environment values.
