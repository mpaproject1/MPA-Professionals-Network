# Email Module Hardening and Operations

Branch: `feat/workstream-3-progress-members-workspace` (PR #18)

## Scope

The email module is the platform's transactional communication path for account verification, membership, organization review, recruitment, mentorship and service workflows. It is not a bulk marketing sender. Optional campaign mail must use a separate opt-in path and must not bypass recipient holds.

## Delivery lifecycle

1. Workflow code records the business transition and queues a notification through `queueWorkflowEmail` or `queueEmailNotification`.
2. Logical workflow event keys collapse duplicate queue attempts for the same recipient, template, resource and transition.
3. The dispatcher claims rows with PostgreSQL row locks and `SKIP LOCKED`, applies recipient/template audience rules and checks active recipient holds.
4. The configured Resend or signed-webhook provider receives a stable idempotency key.
5. Provider callbacks are authenticated, event-ID deduplicated, stored in `email_delivery_event`, and correlated with the outbox. Events that arrive before the provider message ID is persisted remain pending and are reconciled on later dispatch.
6. Account verification remains a dedicated token-bound delivery path rather than a generic workflow outbox item. Its token is hashed, single-use and expiring; provider idempotency and Test Lab capture apply, and delivery attempts are tracked on `email_verification_token`.
7. Provider acceptance and provider delivery are distinct states. A provider acceptance is not evidence that the recipient received or read the email.

## Delivery states

- Outbox `status`: pending, processing, sent, failed or cancelled.
- `delivery_status`: queued, sent, delivered, bounced, complained, failed, suppressed, cancelled or captured.
- `captured` means the development Test Lab stored the message. It does not mean a provider accepted or delivered it.
- `delivered` means a trusted provider event reported delivery. It does not prove the recipient read the message.
- Bounce and complaint events create an active normalized-address hold. Complaints cannot be released by an administrator; a separate documented recipient re-consent process is required. Hard-bounce holds can be released only after review with a reason, and retry is blocked until the hold is cleared.

## Audience governance

Template audiences are enforced at dispatch using the recipient's current persisted identity and role/relationship data:

- `professional`: professional account type.
- `organization_representative`: organization-representative account type.
- `employer`: organization representative with an active owner, administrator or recruiter membership.
- `reviewer`: reviewer role, system administrator or explicit review permission.
- `administrator`: administrative role.
- `mentor`: mentor role or persisted mentor relationship.
- `all`: intentionally universal.

The organization review queue, organization registration/update, professional workflow, employer and mentor templates are seeded with explicit audiences. Unknown audience values are rejected when editing a template. System-managed templates cannot be changed by administrators.

Transactional workflow email is not suppressed by the optional `notification_preference.email_enabled` setting. The optional flag is reserved for future non-essential communications. Recipient bounce/complaint holds still block every email, including verification.

## Template governance

- Templates support subject, text and HTML versions.
- Variables are escaped when inserted into HTML.
- The admin workspace can preview without sending.
- Each template edit creates an immutable version record.
- Restoring a prior version creates a new version and audit event; it does not rewrite history.
- Security-critical email verification cannot be disabled through the template editor.

## Test Lab isolation

Set `TEST_DELIVERY_MODE=capture` in a non-production environment to capture verification, test and queued email without calling an external provider. If `TEST_LAB_ENABLED=true`, capture mode is mandatory. Both flags are forbidden in production. Capture dispatch uses row locks and enforces the same audience and recipient-hold checks as provider dispatch.

Captured messages are marked `delivery_status=captured`; they must never be reported as provider-accepted or delivered.

## Server configuration

Required for Resend delivery:

- `PUBLIC_APP_URL` — HTTPS application origin in production.
- `RESEND_API_KEY` — server-only provider key.
- `EMAIL_FROM` — verified sender identity.
- `EMAIL_DELIVERY_EVENT_WEBHOOK_SECRET` — secret expected in `x-email-delivery-webhook-secret` for delivery callbacks.

Optional integrations:

- `EMAIL_DELIVERY_WEBHOOK_URL` and `EMAIL_DELIVERY_WEBHOOK_SECRET` — signed custom outbound provider.
- `EMAIL_INBOUND_WEBHOOK_SECRET` — secret expected in `x-email-webhook-secret` for inbound email.

Never expose these values through `NEXT_PUBLIC_*` variables or return them from API responses.

## Provider webhook contract

Delivery callback JSON must include:

```json
{
  "provider": "resend",
  "eventId": "provider-event-id",
  "providerMessageId": "provider-message-id",
  "eventType": "delivered"
}
```

Supported event types: `delivered`, `bounced`, `complained`, `failed`. The callback is authenticated with the configured delivery-event secret. A stable provider event ID is required; replayed event IDs are ignored. The endpoint accepts canonical fields and can normalize Resend-style `data.email_id`, top-level `id`, and `email.delivered`/similar event names, but it does not validate Resend Svix signatures itself. For native Resend webhooks, use a trusted adapter that validates the Svix signature and forwards the canonical payload with the configured shared header; do not expose an unsigned native webhook directly to this endpoint. Events with no matching outbox row are retained pending correlation and reconciled on a later dispatch.

Inbound callbacks require a stable provider message ID and the inbound webhook secret. Replayed provider message IDs do not create duplicate inbox rows.

## Administrator operations

All email administration routes require `system_admin`:

- Operations overview and delivery counters.
- Inbox list, read/unread and archive actions.
- Outbox folders, delivery evidence and retry.
- Draft create, edit, cancel and queue.
- Template edit, preview, version history and restore.
- Recipient-hold review and eligible hard-bounce release.
- Test email and bounded queue dispatch.

Operational changes, template revisions, retry requests, provider outcomes, inbound receipt, recipient-hold release and inbox actions are audited with request correlation where available. Audit metadata avoids storing message bodies or secrets.

## Database changes

- `20261103190000_email_delivery_hardening.sql`: delivery evidence columns, event-level idempotency key, provider event ledger, recipient holds, provider-message index and template version history.
- `20261103200000_email_workflow_template_coverage.sql`: explicit organization workflow audience templates and their initial history snapshots.

The email-specific migration compatibility script runs inside a transaction against an explicitly named disposable PostgreSQL database, verifies the new schema/template objects, rolls back, and checks that the prior schema/template baseline is restored. It is included in `npm run check:migrations:rollback`.

## Validation still required before merge/deployment

- Run the full PR Quality workflow on the latest branch head.
- Execute all backend tests and the complete Playwright suite.
- Execute the migration compatibility gate against the disposable PostgreSQL database.
- Verify Resend authentication, sender-domain verification, signed provider callback delivery, bounce and complaint events.
- Verify development Test Lab capture and confirm no external provider requests are made.
- Verify mailbox rendering in Gmail and Outlook.
- Confirm the live development deployment's environment variables and admin UI.

No production migration, deployment or provider credential change is authorized by this implementation.


## Verification recovery and native Resend callbacks (implementation update)

Account verification remains outside the ordinary notification outbox. Its verification token hash remains the authority for single-use verification. A separate email_verification_delivery job stores the token using AES-256-GCM authenticated encryption, with a purpose-derived key from EMAIL_VERIFICATION_ENCRYPTION_KEY or the stable JWT_SECRET fallback. Keep that key stable across deployments; key rotation requires controlled re-encryption.

The verification delivery worker claims due jobs with SKIP LOCKED, recovers claims older than five minutes, uses the shared email transport and provider idempotency key, and retries transient failures with bounded backoff (maximum eight attempts). Replacing or consuming a verification token expires its outstanding delivery job. Verification delivery acceptance, capture, suppression, failure and provider delivery events are audited without writing the raw token to audit metadata. The admin retry action retries the existing unexpired token job; it does not silently replace the token.

Verification template governance is strict: the system-managed template remains enabled and its audience is all. Workflow enqueue and dispatch both fail closed for missing template records or invalid audience governance. Administrator-created admin.manual messages are the explicit exception because their subject and body are stored on the draft/outbox record.

For native Resend webhooks, configure RESEND_WEBHOOK_SECRET (the Svix whsec_ signing secret). The endpoint validates svix-id, svix-timestamp and svix-signature against the exact raw request body and rejects timestamps outside the five-minute tolerance. Custom canonical webhook integrations continue to use EMAIL_DELIVERY_EVENT_WEBHOOK_SECRET. Resend callbacks can be correlated with either ordinary outbox messages or verification delivery jobs; provider event, suppression and audit updates are committed transactionally.

The verification recovery migration is 20261103210000_email_verification_delivery_recovery.sql. It creates the encrypted delivery-job ledger and links provider event records to verification deliveries. EMAIL_VERIFICATION_ENCRYPTION_KEY is optional when JWT_SECRET is configured, but whichever key is used must remain stable.

Native Resend inbound events use the same RESEND_WEBHOOK_SECRET Svix verification over raw request bytes. The inbound message insert and its audit event share one database transaction; duplicate provider message IDs are acknowledged without creating a second inbox row. Custom inbound adapters continue to use EMAIL_INBOUND_WEBHOOK_SECRET.

The workflow producer audit covered the membership service, organization/jobs service and services/mentorship service. Their email template codes are seeded and governed by 20261103220000_email_workflow_template_complete.sql: professional workflow updates, employer candidate/offer/interview updates, mentor mentorship updates, and organization membership access updates. The disposable migration gate verifies all eight templates and their intended audiences, then confirms rollback restores the previous template baseline.
