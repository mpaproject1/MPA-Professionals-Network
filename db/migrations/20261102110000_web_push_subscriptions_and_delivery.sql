-- Device-scoped Web Push subscriptions and transactional delivery outbox.
-- Push is opt-in: no device receives a push until the user grants browser permission
-- and registers that device. Existing notification history and preferences are preserved.
ALTER TABLE notification_preference
  ALTER COLUMN push_enabled SET DEFAULT false;

CREATE TABLE IF NOT EXISTS notification_push_subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  endpoint_sha256 text NOT NULL,
  p256dh text NOT NULL,
  auth_secret text NOT NULL,
  expiration_time timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT notification_push_subscription_endpoint_hash_unique UNIQUE(endpoint_sha256),
  CONSTRAINT notification_push_subscription_https CHECK (left(endpoint,8)='https://'),
  CONSTRAINT notification_push_subscription_hash CHECK (endpoint_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS ix_notification_push_subscription_user_active
  ON notification_push_subscription(user_id,created_at DESC)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS notification_push_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_event_id uuid NOT NULL REFERENCES notification_event(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES notification_push_subscription(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  last_status_code integer,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_push_delivery_status_valid CHECK (status IN ('pending','sending','sent','failed')),
  CONSTRAINT notification_push_delivery_attempts_valid CHECK (attempts >= 0),
  CONSTRAINT notification_push_delivery_unique UNIQUE(notification_event_id,subscription_id)
);

CREATE INDEX IF NOT EXISTS ix_notification_push_delivery_pending
  ON notification_push_delivery(available_at,created_at)
  WHERE status='pending';
