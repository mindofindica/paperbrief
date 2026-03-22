/**
 * Tests for today.ts — Paper of the Day data layer and helpers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MockedFunction } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../supabase', () => ({
  getServiceSupabase: vi.fn(),
}));

import { getServiceSupabase } from '../supabase';
import {
  getPaperOfTheDay,
  generateShareText,
  getScoreBadge,
  formatAuthors,
  type PaperOfTheDay,
} from '../today';

const mockGetSupa = getServiceSupabase as MockedFunction<typeof getServiceSupabase>;

// ── Supabase chainable mock builder ──────────────────────────────────────────

type SupaResult<T> = { data?: T | null; error?: { message: string } | null };

function chainable<T>(result: SupaResult<T>) {
  const obj: Record<string, unknown> = {};
  const methods = ['select', 'from', 'gte', 'not', 'order', 'limit'];
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

const SAMPLE_ROW = {
  arxiv_id: '2401.00001',
  title: 'Attention Is All You Need: Redux',
  authors: ['Alice Smith', 'Bob Jones', 'Carol White', 'Dave Brown'],
  abstract: 'We propose a new transformer architecture. ' + 'x'.repeat(300),
  categories: ['cs.LG', 'cs.AI'],
  submitted_date: '2024-01-15',
  llm_score: 9.2,
  keyword_score: 7.5,
};

const SAMPLE_PAPER: PaperOfTheDay = {
  arxivId: '2401.00001',
  title: 'Attention Is All You Need: Redux',
  authors: ['Alice Smith', 'Bob Jones', 'Carol White', 'Dave Brown'],
  abstract: 'We propose a new transformer architecture. ' + 'x'.repeat(300),
  categories: ['cs.LG', 'cs.AI'],
  submittedDate: '2024-01-15',
  llmScore: 9.2,
  keywordScore: 7.5,
};

// ── getPaperOfTheDay ──────────────────────────────────────────────────────────

describe('getPaperOfTheDay()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a PaperOfTheDay when supabase returns a paper', async () => {
    mockSupabase({ data: [SAMPLE_ROW], error: null });
    const result = await getPaperOfTheDay();
    expect(result).not.toBeNull();
    expect(result?.arxivId).toBe('2401.00001');
    expect(result?.title).toBe('Attention Is All You Need: Redux');
    expect(result?.llmScore).toBe(9.2);
    expect(result?.keywordScore).toBe(7.5);
  });

  it('maps authors array correctly', async () => {
    mockSupabase({ data: [SAMPLE_ROW], error: null });
    const result = await getPaperOfTheDay();
    expect(result?.authors).toEqual(['Alice Smith', 'Bob Jones', 'Carol White', 'Dave Brown']);
  });

  it('maps categories array correctly', async () => {
    mockSupabase({ data: [SAMPLE_ROW], error: null });
    const result = await getPaperOfTheDay();
    expect(result?.categories).toEqual(['cs.LG', 'cs.AI']);
  });

  it('returns null when no papers found in last 3 days', async () => {
    mockSupabase({ data: [], error: null });
    const result = await getPaperOfTheDay();
    expect(result).toBeNull();
  });

  it('returns null when data is null', async () => {
    mockSupabase({ data: null, error: null });
    const result = await getPaperOfTheDay();
    expect(result).toBeNull();
  });

  it('returns null on supabase error', async () => {
    mockSupabase({ data: null, error: { message: 'DB error' } });
    const result = await getPaperOfTheDay();
    expect(result).toBeNull();
  });

  it('casts llm_score from string to number', async () => {
    mockSupabase({ data: [{ ...SAMPLE_ROW, llm_score: '8.5' }], error: null });
    const result = await getPaperOfTheDay();
    expect(result?.llmScore).toBe(8.5);
    expect(typeof result?.llmScore).toBe('number');
  });

  it('handles missing authors gracefully', async () => {
    mockSupabase({ data: [{ ...SAMPLE_ROW, authors: null }], error: null });
    const result = await getPaperOfTheDay();
    expect(result?.authors).toEqual([]);
  });

  it('handles missing categories gracefully', async () => {
    mockSupabase({ data: [{ ...SAMPLE_ROW, categories: null }], error: null });
    const result = await getPaperOfTheDay();
    expect(result?.categories).toEqual([]);
  });
});

// ── generateShareText ─────────────────────────────────────────────────────────

describe('generateShareText()', () => {
  it('contains the paper title', () => {
    const text = generateShareText(SAMPLE_PAPER);
    expect(text).toContain(SAMPLE_PAPER.title);
  });

  it('contains a truncated abstract (200 chars)', () => {
    const text = generateShareText(SAMPLE_PAPER);
    const sliced = SAMPLE_PAPER.abstract.slice(0, 200);
    expect(text).toContain(sliced);
  });

  it('contains the correct URL', () => {
    const text = generateShareText(SAMPLE_PAPER);
    expect(text).toContain('https://paperbrief.ai/today');
  });

  it('includes ellipsis after the abstract excerpt', () => {
    const text = generateShareText(SAMPLE_PAPER);
    expect(text).toContain('...');
  });
});

// ── getScoreBadge ─────────────────────────────────────────────────────────────

describe('getScoreBadge()', () => {
  it('returns 🌟 Exceptional for score ≥ 9', () => {
    expect(getScoreBadge(9).emoji).toBe('🌟');
    expect(getScoreBadge(9).label).toBe('Exceptional');
    expect(getScoreBadge(9.5).emoji).toBe('🌟');
    expect(getScoreBadge(10).emoji).toBe('🌟');
  });

  it('returns ⭐ Excellent for score ≥ 7 and < 9', () => {
    expect(getScoreBadge(7).emoji).toBe('⭐');
    expect(getScoreBadge(7).label).toBe('Excellent');
    expect(getScoreBadge(8.9).emoji).toBe('⭐');
  });

  it('returns ✨ Notable for score < 7', () => {
    expect(getScoreBadge(6.9).emoji).toBe('✨');
    expect(getScoreBadge(6.9).label).toBe('Notable');
    expect(getScoreBadge(0).emoji).toBe('✨');
    expect(getScoreBadge(5).emoji).toBe('✨');
  });
});

// ── formatAuthors ─────────────────────────────────────────────────────────────

describe('formatAuthors()', () => {
  it('returns all authors when 3 or fewer', () => {
    const { displayed, extra } = formatAuthors(['Alice', 'Bob', 'Carol']);
    expect(displayed).toEqual(['Alice', 'Bob', 'Carol']);
    expect(extra).toBe(0);
  });

  it('returns all authors when exactly 1', () => {
    const { displayed, extra } = formatAuthors(['Alice']);
    expect(displayed).toEqual(['Alice']);
    expect(extra).toBe(0);
  });

  it('truncates to 3 and reports extra count for > 3 authors', () => {
    const { displayed, extra } = formatAuthors(['Alice', 'Bob', 'Carol', 'Dave', 'Eve']);
    expect(displayed).toEqual(['Alice', 'Bob', 'Carol']);
    expect(extra).toBe(2);
  });

  it('reports extra=1 for exactly 4 authors', () => {
    const { displayed, extra } = formatAuthors(['A', 'B', 'C', 'D']);
    expect(extra).toBe(1);
    expect(displayed).toHaveLength(3);
  });

  it('handles empty array', () => {
    const { displayed, extra } = formatAuthors([]);
    expect(displayed).toEqual([]);
    expect(extra).toBe(0);
  });
});

// ── API route tests ───────────────────────────────────────────────────────────

describe('GET /api/today', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with paper data when paper found', async () => {
    mockSupabase({ data: [SAMPLE_ROW], error: null });

    // Dynamically import to pick up fresh mocks
    const { GET } = await import('../../app/api/today/route');
    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.paper).not.toBeNull();
    expect(json.paper.arxivId).toBe('2401.00001');
  });

  it('returns 200 with null paper when no papers exist', async () => {
    mockSupabase({ data: [], error: null });

    const { GET } = await import('../../app/api/today/route');
    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.paper).toBeNull();
  });

  it('returns Cache-Control header', async () => {
    mockSupabase({ data: [SAMPLE_ROW], error: null });

    const { GET } = await import('../../app/api/today/route');
    const response = await GET();

    expect(response.headers.get('Cache-Control')).toContain('s-maxage=3600');
  });
});

// ── OG image smoke test ───────────────────────────────────────────────────────

describe('OG image', () => {
  it('renders without throwing when paper is returned', async () => {
    mockSupabase({ data: [SAMPLE_ROW], error: null });

    // Dynamically import to pick up fresh mocks
    const { default: Image } = await import('../../app/today/opengraph-image');
    await expect(Image()).resolves.not.toThrow();
  });

  it('renders without throwing when no paper (fallback card)', async () => {
    mockSupabase({ data: [], error: null });

    const { default: Image } = await import('../../app/today/opengraph-image');
    await expect(Image()).resolves.not.toThrow();
  });
});
