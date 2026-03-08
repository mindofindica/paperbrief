-- Migration: paper_content table
-- Pre-generated AI content variants for each paper (ELI12, undergrad, engineer, TL;DR, etc.)
-- Written by arxiv-coach pipeline daily; read by PaperBrief web app on paper detail pages.

CREATE TABLE paper_content (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  arxiv_id     TEXT NOT NULL REFERENCES papers(arxiv_id) ON DELETE CASCADE,
  variant      TEXT NOT NULL,
  content      TEXT NOT NULL,
  model        TEXT NOT NULL DEFAULT 'sonnet',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (arxiv_id, variant)
);

CREATE INDEX idx_paper_content_arxiv_id ON paper_content(arxiv_id);

ALTER TABLE paper_content ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read paper content
CREATE POLICY "paper_content_readable_by_auth" ON paper_content
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only service role can insert/update (used by arxiv-coach pipeline)
-- No INSERT/UPDATE policy needed — service role bypasses RLS
