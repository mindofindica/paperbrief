-- PaperBrief v1 Reader UI tables

CREATE TABLE IF NOT EXISTS magic_tokens (
  id BIGSERIAL PRIMARY KEY,
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL DEFAULT 'default',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_magic_tokens_token ON magic_tokens(token);

CREATE TABLE IF NOT EXISTS paper_explanations (
  id BIGSERIAL PRIMARY KEY,
  arxiv_id TEXT NOT NULL,
  level TEXT NOT NULL,  -- 'tldr', 'medium', 'deep'
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(arxiv_id, level)
);

CREATE TABLE IF NOT EXISTS user_actions (
  id BIGSERIAL PRIMARY KEY,
  arxiv_id TEXT NOT NULL,
  action TEXT NOT NULL,  -- 'read', 'save', 'love', 'meh', 'skip'
  source TEXT DEFAULT 'web',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_actions_arxiv ON user_actions(arxiv_id);
