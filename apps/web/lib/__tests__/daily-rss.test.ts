/**
 * Tests for getDailyPaperHistory() (today.ts) and GET /rss/daily route.
 *
 * Coverage:
 *   - getDailyPaperHistory: Supabase success, empty, error, dedup, day capping, coercion
 *   - /rss/daily route: status 200, Content-Type, valid XML, item count, ?days param,
 *     empty feed, error handling, Cache-Control
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MockedFunction } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../supabase', () => ({
  getServiceSupabase: vi.fn(),
}));

import { getServiceSupabase } from '../supabase';
import { getDailyPaperHistory, type DailyPaperEntry } from '../today';

const mockGetSupa = getServiceSupabase as MockedFunction<typeof getServiceSupabase>;

// ── Supabase chainable mock ───────────────────────────────────────────────────

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

// Matches the paper_digest_entries+papers join shape used by getDailyPaperHistory
function makeRow(overrides: Partial<{
  arxiv_id: string;
  title: string;
  authors: string[];
  abstract: string;
  categories: string[];
  submitted_date: string; // maps to entry.date (digest date) and papers.published_at
  llm_score: number | string;
}> = {}) {
  const {
    arxiv_id = '2401.00001',
    title = 'Attention Is All You Need: Redux',
    authors = ['Alice Smith', 'Bob Jones'],
    abstract = 'We propose a new transformer architecture that is better.',
    categories = ['cs.LG', 'cs.AI'],
    submitted_date = '2026-03-15',
    llm_score = 9.2,
  } = overrides;
  return {
    llm_score,
    date: submitted_date,
    papers: {
      arxiv_id,
      title,
      authors,
      abstract,
      categories,
      published_at: submitted_date,
    },
  };
}

// ── getDailyPaperHistory ──────────────────────────────────────────────────────

describe('getDailyPaperHistory()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns one entry per distinct date', async () => {
    mockSupabase({
      data: [
        makeRow({ submitted_date: '2026-03-15', arxiv_id: 'A', llm_score: 9 }),
        makeRow({ submitted_date: '2026-03-14', arxiv_id: 'B', llm_score: 8 }),
        makeRow({ submitted_date: '2026-03-13', arxiv_id: 'C', llm_score: 7 }),
      ],
      error: null,
    });
    const result = await getDailyPaperHistory(30);
    expect(result).toHaveLength(3);
    expect(result.map((e) => e.date)).toEqual(['2026-03-15', '2026-03-14', '2026-03-13']);
  });

  it('deduplicates rows with the same date (keeps first = highest score)', async () => {
    mockSupabase({
      data: [
        makeRow({ submitted_date: '2026-03-15', arxiv_id: 'HIGH', llm_score: 9.5 }),
        makeRow({ submitted_date: '2026-03-15', arxiv_id: 'LOW', llm_score: 6.0 }),
      ],
      error: null,
    });
    const result = await getDailyPaperHistory(30);
    expect(result).toHaveLength(1);
    expect(result[0].paper.arxivId).toBe('HIGH');
  });

  it('maps paper fields correctly', async () => {
    mockSupabase({ data: [makeRow()], error: null });
    const result = await getDailyPaperHistory(30);
    const { date, paper } = result[0];
    expect(date).toBe('2026-03-15');
    expect(paper.arxivId).toBe('2401.00001');
    expect(paper.title).toBe('Attention Is All You Need: Redux');
    expect(paper.llmScore).toBe(9.2);
    expect(paper.keywordScore).toBe(0); // not stored in current schema
    expect(paper.authors).toEqual(['Alice Smith', 'Bob Jones']);
    expect(paper.categories).toEqual(['cs.LG', 'cs.AI']);
  });

  it('returns empty array when supabase returns empty data', async () => {
    mockSupabase({ data: [], error: null });
    const result = await getDailyPaperHistory(30);
    expect(result).toEqual([]);
  });

  it('returns empty array when data is null', async () => {
    mockSupabase({ data: null, error: null });
    const result = await getDailyPaperHistory(30);
    expect(result).toEqual([]);
  });

  it('returns empty array on supabase error', async () => {
    mockSupabase({ data: null, error: { message: 'connection refused' } });
    const result = await getDailyPaperHistory(30);
    expect(result).toEqual([]);
  });

  it('caps results at `days` distinct dates', async () => {
    // 5 distinct dates but we ask for 3
    mockSupabase({
      data: ['03-15', '03-14', '03-13', '03-12', '03-11'].map((d, i) =>
        makeRow({ submitted_date: `2026-${d}`, arxiv_id: `ID${i}` }),
      ),
      error: null,
    });
    const result = await getDailyPaperHistory(3);
    expect(result).toHaveLength(3);
  });

  it('clamps days to 1 minimum and 90 maximum', async () => {
    mockSupabase({ data: [], error: null });
    // Just check it doesn't throw for extreme values
    await expect(getDailyPaperHistory(0)).resolves.toEqual([]);
    await expect(getDailyPaperHistory(999)).resolves.toEqual([]);
  });

  it('casts llm_score from string to number', async () => {
    mockSupabase({ data: [makeRow({ llm_score: '8.7' })], error: null });
    const result = await getDailyPaperHistory(30);
    expect(result[0].paper.llmScore).toBe(8.7);
    expect(typeof result[0].paper.llmScore).toBe('number');
  });

  it('handles null authors gracefully', async () => {
    mockSupabase({ data: [makeRow({ authors: null as unknown as string[] })], error: null });
    const result = await getDailyPaperHistory(30);
    expect(result[0].paper.authors).toEqual([]);
  });

  it('handles null abstract gracefully', async () => {
    mockSupabase({ data: [makeRow({ abstract: null as unknown as string })], error: null });
    const result = await getDailyPaperHistory(30);
    expect(result[0].paper.abstract).toBe('');
  });

  it('handles null categories gracefully', async () => {
    mockSupabase({ data: [makeRow({ categories: null as unknown as string[] })], error: null });
    const result = await getDailyPaperHistory(30);
    expect(result[0].paper.categories).toEqual([]);
  });
});

// ── GET /rss/daily route ──────────────────────────────────────────────────────

describe('GET /rss/daily', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeRequest(qs = '') {
    return new Request(`https://paperbrief.ai/rss/daily${qs}`);
  }

  it('returns status 200', async () => {
    mockSupabase({ data: [makeRow()], error: null });
    const { GET } = await import('../../app/rss/daily/route');
    const res = await GET(makeRequest() as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(200);
  });

  it('returns application/rss+xml content type', async () => {
    mockSupabase({ data: [makeRow()], error: null });
    const { GET } = await import('../../app/rss/daily/route');
    const res = await GET(makeRequest() as unknown as import('next/server').NextRequest);
    expect(res.headers.get('Content-Type')).toContain('application/rss+xml');
  });

  it('includes Cache-Control with s-maxage=3600', async () => {
    mockSupabase({ data: [makeRow()], error: null });
    const { GET } = await import('../../app/rss/daily/route');
    const res = await GET(makeRequest() as unknown as import('next/server').NextRequest);
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=3600');
  });

  it('returns valid XML with RSS root element', async () => {
    mockSupabase({ data: [makeRow()], error: null });
    const { GET } = await import('../../app/rss/daily/route');
    const res = await GET(makeRequest() as unknown as import('next/server').NextRequest);
    const text = await res.text();
    expect(text).toContain('<?xml');
    expect(text).toContain('<rss version="2.0"');
    expect(text).toContain('</rss>');
  });

  it('includes the feed title', async () => {
    mockSupabase({ data: [makeRow()], error: null });
    const { GET } = await import('../../app/rss/daily/route');
    const res = await GET(makeRequest() as unknown as import('next/server').NextRequest);
    const text = await res.text();
    expect(text).toContain('PaperBrief — Paper of the Day');
  });

  it('includes one <item> per day', async () => {
    mockSupabase({
      data: [
        makeRow({ submitted_date: '2026-03-15', arxiv_id: 'A' }),
        makeRow({ submitted_date: '2026-03-14', arxiv_id: 'B' }),
        makeRow({ submitted_date: '2026-03-13', arxiv_id: 'C' }),
      ],
      error: null,
    });
    const { GET } = await import('../../app/rss/daily/route');
    const res = await GET(makeRequest() as unknown as import('next/server').NextRequest);
    const text = await res.text();
    const itemMatches = text.match(/<item>/g);
    expect(itemMatches).toHaveLength(3);
  });

  it('escapes XML special chars in titles', async () => {
    mockSupabase({
      data: [makeRow({ title: 'Paper <One> & "Two" \'s End' })],
      error: null,
    });
    const { GET } = await import('../../app/rss/daily/route');
    const res = await GET(makeRequest() as unknown as import('next/server').NextRequest);
    const text = await res.text();
    expect(text).toContain('&lt;One&gt;');
    expect(text).toContain('&amp;');
    expect(text).toContain('&quot;Two&quot;');
  });

  it('includes arxiv URL as <link>', async () => {
    mockSupabase({ data: [makeRow({ arxiv_id: '2401.99999' })], error: null });
    const { GET } = await import('../../app/rss/daily/route');
    const res = await GET(makeRequest() as unknown as import('next/server').NextRequest);
    const text = await res.text();
    expect(text).toContain('https://arxiv.org/abs/2401.99999');
  });

  it('includes the score badge emoji in description', async () => {
    mockSupabase({ data: [makeRow({ llm_score: 9.5 })], error: null });
    const { GET } = await import('../../app/rss/daily/route');
    const res = await GET(makeRequest() as unknown as import('next/server').NextRequest);
    const text = await res.text();
    // Score ≥ 9 → 🌟 Exceptional
    expect(text).toContain('Exceptional');
  });

  it('includes /today URL in description', async () => {
    mockSupabase({ data: [makeRow()], error: null });
    const { GET } = await import('../../app/rss/daily/route');
    const res = await GET(makeRequest() as unknown as import('next/server').NextRequest);
    const text = await res.text();
    expect(text).toContain('/today');
  });

  it('respects ?days query param', async () => {
    mockSupabase({ data: [], error: null });
    const { GET } = await import('../../app/rss/daily/route');
    // Should not throw with a custom days value
    const res = await GET(makeRequest('?days=7') as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(200);
  });

  it('returns 200 with empty channel when no papers exist', async () => {
    mockSupabase({ data: [], error: null });
    const { GET } = await import('../../app/rss/daily/route');
    const res = await GET(makeRequest() as unknown as import('next/server').NextRequest);
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).toContain('<channel>');
    // No items
    expect(text).not.toContain('<item>');
  });

  it('returns 500 when getDailyPaperHistory throws', async () => {
    mockGetSupa.mockImplementation(() => {
      throw new Error('unexpected boom');
    });
    const { GET } = await import('../../app/rss/daily/route');
    const res = await GET(makeRequest() as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(500);
  });

  it('prefixes each item title with the date', async () => {
    mockSupabase({ data: [makeRow({ submitted_date: '2026-03-15' })], error: null });
    const { GET } = await import('../../app/rss/daily/route');
    const res = await GET(makeRequest() as unknown as import('next/server').NextRequest);
    const text = await res.text();
    expect(text).toContain('[2026-03-15]');
  });

  it('includes atom:link self-reference', async () => {
    mockSupabase({ data: [], error: null });
    const { GET } = await import('../../app/rss/daily/route');
    const res = await GET(makeRequest() as unknown as import('next/server').NextRequest);
    const text = await res.text();
    expect(text).toContain('atom:link');
    expect(text).toContain('/rss/daily');
  });
});
