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
6. Provider acceptance and provider delivery are distinct states. A provider acceptance is not evidence that the recipient received or read the email.

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
