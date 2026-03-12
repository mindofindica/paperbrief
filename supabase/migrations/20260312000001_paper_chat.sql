-- Migration: paper_chat_messages
-- Paper Chat is a Pro-only feature: conversational AI for paper detail pages.
-- Each conversation is scoped to a (user_id, arxiv_id) pair.

CREATE TABLE IF NOT EXISTS paper_chat_messages (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  arxiv_id      TEXT        NOT NULL,
  role          TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content       TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast history retrieval
CREATE INDEX IF NOT EXISTS paper_chat_messages_user_paper_idx
  ON paper_chat_messages (user_id, arxiv_id, created_at);

-- RLS: users can only see/write their own messages
ALTER TABLE paper_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "paper_chat_select_own"
  ON paper_chat_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "paper_chat_insert_own"
  ON paper_chat_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "paper_chat_delete_own"
  ON paper_chat_messages FOR DELETE
  USING (auth.uid() = user_id);

-- Service-role bypass (for API routes using service key)
-- Service role ignores RLS by default in Supabase, no extra policy needed.

COMMENT ON TABLE paper_chat_messages IS
  'Stores chat history for PaperBrief paper-chat (Pro feature). '
  'Each row is one turn in a conversation about a specific arxiv paper.';
