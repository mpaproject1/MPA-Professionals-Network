-- Align the persistent challenge limit with the application contract (ten attempts).
-- Existing challenge rows are retained; no user, session or registration records are changed.
alter table security_human_challenge drop constraint if exists security_human_challenge_failed_attempts_check;
alter table security_human_challenge add constraint security_human_challenge_failed_attempts_check check (failed_attempts between 0 and 10);
