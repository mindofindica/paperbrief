-- Migration: user_email_prefs
-- Tracks per-user email subscription preferences.
-- Needed for CAN-SPAM / GDPR compliance: every marketing email must honour
-- a working unsubscribe mechanism.

CREATE TABLE IF NOT EXISTS user_email_prefs (
  user_id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  digest_subscribed  BOOLEAN NOT NULL DEFAULT true,
  unsubscribed_at    TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Most queries will be: SELECT WHERE user_id = $1 (covered by primary key).
-- Add an index on digest_subscribed so the cron can skip unsubscribed users efficiently.
CREATE INDEX IF NOT EXISTS idx_user_email_prefs_subscribed
  ON user_email_prefs(digest_subscribed)
  WHERE digest_subscribed = false;

-- Helper: upsert a default row when a user first signs up.
-- Called from the auth verify route (or can be a DB trigger).
-- We create it here as a function so it can be invoked from application code.
CREATE OR REPLACE FUNCTION ensure_email_prefs(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO user_email_prefs (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;
