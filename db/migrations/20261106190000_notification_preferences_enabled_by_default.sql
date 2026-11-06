-- Enable every in-app notification category for new and existing preferences by default.
-- Preserve explicit member opt-outs by letting existing keys override the defaults.
ALTER TABLE notification_preference
  ALTER COLUMN in_app_categories SET DEFAULT '{"membership":true,"verification":true,"opportunities":true,"recruitment":true,"organizations":true,"mentorship":true,"services":true,"events_learning":true,"community_impact":true,"community_campaign":true,"network_plus":true,"security":true,"system":true}'::jsonb;

UPDATE notification_preference
SET in_app_categories = '{"membership":true,"verification":true,"opportunities":true,"recruitment":true,"organizations":true,"mentorship":true,"services":true,"events_learning":true,"community_impact":true,"community_campaign":true,"network_plus":true,"security":true,"system":true}'::jsonb || COALESCE(in_app_categories, '{}'::jsonb)
WHERE in_app_categories IS NULL
   OR NOT (in_app_categories ?& ARRAY['membership', 'verification', 'opportunities', 'recruitment', 'organizations', 'mentorship', 'services', 'events_learning', 'community_impact', 'community_campaign', 'network_plus', 'security', 'system']);
