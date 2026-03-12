/**
 * Tests for POST + GET /api/paper/:arxivId/chat (Paper Chat — Pro feature)
 *
 * Covers:
 *  - Auth enforcement (missing cookie, invalid cookie → 401)
 *  - Plan gate (free plan → 403 with upgradeUrl)
 *  - Request validation (missing messages, too many, bad shape → 400)
 *  - Paper not found → 404
 *  - Missing OpenRouter API key → 503
 *  - Happy path POST: streams SSE deltas and [DONE]
 *  - Happy path GET: returns chat history
 *  - GET: free plan → 403
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Module mocks ───────────────────────────────────────────────────────────────

vi.mock('../auth', () => ({
  verifySessionCookie: vi.fn(),
}));

vi.mock('../supabase', () => ({
  getServiceSupabase: vi.fn(),
}));

vi.mock('../stripe', () => ({
  getSubscription: vi.fn(),
}));

vi.mock('../arxiv-db', () => ({
  getPaper: vi.fn(),
}));

import { verifySessionCookie } from '../auth';
import { getServiceSupabase } from '../supabase';
import { getSubscription } from '../stripe';
import { getPaper } from '../arxiv-db';
import { POST, GET } from '../../app/api/paper/[arxivId]/chat/route';

// ── Typed mocks ────────────────────────────────────────────────────────────────

import type { MockedFunction } from 'vitest';
const mockVerify     = verifySessionCookie as MockedFunction<typeof verifySessionCookie>;
const mockGetSupa    = getServiceSupabase  as MockedFunction<typeof getServiceSupabase>;
const mockGetSub     = getSubscription     as MockedFunction<typeof getSubscription>;
const mockGetPaper   = getPaper            as MockedFunction<typeof getPaper>;

// ── Helpers ────────────────────────────────────────────────────────────────────

const ARXIV_ID = '2401.00001';

function makeRequest(
  method: 'POST' | 'GET',
  body?: object,
  hasCookie = true,
): NextRequest {
  const url = `http://localhost/api/paper/${ARXIV_ID}/chat`;
  const req = new NextRequest(url, {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}),
  });
  if (hasCookie) req.cookies.set('pb_session', 'valid-session');
  return req;
}

const PARAMS = Promise.resolve({ arxivId: ARXIV_ID });

const PRO_SUBSCRIPTION = {
  plan: 'pro' as const,
  stripeCustomerId: 'cus_test',
  stripeSubscriptionId: 'sub_test',
  planExpiresAt: null,
  trackLimit: 5,
  digestFrequency: 'daily',
};

const FREE_SUBSCRIPTION = {
  plan: 'free' as const,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  planExpiresAt: null,
  trackLimit: 1,
  digestFrequency: 'weekly',
};

const MOCK_PAPER = {
  arxiv_id: ARXIV_ID,
  title: 'Attention Is All You Need',
  abstract: 'We propose the Transformer architecture...',
  track: 'cs.CL',
  authors: '["Vaswani et al."]',
  published_at: '2024-01-15',
  llm_score: 4,
};

function proAuth() {
  mockVerify.mockReturnValue({ valid: true, userId: 'user-123' });
  mockGetSub.mockResolvedValue(PRO_SUBSCRIPTION);
}

// ── Supabase mock factory ──────────────────────────────────────────────────────

function makeSupaMock(historyData: unknown[] = []) {
  const orderMock = vi.fn().mockReturnThis();
  const limitMock = vi.fn().mockResolvedValue({ data: historyData, error: null });
  const insertMock = vi.fn().mockResolvedValue({ error: null });
  const selectMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnThis(),
    order: orderMock,
    limit: limitMock,
  });
  return {
    from: vi.fn().mockReturnValue({
      select: selectMock,
      insert: insertMock,
    }),
  } as unknown as ReturnType<typeof getServiceSupabase>;
}

// ── OpenRouter mock helper ─────────────────────────────────────────────────────

function mockOpenRouter(chunks: string[], status = 200) {
  const encoder = new TextEncoder();
  let idx = 0;

  const stream = new ReadableStream({
    pull(controller) {
      if (idx < chunks.length) {
        controller.enqueue(encoder.encode(chunks[idx++]));
      } else {
        controller.close();
      }
    },
  });

  global.fetch = vi.fn().mockResolvedValueOnce(
    new Response(stream, {
      status,
      headers: { 'content-type': 'text/event-stream' },
    }),
  );
}

function sseChunks(deltas: string[]): string[] {
  return [
    ...deltas.map((d) => `data: ${JSON.stringify({ choices: [{ delta: { content: d } }] })}\n\n`),
    'data: [DONE]\n\n',
  ];
}

// Consume an SSE stream and collect all delta text
async function collectStream(res: Response): Promise<{ deltas: string[]; done: boolean }> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const deltas: string[] = [];
  let done = false;
  let buf = '';

  while (true) {
    const { done: d, value } = await reader.read();
    if (d) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (t === 'data: [DONE]') { done = true; continue; }
      if (!t.startsWith('data: ')) continue;
      try {
        const j = JSON.parse(t.slice(6));
        if (typeof j.delta === 'string') deltas.push(j.delta);
      } catch { /* skip */ }
    }
  }
  return { deltas, done };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('POST /api/paper/[arxivId]/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (global as Record<string, unknown>).fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Auth ──────────────────────────────────────────────────────────────────────

  it('returns 401 when no session cookie', async () => {
    const req = makeRequest('POST', { messages: [{ role: 'user', content: 'hello' }] }, false);
    const res = await POST(req, { params: PARAMS });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('auth_required');
  });

  it('returns 401 when session cookie is invalid', async () => {
    mockVerify.mockReturnValue({ valid: false });
    const req = makeRequest('POST', { messages: [{ role: 'user', content: 'hello' }] });
    const res = await POST(req, { params: PARAMS });
    expect(res.status).toBe(401);
  });

  // ── Plan gate ─────────────────────────────────────────────────────────────────

  it('returns 403 with pro_required for free plan users', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: 'user-free' });
    mockGetSub.mockResolvedValue(FREE_SUBSCRIPTION);

    const req = makeRequest('POST', { messages: [{ role: 'user', content: 'hello' }] });
    const res = await POST(req, { params: PARAMS });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('pro_required');
    expect(body.upgradeUrl).toBe('/pricing');
  });

  // ── Validation ────────────────────────────────────────────────────────────────

  it('returns 400 when messages array is missing', async () => {
    proAuth();
    const req = makeRequest('POST', {});
    const res = await POST(req, { params: PARAMS });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_messages');
  });

  it('returns 400 when messages is empty', async () => {
    proAuth();
    const req = makeRequest('POST', { messages: [] });
    const res = await POST(req, { params: PARAMS });
    expect(res.status).toBe(400);
  });

  it('returns 400 when messages exceeds limit (>20)', async () => {
    proAuth();
    const messages = Array.from({ length: 21 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: 'msg',
    }));
    const req = makeRequest('POST', { messages });
    const res = await POST(req, { params: PARAMS });
    expect(res.status).toBe(400);
  });

  // ── Paper not found ───────────────────────────────────────────────────────────

  it('returns 404 when paper is not found', async () => {
    proAuth();
    mockGetPaper.mockReturnValue(null);

    const req = makeRequest('POST', { messages: [{ role: 'user', content: 'hello' }] });
    const res = await POST(req, { params: PARAMS });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('paper_not_found');
  });

  // ── Missing env var ───────────────────────────────────────────────────────────

  it('returns 503 when OPENROUTER_API_KEY is not set', async () => {
    proAuth();
    mockGetPaper.mockReturnValue(MOCK_PAPER as never);
    const original = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    const req = makeRequest('POST', { messages: [{ role: 'user', content: 'hello' }] });
    const res = await POST(req, { params: PARAMS });
    expect(res.status).toBe(503);

    process.env.OPENROUTER_API_KEY = original;
  });

  // ── Happy path ────────────────────────────────────────────────────────────────

  it('streams SSE deltas and [DONE] for a Pro user', async () => {
    proAuth();
    mockGetPaper.mockReturnValue(MOCK_PAPER as never);
    mockGetSupa.mockReturnValue(makeSupaMock());

    process.env.OPENROUTER_API_KEY = 'test-key';
    mockOpenRouter(sseChunks(['Hello', ' world', '!']));

    const req = makeRequest('POST', {
      messages: [{ role: 'user', content: 'What problem does this solve?' }],
    });
    const res = await POST(req, { params: PARAMS });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const { deltas, done } = await collectStream(res);
    expect(deltas).toEqual(['Hello', ' world', '!']);
    expect(done).toBe(true);
  });

  it('uses claude-haiku model in OpenRouter request', async () => {
    proAuth();
    mockGetPaper.mockReturnValue(MOCK_PAPER as never);
    mockGetSupa.mockReturnValue(makeSupaMock());
    process.env.OPENROUTER_API_KEY = 'test-key';
    mockOpenRouter(sseChunks(['ok']));

    const req = makeRequest('POST', {
      messages: [{ role: 'user', content: 'test' }],
    });
    await POST(req, { params: PARAMS });

    const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.model).toContain('claude-haiku');
  });

  it('includes paper title and abstract in system prompt', async () => {
    proAuth();
    mockGetPaper.mockReturnValue(MOCK_PAPER as never);
    mockGetSupa.mockReturnValue(makeSupaMock());
    process.env.OPENROUTER_API_KEY = 'test-key';
    mockOpenRouter(sseChunks(['ok']));

    const req = makeRequest('POST', {
      messages: [{ role: 'user', content: 'test' }],
    });
    await POST(req, { params: PARAMS });

    const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    const systemMsg = body.messages.find((m: { role: string }) => m.role === 'system');
    expect(systemMsg?.content).toContain('Attention Is All You Need');
    expect(systemMsg?.content).toContain('We propose the Transformer');
  });

  it('returns 502 when OpenRouter responds with non-OK status', async () => {
    proAuth();
    mockGetPaper.mockReturnValue(MOCK_PAPER as never);
    process.env.OPENROUTER_API_KEY = 'test-key';

    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response('{"error":"rate_limit"}', { status: 429 }),
    );

    const req = makeRequest('POST', {
      messages: [{ role: 'user', content: 'test' }],
    });
    const res = await POST(req, { params: PARAMS });
    expect(res.status).toBe(502);
  });
});

