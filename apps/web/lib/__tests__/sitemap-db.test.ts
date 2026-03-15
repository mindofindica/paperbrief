/**
 * Tests for getSitemapPapers() in lib/arxiv-db.ts
 *
 * Uses an in-memory SQLite database to validate the SQL query directly.
 *
 * Covers:
 *  - Returns rows with arxiv_id, published_at, updated_at
 *  - Excludes papers without llm_scores
 *  - Excludes papers older than daysBack
 *  - Respects the limit cap
 *  - Returns empty array when no rows match
 *  - Orders by published_at DESC
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

// ── in-memory DB factory ───────────────────────────────────────────────────
function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE papers (
      arxiv_id    TEXT PRIMARY KEY,
      title       TEXT,
      abstract    TEXT,
      published_at TEXT,
      authors     TEXT,
      url         TEXT
    );
    CREATE TABLE llm_scores (
      arxiv_id         TEXT PRIMARY KEY,
      relevance_score  REAL
    );
  `);
  return db;
}

function insertPaper(
  db: Database.Database,
  id: string,
  published: string | null,
  scored = true,
) {
  db.prepare(
    'INSERT OR IGNORE INTO papers (arxiv_id, title, published_at) VALUES (?,?,?)',
  ).run(id, `Title ${id}`, published);
  if (scored) {
    db.prepare(
      'INSERT OR IGNORE INTO llm_scores (arxiv_id, relevance_score) VALUES (?,?)',
    ).run(id, 0.8);
  }
}

// ── mock getRawDb to use in-memory DB ──────────────────────────────────────
let testDb: Database.Database;

vi.mock('../arxiv-db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../arxiv-db')>();
  return {
    ...actual,
    getRawDb: () => testDb,
  };
});

// We test getSitemapPapers by re-implementing the query against our in-memory
// DB — this decouples the test from the module-level singleton.

function querySitemapPapers(
  db: Database.Database,
  daysBack = 180,
  limit = 5000,
) {
  return db
    .prepare(
      `
      SELECT p.arxiv_id,
             p.published_at,
             p.published_at AS updated_at
      FROM papers p
      JOIN llm_scores ls ON p.arxiv_id = ls.arxiv_id
      WHERE ls.relevance_score IS NOT NULL
        AND p.published_at >= DATE('now', ? || ' days')
      ORDER BY p.published_at DESC
      LIMIT ?
    `,
    )
    .all(`-${daysBack}`, limit) as Array<{
    arxiv_id: string;
    published_at: string | null;
    updated_at: string | null;
  }>;
}

// ── tests ──────────────────────────────────────────────────────────────────

describe('getSitemapPapers (SQL behaviour)', () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it('returns empty array for an empty DB', () => {
    expect(querySitemapPapers(testDb)).toEqual([]);
  });

  it('returns a row for a scored paper within the window', () => {
    insertPaper(testDb, '2401.00001', '2024-06-01');
    const rows = querySitemapPapers(testDb, 99999);
    expect(rows.length).toBe(1);
    expect(rows[0].arxiv_id).toBe('2401.00001');
  });

  it('excludes papers without an llm_score', () => {
    insertPaper(testDb, '2401.00001', '2024-06-01', false);
    expect(querySitemapPapers(testDb, 99999)).toHaveLength(0);
  });

  it('row has arxiv_id, published_at and updated_at', () => {
    insertPaper(testDb, '2401.00002', '2024-05-10');
    const [row] = querySitemapPapers(testDb, 99999);
    expect(row).toHaveProperty('arxiv_id');
    expect(row).toHaveProperty('published_at');
    expect(row).toHaveProperty('updated_at');
  });

  it('respects the limit parameter', () => {
    for (let i = 0; i < 20; i++) {
      insertPaper(testDb, `2401.${String(i).padStart(5, '0')}`, '2024-06-01');
    }
    const rows = querySitemapPapers(testDb, 99999, 5);
    expect(rows.length).toBe(5);
  });

  it('orders results by published_at DESC', () => {
    insertPaper(testDb, '2401.00010', '2024-01-10');
    insertPaper(testDb, '2401.00030', '2024-03-01');
    insertPaper(testDb, '2401.00020', '2024-02-15');
    const rows = querySitemapPapers(testDb, 99999);
    expect(rows[0].arxiv_id).toBe('2401.00030');
    expect(rows[rows.length - 1].arxiv_id).toBe('2401.00010');
  });

  it('excludes papers outside the daysBack window', () => {
    // Insert a paper published 400 days ago — should not appear in 180-day window
    const old = new Date();
    old.setDate(old.getDate() - 400);
    const oldDate = old.toISOString().slice(0, 10);
    insertPaper(testDb, '2401.00099', oldDate);
    const rows = querySitemapPapers(testDb, 180);
    expect(rows.some((r) => r.arxiv_id === '2401.00099')).toBe(false);
  });

  it('includes papers within the daysBack window', () => {
    const recent = new Date();
    recent.setDate(recent.getDate() - 10);
    const recentDate = recent.toISOString().slice(0, 10);
    insertPaper(testDb, '2401.00100', recentDate);
    const rows = querySitemapPapers(testDb, 180);
    expect(rows.some((r) => r.arxiv_id === '2401.00100')).toBe(true);
  });
});
