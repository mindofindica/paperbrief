import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ─── mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../lib/supabase', () => ({ getServiceSupabase: vi.fn() }));
vi.mock('../../../lib/email/send-digest', () => ({ sendDigestEmail: vi.fn() }));
vi.mock('../../../lib/unsubscribe-token', () => ({
  buildUnsubscribeUrl: vi.fn().mockReturnValue('https://paperbrief.ai/unsubscribe?token=x'),
}));

import { getServiceSupabase } from '../../../lib/supabase';
import { sendDigestEmail } from '../../../lib/email/send-digest';
import { POST } from './route';

const mockGetServiceSupabase = vi.mocked(getServiceSupabase);
const mockSendDigestEmail = vi.mocked(sendDigestEmail);

// ─── fixtures ─────────────────────────────────────────────────────────────────

const CRON_SECRET = 'test-cron-secret';
const TRACK = {
  id: 'track-1',
  user_id: 'user-1',
  name: 'AI Agents & Reasoning',
  keywords: ['AI agent', 'tool use'],
  arxiv_cats: ['cs.AI', 'cs.CL'],
  min_score: 3,
};

const PAPER_ROW = {
  arxiv_id: '2503.00001',
  title: 'AI Agents with Tool Use',
  abstract: 'We present a new framework for AI agent tool use with strong results.',
  authors: ['Alice Smith', 'Bob Jones'],
  categories: ['cs.AI'],
  published_at: '2026-03-14',
  llm_score: 4,
};

function makeSupabaseMock({
  tracks = [TRACK],
  prefs = null as { digest_subscribed: boolean } | null,
  email = 'user@test.com',
  papers = [PAPER_ROW],
  rpcError = null as string | null,
} = {}) {
  const mockRpc = vi.fn().mockImplementation((fn: string) => {
    if (fn === 'get_user_email_by_id') return Promise.resolve({ data: rpcError ? null : email, error: rpcError });
    if (fn === 'search_papers_for_digest') return Promise.resolve({ data: papers, error: null });
    return Promise.resolve({ data: null, error: null });
  });

  const mockFrom = vi.fn().mockImplementation((table: string) => {
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: prefs, error: null }),
    };

    if (table === 'tracks') {
      chain.eq = vi.fn().mockReturnThis();
      chain.then = (resolve: any) => resolve({ data: tracks, error: null });
    }
    if (table === 'user_email_prefs') {
      chain.maybeSingle = vi.fn().mockResolvedValue({ data: prefs, error: null });
    }
    if (table === 'paper_digest_entries') {
      chain.then = (resolve: any) => resolve({ data: [], error: null });
    }

    return chain;
  });

  return { from: mockFrom, rpc: mockRpc };
}

