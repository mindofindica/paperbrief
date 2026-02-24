-- PaperBrief database schema
-- Migration 001: core tables

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Tracks ───────────────────────────────────────────────────────────────────
-- A user's research interest track (e.g. "Speculative Decoding")

CREATE TABLE tracks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  keywords    TEXT[] NOT NULL DEFAULT '{}',
  arxiv_cats  TEXT[] NOT NULL DEFAULT ARRAY['cs.LG', 'cs.CL', 'cs.AI'],
  min_score   SMALLINT NOT NULL DEFAULT 3 CHECK (min_score BETWEEN 0 AND 5),
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tracks_user_id ON tracks(user_id) WHERE active = true;

-- ─── Papers ───────────────────────────────────────────────────────────────────
-- Arxiv papers fetched and cached (shared across all users)

CREATE TABLE papers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  arxiv_id     TEXT UNIQUE NOT NULL,
  version      TEXT NOT NULL DEFAULT 'v1',
  title        TEXT NOT NULL,
  abstract     TEXT,
  authors      TEXT[] NOT NULL DEFAULT '{}',
  categories   TEXT[] NOT NULL DEFAULT '{}',
  published_at DATE,
  updated_at   DATE,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_papers_arxiv_id ON papers(arxiv_id);
CREATE INDEX idx_papers_published_at ON papers(published_at DESC);

-- ─── Paper Scores ─────────────────────────────────────────────────────────────
-- LLM-generated relevance scores per paper per track

CREATE TABLE paper_scores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id    UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  track_id    UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  score       SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 5),
  reason      TEXT,
  summary     TEXT,
  scored_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (paper_id, track_id)
);

CREATE INDEX idx_paper_scores_track_id ON paper_scores(track_id, score DESC);

-- ─── Deliveries ───────────────────────────────────────────────────────────────
-- Record of each digest delivery sent to a user

CREATE TABLE deliveries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_of      DATE NOT NULL,
  papers_sent  INT NOT NULL DEFAULT 0,
  channels     TEXT[] NOT NULL DEFAULT ARRAY['email'],
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_of)
);

CREATE INDEX idx_deliveries_user_id ON deliveries(user_id, week_of DESC);

-- ─── Reading List ─────────────────────────────────────────────────────────────
-- Papers saved by users for later reading

CREATE TABLE reading_list (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paper_id    UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  note        TEXT,
  saved_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, paper_id)
);

CREATE INDEX idx_reading_list_user_id ON reading_list(user_id, saved_at DESC);

-- ─── RLS Policies ─────────────────────────────────────────────────────────────
-- Row-level security: users can only see/modify their own data

ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_list ENABLE ROW LEVEL SECURITY;
-- papers is shared (read-only for users, writable by service role)
ALTER TABLE papers ENABLE ROW LEVEL SECURITY;

-- Tracks: users own their tracks
CREATE POLICY "users_own_tracks" ON tracks
  FOR ALL USING (auth.uid() = user_id);

-- Papers: all authenticated users can read
CREATE POLICY "papers_readable_by_auth" ON papers
  FOR SELECT USING (auth.role() = 'authenticated');

-- Paper scores: users can read scores for their own tracks
CREATE POLICY "scores_for_own_tracks" ON paper_scores
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tracks t WHERE t.id = track_id AND t.user_id = auth.uid()
    )
  );

-- Deliveries: users own their delivery records
CREATE POLICY "users_own_deliveries" ON deliveries
  FOR ALL USING (auth.uid() = user_id);

-- Reading list: users own their reading list
CREATE POLICY "users_own_reading_list" ON reading_list
  FOR ALL USING (auth.uid() = user_id);

-- ─── Updated At Trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tracks_updated_at
  BEFORE UPDATE ON tracks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
