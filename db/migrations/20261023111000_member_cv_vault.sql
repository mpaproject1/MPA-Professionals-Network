-- A member-owned private CV pointer. Sharing happens only by attaching it to a specific application.
alter table professional_profile
  add column if not exists cv_file_id uuid references file_object(id) on delete set null,
  add column if not exists cv_updated_at timestamptz;

create index if not exists professional_profile_cv_file_idx
  on professional_profile(cv_file_id) where cv_file_id is not null;
