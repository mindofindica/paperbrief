-- Fix get_trending_papers: published_date → published_at, pde.score → pde.llm_score
DROP FUNCTION IF EXISTS get_trending_papers(INT, INT);
CREATE OR REPLACE FUNCTION get_trending_papers(
  days INT DEFAULT 7,
  lim  INT DEFAULT 20
)
RETURNS TABLE (
  arxiv_id         TEXT,
  title            TEXT,
  abstract         TEXT,
  authors          TEXT[],
  published_date   DATE,
  avg_score        NUMERIC,
  appearance_count BIGINT,
  categories       TEXT[]
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
    p.published_at::DATE,
    ROUND(AVG(pde.llm_score)::NUMERIC, 2) AS avg_score,
    COUNT(*)                               AS appearance_count,
    p.categories
  FROM paper_digest_entries pde
  JOIN papers p ON p.arxiv_id = pde.arxiv_id
  WHERE pde.created_at >= now() - (days || ' days')::INTERVAL
  GROUP BY p.arxiv_id, p.title, p.abstract, p.authors, p.published_at, p.categories
  HAVING COUNT(*) >= 1
  ORDER BY avg_score DESC, appearance_count DESC
  LIMIT lim;
END;
$$;

GRANT EXECUTE ON FUNCTION get_trending_papers(INT, INT) TO anon, authenticated;
