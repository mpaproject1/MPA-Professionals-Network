-- Workstream 1: retry-safe application creation and configured manual-evidence requirements.
-- Additive only: preserve every existing application/payment and do not rewrite lifecycle state.
alter table membership_application
  add column if not exists submission_idempotency_key text,
  add column if not exists submission_payload_sha256 char(64);

create unique index if not exists ux_membership_application_user_submission_key
  on membership_application(user_id, submission_idempotency_key)
  where submission_idempotency_key is not null;

alter table membership_payment_method
  add column if not exists requires_evidence boolean not null default true;

-- Hosted provider checkout is independently verified server-to-server; never require a receipt upload for it.
update membership_payment_method
set requires_evidence=false, updated_at=now()
where method_type='chapa' and requires_evidence=true;
