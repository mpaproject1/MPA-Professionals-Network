-- Snapshot the MPA-approved retention rule on referral records as they are created.
alter table member_referral_code add column if not exists retention_policy_version_id uuid references community_impact_retention_policy_version(id) on delete restrict;
alter table member_referral_code add column if not exists retention_policy_snapshot jsonb check(retention_policy_snapshot is null or jsonb_typeof(retention_policy_snapshot)='object');
alter table member_referral_attribution add column if not exists retention_policy_version_id uuid references community_impact_retention_policy_version(id) on delete restrict;
alter table member_referral_attribution add column if not exists retention_policy_snapshot jsonb check(retention_policy_snapshot is null or jsonb_typeof(retention_policy_snapshot)='object');
alter table member_referral_event add column if not exists retention_policy_version_id uuid references community_impact_retention_policy_version(id) on delete restrict;
alter table member_referral_event add column if not exists retention_policy_snapshot jsonb check(retention_policy_snapshot is null or jsonb_typeof(retention_policy_snapshot)='object');
alter table member_referral_score_ledger add column if not exists retention_policy_version_id uuid references community_impact_retention_policy_version(id) on delete restrict;
alter table member_referral_score_ledger add column if not exists retention_policy_snapshot jsonb check(retention_policy_snapshot is null or jsonb_typeof(retention_policy_snapshot)='object');
