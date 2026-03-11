-- Trending papers: public SQL function for /trending page
-- Returns the top-N papers from the last N days, ranked by avg score + appearances.
--
-- Security: SECURITY DEFINER so it can read paper_digest_entries (which has RLS)
-- without requiring the caller to be authenticated. We explicitly grant EXECUTE
-- to the anon role so the API can use the public anon key for this query.
--
-- This powers the public /trending page (ISR, no auth required).

CREATE OR REPLACE FUNCTION get_trending_papers(
  days_back   INT DEFAULT 7,
  max_results INT DEFAULT 20
)
RETURNS TABLE (
  arxiv_id    TEXT,
  title       TEXT,
  abstract    TEXT,
  authors     TEXT[],
  categories  TEXT[],
  published_at DATE,
  avg_score   NUMERIC,
  appearances BIGINT,
  last_seen   DATE
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT
    p.arxiv_id,
    p.title,
    p.abstract,
    p.authors,
    p.categories,
    p.published_at,
    ROUND(AVG(de.llm_score)::numeric, 2)  AS avg_score,
    COUNT(*)::bigint                        AS appearances,
    MAX(de.date)                            AS last_seen
  FROM paper_digest_entries de
  JOIN papers p ON p.arxiv_id = de.arxiv_id
  WHERE de.date >= CURRENT_DATE - (days_back || ' days')::INTERVAL
    AND de.llm_score IS NOT NULL
  GROUP BY
    p.arxiv_id,
    p.title,
    p.abstract,
    p.authors,
    p.categories,
    p.published_at
  ORDER BY avg_score DESC, appearances DESC
  LIMIT max_results;
$$;

-- Grant public execute — the function reads internal tables via SECURITY DEFINER
-- so the caller never touches the raw tables directly.
GRANT EXECUTE ON FUNCTION get_trending_papers(INT, INT) TO anon;
GRANT EXECUTE ON FUNCTION get_trending_papers(INT, INT) TO authenticated;
