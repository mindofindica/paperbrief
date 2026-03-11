/**
 * stats.test.ts — Unit tests for the stats aggregation layer
 *
 * Mocks getRawDb so tests run without a real SQLite file.
 * Each test group covers a specific slice of the StatsResult.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock getRawDb ──────────────────────────────────────────────────────────

const mockPrepare = vi.fn();
const mockGet = vi.fn();
const mockAll = vi.fn();

vi.mock('../arxiv-db', () => ({
  getRawDb: vi.fn(() => ({
    prepare: mockPrepare,
  })),
}));

// Helper: create a chainable prepare mock that routes .get() or .all()
// based on the query string so multiple prepare calls work independently.
function setupDbMock(queryMap: Record<string, { get?: any; all?: any }>) {
  mockPrepare.mockImplementation((sql: string) => {
    const match = Object.keys(queryMap).find((k) => sql.includes(k));
    const result = match ? queryMap[match] : {};
    return {
      get: vi.fn((..._args: any[]) => result.get ?? null),
      all: vi.fn((..._args: any[]) => result.all ?? []),
    };
  });
}

import { getStats } from '../stats';

// ── Helpers ────────────────────────────────────────────────────────────────

const EMPTY_DB = {
  'reading_list': { all: [] },
  'paper_feedback': { all: [] },
  'sent_digests': { get: { cnt: 0 } },
  'llm_scores': { get: { cnt: 0 } },
  'digest_papers': { get: { cnt: 0 }, all: [] },
  'track_matches': { all: [] },
};

// ── Test suites ────────────────────────────────────────────────────────────

describe('getStats — reading list', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns zeros when reading list is empty', () => {
    setupDbMock(EMPTY_DB);
    const { readingList } = getStats();
    expect(readingList).toEqual({ total: 0, unread: 0, reading: 0, done: 0 });
  });

  it('sums counts by status correctly', () => {
    setupDbMock({
      ...EMPTY_DB,
      'reading_list': {
        all: [
          { status: 'unread', cnt: 5 },
          { status: 'reading', cnt: 2 },
          { status: 'done', cnt: 8 },
        ],
      },
    });
    const { readingList } = getStats();
    expect(readingList.total).toBe(15);
    expect(readingList.unread).toBe(5);
    expect(readingList.reading).toBe(2);
    expect(readingList.done).toBe(8);
  });

  it('handles unknown status without crashing', () => {
    setupDbMock({
      ...EMPTY_DB,
      'reading_list': {
        all: [
          { status: 'unread', cnt: 3 },
          { status: 'archived', cnt: 1 }, // unexpected status
        ],
      },
    });
    const { readingList } = getStats();
    // total includes the unexpected status row
    expect(readingList.total).toBe(4);
    expect(readingList.unread).toBe(3);
    expect(readingList.done).toBe(0); // not mapped
  });
});

describe('getStats — feedback', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns zeros when no feedback exists', () => {
    setupDbMock(EMPTY_DB);
    const { feedback } = getStats();
    expect(feedback).toEqual({ total: 0, read: 0, save: 0, love: 0, meh: 0, skip: 0 });
  });

  it('maps all feedback types correctly', () => {
    setupDbMock({
      ...EMPTY_DB,
      'paper_feedback': {
        all: [
          { feedback_type: 'love', cnt: 10 },
          { feedback_type: 'save', cnt: 8 },
          { feedback_type: 'read', cnt: 6 },
          { feedback_type: 'meh', cnt: 4 },
          { feedback_type: 'skip', cnt: 2 },
        ],
      },
    });
    const { feedback } = getStats();
    expect(feedback.total).toBe(30);
    expect(feedback.love).toBe(10);
    expect(feedback.save).toBe(8);
    expect(feedback.read).toBe(6);
    expect(feedback.meh).toBe(4);
    expect(feedback.skip).toBe(2);
  });

  it('handles partial feedback types gracefully', () => {
    setupDbMock({
      ...EMPTY_DB,
      'paper_feedback': {
        all: [{ feedback_type: 'save', cnt: 3 }],
      },
    });
    const { feedback } = getStats();
    expect(feedback.total).toBe(3);
    expect(feedback.save).toBe(3);
    expect(feedback.love).toBe(0);  // missing → defaults to 0
    expect(feedback.skip).toBe(0);
  });
});

describe('getStats — digest stats', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns correct digest counts', () => {
    setupDbMock({
      ...EMPTY_DB,
      'sent_digests': { get: { cnt: 42 } },
      'llm_scores': { get: { cnt: 1250 } },
      'digest_papers': { get: { cnt: 35 }, all: [] },
    });
    const { digests } = getStats();
    expect(digests.totalDigests).toBe(42);
    expect(digests.totalPapersScored).toBe(1250);
    expect(digests.papersLast30Days).toBe(35);
  });

  it('handles zero digests without errors', () => {
    setupDbMock(EMPTY_DB);
    const { digests } = getStats();
    expect(digests.totalDigests).toBe(0);
    expect(digests.totalPapersScored).toBe(0);
    expect(digests.papersLast30Days).toBe(0);
  });
});

describe('getStats — top tracks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array when no tracks', () => {
    setupDbMock(EMPTY_DB);
    const { topTracks } = getStats();
    expect(topTracks).toEqual([]);
  });

  it('sets pct=100 for the top track', () => {
    setupDbMock({
      ...EMPTY_DB,
      'track_matches': {
        all: [
          { name: 'Agents / Planning', count: 200 },
          { name: 'RAG & Grounding', count: 100 },
          { name: 'Evals', count: 50 },
        ],
      },
    });
    const { topTracks } = getStats();
    expect(topTracks[0].pct).toBe(100);
    expect(topTracks[1].pct).toBe(50);
    expect(topTracks[2].pct).toBe(25);
  });

  it('preserves track names verbatim', () => {
    setupDbMock({
      ...EMPTY_DB,
      'track_matches': {
        all: [{ name: 'Agent Evaluation & Reliability', count: 388 }],
      },
    });
    const { topTracks } = getStats();
    expect(topTracks[0].name).toBe('Agent Evaluation & Reliability');
    expect(topTracks[0].count).toBe(388);
  });
});

describe('getStats — activity chart', () => {
  beforeEach(() => vi.clearAllMocks());

  it('always returns exactly 30 data points', () => {
    setupDbMock(EMPTY_DB);
    const { activity } = getStats();
    expect(activity).toHaveLength(30);
  });

  it('fills missing days with count=0', () => {
    setupDbMock({
      ...EMPTY_DB,
      'digest_papers': {
        get: { cnt: 5 },
        all: [], // no rows → all days filled with 0
      },
    });
    const { activity } = getStats();
    expect(activity.every((d) => d.count === 0)).toBe(true);
  });

  it('includes dates in YYYY-MM-DD format', () => {
    setupDbMock(EMPTY_DB);
    const { activity } = getStats();
    const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
    expect(activity.every((d) => isoDatePattern.test(d.date))).toBe(true);
  });

  it('merges real DB rows into the 30-day window', () => {
    const today = new Date().toISOString().slice(0, 10);
    setupDbMock({
      ...EMPTY_DB,
      'digest_papers': {
        get: { cnt: 5 },
        all: [{ date: today, count: 5 }],
      },
    });
    const { activity } = getStats();
    const todayEntry = activity.find((d) => d.date === today);
    expect(todayEntry).toBeDefined();
    expect(todayEntry!.count).toBe(5);
  });

  it('dates are in ascending chronological order', () => {
    setupDbMock(EMPTY_DB);
    const { activity } = getStats();
    for (let i = 1; i < activity.length; i++) {
      expect(activity[i].date > activity[i - 1].date).toBe(true);
    }
  });
});

describe('getStats — metadata', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a valid ISO generatedAt timestamp', () => {
    setupDbMock(EMPTY_DB);
    const { generatedAt } = getStats();
    expect(() => new Date(generatedAt)).not.toThrow();
    expect(new Date(generatedAt).toISOString()).toBe(generatedAt);
  });

  it('generatedAt is approximately now (within 5 seconds)', () => {
    setupDbMock(EMPTY_DB);
    const before = Date.now();
    const { generatedAt } = getStats();
    const after = Date.now();
    const ts = new Date(generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after + 100);
  });
});
