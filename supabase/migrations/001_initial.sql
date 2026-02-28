-- PaperBrief: initial schema documentation (non-migration reference)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Magic link tokens
CREATE TABLE IF NOT EXISTS magic_tokens (
  id BIGSERIAL PRIMARY KEY,
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL DEFAULT 'default',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_magic_tokens_token ON magic_tokens(token);

-- User research tracks
CREATE TABLE IF NOT EXISTS tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  keywords TEXT[] NOT NULL DEFAULT '{}',
  arxiv_cats TEXT[] NOT NULL DEFAULT ARRAY['cs.LG', 'cs.CL', 'cs.AI'],
  min_score SMALLINT NOT NULL DEFAULT 3 CHECK (min_score BETWEEN 0 AND 10),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tracks_user_id ON tracks(user_id) WHERE active = true;

-- Digest delivery log
CREATE TABLE IF NOT EXISTS deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_of DATE NOT NULL,
  papers_sent INT NOT NULL DEFAULT 0,
  channels TEXT[] NOT NULL DEFAULT ARRAY['email'],
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_of)
);

CREATE INDEX IF NOT EXISTS idx_deliveries_user_id ON deliveries(user_id, week_of DESC);

-- Waitlist
CREATE TABLE IF NOT EXISTS paperbrief_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  source TEXT DEFAULT 'landing',
  created_at TIMESTAMPTZ DEFAULT now()
);
