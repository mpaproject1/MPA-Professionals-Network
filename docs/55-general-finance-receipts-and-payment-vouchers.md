# General finance receipts and QR payment vouchers

## Scope
Adds a finance-owned ledger for manual receipts from members, organizations, sponsors, donors and other payers. It deliberately does not create membership applications or write to the membership payment tables. An optional linked active app_user is validated; payer name/contact details and organization name remain historical snapshots.

## Lifecycle and controls
- Finance records a receipt as `recorded`; it is not proof that funds were received.
- A separately authorized finance verifier records `verified` or `rejected`. Rejection requires a reason.
- Voucher issuance is separately authorized and allowed only when the payment record is verified.
- Vouchers have a random bearer token stored only as SHA-256; the token is returned once at issuance. Public verification requires both voucher id and token and returns limited receipt data. The voucher can represent either a verified general finance receipt or a successful, non-reversed membership payment; the database enforces exactly one source record per voucher.
- One active voucher per general finance receipt and one active voucher per membership payment are enforced by partial unique indexes. A voucher is not an account, membership card or membership activation.
- Private bank evidence references the existing private file store. Upload/confirm remains authenticated; the finance record accepts only a private file created by the recording finance user.
- Every create, decision, voucher issue/reissue and reversal is audited. Bank-transfer entries require either a receipt evidence file or a bank reference. Duplicate bank references are rejected for the same bank, currency and amount.

## Fields
Payer type/name/email/phone, optional linked user, organization name, amount/currency, purpose, payment method/date, bank name/reference, external reference, private evidence file, notes, recording actor, verification actor/time/note and voucher state.

## Organization and member attribution
Organization attribution supports an optional foreign key to the canonical organization table, with the display name retained as a historical snapshot. The service validates the selected organization before linking it. User attribution is relational and validated against an active app_user. If no match exists, finance can enter the payer details manually; no fake organization or user records are created.

## Delivery status
This includes both manual finance receipts and voucher issuance for existing successfully verified membership payments. This is source/schema implementation only. Migration is not applied to any database and no deployment is performed. Run full PR Quality (including migration compatibility, PostgreSQL integration, Biome, TypeScript, build and browser acceptance) before considering ready.
