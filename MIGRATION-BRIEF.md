# PaperBrief — SQLite → Supabase Migration

## Goal
Migrate paper data from local SQLite (`/root/.openclaw/state/arxiv-coach/db.sqlite`) to Supabase so that the PaperBrief Next.js app (deployed on Vercel) can read real paper data instead of returning 500 errors.

## Repos
- **Web app**: `/root/repos/paperbrief/` (monorepo, Next.js app at `apps/web/`)
- **arxiv-coach**: `/root/.openclaw/workspace/projects/arxiv-coach/`
- **Supabase project ref**: `otekgfkmkrpwidqjslmo`
- **Supabase URL**: `https://otekgfkmkrpwidqjslmo.supabase.co`

## Supabase credentials
```bash
export SUPABASE_ACCESS_TOKEN=$(pass show deploy/supabase-token | head -1)
# Supabase anon key and service role key:
pass show deploy/supabase-keys
```

## SQLite source DB
- **Path**: `/root/.openclaw/state/arxiv-coach/db.sqlite`
- **4,253 papers**, 928 llm_scores, 1,098 track_matches, 4 feedback entries, 1 reading list entry

## SQLite schema (source of truth)

```sql
CREATE TABLE papers (
  arxiv_id TEXT PRIMARY KEY,
  latest_version TEXT,
  title TEXT NOT NULL,
  abstract TEXT NOT NULL,
  authors_json TEXT NOT NULL,
  categories_json TEXT NOT NULL,
  published_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  pdf_path TEXT NOT NULL,
  txt_path TEXT NOT NULL,
  meta_path TEXT NOT NULL,
  sha256_pdf TEXT,
  ingested_at TEXT NOT NULL
);
CREATE TABLE llm_scores (
  arxiv_id TEXT PRIMARY KEY,
  relevance_score INTEGER NOT NULL CHECK (relevance_score BETWEEN 1 AND 5),
  reasoning TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT 'sonnet',
  scored_at TEXT NOT NULL,
  FOREIGN KEY (arxiv_id) REFERENCES papers(arxiv_id) ON DELETE CASCADE
);
CREATE TABLE track_matches (
  arxiv_id TEXT NOT NULL,
  track_name TEXT NOT NULL,
  score INTEGER NOT NULL,
  matched_terms_json TEXT NOT NULL,
  matched_at TEXT NOT NULL,
  PRIMARY KEY (arxiv_id, track_name),
  FOREIGN KEY (arxiv_id) REFERENCES papers(arxiv_id) ON DELETE CASCADE
);
CREATE TABLE paper_feedback (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  paper_id TEXT NOT NULL,
  feedback_type TEXT NOT NULL,
  reason TEXT,
  tags TEXT DEFAULT '[]',
  expected_track TEXT,
  actual_interest_level INTEGER,
  UNIQUE(paper_id, feedback_type)
);
CREATE TABLE reading_list (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  paper_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread',
  priority INTEGER DEFAULT 5,
  notes TEXT,
  read_at TEXT,
  UNIQUE(paper_id)
);
CREATE TABLE sent_digests (
  digest_date TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  header_text TEXT NOT NULL,
  tracks_json TEXT NOT NULL
);
CREATE TABLE digest_papers (
  digest_id INTEGER,
  arxiv_id TEXT,
  PRIMARY KEY (digest_id, arxiv_id)
);
```

## Current web app DB layer
`apps/web/lib/arxiv-db.ts` — all functions use `better-sqlite3`. These need replacing with Supabase client calls.