function makeRequest(body: object = {}) {
  return new NextRequest('http://localhost/api/digest', {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${CRON_SECRET}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = CRON_SECRET;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
});

// ─── tests ────────────────────────────────────────────────────────────────────

describe('POST /api/digest', () => {
  it('returns 401 without cron secret', async () => {
    const req = new NextRequest('http://localhost/api/digest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong secret', async () => {
    const req = new NextRequest('http://localhost/api/digest', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong', 'content-type': 'application/json' },
      body: '{}',
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns no tracks message when no active tracks exist', async () => {
    const supabase = makeSupabaseMock({ tracks: [] });
    mockGetServiceSupabase.mockReturnValue(supabase as any);

    const res = await POST(makeRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.processed).toBe(0);
  });

  it('skips user with digest_subscribed=false', async () => {
    const supabase = makeSupabaseMock({ prefs: { digest_subscribed: false } });
    mockGetServiceSupabase.mockReturnValue(supabase as any);

    const res = await POST(makeRequest());
    const json = await res.json();
    expect(json.processed).toBe(0);
    expect(mockSendDigestEmail).not.toHaveBeenCalled();
  });

  it('skips user when email lookup returns null', async () => {
    const supabase = makeSupabaseMock({ rpcError: 'not found' });
    mockGetServiceSupabase.mockReturnValue(supabase as any);

    const res = await POST(makeRequest());
    const json = await res.json();
    expect(json.processed).toBe(0);
    expect(mockSendDigestEmail).not.toHaveBeenCalled();
  });

  it('skips user when no papers match tracks', async () => {
    const supabase = makeSupabaseMock({ papers: [] });
    mockGetServiceSupabase.mockReturnValue(supabase as any);

    const res = await POST(makeRequest());
    const json = await res.json();
    expect(json.processed).toBe(0);
    expect(mockSendDigestEmail).not.toHaveBeenCalled();
  });

  it('sends digest email and records delivery when papers match', async () => {
    const supabase = makeSupabaseMock();
    mockGetServiceSupabase.mockReturnValue(supabase as any);
    mockSendDigestEmail.mockResolvedValue({ ok: true, id: 'email-123' });

    const res = await POST(makeRequest());
    const json = await res.json();
    expect(json.processed).toBe(1);
    expect(mockSendDigestEmail).toHaveBeenCalledOnce();

    const callArgs = mockSendDigestEmail.mock.calls[0]![0];
    expect(callArgs.to).toBe('user@test.com');
    expect(callArgs.digest.entries).toHaveLength(1);
    expect(callArgs.digest.entries[0].arxivId).toBe('2503.00001');
    expect(callArgs.digest.entries[0].trackName).toBe('AI Agents & Reasoning');
  });

  it('digest entry has correct score label', async () => {
    const supabase = makeSupabaseMock();
    mockGetServiceSupabase.mockReturnValue(supabase as any);
    mockSendDigestEmail.mockResolvedValue({ ok: true, id: 'x' });

    await POST(makeRequest());
    const entry = mockSendDigestEmail.mock.calls[0]![0].digest.entries[0];
    expect(entry.score).toBe(4);
    expect(entry.scoreLabel).toBe('⭐ Relevant');
  });

  it('includes unsubscribe URL in email', async () => {
    const supabase = makeSupabaseMock();
    mockGetServiceSupabase.mockReturnValue(supabase as any);
    mockSendDigestEmail.mockResolvedValue({ ok: true, id: 'x' });

    await POST(makeRequest());
    expect(mockSendDigestEmail.mock.calls[0]![0].unsubscribeUrl).toContain('unsubscribe');
  });

  it('counts error but continues when email send fails', async () => {
    const supabase = makeSupabaseMock();
    mockGetServiceSupabase.mockReturnValue(supabase as any);
    mockSendDigestEmail.mockResolvedValue({ ok: false, error: 'smtp error' });

    const res = await POST(makeRequest());
    const json = await res.json();
    expect(json.processed).toBe(0);
    expect(json.errors).toHaveLength(1);
  });

  it('accepts targetUserId in body for single-user delivery', async () => {
    const supabase = makeSupabaseMock();
    mockGetServiceSupabase.mockReturnValue(supabase as any);
    mockSendDigestEmail.mockResolvedValue({ ok: true, id: 'x' });

    const res = await POST(makeRequest({ userId: 'user-1' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.processed).toBe(1);
  });

  it('formats authors correctly for single author', async () => {
    const supabase = makeSupabaseMock({
      papers: [{ ...PAPER_ROW, authors: ['Alice Smith'] }],
    });
    mockGetServiceSupabase.mockReturnValue(supabase as any);
    mockSendDigestEmail.mockResolvedValue({ ok: true, id: 'x' });

    await POST(makeRequest());
    const entry = mockSendDigestEmail.mock.calls[0]![0].digest.entries[0];
    expect(entry.authors).toBe('Alice Smith');
  });

  it('formats authors correctly for many authors', async () => {
    const supabase = makeSupabaseMock({
      papers: [{ ...PAPER_ROW, authors: ['Alice', 'Bob', 'Carol'] }],
    });
    mockGetServiceSupabase.mockReturnValue(supabase as any);
    mockSendDigestEmail.mockResolvedValue({ ok: true, id: 'x' });

    await POST(makeRequest());
    const entry = mockSendDigestEmail.mock.calls[0]![0].digest.entries[0];
    expect(entry.authors).toBe('Alice et al.');
  });
});
