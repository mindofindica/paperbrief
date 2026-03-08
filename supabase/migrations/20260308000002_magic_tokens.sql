-- Magic tokens for passwordless login (idempotent)
CREATE TABLE IF NOT EXISTS magic_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token      TEXT UNIQUE NOT NULL,
  user_id    TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_magic_tokens_token ON magic_tokens(token) WHERE used = false;
CREATE INDEX IF NOT EXISTS idx_magic_tokens_expires ON magic_tokens(expires_at);

ALTER TABLE magic_tokens ENABLE ROW LEVEL SECURITY;
