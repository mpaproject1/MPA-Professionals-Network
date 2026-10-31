-- Historical contributions have no external source key; deduplicate exact normalized claim fingerprints per contributor.
alter table community_impact_score_source_link
 add column if not exists source_fingerprint text;
create unique index if not exists uq_community_impact_score_historical_fingerprint
 on community_impact_score_source_link(subject_user_id,source_fingerprint)
 where source_type='historical_contribution' and source_fingerprint is not null;
