# Community contribution campaigns — implementation and operations

This implementation is additive to the existing notification inbox, web-push subscriptions, service worker and current administrator authorization. Campaign content and delivery history live in their own tables; operational notifications remain in `notification_event` and are not reclassified or suppressed by the campaign preference.

## Safety defaults

- The migration seeds 30 message versions with status `draft`; no approval rows are created.
- Exactly two schedule rows are seeded: Friday 15:00 and Sunday 09:00 in `Africa/Addis_Ababa`.
- Both slots and the campaign itself are paused/disabled after migration.
- Member campaign preference defaults to `false`; public visitors must explicitly opt in and grant browser push permission.
- Approval, scheduling and activation are separate operations. An author cannot approve their own version. Approval records a SHA-256 digest of the reviewed content; a new edit is a new version and needs a new approval.
- A schedule activation requires an explicit confirmation flag and an approved, unchanged version.
- The scheduler rechecks approval and digest before fan-out. Delivery ledger unique keys suppress repeated runs. A global pause disables both slots immediately.
- Campaign opt-out only suppresses the `community_campaign` category. Payment, membership, application, security and other operational notifications are unchanged.

## Admin workflow

Open **Admin → Community contribution campaigns**.

1. Select a seeded draft and choose **Create revised version**. Saving creates a new immutable version and submits it for review.
2. A different authorized administrator reviews the text, Qur'an translation/reference, hadith collection/grade/source and destination, then approves or rejects it.
3. Select an approved version for a schedule slot. Configure weekday/time in Addis Ababa local time.
4. To start delivery, explicitly enable the slot and confirm activation. Repeat independently for the second slot if required.
5. Use **Pause all slots** for the global kill switch. Monitoring displays enabled slots and per-recipient delivery outcomes/reason codes.

The initial seeded rows have no author identity because they are editorial imports. An administrator should create a revised version before submitting one of these drafts for approval; the revised version records its author.

## Public and member preferences

- Members manage **Community contribution invitations** under the notification preferences on `/notifications`. The default is off. The campaign preference is stored separately from the general push preference.
- Public visitors can opt in at `/community-updates`. Public push requires a valid browser subscription, an explicit consent action and `Notification.permission === "granted"`. The manage token is returned once and stored in the current browser session. The public manage API accepts that token to unsubscribe.
- Public subscribers receive push only; no public email channel is enabled by this increment.
- Existing member web-push registration is reused. Push delivery is queued only for active subscriptions and is rechecked at dispatch. Expired/invalid subscriptions are revoked by the existing sender; transient errors receive bounded retries.

## Scheduler and delivery worker

The scheduler is a minute-level CLI job, not an always-on web process. Configure cPanel cron (or the host scheduler) to run the following every minute, using the same Node 22 environment and application root as the API:

```cron
* * * * * cd /home/ACCOUNT/MPA-Professionals-Network && /path/to/node scripts/dispatch-community-campaigns.js >> /home/ACCOUNT/logs/community-campaigns.log 2>&1
* * * * * cd /home/ACCOUNT/MPA-Professionals-Network && /path/to/node scripts/dispatch-web-push.js >> /home/ACCOUNT/logs/web-push.log 2>&1
```

Replace `ACCOUNT` and `/path/to/node` with the cPanel account and Node binary selected for this application. The campaign script fans out due slots and dispatches queued public push; the existing web-push script dispatches member push queued in the standard notification delivery ledger. Do not add either cron entry until the migration is applied, VAPID configuration is verified, authorized reviewers have approved content, and an administrator deliberately activates a schedule.

Required environment values for Web Push remain the existing `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY` and `WEB_PUSH_SUBJECT`. No secret is added to source control.

## Migration and validation

Apply migrations with the repository's normal `npm run migrate` process. The new migrations are `999_community_contribution_campaigns.sql` and `1000_community_campaign_public_push_delivery.sql`; they are forward-only and do not rewrite notification history or assign member preferences.

Run:

```sh
npm test
npm run web:build
```

The dedicated tests cover approval separation, content-digest invalidation, action-route allow-listing, Addis Ababa wall-clock boundaries, delivery idempotency and disabled migration defaults. Full PostgreSQL integration, CI, desktop/mobile browser and installed-PWA permission-state acceptance must pass before production activation. A browser permission denial must never be bypassed or retried with a silent subscription.
