-- Migration: reading_list v2
-- Adds arxiv_id (direct reference, no FK), status, and priority fields.
-- Makes paper_id nullable so new-style entries don't require a papers table row.
--
-- Background: The reading_list table was created with paper_id UUID FK to papers(id).
-- In practice, paper metadata lives in a local SQLite DB on the VPS (for scoring).
-- To properly support multi-user reading lists on Vercel, we store arxiv_id directly
-- and join with the local DB for metadata at read time.

-- Step 1: Make paper_id nullable (new entries use arxiv_id, not FK)
ALTER TABLE reading_list ALTER COLUMN paper_id DROP NOT NULL;

-- Step 2: Add new columns
ALTER TABLE reading_list
  ADD COLUMN IF NOT EXISTS arxiv_id TEXT,
  ADD COLUMN IF NOT EXISTS status   TEXT    NOT NULL DEFAULT 'unread',
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0;

-- Step 3: Unique index on (user_id, arxiv_id) to support upsert
-- PostgreSQL treats NULL ≠ NULL in unique indexes, so existing rows with
-- arxiv_id = NULL won't conflict. New rows (arxiv_id populated) are correctly
-- deduplicated per user.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reading_list_user_arxiv
  ON reading_list(user_id, arxiv_id);

-- Step 4: Index for status filtering
CREATE INDEX IF NOT EXISTS idx_reading_list_status
  ON reading_list(user_id, status, saved_at DESC);
