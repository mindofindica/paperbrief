-- Migration: RLS fixes + SECURITY DEFINER search_path hardening
-- Addresses Supabase Security Advisor warnings detected 2026-03-07

-- ============================================================
-- 1. paper_explanations — shared read-only content
--    Authenticated users can read; only service role can write.
-- ============================================================
ALTER TABLE paper_explanations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "paper_explanations_readable_by_auth"
  ON paper_explanations FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- 2. user_actions — anonymous action log (no auth.uid linkage)
--    No anon reads; service role bypasses RLS for writes.
-- ============================================================
ALTER TABLE user_actions ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read their own actions (matched by source session)
-- Since user_id here is a TEXT field (not UUID auth.uid), we lock to service role writes only.
-- Anon cannot read or write.

-- ============================================================
-- 3. user_email_prefs — users own their own prefs
-- ============================================================
ALTER TABLE user_email_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_email_prefs"
  ON user_email_prefs FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 4. SECURITY DEFINER functions — set search_path to prevent
--    search_path injection attacks (Supabase advisor warning)
-- ============================================================

-- ensure_email_prefs
CREATE OR REPLACE FUNCTION ensure_email_prefs(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO user_email_prefs (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

-- get_trending_papers (defined in 20260311000002_trending_papers.sql)
-- Re-create with search_path hardened
CREATE OR REPLACE FUNCTION get_trending_papers(
  days INT DEFAULT 7,
  lim  INT DEFAULT 20
)
RETURNS TABLE (
  arxiv_id       TEXT,
  title          TEXT,
  abstract       TEXT,
  authors        TEXT[],
  published_date DATE,
  avg_score      NUMERIC,
  appearance_count BIGINT,
  categories     TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.arxiv_id,
    p.title,
    p.abstract,
    p.authors,
    p.published_date,
    ROUND(AVG(pde.score)::NUMERIC, 2)   AS avg_score,
    COUNT(DISTINCT pde.user_id)         AS appearance_count,
    p.categories
  FROM paper_digest_entries pde
  JOIN papers p ON p.arxiv_id = pde.arxiv_id
  WHERE pde.created_at >= now() - (days || ' days')::INTERVAL
  GROUP BY p.arxiv_id, p.title, p.abstract, p.authors, p.published_date, p.categories
  HAVING COUNT(DISTINCT pde.user_id) >= 1
  ORDER BY avg_score DESC, appearance_count DESC
  LIMIT lim;
END;
$$;

GRANT EXECUTE ON FUNCTION get_trending_papers(INT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION ensure_email_prefs(UUID) TO authenticated;
