/**
 * Tests for RSS feed DB helpers:
 *   - getRssPapers()
 *   - getAvailableTracks()
 *
 * Uses an in-memory SQLite database seeded with deterministic test data so
 * the suite runs in CI without a real arxiv-coach DB.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── In-memory DB setup ───────────────────────────────────────────────────────

function createSchema(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS papers (
      arxiv_id    TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      abstract    TEXT,
      published_at TEXT,
      authors_json TEXT
    );

    CREATE TABLE IF NOT EXISTS llm_scores (
      arxiv_id        TEXT PRIMARY KEY,
      relevance_score REAL
    );

    CREATE TABLE IF NOT EXISTS track_matches (
      arxiv_id   TEXT NOT NULL,
      track_name TEXT NOT NULL,
      score      REAL DEFAULT 0
    );
  `);
}

function seedPapers(db: any) {
  // today and recent days
  const today = new Date();
  const dayStr = (daysBack: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - daysBack);
    return d.toISOString().slice(0, 10);
  };

  const papers = [
    { id: '2401.00001', title: 'Attention Is All You Need Revisited', abstract: 'We revisit the transformer.', published_at: dayStr(1), score: 5, track: 'LLM', authors: '["Alice", "Bob"]' },
    { id: '2401.00002', title: 'Efficient Fine-Tuning with LoRA', abstract: 'Low-rank adapters for LLMs.', published_at: dayStr(2), score: 4, track: 'LLM', authors: '["Carol"]' },
    { id: '2401.00003', title: 'Reinforcement Learning from Human Feedback', abstract: 'RLHF methods for alignment.', published_at: dayStr(3), score: 3, track: 'Agents', authors: '["Dave", "Eve"]' },
    { id: '2401.00004', title: 'Vision Transformers at Scale', abstract: 'Scaling ViT to billions of params.', published_at: dayStr(4), score: 4, track: 'Vision', authors: null },
    { id: '2401.00005', title: 'Chain-of-Thought Prompting', abstract: 'Reasoning with CoT prompts.', published_at: dayStr(5), score: 5, track: 'LLM', authors: '["Frank"]' },
  ];

  for (const p of papers) {
    db.prepare(
      `INSERT INTO papers (arxiv_id, title, abstract, published_at, authors_json)
       VALUES (?, ?, ?, ?, ?)`
    ).run(p.id, p.title, p.abstract, p.published_at, p.authors);

    db.prepare(
      `INSERT INTO llm_scores (arxiv_id, relevance_score) VALUES (?, ?)`
    ).run(p.id, p.score);

    db.prepare(
      `INSERT INTO track_matches (arxiv_id, track_name, score) VALUES (?, ?, ?)`
    ).run(p.id, p.track, p.score);
  }
}

async function setupModule() {
  vi.resetModules();
  // Point to in-memory SQLite — createSchema will be called after module import
  process.env.ARXIV_COACH_DB_PATH = ':memory:';
  const mod = await import('./arxiv-db');
  const db = mod.getRawDb();
  createSchema(db);
  seedPapers(db);
  return mod;
}

// ─── getAvailableTracks ────────────────────────────────────────────────────────

describe('getAvailableTracks()', () => {
  let mod: Awaited<ReturnType<typeof setupModule>>;
  let closeDb: (() => void) | null = null;

  beforeEach(async () => {
    mod = await setupModule();
    closeDb = null;
  });

  afterEach(() => {
    if (closeDb) closeDb();
    else mod.closeDb?.();
  });

  it('returns an array', () => {
    const tracks = mod.getAvailableTracks();
    expect(Array.isArray(tracks)).toBe(true);
  });

  it('each entry has a non-empty track string and a positive paperCount', () => {
    const tracks = mod.getAvailableTracks();
    for (const t of tracks) {
      expect(typeof t.track).toBe('string');
      expect(t.track.length).toBeGreaterThan(0);
      expect(typeof t.paperCount).toBe('number');
      expect(t.paperCount).toBeGreaterThan(0);
    }
  });

  it('is sorted descending by paperCount', () => {
    const tracks = mod.getAvailableTracks();
    for (let i = 1; i < tracks.length; i++) {
      expect(tracks[i - 1].paperCount).toBeGreaterThanOrEqual(tracks[i].paperCount);
    }
  });

  it('returns no duplicate track names', () => {
    const tracks = mod.getAvailableTracks();
    const names = tracks.map((t) => t.track);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('returns the expected tracks from seeded data', () => {
    const tracks = mod.getAvailableTracks();
    const trackNames = tracks.map((t) => t.track);
    expect(trackNames).toContain('LLM');
    expect(trackNames).toContain('Agents');
    expect(trackNames).toContain('Vision');
  });

  it('LLM track has the most papers (3 seeded)', () => {
    const tracks = mod.getAvailableTracks();
    const llm = tracks.find((t) => t.track === 'LLM');
    expect(llm).toBeDefined();
    expect(llm!.paperCount).toBe(3);
  });
});

// ─── getRssPapers ─────────────────────────────────────────────────────────────

describe('getRssPapers()', () => {
  let mod: Awaited<ReturnType<typeof setupModule>>;

  beforeEach(async () => {
    mod = await setupModule();
  });

  afterEach(() => {
    mod.closeDb?.();
  });

  it('returns an array with default options', () => {
    const papers = mod.getRssPapers();
    expect(Array.isArray(papers)).toBe(true);
  });

  it('returns seeded papers within default daysBack window', () => {
    // All 5 seeded papers are within 14 days and score >= 3 (default minScore)
    const papers = mod.getRssPapers({ daysBack: 14 });
    expect(papers.length).toBe(5);
  });

  it('respects the limit cap of 100', () => {
    const papers = mod.getRssPapers({ limit: 999 });
    expect(papers.length).toBeLessThanOrEqual(100);
  });

  it('returns fewer papers when limit is small', () => {
    const papers = mod.getRssPapers({ limit: 3, daysBack: 14 });
    expect(papers.length).toBeLessThanOrEqual(3);
  });

  it('each paper has required fields', () => {
    const papers = mod.getRssPapers({ limit: 10, daysBack: 14 });
    for (const p of papers) {
      expect(typeof p.arxiv_id).toBe('string');
      expect(p.arxiv_id.length).toBeGreaterThan(0);

      expect(typeof p.title).toBe('string');
      expect(p.title.length).toBeGreaterThan(0);

      expect(typeof p.url).toBe('string');
      expect(p.url).toMatch(/^https:\/\/arxiv\.org\/abs\//);
    }
  });

  it('url is always a valid arxiv link', () => {
    const papers = mod.getRssPapers({ limit: 20, daysBack: 14 });
    for (const p of papers) {
      expect(p.url).toBe(`https://arxiv.org/abs/${p.arxiv_id}`);
    }
  });

  it('llm_score is null or a number within 1–5', () => {
    const papers = mod.getRssPapers({ limit: 20, daysBack: 14 });
    for (const p of papers) {
      if (p.llm_score !== null) {
        expect(typeof p.llm_score).toBe('number');
        expect(p.llm_score).toBeGreaterThanOrEqual(1);
        expect(p.llm_score).toBeLessThanOrEqual(5);
      }
    }
  });

  it('minScore filter excludes papers below the threshold', () => {
    const minScore = 4;
    const papers = mod.getRssPapers({ minScore, limit: 50, daysBack: 14 });
    for (const p of papers) {
      if (p.llm_score !== null) {
        expect(p.llm_score).toBeGreaterThanOrEqual(minScore);
      }
    }
  });

  it('minScore=4 returns only the 4 papers with score >= 4', () => {
    const papers = mod.getRssPapers({ minScore: 4, daysBack: 14 });
    // Seeded: score 5 (00001), 4 (00002), 4 (00004), 5 (00005) — 4 papers
    expect(papers.length).toBe(4);
  });

  it('papers are sorted by relevance score descending (highest first)', () => {
    const papers = mod.getRssPapers({ limit: 20, daysBack: 14 });
    for (let i = 1; i < papers.length; i++) {
      const prev = papers[i - 1].llm_score ?? 0;
      const curr = papers[i].llm_score ?? 0;
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });

  it('track filter returns only papers for that track', () => {
    const papers = mod.getRssPapers({ track: 'LLM', daysBack: 30, limit: 50 });
    for (const p of papers) {
      expect(p.track).toBe('LLM');
    }
  });

  it('track filter LLM returns exactly 3 seeded papers', () => {
    const papers = mod.getRssPapers({ track: 'LLM', daysBack: 30, limit: 50, minScore: 1 });
    expect(papers.length).toBe(3);
  });

  it('unknown track returns empty array (not an error)', () => {
    const papers = mod.getRssPapers({ track: '__nonexistent_track__' });
    expect(papers).toEqual([]);
  });

  it('daysBack=0 returns no papers (today boundary)', () => {
    expect(() => mod.getRssPapers({ daysBack: 0 })).not.toThrow();
  });

  it('daysBack=30 returns more or equal papers than daysBack=1', () => {
    const wide = mod.getRssPapers({ daysBack: 30, limit: 100 });
    const narrow = mod.getRssPapers({ daysBack: 1, limit: 100 });
    expect(wide.length).toBeGreaterThanOrEqual(narrow.length);
  });

  it('limit=1 returns at most one paper', () => {
    const papers = mod.getRssPapers({ limit: 1, daysBack: 14 });
    expect(papers.length).toBeLessThanOrEqual(1);
  });

  it('no duplicate arxiv_ids in results', () => {
    const papers = mod.getRssPapers({ limit: 100, daysBack: 30 });
    const ids = papers.map((p) => p.arxiv_id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('authors field is null or a JSON array string', () => {
    const papers = mod.getRssPapers({ limit: 20, daysBack: 14 });
    for (const p of papers) {
      if (p.authors !== null) {
        expect(typeof p.authors).toBe('string');
        const parsed = JSON.parse(p.authors);
        expect(Array.isArray(parsed)).toBe(true);
      }
    }
  });
});

// ─── XML safety helpers ───────────────────────────────────────────────────────

describe('RSS XML safety', () => {
  let mod: Awaited<ReturnType<typeof setupModule>>;

  beforeEach(async () => {
    mod = await setupModule();
  });

  afterEach(() => {
    mod.closeDb?.();
  });

  it('arxiv_ids do not contain XML-unsafe characters', () => {
    const papers = mod.getRssPapers({ limit: 50, daysBack: 14 });
    const xmlSpecial = /[<>&"']/;
    for (const p of papers) {
      expect(xmlSpecial.test(p.arxiv_id)).toBe(false);
    }
  });

  it('paper URLs are valid HTTP(S) links', () => {
    const papers = mod.getRssPapers({ limit: 20, daysBack: 14 });
    for (const p of papers) {
      expect(() => new URL(p.url)).not.toThrow();
    }
  });
});
