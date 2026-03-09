/**
 * route.test.ts — Smoke tests for GET /api/stats
 *
 * Verifies the route correctly delegates to getStats() and handles errors.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StatsResult } from '../../../lib/stats';

// Mock the stats lib
vi.mock('../../../lib/stats', () => ({
  getStats: vi.fn(),
}));

import { getStats } from '../../../lib/stats';
import { GET } from './route';

const MOCK_STATS: StatsResult = {
  readingList: { total: 10, unread: 5, reading: 3, done: 2 },
  feedback: { total: 20, read: 6, save: 5, love: 4, meh: 3, skip: 2 },
  digests: { totalDigests: 8, totalPapersScored: 928, papersLast30Days: 35 },
  topTracks: [
    { name: 'Agent Evaluation & Reliability', count: 388, pct: 100 },
    { name: 'RAG & Grounding', count: 285, pct: 73 },
  ],
  activity: Array.from({ length: 30 }, (_, i) => ({
    date: `2026-02-${String(i + 1).padStart(2, '0')}`,
    count: i % 3 === 0 ? 5 : 0,
  })),
  generatedAt: '2026-03-09T02:00:00.000Z',
};

describe('GET /api/stats', () => {
  beforeEach(() => {
    vi.mocked(getStats).mockClear();
  });

  it('returns 200 with stats JSON on success', async () => {
    vi.mocked(getStats).mockReturnValue(MOCK_STATS);

    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.readingList.total).toBe(10);
    expect(body.feedback.total).toBe(20);
    expect(body.digests.totalDigests).toBe(8);
    expect(body.topTracks).toHaveLength(2);
    expect(body.activity).toHaveLength(30);
    expect(body.generatedAt).toBe('2026-03-09T02:00:00.000Z');
  });

  it('calls getStats() exactly once per request', async () => {
    vi.mocked(getStats).mockReturnValue(MOCK_STATS);

    await GET();
    expect(getStats).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when getStats() throws', async () => {
    vi.mocked(getStats).mockImplementation(() => {
      throw new Error('DB unavailable');
    });

    const response = await GET();
    expect(response.status).toBe(500);

    const body = await response.json();
    expect(body.error).toBe('Failed to load stats');
  });

  it('response body matches StatsResult shape', async () => {
    vi.mocked(getStats).mockReturnValue(MOCK_STATS);

    const response = await GET();
    const body = await response.json();

    // Shape checks
    expect(typeof body.readingList.unread).toBe('number');
    expect(typeof body.feedback.love).toBe('number');
    expect(typeof body.digests.papersLast30Days).toBe('number');
    expect(Array.isArray(body.topTracks)).toBe(true);
    expect(Array.isArray(body.activity)).toBe(true);
    expect(typeof body.generatedAt).toBe('string');
  });
});
