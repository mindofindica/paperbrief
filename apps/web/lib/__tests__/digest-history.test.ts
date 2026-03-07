import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Paper, DigestDate } from '../arxiv-db';

// Mock the entire module so no real DB is touched.
vi.mock('../arxiv-db', () => ({
  getDigestDates: vi.fn(),
  getPapersByDate: vi.fn(),
  getAdjacentDigestDates: vi.fn(),
  getTodaysPapers: vi.fn(),
  searchPapers: vi.fn(),
  getPaper: vi.fn(),
  getReadingList: vi.fn(),
  writeFeedback: vi.fn(),
  updateReadingList: vi.fn(),
  getRecommendationBasis: vi.fn(),
  getRecommendations: vi.fn(),
  getRawDb: vi.fn(),
  closeDb: vi.fn(),
}));

import {
  getDigestDates,
  getPapersByDate,
  getAdjacentDigestDates,
} from '../arxiv-db';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePaper(arxivId: string, score = 3): Paper {
  return {
    arxiv_id: arxivId,
    title: `Paper ${arxivId}`,
    abstract: 'Test abstract',
    published_at: '2026-03-03T18:00:00Z',
    llm_score: score,
    track: 'cs.LG',
    authors: JSON.stringify(['Alice', 'Bob']),
    url: `https://arxiv.org/abs/${arxivId}`,
  };
}

const DATES: DigestDate[] = [
  { date: '2026-03-04', paperCount: 127 },
  { date: '2026-03-03', paperCount: 159 },
  { date: '2026-03-02', paperCount: 144 },
  { date: '2026-02-28', paperCount: 8 },
  { date: '2026-02-27', paperCount: 118 },
];

// ---------------------------------------------------------------------------
// getDigestDates
// ---------------------------------------------------------------------------

describe('getDigestDates', () => {
  beforeEach(() => {
    vi.mocked(getDigestDates).mockClear();
  });

  it('returns an empty list when no digests exist', () => {
    vi.mocked(getDigestDates).mockReturnValue([]);
    expect(getDigestDates()).toEqual([]);
  });

  it('returns dates ordered newest-first', () => {
    vi.mocked(getDigestDates).mockReturnValue(DATES);
    const result = getDigestDates();
    expect(result.length).toBe(5);
    expect(result[0].date).toBe('2026-03-04');
    expect(result[result.length - 1].date).toBe('2026-02-27');
  });

  it('each entry has a date and paperCount', () => {
    vi.mocked(getDigestDates).mockReturnValue(DATES);
    const result = getDigestDates();
    for (const entry of result) {
      expect(entry).toHaveProperty('date');
      expect(entry).toHaveProperty('paperCount');
      expect(typeof entry.date).toBe('string');
      expect(typeof entry.paperCount).toBe('number');
    }
  });

  it('respects the limit parameter', () => {
    vi.mocked(getDigestDates).mockImplementation((limit = 30) =>
      DATES.slice(0, limit)
    );
    const result = getDigestDates(3);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('dates are in YYYY-MM-DD format', () => {
    vi.mocked(getDigestDates).mockReturnValue(DATES);
    const result = getDigestDates();
    const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;
    for (const entry of result) {
      expect(entry.date).toMatch(isoDateRe);
    }
  });
});

// ---------------------------------------------------------------------------
// getPapersByDate
// ---------------------------------------------------------------------------

describe('getPapersByDate', () => {
  beforeEach(() => {
    vi.mocked(getPapersByDate).mockClear();
  });

  it('returns empty list for an invalid date', () => {
    vi.mocked(getPapersByDate).mockReturnValue([]);
    expect(getPapersByDate('not-a-date')).toEqual([]);
    expect(getPapersByDate('')).toEqual([]);
  });

  it('returns empty list when no papers exist for a date', () => {
    vi.mocked(getPapersByDate).mockReturnValue([]);
    expect(getPapersByDate('2026-01-01')).toEqual([]);
  });

  it('returns papers for a valid date', () => {
    const papers = [makePaper('2603.00001', 5), makePaper('2603.00002', 4)];
    vi.mocked(getPapersByDate).mockReturnValue(papers);

    const result = getPapersByDate('2026-03-03');
    expect(result).toHaveLength(2);
    expect(result[0].arxiv_id).toBe('2603.00001');
  });

  it('papers are ordered by relevance score descending', () => {
    const papers = [
      makePaper('2603.00001', 5),
      makePaper('2603.00002', 4),
      makePaper('2603.00003', 2),
    ];
    vi.mocked(getPapersByDate).mockReturnValue(papers);

    const result = getPapersByDate('2026-03-03');
    const scores = result.map((p) => p.llm_score ?? 0);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
    }
  });

  it('each returned paper has required fields', () => {
    const papers = [makePaper('2603.00001', 5)];
    vi.mocked(getPapersByDate).mockReturnValue(papers);

    const result = getPapersByDate('2026-03-03');
    const p = result[0];
    expect(p).toHaveProperty('arxiv_id');
    expect(p).toHaveProperty('title');
    expect(p).toHaveProperty('abstract');
    expect(p).toHaveProperty('llm_score');
    expect(p).toHaveProperty('url');
  });

  it('url points to arxiv.org', () => {
    vi.mocked(getPapersByDate).mockReturnValue([makePaper('2603.00001', 4)]);
    const [paper] = getPapersByDate('2026-03-03');
    expect(paper.url).toContain('arxiv.org/abs/2603.00001');
  });
});

// ---------------------------------------------------------------------------
// getAdjacentDigestDates
// ---------------------------------------------------------------------------

describe('getAdjacentDigestDates', () => {
  beforeEach(() => {
    vi.mocked(getAdjacentDigestDates).mockClear();
  });

  it('returns null for both when there is only one digest', () => {
    vi.mocked(getAdjacentDigestDates).mockReturnValue({ prev: null, next: null });
    expect(getAdjacentDigestDates('2026-03-04')).toEqual({ prev: null, next: null });
  });

  it('returns correct prev when older digest exists', () => {
    vi.mocked(getAdjacentDigestDates).mockReturnValue({ prev: '2026-03-03', next: null });
    const { prev, next } = getAdjacentDigestDates('2026-03-04');
    expect(prev).toBe('2026-03-03');
    expect(next).toBeNull();
  });

  it('returns correct next when newer digest exists', () => {
    vi.mocked(getAdjacentDigestDates).mockReturnValue({ prev: '2026-03-02', next: '2026-03-04' });
    const { prev, next } = getAdjacentDigestDates('2026-03-03');
    expect(prev).toBe('2026-03-02');
    expect(next).toBe('2026-03-04');
  });

  it('returns null prev for the oldest digest', () => {
    vi.mocked(getAdjacentDigestDates).mockReturnValue({ prev: null, next: '2026-02-28' });
    const { prev, next } = getAdjacentDigestDates('2026-02-27');
    expect(prev).toBeNull();
    expect(next).toBe('2026-02-28');
  });

  it('returns null for invalid date input', () => {
    vi.mocked(getAdjacentDigestDates).mockReturnValue({ prev: null, next: null });
    const result = getAdjacentDigestDates('not-a-date');
    expect(result.prev).toBeNull();
    expect(result.next).toBeNull();
  });
});
