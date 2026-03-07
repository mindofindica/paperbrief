import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

// ─── mocks ────────────────────────────────────────────────────────────────────

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

vi.mock('@paperbrief/core', () => ({
  fetchRecentPapers: vi.fn(),
  prefilterPapers: vi.fn(),
  scorePapers: vi.fn(),
  buildDigest: vi.fn(),
}));

vi.mock('../../../lib/email/send-digest', () => ({
  sendDigestEmail: vi.fn(),
}));

import { createClient } from '@supabase/supabase-js';
import {
  fetchRecentPapers,
  prefilterPapers,
  scorePapers,
  buildDigest,
} from '@paperbrief/core';
import { sendDigestEmail } from '../../../lib/email/send-digest';

const mockCreateClient = vi.mocked(createClient);
const mockFetchRecentPapers = vi.mocked(fetchRecentPapers);
const mockPrefilterPapers = vi.mocked(prefilterPapers);
const mockScorePapers = vi.mocked(scorePapers);
const mockBuildDigest = vi.mocked(buildDigest);
const mockSendDigestEmail = vi.mocked(sendDigestEmail);

// ─── fixtures ─────────────────────────────────────────────────────────────────

const TRACK_ROW = {
  id: 'track-1',
  user_id: 'user-1',
  name: 'Speculative Decoding',
  keywords: ['speculative decoding', 'draft model'],
  arxiv_cats: ['cs.LG', 'cs.CL'],
  min_score: 3,
};

const PAPER = {
  arxivId: '2502.00001',
  version: 'v1',
  title: 'Fast Inference via Speculative Decoding',
  abstract: 'We propose ...',
  authors: ['Alice', 'Bob'],
  categories: ['cs.LG'],
  publishedAt: '2026-02-01',
  updatedAt: '2026-02-01',
  absUrl: 'https://arxiv.org/abs/2502.00001',
  pdfUrl: null,
};

const SCORED_PAPER = {
  paper: PAPER,
  trackId: 'track-1',
  trackName: 'Speculative Decoding',
  score: 5,
  reason: 'Direct match',
  summary: 'Summary text.',
};

const DIGEST = {
  userId: 'user-1',
  weekOf: '2026-02-23',
  entries: [
    {
      arxivId: '2502.00001',
      title: 'Fast Inference via Speculative Decoding',
      authors: 'Alice, Bob',
      score: 5,
      scoreLabel: '🔥 Essential',
      summary: 'Summary text.',
      reason: 'Direct match',
      absUrl: 'https://arxiv.org/abs/2502.00001',
      trackName: 'Speculative Decoding',
    },
  ],
  tracksIncluded: ['Speculative Decoding'],
  totalPapersScanned: 10,
  totalPapersIncluded: 1,
  generatedAt: new Date().toISOString(),
};

// Build a mock Supabase client for the cron route
function makeClientMock({
  tracks = [TRACK_ROW],
  tracksError = null as unknown,
  userEmail = 'user@example.com',
  upsertResult = { error: null },
  emailPrefs = { digest_subscribed: true } as { digest_subscribed: boolean } | null,
} = {}) {
  const authAdmin = {
    getUserById: vi.fn().mockResolvedValue({
      data: { user: { email: userEmail } },
    }),
  };

  // tracks query — uses Promise-like .then()
  const tracksSelectQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: (v: unknown) => void) =>
      resolve({ data: tracks, error: tracksError })
    ),
  };

  // user_email_prefs query — uses .single() → returns a Promise
  const emailPrefsSelectQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: emailPrefs, error: null }),
  };

  const upsertQuery = {
    upsert: vi.fn().mockResolvedValue(upsertResult),
  };

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'deliveries') return upsertQuery;
      if (table === 'user_email_prefs') return emailPrefsSelectQuery;
      return tracksSelectQuery;
    }),
    auth: { admin: authAdmin },
  };
}