// ── GET /api/paper/[arxivId]/chat ──────────────────────────────────────────────

describe('GET /api/paper/[arxivId]/chat', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 401 when no session cookie', async () => {
    const req = makeRequest('GET', undefined, false);
    const res = await GET(req, { params: PARAMS });
    expect(res.status).toBe(401);
  });

  it('returns 403 for free plan users', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: 'user-free' });
    mockGetSub.mockResolvedValue(FREE_SUBSCRIPTION);

    const req = makeRequest('GET');
    const res = await GET(req, { params: PARAMS });
    expect(res.status).toBe(403);
  });

  it('returns empty messages array when no history', async () => {
    proAuth();
    mockGetSupa.mockReturnValue(makeSupaMock([]));

    const req = makeRequest('GET');
    const res = await GET(req, { params: PARAMS });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toEqual([]);
  });

  it('returns chat history for Pro user', async () => {
    proAuth();
    const history = [
      { id: 1, role: 'user', content: 'What problem?', created_at: '2026-03-12T00:00:00Z' },
      { id: 2, role: 'assistant', content: 'It solves X.', created_at: '2026-03-12T00:00:10Z' },
    ];
    mockGetSupa.mockReturnValue(makeSupaMock(history));

    const req = makeRequest('GET');
    const res = await GET(req, { params: PARAMS });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe('user');
    expect(body.messages[1].content).toBe('It solves X.');
  });

  it('returns 500 on database error', async () => {
    proAuth();

    const errSupaMock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'db error' } }),
        }),
      }),
    } as unknown as ReturnType<typeof getServiceSupabase>;
    mockGetSupa.mockReturnValue(errSupaMock);

    const req = makeRequest('GET');
    const res = await GET(req, { params: PARAMS });
    expect(res.status).toBe(500);
  });
});
