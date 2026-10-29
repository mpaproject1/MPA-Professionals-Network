-- Governed public video stories for completed service engagements and mentorship relationships.
-- Stories are public only after explicit participant consent and moderator approval.
CREATE TABLE IF NOT EXISTS public_media_story (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_listing_id uuid REFERENCES service_listing(id) ON DELETE RESTRICT,
  mentor_profile_id uuid REFERENCES mentor_profile(id) ON DELETE RESTRICT,
  author_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 4 AND 120),
  summary text NOT NULL CHECK (length(trim(summary)) BETWEEN 20 AND 1200),
  transcript text NOT NULL CHECK (length(trim(transcript)) BETWEEN 20 AND 12000),
  video_url text NOT NULL CHECK (video_url ~ '^https://[^/@[:space:]]+([/?#].*)?$'),
  attribution_mode text NOT NULL CHECK (attribution_mode IN ('named','anonymous')),
  attribution_name text,
  evidence_status text NOT NULL DEFAULT 'participant_reported' CHECK (evidence_status='participant_reported'),
  consent_confirmed boolean NOT NULL CHECK (consent_confirmed=true),
  consent_version text NOT NULL CHECK (consent_version='public-media-story-v1'),
  consent_text_snapshot text NOT NULL CHECK (length(trim(consent_text_snapshot)) BETWEEN 40 AND 1000),
  consented_at timestamptz NOT NULL,
  consent_withdrawn_at timestamptz,
  moderation_status text NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending','approved','rejected','withdrawn')),
  moderation_note text,
  moderated_by uuid REFERENCES app_user(id) ON DELETE RESTRICT,
  moderated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((CASE WHEN service_listing_id IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN mentor_profile_id IS NOT NULL THEN 1 ELSE 0 END) = 1),
  CHECK ((attribution_mode='anonymous' AND attribution_name IS NULL) OR (attribution_mode='named' AND attribution_name IS NOT NULL AND length(trim(attribution_name)) BETWEEN 1 AND 120)),
  CHECK ((moderation_status IN ('pending','rejected') AND moderated_at IS NULL) OR (moderation_status IN ('approved','withdrawn') AND moderated_at IS NOT NULL) OR moderation_status='rejected'),
  CHECK (consent_withdrawn_at IS NULL OR moderation_status='withdrawn')
);
CREATE INDEX IF NOT EXISTS ix_public_media_story_service_public ON public_media_story(service_listing_id,moderation_status,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_public_media_story_mentor_public ON public_media_story(mentor_profile_id,moderation_status,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_public_media_story_author ON public_media_story(author_user_id,created_at DESC);
COMMENT ON TABLE public_media_story IS 'Participant-submitted video stories. Public visibility requires consent not withdrawn and moderation_status=approved; evidence is labelled participant-reported.';
