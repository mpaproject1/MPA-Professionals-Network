-- Preserve the candidate's own outcome statement separately from MPA's verification reference.
alter table member_referral_attribution add column if not exists candidate_outcome_summary text;
alter table member_referral_attribution drop constraint if exists member_referral_candidate_outcome_summary_length_check;
alter table member_referral_attribution add constraint member_referral_candidate_outcome_summary_length_check
 check(candidate_outcome_summary is null or length(trim(candidate_outcome_summary)) between 20 and 1000);
