# MPA Installable Web App and Device Push Notifications

**Scope:** PR #18, Workstream 3. This implementation adds an installable Progressive Web App (PWA), mobile-first navigation, opt-in Web Push subscriptions, and a durable push-delivery outbox. It does not merge or deploy the PR.

## Browser installation and mobile experience

- `web/public/manifest.webmanifest` declares the MPA app identity, standalone display mode, scope, theme, and branded icon.
- The application shell registers `/sw.js` on supported browsers and offers installation guidance. The installed app starts at the dedicated `/mobile` workspace, which is a public, cacheable entry point. Chromium browsers may expose the native install prompt; iOS users can use Safari Share → Add to Home Screen.
- Mobile navigation prioritizes four destinations and places remaining destinations in a dedicated More panel. Safe-area spacing keeps the fixed navigation clear of device home indicators.
- The app continues to use the same account, backend, authorization and workflow routes on desktop and mobile; it does not create a second identity or data store.

## Offline and privacy boundaries

The service worker caches only the public landing shell, public brand assets and fingerprinted Next.js static assets. It does not cache API responses, authentication, notification inboxes, member profiles, financial records, forms, approvals or other private workflow data. Offline account actions are not queued or replayed. The offline screen asks the user to reconnect.

## Web Push configuration

Web Push requires a VAPID key pair and a monitored subject:

1. Generate a key pair in a trusted terminal with `node scripts/generate-web-push-vapid-keys.js`.
2. Store the printed values in the API host's environment or repository-root `.env` (file mode `600`):
   - `WEB_PUSH_VAPID_PUBLIC_KEY`
   - `WEB_PUSH_VAPID_PRIVATE_KEY`
   - `WEB_PUSH_SUBJECT` (a monitored `mailto:` contact or HTTPS contact URL)
3. Never commit the private key, expose it to the browser, or paste it into source control. The public key is returned only by the authenticated push setup endpoint.
4. Apply the additive migration `20261102110000_web_push_subscriptions_and_delivery.sql`.
5. Users enable notifications themselves from **Action center → Phone and browser notifications**. The browser permission request is initiated only by that explicit click. Subscriptions are scoped to one account at a time; moving a browser endpoint to another account cancels its queued deliveries for the previous account.

Supported push endpoints are restricted to HTTPS endpoints from the major browser push services. Subscription endpoints and encryption keys are stored server-side and must be treated as sensitive credentials.

## Delivery worker and cPanel scheduling

In-app notification creation inserts device delivery jobs into `notification_push_delivery` in the same database transaction. The running API process already starts a bounded in-process dispatcher at startup and checks the outbox every 30 seconds. This is the normal delivery path when the Node application remains running.

The same worker can be run manually or by an external scheduler:

```bash
npm run notifications:dispatch-web-push
```

For a host that suspends the API process or requires an independently monitored scheduler, configure a cPanel cron job to run every minute using the Node 22 executable selected for the API application, for example:

```bash
cd /home/ACCOUNT/REPOSITORY && /home/ACCOUNT/nodevenv/APP_ROOT/22/bin/node scripts/dispatch-web-push.js
```

Replace the example account, repository and application paths with the actual hosting paths. Do not add a cron job merely because the script exists; first confirm whether the persistent API worker is running. Running both is safe at the database-claim level because the dispatcher uses `FOR UPDATE SKIP LOCKED`, but it adds unnecessary polling and log noise when the in-process worker is healthy. The dispatcher retries transient failures with bounded backoff, expires invalid (404/410) subscriptions, and leaves a delivery audit trail in the outbox. It sends generic lock-screen copy only; private names, case details and member data stay inside the authenticated app. If VAPID is not configured, the worker reports a skipped run and does not attempt delivery.

## Operational notes and limitations

- Browser permission is required and may be denied or revoked by the user.
- Push is not guaranteed to be immediate; delivery depends on browser, operating system, network and push-service behavior.
- High/urgent notifications may request vibration or persistent presentation where supported. A PWA cannot override silent mode, Do Not Disturb, device volume, battery restrictions or operating-system notification settings. It is not a guaranteed alarm clock.
- The existing email/SMS preferences are independent. This work does not claim that email, SMS or digest delivery is implemented by Web Push.
- Test delivery on real Android Chrome and iOS Safari-installed web apps before release. Validate subscription removal, account switching, expired endpoints, worker restarts, and a cPanel cron run.
- Do not merge or deploy until the full PR Quality workflow, migration compatibility rehearsal, backend tests, Biome, TypeScript, production build and browser acceptance pass on the latest PR head.


## 2026-11-03 integration audit and source updates

The follow-up source audit on PR #18 checked the manifest, app shell, service worker, notification inbox, subscription UI, VAPID configuration, push encryption/delivery service, outbox migration and existing PWA regression suite. The following integration gaps were corrected:

- Service-worker registration is now owned by the app shell's PWA status/install surface; the root provider no longer independently registers the same worker during hydration.
- The worker's same-origin notification navigation allowlist now includes current destinations such as `/network-plus`, `/recruitment`, `/account`, `/workspaces` and `/learning`. A valid notification deep link no longer falls back to `/notifications` solely because it targets one of these app workspaces.
- Notification title and body are trimmed and bounded to 100 and 180 characters respectively. Long campaign copy is now shortened for the device panel rather than replaced with a generic fallback message.
- The install nudge respects the persisted dismissed flag and closes after the browser reports `appinstalled` or the native prompt is accepted.
- The push settings panel refreshes browser permission and current device subscription state when the user returns to the page, including after changing site permission in browser settings.
- The existing regression suite `test/platform/pwa-install-push.test.js` now checks the added deep-link destinations, bounded notification copy, install dismissal state and single registration ownership in addition to the existing manifest, migration, encryption and VAPID checks.

**Validation boundary:** these are source changes and authored regression assertions. The test suite, production build, disposable PostgreSQL migration rehearsal and real-device push delivery have not been run in this continuation. Keep the PR draft; do not treat this audit as release approval. The cPanel cron entry and VAPID secrets remain deployment-specific and must be configured by the operator.
