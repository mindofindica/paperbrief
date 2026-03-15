-- Migration: user_settings
-- Stores per-user digest preferences: frequency override, delivery hour, paused state.
--
-- digest_frequency_override:
--   'auto'        — use plan default (weekly for free, daily for pro)
--   'daily'       — every day (Pro only; falls back to auto if plan degrades)
--   'twice_weekly'— Mon + Thu delivery (Pro only)
--   'weekly'      — once per week (available on all plans)
--
-- digest_hour: UTC hour for digest delivery (0–23, default 7 = 07:00 UTC)
-- digest_paused: when true, no digests are sent (user can resume anytime)

CREATE TABLE IF NOT EXISTS user_settings (
  user_id        UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  digest_frequency_override  TEXT    NOT NULL DEFAULT 'auto'
    CHECK (digest_frequency_override IN ('auto', 'daily', 'twice_weekly', 'weekly')),
  digest_hour    INT         NOT NULL DEFAULT 7
    CHECK (digest_hour >= 0 AND digest_hour <= 23),
  digest_paused  BOOLEAN     NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_user_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_user_settings_updated_at();

-- RLS: users can only read/write their own settings
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_settings_self_select ON user_settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY user_settings_self_insert ON user_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_settings_self_update ON user_settings
  FOR UPDATE USING (auth.uid() = user_id);

-- Service role bypasses RLS (used by the API via service key)
