-- Migration: first_login tracking
-- Adds first_login_at and onboarding_complete to user_settings.
-- first_login_at: set when a user first uses a magic link (converts from signup to active user)
-- onboarding_complete: set to true after user completes the /onboarding track-selection step

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS first_login_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_sent_at  TIMESTAMPTZ;

COMMENT ON COLUMN user_settings.first_login_at IS
  'Timestamp of the user''s first successful magic link login. NULL = never logged in.';

COMMENT ON COLUMN user_settings.onboarding_complete IS
  'True once the user has completed the onboarding track-selection step.';

COMMENT ON COLUMN user_settings.onboarding_sent_at IS
  'Timestamp when the onboarding active email was sent. NULL = not yet sent.';
