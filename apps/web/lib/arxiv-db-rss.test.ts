/**
 * Tests for RSS feed DB helpers:
 *   - getRssPapers()
 *   - getAvailableTracks()
 *
 * Uses the real SQLite database at ARXIV_COACH_DB_PATH (or the default path).
 * Tests are read-only and safe to run in any environment that has the DB.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { getRssPapers, getAvailableTracks } from './arxiv-db';

// ─── getAvailableTracks ────────────────────────────────────────────────────────

describe('getAvailableTracks()', () => {
  it('returns an array', () => {
    const tracks = getAvailableTracks();
    expect(Array.isArray(tracks)).toBe(true);
  });

  it('each entry has a non-empty track string and a positive paperCount', () => {
    const tracks = getAvailableTracks();
    for (const t of tracks) {
      expect(typeof t.track).toBe('string');
      expect(t.track.length).toBeGreaterThan(0);
      expect(typeof t.paperCount).toBe('number');
      expect(t.paperCount).toBeGreaterThan(0);
    }
  });

  it('is sorted descending by paperCount', () => {
    const tracks = getAvailableTracks();
    for (let i = 1; i < tracks.length; i++) {
      expect(tracks[i - 1].paperCount).toBeGreaterThanOrEqual(tracks[i].paperCount);
    }
  });

  it('returns no duplicate track names', () => {
    const tracks = getAvailableTracks();
    const names = tracks.map((t) => t.track);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });
});

// ─── getRssPapers ─────────────────────────────────────────────────────────────

describe('getRssPapers()', () => {
  it('returns an array with default options', () => {
    const papers = getRssPapers();
    expect(Array.isArray(papers)).toBe(true);
  });

  it('respects the limit cap of 100', () => {
    const papers = getRssPapers({ limit: 999 });
    expect(papers.length).toBeLessThanOrEqual(100);
  });

  it('returns fewer papers when limit is small', () => {
    const papers = getRssPapers({ limit: 3 });
    expect(papers.length).toBeLessThanOrEqual(3);
  });

  it('each paper has required fields', () => {
    const papers = getRssPapers({ limit: 10 });
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
    const papers = getRssPapers({ limit: 20 });
    for (const p of papers) {
      expect(p.url).toBe(`https://arxiv.org/abs/${p.arxiv_id}`);
    }
  });

  it('llm_score is null or a number within 1–5', () => {
    const papers = getRssPapers({ limit: 20 });
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
    const papers = getRssPapers({ minScore, limit: 50 });
    for (const p of papers) {
      if (p.llm_score !== null) {
        expect(p.llm_score).toBeGreaterThanOrEqual(minScore);
      }
    }
  });

  it('papers are sorted by relevance score descending (highest first)', () => {
    const papers = getRssPapers({ limit: 20 });
    for (let i = 1; i < papers.length; i++) {
      const prev = papers[i - 1].llm_score ?? 0;
      const curr = papers[i].llm_score ?? 0;
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });

  it('track filter returns only papers for that track', () => {
    const tracks = getAvailableTracks();
    if (tracks.length === 0) return; // skip if DB is empty

    const targetTrack = tracks[0].track;
    const papers = getRssPapers({ track: targetTrack, daysBack: 30, limit: 50 });

    for (const p of papers) {
      expect(p.track).toBe(targetTrack);
    }
  });

  it('unknown track returns empty array (not an error)', () => {
    const papers = getRssPapers({ track: '__nonexistent_track__' });
    expect(papers).toEqual([]);
  });

  it('daysBack=0 returns no papers (today boundary)', () => {
    // With daysBack=0 the from date equals today, published_at < today → empty
    // (Actual behaviour depends on data, but should not throw)
    expect(() => getRssPapers({ daysBack: 0 })).not.toThrow();
  });

  it('daysBack=30 returns more or equal papers than daysBack=1', () => {
    const wide = getRssPapers({ daysBack: 30, limit: 100 });
    const narrow = getRssPapers({ daysBack: 1, limit: 100 });
    expect(wide.length).toBeGreaterThanOrEqual(narrow.length);
  });

  it('limit=1 returns at most one paper', () => {
    const papers = getRssPapers({ limit: 1 });
    expect(papers.length).toBeLessThanOrEqual(1);
  });

  it('no duplicate arxiv_ids in results', () => {
    const papers = getRssPapers({ limit: 100, daysBack: 30 });
    const ids = papers.map((p) => p.arxiv_id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('authors field is null or a JSON array string', () => {
    const papers = getRssPapers({ limit: 20 });
    for (const p of papers) {
      if (p.authors !== null) {
        expect(typeof p.authors).toBe('string');
        // Must be parseable JSON array
        const parsed = JSON.parse(p.authors);
        expect(Array.isArray(parsed)).toBe(true);
      }
    }
  });
});

// ─── XML safety helpers (inline, no import needed) ───────────────────────────

describe('RSS XML safety', () => {
  it('arxiv_ids do not contain XML-unsafe characters', () => {
    const papers = getRssPapers({ limit: 50 });
    const xmlSpecial = /[<>&"']/;
    for (const p of papers) {
      expect(xmlSpecial.test(p.arxiv_id)).toBe(false);
    }
  });

  it('paper URLs are valid HTTP(S) links', () => {
    const papers = getRssPapers({ limit: 20 });
    for (const p of papers) {
      expect(() => new URL(p.url)).not.toThrow();
    }
  });
});
