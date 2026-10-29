-- Workstream 7: account recovery controls. Safe to apply to existing deployments.
alter table app_user
  add column if not exists credential_setup_required boolean not null default false,
  add column if not exists credential_setup_expires_at timestamptz,
  add column if not exists recovery_email text,
  add column if not exists recovery_email_verified_at timestamptz,
  add column if not exists recovery_email_pending text,
  add column if not exists recovery_email_change_token_hash text,
  add column if not exists recovery_email_change_expires_at timestamptz;

create index if not exists app_user_recovery_email_lower_idx
  on app_user (lower(recovery_email))
  where recovery_email is not null;

create index if not exists app_user_recovery_email_pending_lower_idx
  on app_user (lower(recovery_email_pending))
  where recovery_email_pending is not null;

-- Recovery tokens are stored only as SHA-256 verifiers; no raw token is persisted.
comment on column app_user.recovery_email_change_token_hash is
  'SHA-256 verifier for a single-use, short-lived recovery-email verification token; never store the raw token.';
