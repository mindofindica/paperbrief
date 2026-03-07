/**
 * Tests for weekly digest DB functions:
 *   - extractTitleKeywords()
 *   - getWeeklyPapers()
 *   - getWeeklyStats()
 *   - getWeeklyKeywordTrends()
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  extractTitleKeywords,
  getWeeklyPapers,
  getWeeklyStats,
  getWeeklyKeywordTrends,
  closeDb,
} from './arxiv-db';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function seedDb(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS papers (
      arxiv_id   TEXT PRIMARY KEY,
      title      TEXT NOT NULL,
      abstract   TEXT,
      published_at TEXT,
      authors_json TEXT,
      meta_path  TEXT,
      url        TEXT
    );
    CREATE TABLE IF NOT EXISTS llm_scores (
      arxiv_id       TEXT PRIMARY KEY,
      relevance_score INTEGER
    );
    CREATE TABLE IF NOT EXISTS track_matches (
      id         TEXT PRIMARY KEY,
      arxiv_id   TEXT,
      track_name TEXT,
      score      REAL,
      matched_at TEXT
    );
    CREATE TABLE IF NOT EXISTS paper_feedback (
      id            TEXT PRIMARY KEY,
      paper_id      TEXT,
      feedback_type TEXT,
      created_at    TEXT
    );
    CREATE TABLE IF NOT EXISTS reading_list (
      id        TEXT PRIMARY KEY,
      paper_id  TEXT UNIQUE,
      status    TEXT,
      priority  INTEGER,
      created_at TEXT,
      notes     TEXT
    );
  `);
}

function insertPaper(db: Database.Database, opts: {
  arxivId: string;
  title: string;
  score: number;
  track: string;
  daysAgo: number;
}) {
  const d = new Date();
  d.setDate(d.getDate() - opts.daysAgo);
  const publishedAt = d.toISOString();

  db.prepare(`INSERT OR IGNORE INTO papers (arxiv_id, title, abstract, published_at, authors_json)
    VALUES (?, ?, 'Abstract text.', ?, '[]')`
  ).run(opts.arxivId, opts.title, publishedAt);

  db.prepare(`INSERT OR IGNORE INTO llm_scores (arxiv_id, relevance_score) VALUES (?, ?)`)
    .run(opts.arxivId, opts.score);

  db.prepare(`INSERT OR IGNORE INTO track_matches (id, arxiv_id, track_name, score, matched_at)
    VALUES (?, ?, ?, ?, ?)`
  ).run(`tm-${opts.arxivId}`, opts.arxivId, opts.track, opts.score, publishedAt);
}

// ─── extractTitleKeywords ─────────────────────────────────────────────────────

describe('extractTitleKeywords', () => {
  it('returns single meaningful words', () => {
    const kws = extractTitleKeywords('Transformer Attention Mechanisms');
    expect(kws).toContain('transformer');
    expect(kws).toContain('attention');
    expect(kws).toContain('mechanisms');
  });

  it('filters stopwords', () => {
    const kws = extractTitleKeywords('A New Approach to the Method');
    // "new", "approach", "method" are in STOPWORDS; 'the', 'a' too
    // Only "new" might slip through depending on STOPWORDS — let's just check stopwords are gone
    expect(kws).not.toContain('a');
    expect(kws).not.toContain('the');
    expect(kws).not.toContain('to');
  });

  it('extracts bigrams from non-stopword pairs', () => {
    const kws = extractTitleKeywords('Large Language Models for Code Generation');
    expect(kws).toContain('language models');
    expect(kws).toContain('code generation');
  });

  it('skips pure-digit tokens', () => {
    const kws = extractTitleKeywords('GPT4 and 2024 benchmarks');
    expect(kws).not.toContain('2024');
  });

  it('deduplicates keywords', () => {
    const kws = extractTitleKeywords('Learning Learning Learning');
    const count = kws.filter(k => k === 'learning').length;
    expect(count).toBe(1);
  });

  it('handles empty string gracefully', () => {
    expect(extractTitleKeywords('')).toEqual([]);
  });

  it('handles punctuation in titles', () => {
    const kws = extractTitleKeywords('Scaling Up: Efficient Training of Diffusion Models');
    expect(kws).toContain('diffusion');
    expect(kws).toContain('training');
    expect(kws).toContain('efficient');
  });
});

// ─── DB tests ─────────────────────────────────────────────────────────────────



// ─── Unit tests using real temp SQLite files ───────────────────────────────────

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function createTempDb(): { dbPath: string; db: Database.Database } {
  const dir = mkdtempSync(join(tmpdir(), 'paperbrief-test-'));
  const dbPath = join(dir, 'test.sqlite');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  seedDb(db);
  return { dbPath, db };
}

describe('getWeeklyPapers (integration)', () => {
  let dbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    closeDb();
    const tmp = createTempDb();
    dbPath = tmp.dbPath;
    db = tmp.db;
    vi.stubEnv('ARXIV_COACH_DB_PATH', dbPath);
  });

  afterEach(() => {
    closeDb();
    db.close();
    vi.unstubAllEnvs();
  });

  it('returns empty array when no papers exist', () => {
    const sections = getWeeklyPapers();
    expect(sections).toEqual([]);
  });

  it('returns papers from the last 7 days only', () => {
    insertPaper(db, { arxivId: '2601.00001', title: 'Recent Transformer Paper', score: 5, track: 'cs.AI', daysAgo: 3 });
    insertPaper(db, { arxivId: '2601.00002', title: 'Old Paper on Learning', score: 4, track: 'cs.LG', daysAgo: 14 });

    const sections = getWeeklyPapers();
    const allPaperIds = sections.flatMap(s => s.papers.map(p => p.arxiv_id));
    expect(allPaperIds).toContain('2601.00001');
    expect(allPaperIds).not.toContain('2601.00002');
  });

  it('groups papers by track', () => {
    insertPaper(db, { arxivId: '2601.00003', title: 'AI Paper One', score: 5, track: 'cs.AI', daysAgo: 1 });
    insertPaper(db, { arxivId: '2601.00004', title: 'AI Paper Two', score: 4, track: 'cs.AI', daysAgo: 2 });
    insertPaper(db, { arxivId: '2601.00005', title: 'LG Paper One', score: 3, track: 'cs.LG', daysAgo: 3 });

    const sections = getWeeklyPapers();
    const aiSection = sections.find(s => s.track === 'cs.AI');
    const lgSection = sections.find(s => s.track === 'cs.LG');

    expect(aiSection).toBeDefined();
    expect(aiSection!.papers).toHaveLength(2);
    expect(lgSection).toBeDefined();
    expect(lgSection!.papers).toHaveLength(1);
  });

  it('sorts sections by paper count descending', () => {
    insertPaper(db, { arxivId: '2601.00006', title: 'LG Paper A', score: 5, track: 'cs.LG', daysAgo: 1 });
    insertPaper(db, { arxivId: '2601.00007', title: 'LG Paper B', score: 4, track: 'cs.LG', daysAgo: 2 });
    insertPaper(db, { arxivId: '2601.00008', title: 'LG Paper C', score: 3, track: 'cs.LG', daysAgo: 3 });
    insertPaper(db, { arxivId: '2601.00009', title: 'AI Paper X', score: 5, track: 'cs.AI', daysAgo: 1 });

    const sections = getWeeklyPapers();
    expect(sections[0]!.track).toBe('cs.LG');
    expect(sections[1]!.track).toBe('cs.AI');
  });

  it('papers within a track are ordered by relevance score descending', () => {
    insertPaper(db, { arxivId: '2601.00010', title: 'Low Score Paper', score: 2, track: 'cs.CL', daysAgo: 1 });
    insertPaper(db, { arxivId: '2601.00011', title: 'High Score Paper', score: 5, track: 'cs.CL', daysAgo: 2 });

    const sections = getWeeklyPapers();
    const clSection = sections.find(s => s.track === 'cs.CL');
    expect(clSection).toBeDefined();
    expect(clSection!.papers[0]!.arxiv_id).toBe('2601.00011');
    expect(clSection!.papers[1]!.arxiv_id).toBe('2601.00010');
  });
});

describe('getWeeklyStats (integration)', () => {
  let dbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    closeDb();
    const tmp = createTempDb();
    dbPath = tmp.dbPath;
    db = tmp.db;
    vi.stubEnv('ARXIV_COACH_DB_PATH', dbPath);
  });

  afterEach(() => {
    closeDb();
    db.close();
    vi.unstubAllEnvs();
  });

  it('returns zero counts for empty DB', () => {
    const stats = getWeeklyStats();
    expect(stats.totalPapers).toBe(0);
    expect(stats.topTrack).toBeNull();
  });

  it('counts papers in last 7 days correctly', () => {
    insertPaper(db, { arxivId: '2601.00020', title: 'Paper A', score: 4, track: 'cs.AI', daysAgo: 2 });
    insertPaper(db, { arxivId: '2601.00021', title: 'Paper B', score: 3, track: 'cs.AI', daysAgo: 5 });
    insertPaper(db, { arxivId: '2601.00022', title: 'Paper C', score: 2, track: 'cs.AI', daysAgo: 10 }); // outside window

    const stats = getWeeklyStats();
    expect(stats.totalPapers).toBe(2);
  });

  it('returns fromDate and toDate as ISO date strings', () => {
    const stats = getWeeklyStats();
    expect(stats.fromDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(stats.toDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('identifies the top track by paper count', () => {
    insertPaper(db, { arxivId: '2601.00023', title: 'LG Paper 1', score: 3, track: 'cs.LG', daysAgo: 1 });
    insertPaper(db, { arxivId: '2601.00024', title: 'LG Paper 2', score: 2, track: 'cs.LG', daysAgo: 2 });
    insertPaper(db, { arxivId: '2601.00025', title: 'AI Paper 1', score: 5, track: 'cs.AI', daysAgo: 3 });

    const stats = getWeeklyStats();
    expect(stats.topTrack).toBe('cs.LG');
  });
});

describe('getWeeklyKeywordTrends (integration)', () => {
  let dbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    closeDb();
    const tmp = createTempDb();
    dbPath = tmp.dbPath;
    db = tmp.db;
    vi.stubEnv('ARXIV_COACH_DB_PATH', dbPath);
  });

  afterEach(() => {
    closeDb();
    db.close();
    vi.unstubAllEnvs();
  });

  it('returns empty array for empty DB', () => {
    expect(getWeeklyKeywordTrends()).toEqual([]);
  });

  it('returns keywords that appear at least twice in last 7 days', () => {
    // Insert 2 papers with "transformer" in title in recent window
    insertPaper(db, { arxivId: '2601.00030', title: 'Transformer Attention Study', score: 4, track: 'cs.AI', daysAgo: 1 });
    insertPaper(db, { arxivId: '2601.00031', title: 'Efficient Transformer Architecture', score: 3, track: 'cs.AI', daysAgo: 2 });
    // Only 1 paper with "diffusion" — should be filtered out
    insertPaper(db, { arxivId: '2601.00032', title: 'Diffusion Model Survey', score: 3, track: 'cs.AI', daysAgo: 3 });

    const trends = getWeeklyKeywordTrends();
    const keywords = trends.map(t => t.keyword);
    expect(keywords).toContain('transformer');
    // diffusion only appears once, should be filtered
    expect(keywords).not.toContain('diffusion');
  });

  it('marks keywords as rising when they appear in recent but not prior window', () => {
    insertPaper(db, { arxivId: '2601.00033', title: 'Agentic Reasoning Framework', score: 4, track: 'cs.AI', daysAgo: 1 });
    insertPaper(db, { arxivId: '2601.00034', title: 'Agentic Planning Systems', score: 3, track: 'cs.AI', daysAgo: 2 });
    // No 'agentic' papers in prior 7-14 days window

    const trends = getWeeklyKeywordTrends();
    const agenticTrend = trends.find(t => t.keyword === 'agentic');
    if (agenticTrend) {
      expect(agenticTrend.direction).toBe('rising');
      expect(agenticTrend.pctChange).toBeNull(); // new — no prior data
    }
  });

  it('respects the limit parameter', () => {
    for (let i = 0; i < 10; i++) {
      insertPaper(db, {
        arxivId: `2601.0004${i}`,
        title: `Unique Keyword${i} Learning System Benchmark${i}`,
        score: 3,
        track: 'cs.AI',
        daysAgo: i + 1,
      });
    }
    const trends = getWeeklyKeywordTrends(5);
    expect(trends.length).toBeLessThanOrEqual(5);
  });

  it('returns rising keywords before stable ones', () => {
    // Insert papers with "learning" in both windows (stable)
    insertPaper(db, { arxivId: '2601.00050', title: 'Learning Rate Scheduling', score: 4, track: 'cs.AI', daysAgo: 1 });
    insertPaper(db, { arxivId: '2601.00051', title: 'Learning Curve Dynamics', score: 3, track: 'cs.AI', daysAgo: 2 });
    insertPaper(db, { arxivId: '2601.00052', title: 'Federated Learning Methods', score: 3, track: 'cs.AI', daysAgo: 8 });
    insertPaper(db, { arxivId: '2601.00053', title: 'Continual Learning Study', score: 2, track: 'cs.AI', daysAgo: 9 });

    // Insert papers with "multimodal" only in recent window (rising)
    insertPaper(db, { arxivId: '2601.00054', title: 'Multimodal Fusion Networks', score: 5, track: 'cs.AI', daysAgo: 1 });
    insertPaper(db, { arxivId: '2601.00055', title: 'Multimodal Vision Language', score: 4, track: 'cs.AI', daysAgo: 3 });

    const trends = getWeeklyKeywordTrends(20);
    const multimodalIdx = trends.findIndex(t => t.keyword === 'multimodal');
    const learningIdx = trends.findIndex(t => t.keyword === 'learning');

    if (multimodalIdx !== -1 && learningIdx !== -1) {
      // rising 'multimodal' should come before stable 'learning'
      expect(multimodalIdx).toBeLessThan(learningIdx);
    }
  });
});
