import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('../../../lib/auth', () => ({
  verifySessionCookie: vi.fn(),
}));

vi.mock('../../../lib/supabase', () => ({
  getServiceSupabase: vi.fn(),
}));

import { verifySessionCookie } from '../../../lib/auth';
import { getServiceSupabase } from '../../../lib/supabase';
import { GET } from './route';

const mockVerifySession = vi.mocked(verifySessionCookie);
const mockGetSupabase = vi.mocked(getServiceSupabase);

function makeRequest(cookie?: string): NextRequest {
  const req = new NextRequest('http://localhost/api/gaps');
  vi.spyOn(req.cookies, 'get').mockImplementation((name: string) =>
    name === 'pb_session' && cookie
      ? ({ name: 'pb_session', value: cookie } as ReturnType<typeof req.cookies.get>)
      : undefined,
  );
  return req;
}

/** Creates a chainable mock that resolves at the terminal method (limit, single, etc.) */
function makeChain(data: unknown[], terminator = 'limit') {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };
  chain[terminator] = vi.fn().mockResolvedValue({ data, error: null });
  return chain;
}

const sampleTracks = [
  { name: 'LLM Reasoning', keywords: ['chain-of-thought', 'reasoning'], arxiv_cats: ['cs.AI'] },
  { name: 'Efficient Inference', keywords: ['quantization', 'pruning'], arxiv_cats: ['cs.LG'] },
];

const sampleDigestEntries = [
  { arxiv_id: '2401.00001', papers: { title: 'Chain-of-Thought Prompting', categories: ['cs.AI'] } },
  { arxiv_id: '2401.00002', papers: { title: 'Quantized Neural Networks', categories: ['cs.LG'] } },
  { arxiv_id: '2401.00003', papers: { title: 'Attention Mechanisms Survey', categories: ['cs.CL'] } },
];

const sampleReadingList = [
  { papers: { arxiv_id: '2401.00004', title: 'Token Efficiency Survey', categories: ['cs.LG'] } },
];

const sampleSuggestedPapers = [
  { arxiv_id: '2405.00100', title: 'Test-Time Compute Scaling', abstract: 'We study test-time compute scaling laws.', published_at: '2024-05-01' },
  { arxiv_id: '2405.00200', title: 'Self-Verification in LLMs', abstract: 'Self-verification methods improve accuracy.', published_at: '2024-05-02' },
];

function makeLLMResponse(gaps = [
  { topic: 'Test-Time Compute', why: 'Missing test-time scaling research.', searchTerms: ['test-time compute', 'inference scaling'] },
  { topic: 'Constitutional AI', why: 'Alignment is underrepresented.', searchTerms: ['constitutional ai', 'RLHF alternatives'] },
  { topic: 'Mixture of Experts', why: 'MoE is a blind spot.', searchTerms: ['mixture of experts', 'sparse MoE'] },
]) {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(gaps) } }] }),
  };
}

