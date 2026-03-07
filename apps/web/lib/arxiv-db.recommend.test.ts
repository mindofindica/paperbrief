import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createSchema(db: any) {
  db.exec(`
    CREATE TABLE papers (
      arxiv_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      abstract TEXT,
      published_at TEXT,
      authors_json TEXT
    );

    CREATE TABLE llm_scores (
      arxiv_id TEXT PRIMARY KEY,
      relevance_score REAL
    );

    CREATE TABLE track_matches (
      arxiv_id TEXT NOT NULL,
      track_name TEXT NOT NULL,
      score REAL DEFAULT 0
    );

    CREATE TABLE paper_feedback (
      id TEXT PRIMARY KEY,
      paper_id TEXT NOT NULL,
      feedback_type TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE reading_list (
      id TEXT PRIMARY KEY,
      paper_id TEXT NOT NULL,
      status TEXT NOT NULL,
      priority INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);
}

async function setupModule() {
  vi.resetModules();
  process.env.ARXIV_COACH_DB_PATH = ':memory:';
  const mod = await import('./arxiv-db');
  const db = mod.getRawDb();
  createSchema(db);
  return { mod, db };
}

function seedPaper(db: any, {
  id,
  score,
  track,
  publishedAt,
}: {
  id: string;
  score: number;
  track: string;
  publishedAt: string;
}) {
  db.prepare(`
    INSERT INTO papers (arxiv_id, title, abstract, published_at, authors_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, `Paper ${id}`, `Abstract ${id}`, publishedAt, '["Alice", "Bob"]');

  db.prepare(`
    INSERT INTO llm_scores (arxiv_id, relevance_score)
    VALUES (?, ?)
  `).run(id, score);

  db.prepare(`
    INSERT INTO track_matches (arxiv_id, track_name, score)
    VALUES (?, ?, ?)
  `).run(id, track, score);
}

describe('getRecommendations', () => {
  let closeDb: (() => void) | null = null;

  beforeEach(() => {
    closeDb = null;
  });

  afterEach(() => {
    if (closeDb) closeDb();
  });

  it('returns top papers by relevance when no feedback exists', async () => {
    const { mod, db } = await setupModule();
    closeDb = mod.closeDb;

    seedPaper(db, { id: '2601.00001', score: 2, track: 'cs.LG', publishedAt: '2026-01-01' });
    seedPaper(db, { id: '2601.00002', score: 5, track: 'cs.AI', publishedAt: '2026-01-02' });
    seedPaper(db, { id: '2601.00003', score: 4, track: 'cs.CL', publishedAt: '2026-01-03' });

    const papers = mod.getRecommendations(2);

    expect(papers).toHaveLength(2);
    expect(papers[0].arxiv_id).toBe('2601.00002');
    expect(papers[1].arxiv_id).toBe('2601.00003');
  });

  it('filters out already-seen and reading-list papers when feedback exists', async () => {
    const { mod, db } = await setupModule();
    closeDb = mod.closeDb;

    seedPaper(db, { id: '2602.00001', score: 5, track: 'cs.LG', publishedAt: '2026-02-01' }); // loved seed
    seedPaper(db, { id: '2602.00002', score: 4, track: 'cs.LG', publishedAt: '2026-02-02' }); // should stay
    seedPaper(db, { id: '2602.00003', score: 3, track: 'cs.LG', publishedAt: '2026-02-03' }); // seen
    seedPaper(db, { id: '2602.00004', score: 2, track: 'cs.LG', publishedAt: '2026-02-04' }); // reading list

    db.prepare(`
      INSERT INTO paper_feedback (id, paper_id, feedback_type, created_at)
      VALUES ('f1', '2602.00001', 'love', '2026-02-05'),
             ('f2', '2602.00003', 'skip', '2026-02-05')
    `).run();

    db.prepare(`
      INSERT INTO reading_list (id, paper_id, status, priority, created_at)
      VALUES ('r1', '2602.00004', 'unread', 1, '2026-02-05')
    `).run();

    const papers = mod.getRecommendations(10);

    expect(papers.map((p: { arxiv_id: string }) => p.arxiv_id)).toEqual(['2602.00002']);
  });

  it('returns papers from preferred tracks', async () => {
    const { mod, db } = await setupModule();
    closeDb = mod.closeDb;

    seedPaper(db, { id: '2603.00001', score: 5, track: 'cs.AI', publishedAt: '2026-03-01' }); // save seed
    seedPaper(db, { id: '2603.00002', score: 4, track: 'cs.CV', publishedAt: '2026-03-02' }); // excluded track
    seedPaper(db, { id: '2603.00003', score: 3, track: 'cs.AI', publishedAt: '2026-03-03' }); // included

    db.prepare(`
      INSERT INTO paper_feedback (id, paper_id, feedback_type, created_at)
      VALUES ('f1', '2603.00001', 'save', '2026-03-04')
    `).run();

    const papers = mod.getRecommendations(10);

    expect(papers.map((p: { arxiv_id: string }) => p.arxiv_id)).toEqual(['2603.00003']);
  });
});