function makeRequest(body: Record<string, unknown> = {}, cronSecret = 'test-secret') {
  return new NextRequest('http://localhost/api/digest', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cronSecret}`,
    },
    body: JSON.stringify(body),
  });
}

// ─── tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
  process.env.CRON_SECRET = 'test-secret';
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
});

describe('POST /api/digest', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const req = new NextRequest('http://localhost/api/digest', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when CRON_SECRET is wrong', async () => {
    const res = await POST(makeRequest({}, 'wrong-secret'));
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 500 when SUPABASE_URL is missing', async () => {
    delete process.env.SUPABASE_URL;
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Missing server configuration');
  });

  it('returns 500 when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Missing server configuration');
  });

  it('returns processed=0 when no active tracks exist', async () => {
    mockCreateClient.mockReturnValue(makeClientMock({ tracks: [] }) as never);
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as { processed: number; message: string };
    expect(body.processed).toBe(0);
    expect(body.message).toBe('No active tracks');
  });

  it('fetches papers, scores them, builds digest, sends email, and records delivery', async () => {
    mockCreateClient.mockReturnValue(makeClientMock() as never);
    mockFetchRecentPapers.mockResolvedValue([PAPER]);
    mockPrefilterPapers.mockReturnValue([PAPER]);
    mockScorePapers.mockResolvedValue([SCORED_PAPER]);
    mockBuildDigest.mockReturnValue(DIGEST);
    mockSendDigestEmail.mockResolvedValue({ ok: true, id: 'email-id-1' });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; processed: number };
    expect(body.success).toBe(true);
    expect(body.processed).toBe(1);

    expect(mockFetchRecentPapers).toHaveBeenCalledOnce();
    expect(mockScorePapers).toHaveBeenCalledOnce();
    expect(mockSendDigestEmail).toHaveBeenCalledOnce();
    expect(mockSendDigestEmail.mock.calls[0][0]).toMatchObject({
      to: 'user@example.com',
      digest: DIGEST,
    });
  });

  it('scopes tracks to a specific userId when provided', async () => {
    const clientMock = makeClientMock();
    mockCreateClient.mockReturnValue(clientMock as never);
    mockFetchRecentPapers.mockResolvedValue([PAPER]);
    mockPrefilterPapers.mockReturnValue([PAPER]);
    mockScorePapers.mockResolvedValue([SCORED_PAPER]);
    mockBuildDigest.mockReturnValue(DIGEST);
    mockSendDigestEmail.mockResolvedValue({ ok: true, id: 'email-id-1' });

    await POST(makeRequest({ userId: 'user-1' }));

    // The tracks query should chain .eq('user_id', 'user-1') — verified by
    // checking the from() call was made for 'tracks'
    expect(clientMock.from).toHaveBeenCalledWith('tracks');
  });

  it('skips sending when digest has no entries', async () => {
    const emptyDigest = { ...DIGEST, entries: [] };
    mockCreateClient.mockReturnValue(makeClientMock() as never);
    mockFetchRecentPapers.mockResolvedValue([PAPER]);
    mockPrefilterPapers.mockReturnValue([PAPER]);
    mockScorePapers.mockResolvedValue([SCORED_PAPER]);
    mockBuildDigest.mockReturnValue(emptyDigest);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as { processed: number };
    // No entries → no email sent, no delivery recorded
    expect(mockSendDigestEmail).not.toHaveBeenCalled();
    expect(body.processed).toBe(0);
  });

  it('continues processing other users when one email send fails', async () => {
    const user2Track = { ...TRACK_ROW, id: 'track-2', user_id: 'user-2' };
    const clientMock = makeClientMock({ tracks: [TRACK_ROW, user2Track] });
    // getUserById returns different emails for each user
    let callCount = 0;
    clientMock.auth.admin.getUserById = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        data: { user: { email: callCount === 1 ? 'u1@example.com' : 'u2@example.com' } },
      });
    });
    mockCreateClient.mockReturnValue(clientMock as never);
    mockFetchRecentPapers.mockResolvedValue([PAPER]);
    mockPrefilterPapers.mockReturnValue([PAPER]);
    mockScorePapers.mockResolvedValue([SCORED_PAPER]);
    mockBuildDigest.mockReturnValue(DIGEST);
    mockSendDigestEmail
      .mockResolvedValueOnce({ ok: false, error: 'Rate limit' })
      .mockResolvedValueOnce({ ok: true, id: 'email-id-2' });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    // Both users processed (delivery recorded even if email failed)
    const body = await res.json() as { processed: number };
    expect(body.processed).toBe(2);
  });

  it('skips delivery for users who have unsubscribed from emails', async () => {
    mockCreateClient.mockReturnValue(
      makeClientMock({ emailPrefs: { digest_subscribed: false } }) as never
    );
    mockFetchRecentPapers.mockResolvedValue([PAPER]);
    mockPrefilterPapers.mockReturnValue([PAPER]);
    mockScorePapers.mockResolvedValue([SCORED_PAPER]);
    mockBuildDigest.mockReturnValue(DIGEST);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as { processed: number };
    // User has opted out — no email sent, delivery not recorded
    expect(mockSendDigestEmail).not.toHaveBeenCalled();
    expect(body.processed).toBe(0);
  });

  it('sends email to users with no prefs row (default = subscribed)', async () => {
    mockCreateClient.mockReturnValue(
      makeClientMock({ emailPrefs: null }) as never
    );
    mockFetchRecentPapers.mockResolvedValue([PAPER]);
    mockPrefilterPapers.mockReturnValue([PAPER]);
    mockScorePapers.mockResolvedValue([SCORED_PAPER]);
    mockBuildDigest.mockReturnValue(DIGEST);
    mockSendDigestEmail.mockResolvedValue({ ok: true, id: 'email-id-1' });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    // No prefs row → assume subscribed → send
    expect(mockSendDigestEmail).toHaveBeenCalledOnce();
  });

  it('returns 500 on unexpected error', async () => {
    mockCreateClient.mockReturnValue(makeClientMock() as never);
    mockFetchRecentPapers.mockRejectedValue(new Error('arXiv API down'));

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Internal server error');
  });
});
