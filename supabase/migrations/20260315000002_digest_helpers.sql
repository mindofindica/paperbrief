-- Helper: look up user email by UUID (avoids broken auth.admin API on free tier)
CREATE OR REPLACE FUNCTION get_user_email_by_id(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT email FROM auth.users WHERE id = p_user_id LIMIT 1; $$;
GRANT EXECUTE ON FUNCTION get_user_email_by_id(UUID) TO service_role;

-- Helper: select papers matching track keywords for digest delivery
-- Filters by keyword match (title/abstract), categories, min LLM score,
-- excludes already-sent paper IDs, and limits to last 30 days.
CREATE OR REPLACE FUNCTION search_papers_for_digest(
  p_keywords    TEXT[],
  p_categories  TEXT[],
  p_min_score   NUMERIC,
  p_exclude_ids TEXT[],
  p_limit       INT DEFAULT 10
)
RETURNS TABLE(
  arxiv_id    TEXT,
  title       TEXT,
  abstract    TEXT,
  authors     TEXT[],
  categories  TEXT[],
  published_at DATE,
  llm_score   SMALLINT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    p.arxiv_id,
    p.title,
    p.abstract,
    p.authors,
    p.categories,
    p.published_at,
    ps.score AS llm_score
  FROM papers p
  LEFT JOIN paper_scores ps ON ps.paper_id = p.id
  WHERE
    (
      SELECT bool_or(
        lower(p.title)    LIKE '%' || lower(kw) || '%' OR
        lower(p.abstract) LIKE '%' || lower(kw) || '%'
      )
      FROM unnest(p_keywords) AS kw
    )
    AND (p_categories IS NULL OR p.categories && p_categories)
    AND (ps.score IS NULL OR ps.score >= p_min_score)
    AND (p_exclude_ids IS NULL OR p.arxiv_id != ALL(p_exclude_ids))
    AND p.published_at >= CURRENT_DATE - INTERVAL '30 days'
  ORDER BY COALESCE(ps.score, 0) DESC, p.published_at DESC
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION search_papers_for_digest(TEXT[], TEXT[], NUMERIC, TEXT[], INT) TO service_role;