describe('GET /api/gaps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = 'test-key';
  });

  it('returns 401 when no session cookie', async () => {
    mockVerifySession.mockReturnValue({ valid: false } as ReturnType<typeof verifySessionCookie>);
    const req = makeRequest(); // no cookie
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 when session cookie is invalid', async () => {
    mockVerifySession.mockReturnValue({ valid: false } as ReturnType<typeof verifySessionCookie>);
    const req = makeRequest('bad-token');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 503 when OPENROUTER_API_KEY is not set', async () => {
    delete process.env.OPENROUTER_API_KEY;
    mockVerifySession.mockReturnValue({ valid: true, userId: 'user-1' } as ReturnType<typeof verifySessionCookie>);
    const req = makeRequest('valid-token');
    const res = await GET(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toContain('LLM not configured');
  });

  it('returns empty gaps with message when user has no tracks', async () => {
    mockVerifySession.mockReturnValue({ valid: true, userId: 'user-1' } as ReturnType<typeof verifySessionCookie>);
    mockGetSupabase.mockReturnValue({
      from: vi.fn().mockReturnValue(makeChain([])), // tracks returns empty
    } as unknown as ReturnType<typeof getServiceSupabase>);
    const req = makeRequest('valid-token');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.gaps).toEqual([]);
    expect(body.message).toBeTruthy();
  });

  it('returns empty gaps with message when user has no reading history', async () => {
    mockVerifySession.mockReturnValue({ valid: true, userId: 'user-1' } as ReturnType<typeof verifySessionCookie>);
    mockGetSupabase.mockReturnValue({
      from: vi.fn()
        .mockReturnValueOnce(makeChain(sampleTracks))      // tracks
        .mockReturnValueOnce(makeChain([]))                 // paper_digest_entries (empty)
        .mockReturnValueOnce(makeChain([])),                // reading_list (empty)
    } as unknown as ReturnType<typeof getServiceSupabase>);
    const req = makeRequest('valid-token');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.gaps).toEqual([]);
    expect(body.message).toBeTruthy();
  });

  it('returns 500 if LLM call fails', async () => {
    mockVerifySession.mockReturnValue({ valid: true, userId: 'user-1' } as ReturnType<typeof verifySessionCookie>);
    mockGetSupabase.mockReturnValue({
      from: vi.fn()
        .mockReturnValueOnce(makeChain(sampleTracks))
        .mockReturnValueOnce(makeChain(sampleDigestEntries))
        .mockReturnValueOnce(makeChain(sampleReadingList)),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

    const req = makeRequest('valid-token');
    const res = await GET(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('returns structured gaps when LLM succeeds', async () => {
    mockVerifySession.mockReturnValue({ valid: true, userId: 'user-1' } as ReturnType<typeof verifySessionCookie>);
    mockGetSupabase.mockReturnValue({
      from: vi.fn()
        .mockReturnValueOnce(makeChain(sampleTracks))
        .mockReturnValueOnce(makeChain(sampleDigestEntries))
        .mockReturnValueOnce(makeChain(sampleReadingList))
        // Then 3 gaps × up to 2 queries each (title + abstract fallback)
        .mockReturnValue(makeChain(sampleSuggestedPapers)),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    global.fetch = vi.fn().mockResolvedValue(makeLLMResponse());

    const req = makeRequest('valid-token');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(Array.isArray(body.gaps)).toBe(true);
    expect(body.gaps.length).toBe(3);
    expect(body.gaps[0].topic).toBe('Test-Time Compute');
    expect(body.gaps[0].why).toBeTruthy();
    expect(Array.isArray(body.gaps[0].suggestedPapers)).toBe(true);

    expect(body.meta.tracksAnalyzed).toBe(2);
    expect(body.meta.recentPapersAnalyzed).toBeGreaterThan(0);
    expect(body.meta.generatedAt).toBeTruthy();
  });

  it('includes paper arxiv_id, title, abstract, published_at in suggestions', async () => {
    mockVerifySession.mockReturnValue({ valid: true, userId: 'user-1' } as ReturnType<typeof verifySessionCookie>);
    mockGetSupabase.mockReturnValue({
      from: vi.fn()
        .mockReturnValueOnce(makeChain(sampleTracks))
        .mockReturnValueOnce(makeChain(sampleDigestEntries))
        .mockReturnValueOnce(makeChain(sampleReadingList))
        .mockReturnValue(makeChain(sampleSuggestedPapers)),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    global.fetch = vi.fn().mockResolvedValue(makeLLMResponse());

    const req = makeRequest('valid-token');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();

    const firstPaper = body.gaps[0]?.suggestedPapers[0];
    if (firstPaper) {
      expect(firstPaper).toHaveProperty('arxiv_id');
      expect(firstPaper).toHaveProperty('title');
      expect(firstPaper).toHaveProperty('abstract');
      expect(firstPaper).toHaveProperty('published_at');
    }
  });

  it('excludes already-seen papers from suggestions', async () => {
    const seenArxivId = '2405.00100'; // first suggested paper — should be excluded
    mockVerifySession.mockReturnValue({ valid: true, userId: 'user-1' } as ReturnType<typeof verifySessionCookie>);

    // Digest entries include the "seen" paper
    const digestWithSeen = [
      { arxiv_id: seenArxivId, papers: { title: 'Test-Time Compute Scaling', categories: ['cs.AI'] } },
      ...sampleDigestEntries.filter((e) => e.arxiv_id !== seenArxivId),
    ];

    // Paper suggestions include seen + unseen
    const papers = [
      { arxiv_id: seenArxivId, title: 'Already Read', abstract: 'old...', published_at: '2024-01-01' },
      { arxiv_id: '2405.999', title: 'Truly New Paper', abstract: 'new...', published_at: '2024-05-01' },
    ];

    mockGetSupabase.mockReturnValue({
      from: vi.fn()
        .mockReturnValueOnce(makeChain(sampleTracks))
        .mockReturnValueOnce(makeChain(digestWithSeen))
        .mockReturnValueOnce(makeChain([]))
        .mockReturnValue(makeChain(papers)),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    global.fetch = vi.fn().mockResolvedValue(makeLLMResponse());

    const req = makeRequest('valid-token');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();

    // The already-seen paper must NOT appear in any gap's suggestions
    for (const gap of body.gaps) {
      for (const paper of gap.suggestedPapers) {
        expect(paper.arxiv_id).not.toBe(seenArxivId);
      }
    }
  });
});
