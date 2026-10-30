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
| Failed, refunded and reversed payments | Failed transactions are distinguished from refund/reversal outcomes. Reversal type and reason come from the reversal record. |
| Membership collections by currency | Gross verified includes succeeded plus refunded transactions; refunds/reversals are shown separately; net collected equals currently succeeded, non-reversed transactions. |
| Outstanding membership payments | Approved/payment_pending applications without a currently succeeded, non-reversed linked payment. Amount/currency come from the immutable fee snapshot. |
| Finance summary by currency | Period summary of collections, failures, refunds/reversals, reconciliation and outstanding balances, with each currency kept separate. |

The existing payment reconciliation report is also corrected:
- It is restricted to membership-linked transactions.
- It selects the latest reconciliation record per transaction rather than multiplying rows if reconciliation history has more than one record.
- Its currency totals separate approved, failed, refunded/reversed and pending amounts instead of summing incompatible transaction states into one misleading figure.

## Financial calculation rules

- **Approved payment:** transaction status `succeeded` and no reversal record.
- **Failed payment:** transaction status `failed`; this is not a refund.
- **Refund/reversal:** transaction status `refunded`; reversal type and reason are sourced from `membership_payment_reversal` where present.
- **Gross verified:** amount from transactions currently `succeeded` or `refunded`; this retains visibility of refunded transactions in the gross figure.
- **Refunds/reversals:** amount from transactions currently `refunded`.
- **Net collected:** amount from currently `succeeded`, non-reversed transactions. This is not a cross-currency grand total.
- **Matched:** currently succeeded, non-reversed transactions with latest reconciliation status `matched`.
- **Unreconciled:** currently succeeded, non-reversed transactions whose latest reconciliation status is not `matched`, including absent reconciliation records.
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
- Finance report rows are checked for applicant contact identity fields.
- Existing PDF/XLSX empty-state, export-format and report-filter tests remain in place.
- Permission migration tests assert that `finance.view` is registered without assigning it to accounts.

## Known validation boundary

The report queries and UI changes are committed to the feature branch, but this document does not claim that CI or browser acceptance passed. The preceding Phase 1 PR Quality run #804 failed in Biome, TypeScript, backend PostgreSQL tests and Next.js/browser acceptance; its log retrieval returned a GitHub 404. The latest branch head must pass the full PR Quality workflow before Phase 2 or Phase 1 is marked complete.

No production database migration or deployment has been executed.
