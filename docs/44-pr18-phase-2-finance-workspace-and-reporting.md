# PR #18 — Phase 2: Finance Workspace and Reporting Completion

## Scope and safety

Implemented on `feat/workstream-3-progress-members-workspace`. This phase completes the finance workspace and finance reporting definitions using the existing membership payment lifecycle and persisted payment/reversal/reconciliation records.

No production database changes, payment edits, membership decisions, permission assignments to users, or deployment are performed. The only migration addition is the `finance.view` permission catalogue entry in the existing additive Phase 1 permission migration. It grants read-only finance workspace/report access and does not grant verification, reversal, membership review, or activation.

The server remains authoritative for every report request and export. The finance UI is a discovery and operational interface only.

## Finance workspace

The `/admin/finance` workspace now includes:

- A current finance summary grouped independently by currency.
- Explicit gross verified, refunds/reversals, net collected, failed amount, matched amount, unreconciled amount and outstanding balance.
- Counts for approved, failed, refunded/reversed payments and outstanding applications.
- Direct links to the five focused finance reports plus payment reconciliation.
- The existing privacy-minimized payment queue and separate payment verification/reversal actions.
- A clear boundary: payment verification does not approve or activate membership.

The summary loads independently from the payment queue. A summary failure is surfaced without hiding a successfully loaded payment queue; denied finance access clears stale summary and queue data.

## Finance report catalogue

The existing 18 reports are preserved. Five finance reports are added, bringing the administrator catalogue to 23:

| Report | Definition |
| --- | --- |
| Approved membership payments | Currently succeeded membership transactions only; excludes failed, pending and refunded/reversed transactions. |
| Failed, refunded, reversed and disputed payments | Failed transactions are distinguished from refund/reversal outcomes and successful payments with a disputed reconciliation state. Written-off reconciliation states remain distinct in the summary. Reversal type and reason come from the reversal record. |
| Membership collections by currency | Gross verified includes succeeded plus refunded transactions; refunds/reversals are shown separately; net collected equals currently succeeded, non-reversed transactions. |
| Outstanding membership payments | Approved/payment_pending applications without a currently succeeded, non-reversed linked payment. Amount/currency come from the immutable fee snapshot. |
| Finance summary by currency | Period summary of collections, failures, refunds/reversals, matched/unreconciled/disputed/written-off reconciliation amounts and outstanding balances, with each currency kept separate. |

The existing payment reconciliation report is also corrected:
- It is restricted to membership-linked transactions.
- It selects the latest reconciliation record per transaction rather than multiplying rows if reconciliation history has more than one record.
- Its currency totals separate approved, failed, refunded/reversed, pending (initiated and pending), and cancelled amounts instead of summing incompatible transaction states into one misleading figure.

## Financial calculation rules

- **Approved payment:** transaction status `succeeded` and no reversal record.
- **Failed payment:** transaction status `failed`; this is not a refund.
- **Refund/reversal:** transaction status `refunded`; reversal type and reason are sourced from `membership_payment_reversal` where present.
- **Gross verified:** amount from transactions currently `succeeded` or `refunded`; this retains visibility of refunded transactions in the gross figure.
- **Refunds/reversals:** amount from transactions currently `refunded`.
- **Net collected:** amount from currently `succeeded`, non-reversed transactions. This is not a cross-currency grand total.
- **Matched:** currently succeeded, non-reversed transactions with latest reconciliation status `matched`.
- **Unreconciled:** currently succeeded, non-reversed transactions whose latest reconciliation status is `unreconciled` or absent.
- **Disputed:** currently succeeded, non-reversed transactions whose latest reconciliation status is `disputed`. Refunded/reversed transactions remain in the refund/reversal category rather than being double-counted as disputed.
- **Written off:** currently succeeded, non-reversed transactions whose latest reconciliation status is `written_off`.
- **Outstanding:** applications in `approved` or `payment_pending` with no currently succeeded, non-reversed linked payment. A refunded transaction does not settle the balance.

Payment reporting periods use verification/completion timestamps where available, falling back to transaction creation time. Outstanding applications use application creation time. All amount summaries are grouped by currency; no FX conversion or cross-currency summation is inferred.

## Authorization

- Finance Officers and system administrators can access finance reports.
- `finance.view` provides read-only access to the finance workspace and finance reports.
- `finance.payment.verify` and `finance.payment.reverse` remain distinct mutation permissions.
- Membership reviewers do not receive finance report access merely through `reports.view`.
- Finance roles do not receive member-directory PII or membership application review/activation permissions.
- Every report run and export continues through the existing backend authorization and audit path.

## Regression coverage

- Catalogue count and preservation of all original reports, plus the five new finance reports.
- Finance Officer can discover and execute finance reports but cannot access the member directory.
- Membership reviewer with generic `reports.view` cannot discover or execute restricted finance reports.
- Finance report execution is exercised against the disposable PostgreSQL database as part of the report query matrix.
- Finance report rows are checked for applicant contact identity fields. Regression coverage also asserts the 5,000-row cap is disclosed rather than silently presenting a potentially incomplete detail export. PostgreSQL fixtures verify a matched ETB collection, an unreconciled USD collection, a disputed USD payment, failed and refunded ETB transactions, and outstanding balances across both currencies.
- Existing PDF/XLSX empty-state, export-format and report-filter tests remain in place.
- Permission migration tests assert that `finance.view` is registered without assigning it to accounts.

## Known validation boundary

The report queries and UI changes are committed to the feature branch, but this document does not claim that CI or browser acceptance passed. The latest observed PR Quality run #905 for code commit `56da8b278972dc6890cabb05b8c1ff24c4b4a0f6` failed in all four jobs: Biome, TypeScript, backend PostgreSQL tests and Next.js/browser acceptance. GitHub returned empty step summaries and `404 BlobNotFound` for the job logs, so the failure causes remain unverified. JavaScript syntax parsing passed for `src/platform/reports.js`, `test/p2/report-exports.test.js` and `test/p0/role-workspace-authorization.test.js`; this is not a substitute for executing those tests. The latest branch head must pass the full PR Quality workflow before Phase 2 or Phase 1 is marked complete.

No production database migration or deployment has been executed.


## Current PR Quality evidence update — 2026-11-04

The previous pending/no-run statement is superseded for automated PR Quality validation by [run 41772344170](https://github.com/mpaproject1/MPA-Professionals-Network/actions/runs/41772344170), run #1358, on exact commit `494b8c97b83029868dabc725839d3621995879fe`. The workflow completed successfully: Biome lint, TypeScript, Next.js production build plus the configured Chromium/browser and membership-card PDF acceptance, and disposable-PostgreSQL migration compatibility plus the complete backend test-file suite all passed. See [the consolidated validation record](78-pr-quality-run-41772344170-validation-record.md).

This corrects only the CI evidence status. It does not close any separately listed manual/device/browser journey, live deployment, provider-delivery, scheduled-operation, data-governance, encryption-key rotation, or other product acceptance gap that this run did not execute.
