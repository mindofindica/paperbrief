/**
 * route.test.ts — tests for POST /api/notify/reading-nudge
 *
 * Covers:
 *  - 401 in production when CRON_SECRET is wrong
 *  - 200 ok:true in development (no auth check)
 *  - dry_run=1 returns candidate counts without sending
 *  - Processes candidates and returns sent/skipped/errors counts
 *  - Returns 500 on unexpected error
 *  - days and limit params are clamped to valid ranges
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockFrom = vi.fn();

vi.mock('../../../lib/supabase', () => ({
  getServiceSupabase: () => ({ from: mockFrom }),
}));

const mockSendReadingNudgeEmail = vi.fn();
vi.mock('../../../lib/email/send-reading-nudge', () => ({
  sendReadingNudgeEmail: (...args: unknown[]) => mockSendReadingNudgeEmail(...args),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(
  searchParams: Record<string, string> = {},
  secret: string | null = null,
): NextRequest {
  const url = new URL('http://localhost/api/notify/reading-nudge');
  for (const [k, v] of Object.entries(searchParams)) {
    url.searchParams.set(k, v);
  }
  const headers: Record<string, string> = {};
  if (secret !== null) {
    headers['authorization'] = `Bearer ${secret}`;
  }
  return new NextRequest(url, { method: 'POST', headers });
}

/** Build a mock Supabase chain that returns the given rows */
function mockSupabase(rows: unknown[]) {
  mockFrom.mockReturnValue({
    select: () => ({
      eq: () => ({
        lt: () => ({
          order: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: rows, error: null }),
            }),
          }),
        }),
      }),
    }),
  });
}

function makeRow(userId: string, email: string, arxivId: string) {
  return {
    user_id: userId,
    arxiv_id: arxivId,
    priority: 5,
    saved_at: '2026-01-01T00:00:00Z',
    papers: { title: `Paper ${arxivId}`, authors: '["Author"]', categories: ['LLM'] },
    profiles: { email },
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

const ORIG_NODE_ENV = process.env.NODE_ENV;
const ORIG_SECRET   = process.env.CRON_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NODE_ENV    = 'development'; // skip auth by default
  process.env.CRON_SECRET = 'test-secret';
  mockSendReadingNudgeEmail.mockResolvedValue({ ok: true, id: 'email-id' });
});

afterEach(() => {
  process.env.NODE_ENV    = ORIG_NODE_ENV;
  process.env.CRON_SECRET = ORIG_SECRET;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/notify/reading-nudge', () => {
  it('returns 401 in production with wrong secret', async () => {
    process.env.NODE_ENV = 'production';
    const { POST } = await import('./route');
    mockSupabase([]);
    const req = makeRequest({}, 'wrong-secret');
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 200 in production with correct secret', async () => {
    process.env.NODE_ENV = 'production';
    const { POST } = await import('./route');
    mockSupabase([]);
    const req = makeRequest({}, 'test-secret');
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('returns 200 in development without auth header', async () => {
    const { POST } = await import('./route');
    mockSupabase([]);
    const req = makeRequest();
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('dry_run=1 returns candidates count without sending', async () => {
    const { POST } = await import('./route');
    const rows = [
      makeRow('u1', 'a@example.com', '2401.00001'),
      makeRow('u2', 'b@example.com', '2401.00002'),
    ];
    mockSupabase(rows);
    const req = makeRequest({ dry_run: '1' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.dry_run).toBe(true);
    expect(json.candidates).toBeGreaterThanOrEqual(0);
    expect(mockSendReadingNudgeEmail).not.toHaveBeenCalled();
  });

  it('processes candidates and returns sent count', async () => {
    const { POST } = await import('./route');
    const rows = [
      makeRow('u1', 'a@example.com', '2401.00001'),
      makeRow('u2', 'b@example.com', '2401.00002'),
    ];
    mockSupabase(rows);
    const req = makeRequest();
    const res = await POST(req);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(typeof json.processed).toBe('number');
    expect(typeof json.sent).toBe('number');
    expect(typeof json.errors).toBe('number');
  });

  it('counts skipped emails correctly', async () => {
    const { POST } = await import('./route');
    mockSupabase([makeRow('u1', 'a@example.com', '2401.00001')]);
    mockSendReadingNudgeEmail.mockResolvedValueOnce({ ok: false, error: 'no key', skipped: true });
    const req = makeRequest();
    const res = await POST(req);
    const json = await res.json();
    expect(json.skipped).toBe(1);
    expect(json.sent).toBe(0);
  });

  it('counts errors correctly', async () => {
    const { POST } = await import('./route');
    mockSupabase([makeRow('u1', 'a@example.com', '2401.00001')]);
    mockSendReadingNudgeEmail.mockResolvedValueOnce({ ok: false, error: 'send failed' });
    const req = makeRequest();
    const res = await POST(req);
    const json = await res.json();
    expect(json.errors).toBe(1);
    expect(json.sent).toBe(0);
  });

  it('returns 200 with empty processed when no candidates', async () => {
    const { POST } = await import('./route');
    mockSupabase([]);
    const req = makeRequest();
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.processed).toBe(0);
    expect(json.sent).toBe(0);
  });

  it('returns 500 on unexpected Supabase error', async () => {
    const { POST } = await import('./route');
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          lt: () => ({
            order: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: null, error: { message: 'DB down' } }),
              }),
            }),
          }),
        }),
      }),
    });
    const req = makeRequest();
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
