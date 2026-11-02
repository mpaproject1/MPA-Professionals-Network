create or replace view membership_fee_obligation_balance as
select o.id obligation_id,o.application_id,o.membership_record_id,o.amount_due,o.currency,o.due_date,o.status,
  coalesce(cash.verified_cash,0)::numeric(14,2) verified_cash,
  coalesce(adj.approved_adjustments,0)::numeric(14,2) approved_non_cash,
  greatest(0,o.amount_due-coalesce(cash.verified_cash,0)-coalesce(adj.approved_adjustments,0))::numeric(14,2) outstanding_balance,
  greatest(0,coalesce(cash.verified_cash,0)+coalesce(adj.approved_adjustments,0)-o.amount_due)::numeric(14,2) overpaid_balance
from membership_fee_obligation o
left join lateral (
  select sum(pt.amount) verified_cash
  from membership_fee_obligation_payment op
  join payment_transaction pt on pt.id=op.payment_transaction_id and pt.status='succeeded' and pt.currency=o.currency
  where op.obligation_id=o.id
    and not exists(select 1 from membership_payment_reversal rev where rev.payment_transaction_id=pt.id)
) cash on true
left join lateral (
  select sum(a.amount) approved_adjustments
  from membership_fee_adjustment a where a.obligation_id=o.id and a.status='approved' and a.currency=o.currency
) adj on true;
