#!/usr/bin/env node
/**
 * Seed Supabase `papers` table from local arxiv-coach SQLite DB.
 * Upserts in batches of 200. Safe to re-run (upsert on arxiv_id).
 *
 * Usage: node scripts/seed-papers.mjs
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *      (or set ARXIV_COACH_DB_PATH to override default SQLite path)
 */

import Database from 'better-sqlite3';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://otekgfkmkrpwidqjslmo.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_PATH = process.env.ARXIV_COACH_DB_PATH || '/root/.openclaw/state/arxiv-coach/db.sqlite';
const BATCH_SIZE = 200;

if (!SUPABASE_KEY) {
  console.error('❌  Missing SUPABASE_SERVICE_ROLE_KEY env var');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const db = new Database(DB_PATH, { readonly: true });

// Pull all papers with their best llm_score and track
const rows = db.prepare(`
  SELECT
    p.arxiv_id,
    p.latest_version as version,
    p.title,
    p.abstract,
    p.authors_json,
    p.categories_json,
    p.published_at,
    p.updated_at,
    p.ingested_at as fetched_at,
    ls.relevance_score,
    (SELECT track_name FROM track_matches WHERE arxiv_id = p.arxiv_id ORDER BY score DESC LIMIT 1) as track
  FROM papers p
  LEFT JOIN llm_scores ls ON p.arxiv_id = ls.arxiv_id
`).all();

console.log(`📦  ${rows.length} papers to seed...`);

let inserted = 0;
let failed = 0;

for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const batch = rows.slice(i, i + BATCH_SIZE).map(row => ({
    arxiv_id: row.arxiv_id,
    version: row.version || 'v1',
    title: row.title,
    abstract: row.abstract,
    authors: (() => { try { return JSON.parse(row.authors_json || '[]'); } catch { return []; } })(),
    categories: (() => { try { return JSON.parse(row.categories_json || '[]'); } catch { return []; } })(),
    published_at: row.published_at,
    updated_at: row.updated_at || null,
    fetched_at: row.fetched_at || new Date().toISOString(),
  }));

  const { error, count } = await supabase
    .from('papers')
    .upsert(batch, { onConflict: 'arxiv_id', ignoreDuplicates: false })
    .select('arxiv_id', { count: 'exact', head: true });

  if (error) {
    console.error(`  ❌  Batch ${i}–${i + batch.length}: ${error.message}`);
    failed += batch.length;
  } else {
    inserted += batch.length;
    process.stdout.write(`  ✅  ${inserted}/${rows.length}\r`);
  }
}

console.log(`\n\n🎉  Done. Seeded ${inserted} papers, ${failed} failed.`);
db.close();
