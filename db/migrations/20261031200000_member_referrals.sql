-- Member invitations and job-specific employment referrals.
-- Attribution is separate from membership decisions and hiring decisions.
create table if not exists member_referral_code (
 id uuid primary key default gen_random_uuid(),
 member_user_id uuid not null unique references app_user(id) on delete restrict,
 code text not null unique check(code ~ '^MPA-[A-Z2-9]{8}$'),
 status text not null default 'active' check(status in ('active','suspended','revoked')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists member_referral_attribution (
 id uuid primary key default gen_random_uuid(),
 referral_type text not null check(referral_type in ('membership','employment')),
 referrer_user_id uuid not null references app_user(id) on delete restrict,
 referred_user_id uuid not null references app_user(id) on delete restrict,
 job_id uuid references job(id) on delete restrict,
 job_application_id uuid references job_application(id) on delete restrict,
 referral_code_id uuid not null references member_referral_code(id) on delete restrict,
 status text not null default 'attributed' check(status in ('attributed','registered','email_verified','membership_application_submitted','membership_approved','membership_declined','application_submitted','membership_activated','candidate_confirmed','shortlisted','interview','offer_accepted','employment_reported','employment_verified','declined','withdrawn','disputed')),
 status_visibility_consent boolean not null default false,
 candidate_consent_at timestamptz,
 employment_verified_at timestamptz,
 employment_verified_by uuid references app_user(id) on delete restrict,
 verification_method text check(verification_method is null or verification_method in ('employer_confirmation','candidate_and_employer_confirmation','approved_private_evidence')),
 verification_reference text check(verification_reference is null or length(verification_reference) between 4 and 500),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(referrer_user_id<>referred_user_id),
 check((referral_type='membership' and job_id is null and job_application_id is null) or (referral_type='employment' and job_id is not null)),
 check((employment_verified_at is null and employment_verified_by is null and verification_method is null) or (employment_verified_at is not null and employment_verified_by is not null and verification_method is not null))
);
create unique index if not exists uq_member_referral_membership_referred on member_referral_attribution(referred_user_id) where referral_type='membership';
create unique index if not exists uq_member_referral_employment_application on member_referral_attribution(job_application_id) where referral_type='employment' and job_application_id is not null;
create index if not exists ix_member_referral_referrer on member_referral_attribution(referrer_user_id,created_at desc);
create index if not exists ix_member_referral_job on member_referral_attribution(job_id,created_at desc) where referral_type='employment';
create table if not exists member_referral_event (
 id uuid primary key default gen_random_uuid(),
 attribution_id uuid not null references member_referral_attribution(id) on delete restrict,
 actor_user_id uuid references app_user(id) on delete restrict,
 event_code text not null check(event_code in ('attributed','registered','email_verified','membership_application_submitted','membership_approved','membership_declined','application_submitted','membership_activated','candidate_confirmed','shortlisted','interview','offer_accepted','employment_reported','employment_verified','declined','withdrawn','disputed')),
 from_status text,
 to_status text not null,
 reason text,
 metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
 created_at timestamptz not null default now()
);
create index if not exists ix_member_referral_event_history on member_referral_event(attribution_id,created_at);
create table if not exists member_referral_score_policy (
 id uuid primary key default gen_random_uuid(),
 version integer not null unique check(version>0),
 points jsonb not null check(jsonb_typeof(points)='object'),
 status text not null default 'draft' check(status in ('draft','approved','active','retired')),
 created_by uuid not null references app_user(id) on delete restrict,
 approved_by uuid references app_user(id) on delete restrict,
 approval_reason text,
 approved_at timestamptz,
 activated_at timestamptz,
 created_at timestamptz not null default now(),
 check((status='draft' and approved_by is null and approved_at is null and activated_at is null) or (status in ('approved','active','retired') and approved_by is not null and approved_at is not null)),
 check(approved_by is null or approved_by<>created_by)
);
create unique index if not exists uq_member_referral_active_score_policy on member_referral_score_policy((status)) where status='active';
create table if not exists member_referral_score_ledger (
 id uuid primary key default gen_random_uuid(),
 attribution_id uuid not null references member_referral_attribution(id) on delete restrict,
 event_code text not null,
 points integer not null check(points between 0 and 100000),
 policy_id uuid not null references member_referral_score_policy(id) on delete restrict,
 created_at timestamptz not null default now(),
 unique(attribution_id,event_code)
);
create or replace function prevent_member_referral_history_mutation() returns trigger language plpgsql as $$
begin raise exception 'Referral event and score ledger history is immutable' using errcode='23514'; end; $$;
drop trigger if exists trg_member_referral_event_immutable on member_referral_event;
create trigger trg_member_referral_event_immutable before update or delete on member_referral_event for each row execute function prevent_member_referral_history_mutation();
drop trigger if exists trg_member_referral_score_immutable on member_referral_score_ledger;
create trigger trg_member_referral_score_immutable before update or delete on member_referral_score_ledger for each row execute function prevent_member_referral_history_mutation();
