-- Migration: Stripe subscription support
-- Adds user_subscriptions table to track Free vs Pro plan status

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  plan                  TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  stripe_customer_id    TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  plan_expires_at       TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_customer ON user_subscriptions(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- RLS: users can only read their own subscription
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_subscription" ON user_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Service role handles all writes (webhook + checkout callbacks)
-- No INSERT/UPDATE/DELETE policy needed for authenticated users

-- Auto-update updated_at
CREATE TRIGGER user_subscriptions_updated_at
  BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE user_subscriptions IS 'Stripe subscription state per user. Managed by webhook handler. Free = 1 track, Pro ($12/mo) = 5 tracks + daily digest.';
