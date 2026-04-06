/**
 * Tests for trending-archive.ts
 *
 * Covers:
 * - isValidDateString — format + validity checks
 * - isFutureDate — comparison against UTC today
 * - formatArchiveDate — human-readable formatting
 * - prevDate / nextDate — day arithmetic
 * - getTopPapersForDate — Supabase query + deduplication logic
 * - getAvailableArchiveDates — date aggregation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MockedFunction } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../supabase', () => ({
  getServiceSupabase: vi.fn(),
}));

import { getServiceSupabase } from '../supabase';
import {
  isValidDateString,
  isFutureDate,
  formatArchiveDate,
  prevDate,
  nextDate,
  getTopPapersForDate,
  getAvailableArchiveDates,
} from '../trending-archive';

const mockGetSupa = getServiceSupabase as MockedFunction<typeof getServiceSupabase>;

// ── Supabase chainable mock builder ──────────────────────────────────────────

type SupaResult<T> = { data?: T | null; error?: { message: string } | null };

function chainable<T>(result: SupaResult<T>) {
  const obj: Record<string, unknown> = {};
  const methods = ['select', 'from', 'eq', 'gte', 'not', 'order', 'limit'];
  for (const m of methods) {
    obj[m] = vi.fn().mockReturnValue(obj);
  }
  obj['then'] = (
    resolve: (v: SupaResult<T>) => void,
    _reject: (e: unknown) => void,
  ) => Promise.resolve(result).then(resolve, _reject);
  return obj as Record<string, ReturnType<typeof vi.fn>>;
}

function mockSupabase<T>(result: SupaResult<T>) {
  const chain = chainable(result);
  mockGetSupa.mockReturnValue({
    from: vi.fn().mockReturnValue(chain),
  } as unknown as ReturnType<typeof getServiceSupabase>);
  return chain;
}

// ── Sample data ───────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<{
  llm_score: number;
  track: string;
  arxiv_id: string;
  title: string;
  abstract: string;
  authors: string[];
  categories: string[];
  published_at: string;
}> = {}) {
  return {
    llm_score: overrides.llm_score ?? 8.5,
    track: overrides.track ?? 'cs.LG',
    papers: {
      arxiv_id: overrides.arxiv_id ?? '2401.12345',
      title: overrides.title ?? 'Test Paper Title',
      abstract: overrides.abstract ?? 'A short abstract.',
      authors: overrides.authors ?? ['Alice Smith', 'Bob Jones'],
      categories: overrides.categories ?? ['cs.LG', 'cs.AI'],
      published_at: overrides.published_at ?? '2024-01-15',
    },
  };
}

// ── isValidDateString ─────────────────────────────────────────────────────────

describe('isValidDateString', () => {
  it('accepts well-formed dates', () => {
    expect(isValidDateString('2024-01-15')).toBe(true);
    expect(isValidDateString('2026-04-06')).toBe(true);
    expect(isValidDateString('2023-12-31')).toBe(true);
  });

  it('rejects wrong format', () => {
    expect(isValidDateString('20240115')).toBe(false);
    expect(isValidDateString('2024/01/15')).toBe(false);
    expect(isValidDateString('Jan 15 2024')).toBe(false);
    expect(isValidDateString('')).toBe(false);
    expect(isValidDateString('abc')).toBe(false);
  });

  it('rejects out-of-range values (invalid dates)', () => {
    expect(isValidDateString('2024-13-01')).toBe(false); // month 13
    expect(isValidDateString('2024-00-01')).toBe(false); // month 0
  });
});

// ── isFutureDate ─────────────────────────────────────────────────────────────

describe('isFutureDate', () => {
  it('returns true for dates after today', () => {
    const futureDate = '9999-12-31';
    expect(isFutureDate(futureDate)).toBe(true);
  });

  it('returns false for past dates', () => {
    expect(isFutureDate('2020-01-01')).toBe(false);
  });

  it('returns false for today', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(isFutureDate(today)).toBe(false);
  });
});

// ── formatArchiveDate ─────────────────────────────────────────────────────────

describe('formatArchiveDate', () => {
  it('formats a known date correctly', () => {
    // 2024-04-07 is a Sunday
    const result = formatArchiveDate('2024-04-07');
    expect(result).toContain('April');
    expect(result).toContain('7');
    expect(result).toContain('2024');
    expect(result).toContain('Sunday');
  });

  it('includes weekday, month, day, year', () => {
    const result = formatArchiveDate('2026-04-06');
    expect(result).toMatch(/Monday/);
    expect(result).toMatch(/April/);
    expect(result).toMatch(/6/);
    expect(result).toMatch(/2026/);
  });
});

// ── prevDate / nextDate ───────────────────────────────────────────────────────

describe('prevDate', () => {
  it('returns the previous calendar day', () => {
    expect(prevDate('2024-04-07')).toBe('2024-04-06');
    expect(prevDate('2024-04-01')).toBe('2024-03-31'); // month boundary
    expect(prevDate('2024-01-01')).toBe('2023-12-31'); // year boundary
  });
});

describe('nextDate', () => {
  it('returns the next calendar day', () => {
    expect(nextDate('2024-04-06')).toBe('2024-04-07');
    expect(nextDate('2024-03-31')).toBe('2024-04-01'); // month boundary
    expect(nextDate('2023-12-31')).toBe('2024-01-01'); // year boundary
  });
});

// ── getTopPapersForDate ───────────────────────────────────────────────────────

describe('getTopPapersForDate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when Supabase errors', async () => {
    mockSupabase({ data: null, error: { message: 'DB down' } });
    const result = await getTopPapersForDate('2024-01-15');
    expect(result.papers).toHaveLength(0);
    expect(result.date).toBe('2024-01-15');
  });

  it('returns empty array when no data', async () => {
    mockSupabase({ data: [], error: null });
    const result = await getTopPapersForDate('2024-01-15');
    expect(result.papers).toHaveLength(0);
  });

  it('maps a single entry to a TodayPaper', async () => {
    const entry = makeEntry({ llm_score: 9.1, arxiv_id: '2401.99999' });
    mockSupabase({ data: [entry], error: null });

    const result = await getTopPapersForDate('2024-01-15');
    expect(result.papers).toHaveLength(1);
    expect(result.papers[0]!.arxiv_id).toBe('2401.99999');
    expect(result.papers[0]!.avg_score).toBe(9.1);
    expect(result.papers[0]!.appearances).toBe(1);
  });

  it('deduplicates papers appearing in multiple tracks, keeping highest score', async () => {
    // Same paper in two tracks with different scores
    const entry1 = makeEntry({ arxiv_id: '2401.00001', llm_score: 9.0, track: 'cs.LG' });
    const entry2 = makeEntry({ arxiv_id: '2401.00001', llm_score: 7.5, track: 'cs.AI' }); // lower
    const entry3 = makeEntry({ arxiv_id: '2401.00002', llm_score: 8.5, track: 'cs.LG' }); // different paper
    mockSupabase({ data: [entry1, entry2, entry3], error: null });

    const result = await getTopPapersForDate('2024-01-15');
    expect(result.papers).toHaveLength(2);

    const p1 = result.papers.find(p => p.arxiv_id === '2401.00001');
    expect(p1?.avg_score).toBe(9.0); // kept the higher score
  });

  it('sorts results by score descending', async () => {
    const entries = [
      makeEntry({ arxiv_id: 'low',  llm_score: 5.0 }),
      makeEntry({ arxiv_id: 'high', llm_score: 9.5 }),
      makeEntry({ arxiv_id: 'mid',  llm_score: 7.2 }),
    ];
    mockSupabase({ data: entries, error: null });

    const result = await getTopPapersForDate('2024-01-15');
    expect(result.papers[0]!.arxiv_id).toBe('high');
    expect(result.papers[1]!.arxiv_id).toBe('mid');
    expect(result.papers[2]!.arxiv_id).toBe('low');
  });

  it('caps results at the default limit of 10', async () => {
    const entries = Array.from({ length: 15 }, (_, i) =>
      makeEntry({ arxiv_id: `2401.${String(i).padStart(5, '0')}`, llm_score: 8 - i * 0.1 }),
    );
    mockSupabase({ data: entries, error: null });

    const result = await getTopPapersForDate('2024-01-15');
    expect(result.papers.length).toBeLessThanOrEqual(10);
  });

  it('respects a custom limit', async () => {
    const entries = Array.from({ length: 8 }, (_, i) =>
      makeEntry({ arxiv_id: `2401.${String(i).padStart(5, '0')}`, llm_score: 9 - i * 0.1 }),
    );
    mockSupabase({ data: entries, error: null });

    const result = await getTopPapersForDate('2024-01-15', 5);
    expect(result.papers.length).toBeLessThanOrEqual(5);
  });

  it('handles null optional fields gracefully', async () => {
    const entry = {
      llm_score: 7.0,
      track: null,
      papers: {
        arxiv_id: '2401.00003',
        title: 'Nullable Fields Paper',
        abstract: null,
        authors: null,
        categories: null,
        published_at: null,
      },
    };
    mockSupabase({ data: [entry], error: null });

    const result = await getTopPapersForDate('2024-01-15');
    expect(result.papers[0]!.abstract).toBeNull();
    expect(result.papers[0]!.authors).toEqual([]);
    expect(result.papers[0]!.categories).toEqual([]);
    expect(result.papers[0]!.published_at).toBeNull();
  });

  it('includes date and generatedAt in the result', async () => {
    mockSupabase({ data: [makeEntry()], error: null });
    const result = await getTopPapersForDate('2024-01-15');
    expect(result.date).toBe('2024-01-15');
    expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ── getAvailableArchiveDates ──────────────────────────────────────────────────

describe('getAvailableArchiveDates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array on Supabase error', async () => {
    mockSupabase({ data: null, error: { message: 'DB error' } });
    const result = await getAvailableArchiveDates(7);
    expect(result).toEqual([]);
  });

  it('aggregates distinct paper counts per date', async () => {
    const rows = [
      { date: '2024-01-15', arxiv_id: '2401.00001' },
      { date: '2024-01-15', arxiv_id: '2401.00002' },
      { date: '2024-01-15', arxiv_id: '2401.00001' }, // duplicate (same paper, different track)
      { date: '2024-01-14', arxiv_id: '2401.00003' },
    ];
    mockSupabase({ data: rows, error: null });

    const result = await getAvailableArchiveDates(7);
    const jan15 = result.find(r => r.date === '2024-01-15');
    const jan14 = result.find(r => r.date === '2024-01-14');

    expect(jan15?.paperCount).toBe(2); // 2 unique papers (deduped)
    expect(jan14?.paperCount).toBe(1);
  });

  it('sorts results newest-first', async () => {
    const rows = [
      { date: '2024-01-13', arxiv_id: 'a' },
      { date: '2024-01-15', arxiv_id: 'b' },
      { date: '2024-01-14', arxiv_id: 'c' },
    ];
    mockSupabase({ data: rows, error: null });

    const result = await getAvailableArchiveDates(7);
    expect(result[0]!.date).toBe('2024-01-15');
    expect(result[1]!.date).toBe('2024-01-14');
    expect(result[2]!.date).toBe('2024-01-13');
  });

  it('returns empty array when no rows', async () => {
    mockSupabase({ data: [], error: null });
    const result = await getAvailableArchiveDates(7);
    expect(result).toEqual([]);
  });
});
