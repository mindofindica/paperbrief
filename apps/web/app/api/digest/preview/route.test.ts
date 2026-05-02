import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { getServiceSupabase } from '../../../../lib/supabase';
import { verifySessionCookie } from '../../../../lib/auth';

// ─── mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../../lib/supabase', () => ({ getServiceSupabase: vi.fn() }));
vi.mock('../../../../lib/auth', () => ({ verifySessionCookie: vi.fn() }));
vi.mock('@paperbrief/core', () => ({
  scoreLabel: vi.fn((n: number) => n >= 5 ? '🔥 Essential' : n >= 4 ? '✅ Relevant' : '👀 Interesting'),
}));

const mockGetServiceSupabase = vi.mocked(getServiceSupabase);
const mockVerifySessionCookie = vi.mocked(verifySessionCookie);

// ─── fixtures ─────────────────────────────────────────────────────────────────

const TRACK_ROW = {
  id: 'track-1',
  name: 'Speculative Decoding',
  keywords: ['speculative decoding', 'draft model'],
  arxiv_cats: ['cs.LG', 'cs.CL'],
  min_score: 3,
};

const PAPER_ROW = {
  arxiv_id: '2502.00001',
  title: 'Fast Inference via Speculative Decoding',
  abstract: 'We propose a new method for speculative decoding with draft models.',
  authors: ['Alice', 'Bob'],
  categories: ['cs.LG'],
  published_at: '2026-02-01',
  llm_score: 5,
};

// ─── mock builder ─────────────────────────────────────────────────────────────

/**
 * Build a Supabase client mock that handles:
 *  - .from().select().eq().eq() → { data: tracks, error }
 *  - .rpc() → { data: papers, error }
 */
function makeSupabaseMock({
  tracks = [TRACK_ROW] as typeof TRACK_ROW[] | null,
  tracksError = null as unknown,
  rpcData = [PAPER_ROW] as typeof PAPER_ROW[] | null,
  rpcError = null as unknown,
} = {}) {
  // Track query chain: from().select().eq().eq()
  const eqChain = {
    select: vi.fn(),
    eq: vi.fn(),
  };
  // Allow chaining
  eqChain.select.mockReturnValue(eqChain);
  eqChain.eq.mockReturnValue(eqChain);
  // Final await resolution
  (eqChain as unknown as PromiseLike<unknown>).then = (resolve: (v: unknown) => void) =>
    resolve({ data: tracks, error: tracksError });

  const fromMock = vi.fn().mockReturnValue(eqChain);

  // RPC mock
  const rpcMock = vi.fn().mockResolvedValue({ data: rpcData, error: rpcError });

  return {
    from: fromMock,
    rpc: rpcMock,
  };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeRequest(url = 'http://localhost/api/digest/preview', sessionCookie?: string) {
  const req = new NextRequest(url);
  if (sessionCookie) {
    req.cookies.set('pb_session', sessionCookie);
  }
  return req;
}

// ─── tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
});

