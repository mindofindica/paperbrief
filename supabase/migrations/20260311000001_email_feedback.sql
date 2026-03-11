-- PaperBrief: email feedback table
--
-- Stores one-click 👍/👎 feedback from digest email links.
-- Token-verified (no login required), idempotent upsert.
--
-- Separate from user_actions (which is web-only, no user_id) because:
--   1. We know the user_id (from HMAC token payload)
--   2. Email sentiment is binary (like/skip) vs. 5-action web enum
--   3. Clean separation makes personalization queries simpler

CREATE TABLE IF NOT EXISTS email_feedback (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  arxiv_id    TEXT NOT NULL,
  sentiment   TEXT NOT NULL CHECK (sentiment IN ('like', 'skip')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, arxiv_id)           -- one feedback per user per paper (last wins)
);

CREATE INDEX idx_email_feedback_user    ON email_feedback(user_id, created_at DESC);
CREATE INDEX idx_email_feedback_arxiv   ON email_feedback(arxiv_id, sentiment);

-- RLS: users can read their own feedback; service role writes via API
ALTER TABLE email_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_email_feedback" ON email_feedback
  FOR SELECT USING (auth.uid() = user_id);

-- No user INSERT/UPDATE policy — writes come from the service role
-- via the /api/feedback/email endpoint (token-verified, no session).

COMMENT ON TABLE email_feedback IS
  'One-click 👍/👎 feedback submitted via links embedded in digest emails.
   Written by the service role after HMAC token verification.
   Upserted (UNIQUE user_id + arxiv_id) so changing your mind works.';
