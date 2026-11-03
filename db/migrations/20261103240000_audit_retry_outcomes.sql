-- Email retry scheduling is a durable audit outcome, distinct from a
-- provider failure. Preserve the existing success/failure values and admit
-- the retry state emitted by the shared email dispatcher.
alter table audit_log
  drop constraint if exists audit_log_outcome_check;

alter table audit_log
  add constraint audit_log_outcome_check
  check (outcome in ('success','failure','retry_scheduled'));
