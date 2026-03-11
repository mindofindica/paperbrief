/**
 * Tests for GET /api/trending
 *
 * Covers:
 *  - Query parameter parsing (days, limit, clamping, defaults)
 *  - Supabase RPC call arguments
 *  - Response shape and numeric normalisation (NUMERIC → float)
 *  - Error handling (RPC error, missing env vars)
 *  - Cache headers
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Supabase mock ─────────────────────────────────────────────────────────────
//
// We control the result of supabase.rpc() per test via `mockRpcResult`.

let mockRpcResult: { data: unknown; error: { message: string } | null } = {
  data: [],
  error: null,
};

const mockRpc = vi.fn().mockImplementation(() => Promise.resolve(mockRpcResult));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    rpc: mockRpc,
  })),
}));

import { GET } from '../../app/api/trending/route';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    arxiv_id:    '2601.00001',
    title:       'Test Paper',
    abstract:    'A test abstract.',
    authors:     ['Alice', 'Bob'],
    categories:  ['cs.AI', 'cs.LG'],
    published_at: '2026-03-01',
    avg_score:   '4.50',   // NUMERIC returned as string from Supabase
    appearances: '3',      // BIGINT returned as string
    last_seen:   '2026-03-10',
    ...overrides,
  };
}

function makeRequest(params: Record<string, string> = {}): Request {
  const url = new URL('http://localhost/api/trending');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

// ── Environment setup ─────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  mockRpcResult = { data: [], error: null };
  mockRpc.mockClear();
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});

// ── Parameter parsing ─────────────────────────────────────────────────────────

describe('GET /api/trending — parameter parsing', () => {
  it('uses defaults (days=7, limit=20) when no params given', async () => {
    await GET(makeRequest() as any);
    expect(mockRpc).toHaveBeenCalledWith('get_trending_papers', {
      days_back:   7,
      max_results: 20,
    });
  });

  it('passes custom days and limit', async () => {
    await GET(makeRequest({ days: '14', limit: '10' }) as any);
    expect(mockRpc).toHaveBeenCalledWith('get_trending_papers', {
      days_back:   14,
      max_results: 10,
    });
  });

  it('clamps days to max 30', async () => {
    await GET(makeRequest({ days: '999' }) as any);
    expect(mockRpc).toHaveBeenCalledWith(
      'get_trending_papers',
      expect.objectContaining({ days_back: 30 })
    );
  });

  it('clamps days to min 1', async () => {
    await GET(makeRequest({ days: '0' }) as any);
    expect(mockRpc).toHaveBeenCalledWith(
      'get_trending_papers',
      expect.objectContaining({ days_back: 1 })
    );
  });

  it('clamps limit to max 50', async () => {
    await GET(makeRequest({ limit: '500' }) as any);
    expect(mockRpc).toHaveBeenCalledWith(
      'get_trending_papers',
      expect.objectContaining({ max_results: 50 })
    );
  });

  it('clamps limit to min 1', async () => {
    await GET(makeRequest({ limit: '-5' }) as any);
    expect(mockRpc).toHaveBeenCalledWith(
      'get_trending_papers',
      expect.objectContaining({ max_results: 1 })
    );
  });

  it('ignores NaN days, uses default', async () => {
    await GET(makeRequest({ days: 'abc' }) as any);
    expect(mockRpc).toHaveBeenCalledWith(
      'get_trending_papers',
      expect.objectContaining({ days_back: 7 })
    );
  });

  it('truncates decimal days (floor)', async () => {
    await GET(makeRequest({ days: '7.9' }) as any);
    expect(mockRpc).toHaveBeenCalledWith(
      'get_trending_papers',
      expect.objectContaining({ days_back: 7 })
    );
  });
});

// ── Response shape ────────────────────────────────────────────────────────────

describe('GET /api/trending — response shape', () => {
  it('returns 200 with papers array and metadata', async () => {
    mockRpcResult = { data: [makeRow()], error: null };
    const res = await GET(makeRequest() as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('papers');
    expect(body).toHaveProperty('generated_at');
    expect(body).toHaveProperty('days', 7);
    expect(Array.isArray(body.papers)).toBe(true);
    expect(body.papers).toHaveLength(1);
  });

  it('normalises avg_score from string to float', async () => {
    mockRpcResult = { data: [makeRow({ avg_score: '4.50' })], error: null };
    const res = await GET(makeRequest() as any);
    const body = await res.json();
    expect(typeof body.papers[0].avg_score).toBe('number');
    expect(body.papers[0].avg_score).toBeCloseTo(4.5);
  });

  it('normalises appearances from string to number', async () => {
    mockRpcResult = { data: [makeRow({ appearances: '12' })], error: null };
    const res = await GET(makeRequest() as any);
    const body = await res.json();
    expect(typeof body.papers[0].appearances).toBe('number');
    expect(body.papers[0].appearances).toBe(12);
  });

  it('sets empty array for missing authors', async () => {
    mockRpcResult = { data: [makeRow({ authors: null })], error: null };
    const res = await GET(makeRequest() as any);
    const body = await res.json();
    expect(body.papers[0].authors).toEqual([]);
  });

  it('sets empty array for missing categories', async () => {
    mockRpcResult = { data: [makeRow({ categories: null })], error: null };
    const res = await GET(makeRequest() as any);
    const body = await res.json();
    expect(body.papers[0].categories).toEqual([]);
  });

  it('handles null abstract gracefully', async () => {
    mockRpcResult = { data: [makeRow({ abstract: null })], error: null };
    const res = await GET(makeRequest() as any);
    const body = await res.json();
    expect(body.papers[0].abstract).toBeNull();
  });

  it('returns empty papers array when RPC returns null', async () => {
    mockRpcResult = { data: null, error: null };
    const res = await GET(makeRequest() as any);
    const body = await res.json();
    expect(body.papers).toEqual([]);
  });

  it('returns empty papers array when no papers found', async () => {
    mockRpcResult = { data: [], error: null };
    const res = await GET(makeRequest() as any);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.papers).toEqual([]);
  });

  it('sets cache-control header', async () => {
    const res = await GET(makeRequest() as any);
    const cc = res.headers.get('cache-control') ?? '';
    expect(cc).toContain('public');
    expect(cc).toContain('s-maxage');
  });

  it('includes generated_at as ISO timestamp', async () => {
    const res = await GET(makeRequest() as any);
    const body = await res.json();
    expect(() => new Date(body.generated_at)).not.toThrow();
    expect(new Date(body.generated_at).toISOString()).toBe(body.generated_at);
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('GET /api/trending — error handling', () => {
  it('returns 500 when Supabase RPC returns an error', async () => {
    mockRpcResult = { data: null, error: { message: 'connection refused' } };
    const res = await GET(makeRequest() as any);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  it('returns 500 when env vars are missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = await GET(makeRequest() as any);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  it('uses anon key as fallback when service role key is absent', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    mockRpcResult = { data: [], error: null };
    const res = await GET(makeRequest() as any);
    // Should succeed (anon key fallback works)
    expect(res.status).toBe(200);
  });
});

// ── Multiple papers ───────────────────────────────────────────────────────────

describe('GET /api/trending — multiple papers', () => {
  it('returns all papers from RPC', async () => {
    mockRpcResult = {
      data: [
        makeRow({ arxiv_id: '2601.00001', avg_score: '5.00', appearances: '10' }),
        makeRow({ arxiv_id: '2601.00002', avg_score: '4.50', appearances: '7' }),
        makeRow({ arxiv_id: '2601.00003', avg_score: '3.75', appearances: '3' }),
      ],
      error: null,
    };
    const res = await GET(makeRequest() as any);
    const body = await res.json();
    expect(body.papers).toHaveLength(3);
    expect(body.papers[0].arxiv_id).toBe('2601.00001');
    expect(body.papers[1].avg_score).toBeCloseTo(4.5);
    expect(body.papers[2].appearances).toBe(3);
  });

  it('preserves order from RPC (already sorted server-side)', async () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      makeRow({ arxiv_id: `2601.0000${i + 1}`, avg_score: String(5 - i) })
    );
    mockRpcResult = { data: rows, error: null };
    const res = await GET(makeRequest() as any);
    const body = await res.json();
    const ids = body.papers.map((p: { arxiv_id: string }) => p.arxiv_id);
    expect(ids).toEqual(rows.map((r) => r.arxiv_id));
  });
});