describe('GET /api/digest/preview', () => {
  it('returns 401 when no session cookie', async () => {
    mockVerifySessionCookie.mockReturnValue({ valid: false });
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 when session cookie is invalid', async () => {
    mockVerifySessionCookie.mockReturnValue({ valid: false });
    const res = await GET(makeRequest('http://localhost/api/digest/preview', 'bad-token'));
    expect(res.status).toBe(401);
  });

  it('returns empty-tracks message when user has no active tracks', async () => {
    mockVerifySessionCookie.mockReturnValue({ valid: true, userId: 'user-1' });
    mockGetServiceSupabase.mockReturnValue(makeSupabaseMock({ tracks: [] }) as never);

    const res = await GET(makeRequest('http://localhost/api/digest/preview', 'valid'));
    expect(res.status).toBe(200);
    const body = await res.json() as { digest: null; tracksQueried: number; message: string };
    expect(body.digest).toBeNull();
    expect(body.tracksQueried).toBe(0);
    expect(body.message).toMatch(/No active tracks/i);
  });

  it('returns 500 when tracks query errors', async () => {
    mockVerifySessionCookie.mockReturnValue({ valid: true, userId: 'user-1' });
    mockGetServiceSupabase.mockReturnValue(
      makeSupabaseMock({ tracks: null, tracksError: { message: 'DB error' } }) as never
    );

    const res = await GET(makeRequest('http://localhost/api/digest/preview', 'valid'));
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Failed to load tracks');
  });

  it('returns preview digest with correct shape', async () => {
    mockVerifySessionCookie.mockReturnValue({ valid: true, userId: 'user-1' });
    const supabase = makeSupabaseMock();
    mockGetServiceSupabase.mockReturnValue(supabase as never);

    const res = await GET(makeRequest('http://localhost/api/digest/preview', 'valid'));
    expect(res.status).toBe(200);

    const body = await res.json() as {
      digest: { entries: { arxivId: string; score: number; trackName: string }[] };
      tracksQueried: number;
      papersScanned: number;
      durationMs: number;
    };
    expect(body.digest.entries).toHaveLength(1);
    expect(body.digest.entries[0].arxivId).toBe('2502.00001');
    expect(body.digest.entries[0].score).toBe(5);
    expect(body.digest.entries[0].trackName).toBe('Speculative Decoding');
    expect(body.tracksQueried).toBe(1);
    expect(body.papersScanned).toBe(1);
    expect(body.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('calls supabase.rpc with search_papers_for_digest', async () => {
    mockVerifySessionCookie.mockReturnValue({ valid: true, userId: 'user-1' });
    const supabase = makeSupabaseMock();
    mockGetServiceSupabase.mockReturnValue(supabase as never);

    await GET(makeRequest('http://localhost/api/digest/preview', 'valid'));

    expect(supabase.rpc).toHaveBeenCalledWith('search_papers_for_digest', expect.objectContaining({
      p_keywords: ['speculative decoding', 'draft model'],
      p_min_score: 3,
    }));
  });

  it('does NOT require OPENROUTER_API_KEY (pure DB-based pipeline)', async () => {
    delete process.env.OPENROUTER_API_KEY;
    mockVerifySessionCookie.mockReturnValue({ valid: true, userId: 'user-1' });
    mockGetServiceSupabase.mockReturnValue(makeSupabaseMock() as never);

    const res = await GET(makeRequest('http://localhost/api/digest/preview', 'valid'));
    // Should succeed without any API key — uses DB scoring only
    expect(res.status).toBe(200);
  });

  it('filters tracks by ?track= query param (case-insensitive substring)', async () => {
    const otherTrack = {
      ...TRACK_ROW,
      id: 'track-2',
      name: 'Diffusion Models',
      keywords: ['diffusion', 'denoising'],
      arxiv_cats: ['cs.CV'],
    };
    mockVerifySessionCookie.mockReturnValue({ valid: true, userId: 'user-1' });
    const supabase = makeSupabaseMock({ tracks: [TRACK_ROW, otherTrack] });
    mockGetServiceSupabase.mockReturnValue(supabase as never);

    const res = await GET(
      makeRequest('http://localhost/api/digest/preview?track=speculative', 'valid'),
    );
    expect(res.status).toBe(200);

    // rpc should only be called once (for the matched track, not Diffusion Models)
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it('returns no-match message when track filter matches nothing', async () => {
    mockVerifySessionCookie.mockReturnValue({ valid: true, userId: 'user-1' });
    mockGetServiceSupabase.mockReturnValue(makeSupabaseMock() as never);

    const res = await GET(
      makeRequest('http://localhost/api/digest/preview?track=robotics', 'valid'),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { digest: null; message: string };
    expect(body.digest).toBeNull();
    expect(body.message).toMatch(/no active tracks match/i);
  });

  it('caps maxEntries at 50 regardless of query param', async () => {
    mockVerifySessionCookie.mockReturnValue({ valid: true, userId: 'user-1' });
    const supabase = makeSupabaseMock();
    mockGetServiceSupabase.mockReturnValue(supabase as never);

    await GET(makeRequest('http://localhost/api/digest/preview?maxEntries=999', 'valid'));

    // The RPC should be called with p_limit = 50 (capped from 999)
    expect(supabase.rpc).toHaveBeenCalledWith('search_papers_for_digest', expect.objectContaining({
      p_limit: 50,
    }));
  });

  it('returns 500 on RPC error', async () => {
    mockVerifySessionCookie.mockReturnValue({ valid: true, userId: 'user-1' });
    const supabase = makeSupabaseMock({ rpcError: new Error('RPC failure') });
    mockGetServiceSupabase.mockReturnValue(supabase as never);

    // rpc() throws → caught by try/catch → 500
    supabase.rpc.mockRejectedValue(new Error('Network timeout'));
    const res = await GET(makeRequest('http://localhost/api/digest/preview', 'valid'));
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Failed to generate preview');
  });

  it('deduplicates papers across multiple tracks', async () => {
    const track2 = { ...TRACK_ROW, id: 'track-2', name: 'Inference Optimization' };
    // Both tracks return the same paper
    mockVerifySessionCookie.mockReturnValue({ valid: true, userId: 'user-1' });
    const supabase = makeSupabaseMock({ tracks: [TRACK_ROW, track2] });
    mockGetServiceSupabase.mockReturnValue(supabase as never);

    const res = await GET(makeRequest('http://localhost/api/digest/preview', 'valid'));
    expect(res.status).toBe(200);
    const body = await res.json() as { digest: { entries: unknown[] }; papersScanned: number };
    // Paper should appear only once (deduped by seenIds)
    expect(body.digest.entries).toHaveLength(1);
  });
});
