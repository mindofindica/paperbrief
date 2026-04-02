/**
 * Tests for daily-digest.ts — public /daily/[date] data helpers.
 *
 * Covers:
 *  isValidDate — rejects bad formats, future dates, accepts valid past dates
 *  formatDailyDate — produces readable "Month D, YYYY" strings
 *  formatDailyDateLong — includes weekday
 *  getDailyPageUrl — uses env var or default base URL
 *  getTwitterShareUrl — encodes tweet text and URL correctly
 *  scoreIcon — maps score ranges to correct emojis
 *  getTopPapersForDate — happy path, empty result, invalid date, track filter, error handling
 *  getDailyDigestDates — aggregates per-date counts, newest-first ordering, cutoff
 *  getAdjacentDailyDates — returns prev/next, handles boundaries, rejects bad date
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../supabase', () => ({
  getServiceSupabase: vi.fn(),
}));

import { getServiceSupabase } from '../supabase';
import type { MockedFunction } from 'vitest';

import {
  isValidDate,
  formatDailyDate,
  formatDailyDateLong,
  getDailyPageUrl,
  getTwitterShareUrl,
  scoreIcon,
  getTopPapersForDate,
  getDailyDigestDates,
  getAdjacentDailyDates,
} from '../daily-digest';

const mockGetSupa = getServiceSupabase as MockedFunction<typeof getServiceSupabase>;

// ── Thenable chain builder ────────────────────────────────────────────────────

type ChainMock = Record<string, unknown>;

function makeChain(resolveWith: unknown): ChainMock {
  const chain: ChainMock = {};
  const methods = ['select', 'eq', 'neq', 'not', 'gte', 'lt', 'gt', 'order', 'limit'] as const;
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // Make it awaitable — cast to any to avoid generic-variance noise

  (chain as any)['then'] = (onfulfilled: any, onrejected: any) =>
    Promise.resolve(resolveWith).then(onfulfilled, onrejected);
  return chain;
}

function makeSupa(fromResult: unknown) {
  return { from: vi.fn().mockReturnValue(makeChain(fromResult)) };
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

describe('isValidDate', () => {
  it('accepts a valid past date', () => {
    expect(isValidDate('2026-01-01')).toBe(true);
  });

  it('accepts today', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(isValidDate(today)).toBe(true);
  });

  it('rejects a future date', () => {
    expect(isValidDate('2099-01-01')).toBe(false);
  });

  it('rejects wrong format: MM-DD-YYYY', () => {
    expect(isValidDate('03-22-2026')).toBe(false);
  });

  it('rejects partial date', () => {
    expect(isValidDate('2026-03')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidDate('')).toBe(false);
  });

  it('rejects date with slashes', () => {
    expect(isValidDate('2026/03/22')).toBe(false);
  });
});

describe('formatDailyDate', () => {
  it('formats 2026-03-22 correctly', () => {
    expect(formatDailyDate('2026-03-22')).toBe('March 22, 2026');
  });

  it('formats 2026-01-01 correctly', () => {
    expect(formatDailyDate('2026-01-01')).toBe('January 1, 2026');
  });

  it('formats 2025-12-31 correctly', () => {
    expect(formatDailyDate('2025-12-31')).toBe('December 31, 2025');
  });
});

describe('formatDailyDateLong', () => {
  it('includes the weekday for 2026-03-22 (Sunday)', () => {
    const result = formatDailyDateLong('2026-03-22');
    expect(result).toContain('Sunday');
    expect(result).toContain('March 22, 2026');
  });
});

describe('getDailyPageUrl', () => {
  it('uses the default base URL when no override provided', () => {
    const url = getDailyPageUrl('2026-03-22');
    expect(url).toBe('https://paperbrief.ai/daily/2026-03-22');
  });

  it('uses provided base URL', () => {
    const url = getDailyPageUrl('2026-03-22', 'https://test.example.com');
    expect(url).toBe('https://test.example.com/daily/2026-03-22');
  });
});

describe('getTwitterShareUrl', () => {
  it('includes the daily URL in the tweet text', () => {
    const url = getTwitterShareUrl('2026-03-22', 'https://paperbrief.ai');
    expect(url).toContain('twitter.com/intent/tweet');
    expect(url).toContain(encodeURIComponent('paperbrief.ai/daily/2026-03-22'));
  });

  it('includes @paperbrief in the tweet text', () => {
    const url = getTwitterShareUrl('2026-03-22', 'https://paperbrief.ai');
    expect(url).toContain(encodeURIComponent('@paperbrief'));
  });

  it('URL-encodes the full tweet text', () => {
    const url = getTwitterShareUrl('2026-03-22', 'https://paperbrief.ai');
    expect(url).toContain('text=');
    expect(url).not.toContain(' '); // spaces should be encoded
  });
});

describe('scoreIcon', () => {
  it('returns 🌟 for score >= 9', () => {
    expect(scoreIcon(9)).toBe('🌟');
    expect(scoreIcon(10)).toBe('🌟');
    expect(scoreIcon(9.5)).toBe('🌟');
  });

  it('returns ⭐ for score >= 7 and < 9', () => {
    expect(scoreIcon(7)).toBe('⭐');
    expect(scoreIcon(8)).toBe('⭐');
    expect(scoreIcon(8.9)).toBe('⭐');
  });

  it('returns ✨ for score < 7', () => {
    expect(scoreIcon(6)).toBe('✨');
    expect(scoreIcon(0)).toBe('✨');
    expect(scoreIcon(4.5)).toBe('✨');
  });
});

// ── Async DB helpers ──────────────────────────────────────────────────────────

describe('getTopPapersForDate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array for invalid date format', async () => {
    const result = await getTopPapersForDate('not-a-date');
    expect(result).toEqual([]);
    expect(mockGetSupa).not.toHaveBeenCalled();
  });

  it('returns empty array for future date', async () => {
    const result = await getTopPapersForDate('2099-01-01');
    expect(result).toEqual([]);
    expect(mockGetSupa).not.toHaveBeenCalled();
  });

  it('returns mapped papers on success', async () => {
    const rows = [
      {
        arxiv_id: '2403.00001',
        track: 'cs.LG',
        llm_score: 9,
        date: '2026-03-22',
        papers: {
          title: 'A Great Paper',
          abstract: 'Abstract text.',
          authors: ['Alice', 'Bob'],
          published_at: '2026-03-22T00:00:00Z',
        },
      },
      {
        arxiv_id: '2403.00002',
        track: 'cs.CL',
        llm_score: 7,
        date: '2026-03-22',
        papers: {
          title: 'Another Paper',
          abstract: 'More text.',
          authors: null,
          published_at: '2026-03-22T00:00:00Z',
        },
      },
    ];

    mockGetSupa.mockReturnValue(makeSupa({ data: rows, error: null }) as unknown as ReturnType<typeof getServiceSupabase>);

    const result = await getTopPapersForDate('2026-03-22', 10);
    expect(result).toHaveLength(2);
    expect(result[0].arxiv_id).toBe('2403.00001');
    expect(result[0].title).toBe('A Great Paper');
    expect(result[0].llm_score).toBe(9);
    expect(result[0].track).toBe('cs.LG');
    expect(result[0].authors).toEqual(['Alice', 'Bob']);
    expect(result[1].authors).toBeNull();
  });

  it('filters out rows with null papers', async () => {
    const rows = [
      { arxiv_id: '2403.00001', track: 'cs.LG', llm_score: 9, date: '2026-03-22', papers: null },
    ];
    mockGetSupa.mockReturnValue(makeSupa({ data: rows, error: null }) as unknown as ReturnType<typeof getServiceSupabase>);

    const result = await getTopPapersForDate('2026-03-22');
    expect(result).toHaveLength(0);
  });

  it('returns empty array on Supabase error', async () => {
    mockGetSupa.mockReturnValue(makeSupa({ data: null, error: { message: 'db error' } }) as unknown as ReturnType<typeof getServiceSupabase>);

    const result = await getTopPapersForDate('2026-03-22');
    expect(result).toEqual([]);
  });

  it('returns empty array when data is null', async () => {
    mockGetSupa.mockReturnValue(makeSupa({ data: null, error: null }) as unknown as ReturnType<typeof getServiceSupabase>);

    const result = await getTopPapersForDate('2026-03-22');
    expect(result).toEqual([]);
  });

  it('defaults llm_score to 0 when null', async () => {
    const rows = [
      {
        arxiv_id: '2403.99999',
        track: null,
        llm_score: null,
        date: '2026-03-22',
        papers: { title: 'Paper', abstract: null, authors: null, published_at: null },
      },
    ];
    mockGetSupa.mockReturnValue(makeSupa({ data: rows, error: null }) as unknown as ReturnType<typeof getServiceSupabase>);

    const result = await getTopPapersForDate('2026-03-22');
    expect(result[0].llm_score).toBe(0);
  });
});

describe('getDailyDigestDates', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array when no data', async () => {
    mockGetSupa.mockReturnValue(makeSupa({ data: [], error: null }) as unknown as ReturnType<typeof getServiceSupabase>);
    const result = await getDailyDigestDates(90);
    expect(result).toEqual([]);
  });

  it('returns empty array on error', async () => {
    mockGetSupa.mockReturnValue(makeSupa({ data: null, error: { message: 'fail' } }) as unknown as ReturnType<typeof getServiceSupabase>);
    const result = await getDailyDigestDates();
    expect(result).toEqual([]);
  });

  it('aggregates paper counts per date', async () => {
    const rows = [
      { date: '2026-03-22' },
      { date: '2026-03-22' },
      { date: '2026-03-22' },
      { date: '2026-03-21' },
      { date: '2026-03-21' },
    ];
    mockGetSupa.mockReturnValue(makeSupa({ data: rows, error: null }) as unknown as ReturnType<typeof getServiceSupabase>);

    const result = await getDailyDigestDates();
    expect(result).toHaveLength(2);
    const march22 = result.find((r) => r.date === '2026-03-22');
    const march21 = result.find((r) => r.date === '2026-03-21');
    expect(march22?.paperCount).toBe(3);
    expect(march21?.paperCount).toBe(2);
  });

  it('orders results newest-first', async () => {
    const rows = [
      { date: '2026-03-20' },
      { date: '2026-03-22' },
      { date: '2026-03-21' },
    ];
    mockGetSupa.mockReturnValue(makeSupa({ data: rows, error: null }) as unknown as ReturnType<typeof getServiceSupabase>);

    const result = await getDailyDigestDates();
    expect(result[0].date).toBe('2026-03-22');
    expect(result[1].date).toBe('2026-03-21');
    expect(result[2].date).toBe('2026-03-20');
  });
});

describe('getAdjacentDailyDates', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null/null for invalid date', async () => {
    const result = await getAdjacentDailyDates('bad');
    expect(result).toEqual({ prev: null, next: null });
    expect(mockGetSupa).not.toHaveBeenCalled();
  });

  it('returns prev and next dates when both exist', async () => {
    // Mock called twice in Promise.all: first for prev, then for next
    let callCount = 0;
    mockGetSupa.mockImplementation(() => {
      callCount++;
      const date = callCount === 1 ? '2026-03-21' : '2026-03-23';
      return makeSupa({ data: [{ date }], error: null }) as unknown as ReturnType<typeof getServiceSupabase>;
    });

    const result = await getAdjacentDailyDates('2026-03-22');
    expect(result.prev).toBe('2026-03-21');
    expect(result.next).toBe('2026-03-23');
  });

  it('returns null prev when no older date exists', async () => {
    let callCount = 0;
    mockGetSupa.mockImplementation(() => {
      callCount++;
      const data = callCount === 1 ? [] : [{ date: '2026-03-23' }];
      return makeSupa({ data, error: null }) as unknown as ReturnType<typeof getServiceSupabase>;
    });

    const result = await getAdjacentDailyDates('2026-03-22');
    expect(result.prev).toBeNull();
    expect(result.next).toBe('2026-03-23');
  });

  it('returns null next when no newer date exists', async () => {
    let callCount = 0;
    mockGetSupa.mockImplementation(() => {
      callCount++;
      const data = callCount === 1 ? [{ date: '2026-03-21' }] : [];
      return makeSupa({ data, error: null }) as unknown as ReturnType<typeof getServiceSupabase>;
    });

    const result = await getAdjacentDailyDates('2026-03-22');
    expect(result.prev).toBe('2026-03-21');
    expect(result.next).toBeNull();
  });

  it('returns null/null when both prev and next are empty', async () => {
    mockGetSupa.mockImplementation(() =>
      makeSupa({ data: [], error: null }) as unknown as ReturnType<typeof getServiceSupabase>,
    );

    const result = await getAdjacentDailyDates('2026-03-22');
    expect(result.prev).toBeNull();
    expect(result.next).toBeNull();
  });
});