Key functions used across the app:
- `getTodaysPapers()` → `digest`, `paper` pages
- `searchPapers()` → `/search`
- `getPaper()` → `/paper/[arxivId]`
- `getReadingList()` → `/reading-list`
- `writeFeedback()` → feedback API
- `updateReadingList()` → reading list API
- `getRecommendations()` → `/recommend`
- `getWeeklyPapers()`, `getWeeklyStats()`, `getWeeklyKeywordTrends()` → `/weekly`
- `getDigestDates()`, `getPapersByDate()`, `getAdjacentDigestDates()` → `/digest/archive`, `/digest/[date]`
- `getRssPapers()`, `getAvailableTracks()` → `/rss`
- `removeFromReadingList()`, `getRecommendationBasis()` → dashboard

## Environment variables in Vercel
The web app already has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` set (used for auth). We'll reuse the same Supabase project for paper data.

The `@supabase/supabase-js` package is already installed in `apps/web`.

## What to build

### 1. Supabase migration file
Create `supabase/migrations/20260308000001_paper_tables.sql` with:
- `papers` table (matching SQLite schema, use TEXT for all fields)
- `llm_scores` table
- `track_matches` table  
- `paper_feedback` table
- `reading_list` table
- `sent_digests` table (digest_date as PK)
- `digest_papers` table
- Full-text search: `tsvector` column on papers (`to_tsvector('english', title || ' ' || abstract)`) + GIN index
- RLS policies:
  - `papers`, `llm_scores`, `track_matches`, `sent_digests`, `digest_papers`: public read, service_role write
  - `paper_feedback`, `reading_list`: authenticated read+write (single user for now, can scope by user_id later)
- Indexes matching SQLite indexes

### 2. One-time data migration script
Create `scripts/migrate-to-supabase.ts` (or `.js`) in the paperbrief repo that:
- Reads all data from SQLite (`/root/.openclaw/state/arxiv-coach/db.sqlite`)
- Upserts to Supabase in batches of 100
- Tables in order: papers → llm_scores → track_matches → paper_feedback → reading_list → sent_digests → digest_papers
- Logs progress per table

### 3. Replace `apps/web/lib/arxiv-db.ts`
Rewrite all functions to use the Supabase client instead of better-sqlite3. Keep the exact same exported function signatures so no other files need changing.

For search (`searchPapers`): use PostgreSQL full-text search:
```sql
SELECT *, ts_rank(search_vector, query) as rank
FROM papers, to_tsquery('english', ?) query
WHERE search_vector @@ query
ORDER BY rank DESC LIMIT ?
```

For recommendations (`getRecommendations`): replicate the current logic using Supabase `.select()` + `.not()` chaining.

For `getWeeklyKeywordTrends`: this is complex keyword analysis. Keep it simple — just return top papers for the week, skip the bigram analysis for now (can add later). Return empty trends array `[]` temporarily.

### 4. Update arxiv-coach to write to Supabase
In `/root/.openclaw/workspace/projects/arxiv-coach/src/`:
- Find where papers are stored to SQLite (likely `storage/` or `db/` directory)
- Add Supabase write alongside existing SQLite write (dual-write, don't remove SQLite)
- Supabase service role key from `pass show deploy/supabase-keys`
- Write: new papers, llm_scores, track_matches, sent_digests

### 5. Push migration and run data migration
```bash
export SUPABASE_ACCESS_TOKEN=$(pass show deploy/supabase-token | head -1)
cd /root/repos/paperbrief
supabase db push --yes
# Then run the migration script
```

### 6. Verify
- Check row counts in Supabase match SQLite
- Test a few API routes locally if possible
- Commit everything and push to master

## Important constraints
- Do NOT remove better-sqlite3 from the web app package.json yet (other code may still reference it)
- Keep SQLite as arxiv-coach's primary store — Supabase is additive
- The Supabase anon key can be used for reads; use service role key for the migration script and arxiv-coach writes
- Keep all existing TypeScript types/interfaces in arxiv-db.ts unchanged

## Done signal
When completely finished, run:
openclaw system event --text "Done: SQLite→Supabase migration complete. Paper data live in Supabase, arxiv-db.ts rewritten, migration script run. Check Supabase dashboard to verify row counts." --mode now
