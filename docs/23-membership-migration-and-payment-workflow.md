# Membership migration and payment workflow

## Legacy membership import

The platform does **not** overwrite current membership data when an old register is imported.

The workflow is:

1. Upload CSV/XLSX/normalized JSON.
2. Preserve the original row in the import record.
3. Normalize names, email, phone, membership number, dates, product and payment fields.
4. Match against existing accounts using stable legacy member ID first, then membership number and controlled contact/name matching.
5. Produce candidates with confidence and reasons.
6. Automatically accept only a high-confidence unique match.
7. Send ambiguous matches to an authorized reviewer.
8. Create a new member/account only when no existing person is found and policy allows it.
9. Map the old membership product to the current configurable membership product through an explicit mapping.
10. Preserve the original membership dates/status and historical payment information.
11. Record a membership event and full import provenance.
12. Never silently convert an imported payment into a provider-confirmed online payment.

This allows an old membership register and future online registrations to converge on one member identity without destroying history.

### Important identity rule

Matching is not based on name alone. A name collision is a review case, not permission to merge two people.

### Incoming members

A new registration is matched against existing active/pending records before creating a new person. The same identity-resolution policy can therefore be reused for:

- legacy imports;
- new online registration;
- admin-created records;
- membership renewal;
- imported payment reconciliation.

## Payment workflow

Payment is provider-neutral.

Supported paths:

- online provider;
- bank transfer;
- cash;
- manual payment entry;
- imported historical payment.

All use the same transaction and reconciliation model.

### Manual payment

A member or authorized staff member can submit:

- amount;
- currency;
- payment purpose;
- reference number;
- payment channel;
- supporting receipt/document/photo.

The transaction starts as pending and **does not activate the membership solely because a receipt was uploaded**.

An authorized finance/reviewer role can:

- approve;
- reject;
- request correction;
- record verification notes;
- reconcile the payment to a membership.

Every decision is auditable.

### Online payment

The same payment record supports an online provider adapter. Provider callbacks/webhooks must be idempotent and must not be trusted solely from the browser.

### Historical payment

Legacy payments remain marked as `legacy_import`. They can support historical membership evidence and reconciliation but are never represented as a gateway-confirmed payment unless separately verified.

## Docker is optional

Docker is a deployment/development convenience, **not an application requirement**.

The application can run directly with Node.js and a PostgreSQL database:

    Node.js 20+
    PostgreSQL 15/16+
    npm test
    npm start

Docker Compose is provided for reproducible local setup and CI-like development. It is useful for:

- consistent PostgreSQL version;
- one-command local environment;
- isolated dependencies;
- easier onboarding;
- repeatable deployment packaging.

It is not required for:

- application code;
- tests that do not require PostgreSQL;
- production;
- managed PostgreSQL;
- VM/bare-metal deployment;
- Kubernetes/container platforms.

The only runtime dependency that remains mandatory is the configured database and other selected infrastructure services. Provider adapters keep storage, notification and payment implementations replaceable.

## Phase exit implication

Membership migration and manual payment verification are now part of the foundation contract and must be preserved when the membership module is implemented.

## Independent application and payment stages

Application review and payment collection are independent records and decisions.

- A member may submit payment evidence while the application is `submitted`, `in_review`, `correction_required`, or `payment_pending`.
- Early payment submission does not change the application status. Finance can verify the amount, currency, reference and private evidence while a reviewer separately evaluates eligibility.
- If finance verifies payment before approval, the application remains in its review state. A later approval moves it to `paid`; activation still requires the existing server-side activation gate.
- If the application is rejected after an early payment has succeeded, the payment remains visible in the authorized review queue for reconciliation/refund handling. Rejection never silently erases a received payment.
- Duplicate pending payment submissions are blocked. Rejected, failed, refunded or cancelled payment records remain auditable.

The separate member workspace is `/membership/payment`. The membership application workspace is `/membership`. Receipt uploads use the existing private upload service and checksum confirmation; they are attached to the payment transaction and are never public.

## Configured payment methods

Authorized membership/finance administrators configure methods in `/admin/membership/payment-methods`; member-facing instructions appear in the signed-in `/membership/payment` journey. Supported manual evidence methods include local bank transfer, Telebirr, cash/in-person and other manual payments. Bank/account details, currency, instructions and an optional HTTPS QR image URL are stored in the existing `membership_payment_method` configuration table; the application never hardcodes actual account numbers. Bank and Telebirr references are required for those methods. Account details are not served to unauthenticated public visitors. Payment transactions preserve the method details captured at submission time in an immutable snapshot so later configuration edits do not rewrite historical payment context.

### Chapa hosted checkout

Chapa is implemented as a server-side hosted checkout adapter. Keep the private key and webhook secret only in the API environment; never enter them in the browser or payment-method form. Configure these environment variables before enabling a Chapa method:

- `CHAPA_SECRET_KEY`: Chapa private key (use a test key during acceptance).
- `CHAPA_WEBHOOK_SECRET`: secret used to authenticate the raw-body HMAC-SHA256 webhook signature.
- `CHAPA_CALLBACK_URL`: public HTTPS URL ending in `/api/v1/payments/chapa/webhook`.
- `CHAPA_RETURN_URL`: public HTTPS member payment page URL.

The API initializes hosted checkout with a unique merchant reference (20 characters or fewer) and idempotency key. Membership fees are converted to Chapa integer minor units; this adapter currently permits ETB and USD only until other currency precision is explicitly validated. The return URL is not trusted as proof of payment. The webhook signature is checked against the exact raw request bytes using constant-time comparison, then the API independently calls Chapa's verification endpoint and checks final status, merchant reference, amount and currency. Authenticated final webhook payloads are deduplicated by raw-body SHA-256 scoped to the test/live environment. Only a server-verified success updates the payment transaction. Application approval and membership activation remain separate.

Do not enable live payments until a Chapa merchant account has confirmed which payment methods are enabled, HTTPS callback/return URLs are reachable, test-mode success/failure/pending/replay cases pass, and finance has reviewed reconciliation and refund operations. No live credentials or bank/Telebirr account details are included in this repository.
