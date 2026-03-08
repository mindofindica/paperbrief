-- Daily digest entries — which papers appeared in which track on which date
-- Populated by arxiv-coach pipeline; read by PaperBrief web digest page.

CREATE TABLE paper_digest_entries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date       DATE NOT NULL,
  arxiv_id   TEXT NOT NULL REFERENCES papers(arxiv_id) ON DELETE CASCADE,
  track      TEXT NOT NULL,
  llm_score  SMALLINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (date, arxiv_id, track)
);

CREATE INDEX idx_digest_entries_date ON paper_digest_entries(date DESC);
CREATE INDEX idx_digest_entries_arxiv_id ON paper_digest_entries(arxiv_id);

ALTER TABLE paper_digest_entries ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "digest_entries_readable_by_auth" ON paper_digest_entries
  FOR SELECT USING (auth.role() = 'authenticated');
