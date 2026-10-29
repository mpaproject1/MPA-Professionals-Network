-- Public media metadata for service listings and mentor profiles.
-- Banner images and video links are public listing content, never private verification evidence.
ALTER TABLE service_listing
  ADD COLUMN IF NOT EXISTS approved_banner_url text,
  ADD COLUMN IF NOT EXISTS approved_banner_alt text,
  ADD COLUMN IF NOT EXISTS video_url text;
ALTER TABLE mentor_profile
  ADD COLUMN IF NOT EXISTS approved_banner_url text,
  ADD COLUMN IF NOT EXISTS approved_banner_alt text,
  ADD COLUMN IF NOT EXISTS video_url text;

ALTER TABLE service_listing DROP CONSTRAINT IF EXISTS service_listing_approved_banner_url_https_check;
ALTER TABLE service_listing ADD CONSTRAINT service_listing_approved_banner_url_https_check
  CHECK (approved_banner_url IS NULL OR approved_banner_url ~ '^https://[^/@[:space:]]+([/?#].*)?$');
ALTER TABLE service_listing DROP CONSTRAINT IF EXISTS service_listing_video_url_https_check;
ALTER TABLE service_listing ADD CONSTRAINT service_listing_video_url_https_check
  CHECK (video_url IS NULL OR video_url ~ '^https://[^/@[:space:]]+([/?#].*)?$');
ALTER TABLE mentor_profile DROP CONSTRAINT IF EXISTS mentor_profile_approved_banner_url_https_check;
ALTER TABLE mentor_profile ADD CONSTRAINT mentor_profile_approved_banner_url_https_check
  CHECK (approved_banner_url IS NULL OR approved_banner_url ~ '^https://[^/@[:space:]]+([/?#].*)?$');
ALTER TABLE mentor_profile DROP CONSTRAINT IF EXISTS mentor_profile_video_url_https_check;
ALTER TABLE mentor_profile ADD CONSTRAINT mentor_profile_video_url_https_check
  CHECK (video_url IS NULL OR video_url ~ '^https://[^/@[:space:]]+([/?#].*)?$');

ALTER TABLE service_listing DROP CONSTRAINT IF EXISTS service_listing_approved_banner_alt_length_check;
ALTER TABLE service_listing ADD CONSTRAINT service_listing_approved_banner_alt_length_check
  CHECK (approved_banner_alt IS NULL OR length(approved_banner_alt) <= 300);
ALTER TABLE mentor_profile DROP CONSTRAINT IF EXISTS mentor_profile_approved_banner_alt_length_check;
ALTER TABLE mentor_profile ADD CONSTRAINT mentor_profile_approved_banner_alt_length_check
  CHECK (approved_banner_alt IS NULL OR length(approved_banner_alt) <= 300);
