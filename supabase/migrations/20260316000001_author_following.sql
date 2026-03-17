-- Author Following System for PaperBrief
-- Allows users to follow specific researchers by name and see their papers
-- 
-- Design notes:
-- - author_name is stored as entered (display name) — users know the name format from paper bylines
-- - arxiv_author_id is optional — arXiv doesn't have stable author IDs, this is a future hook
-- - UNIQUE(user_id, author_name) prevents duplicates; follow is idempotent via ON CONFLICT DO NOTHING

CREATE TABLE IF NOT EXISTS author_follows (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT author_follows_unique UNIQUE (user_id, author_name)
);

-- Index for fast lookup of follows by user
CREATE INDEX IF NOT EXISTS author_follows_user_idx ON author_follows (user_id, created_at DESC);

-- RLS: each user can only see/modify their own follows
ALTER TABLE author_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "author_follows_select" ON author_follows
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "author_follows_insert" ON author_follows
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "author_follows_delete" ON author_follows
  FOR DELETE USING (auth.uid() = user_id);

-- Helper function: get papers by followed authors for a user
-- Returns distinct papers from the papers table where any followed author appears in the authors array
-- Used by the /following page to surface "Papers from authors you follow"
CREATE OR REPLACE FUNCTION get_papers_by_followed_authors(
  p_user_id UUID,
  p_limit   INT DEFAULT 20,
  p_offset  INT DEFAULT 0
)
RETURNS TABLE (
  arxiv_id      TEXT,
  title         TEXT,
  authors       TEXT[],
  abstract      TEXT,
  published_at  DATE,
  categories    TEXT[],
  llm_score     NUMERIC,
  matched_author TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT DISTINCT ON (p.arxiv_id)
    p.arxiv_id,
    p.title,
    p.authors,
    p.abstract,
    p.published_at::DATE,
    p.categories,
    p.llm_score,
    af.author_name AS matched_author
  FROM papers p
  CROSS JOIN author_follows af
  WHERE af.user_id = p_user_id
    AND EXISTS (
      SELECT 1 FROM unnest(p.authors) AS a
      WHERE LOWER(a) LIKE LOWER('%' || af.author_name || '%')
    )
  ORDER BY p.arxiv_id, p.published_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION get_papers_by_followed_authors(UUID, INT, INT) TO authenticated;
