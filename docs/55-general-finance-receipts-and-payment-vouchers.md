# General finance receipts and QR payment vouchers

## Scope
Adds a finance-owned ledger for manual receipts from members, organizations, sponsors, donors and other payers. It deliberately does not create membership applications or write to the membership payment tables. An optional linked active app_user is validated; payer name/contact details and organization name remain historical snapshots.

## Lifecycle and controls
- Finance records a receipt as `recorded`; it is not proof that funds were received.
- A separately authorized finance verifier records `verified` or `rejected`. Rejection requires a reason.
- Voucher issuance is separately authorized and allowed only when the payment record is verified.
- Vouchers have a random bearer token stored only as SHA-256; the token is returned once at issuance. Public verification requires both voucher id and token and returns limited receipt data.
- One active voucher per payment is enforced by a partial unique index. A voucher is not an account, membership card or membership activation.
- Private bank evidence references the existing private file store. Upload/confirm remains authenticated; the finance record accepts only a private file created by the recording finance user.
- Every create, decision and voucher issue is audited.

## Fields
Payer type/name/email/phone, optional linked user, organization name, amount/currency, purpose, payment method/date, bank name/reference, external reference, private evidence file, notes, recording actor, verification actor/time/note and voucher state.

## Important schema limitation
Organization attribution is preserved as an organization-name snapshot rather than a foreign key because this migration is additive and does not assume one organization table/key contract. User attribution is relational and validated against an active app_user. An organization foreign key should be added only after confirming the canonical organization identity model; no fake organization/user records are created.

## Delivery status
This is source/schema implementation only. Migration is not applied to any database and no deployment is performed. Run full PR Quality (including migration compatibility, PostgreSQL integration, Biome, TypeScript, build and browser acceptance) before considering ready.
