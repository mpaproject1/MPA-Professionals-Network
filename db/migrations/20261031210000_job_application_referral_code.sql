-- Preserve a candidate's referral code while an application is saved as a draft.
alter table job_application add column if not exists referral_code text;
