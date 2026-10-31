-- At most one compensating reversal may reference any original award, including under concurrent correction requests.
create unique index if not exists uq_community_impact_score_ledger_single_reversal
 on community_impact_score_ledger(reverses_entry_id)
 where reverses_entry_id is not null;
