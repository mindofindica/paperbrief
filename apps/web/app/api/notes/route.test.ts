/**
 * route.test.ts — tests for GET /api/notes and POST /api/notes
 *
 * Covers:
 *  GET /api/notes?arxivId=xxx
 *   - 401 when no session cookie
 *   - 400 when arxivId is missing
 *   - 200 with notes array on success
 *   - 500 on Supabase error
 *
 *  POST /api/notes
 *   - 401 when no session cookie
 *   - 400 when arxivId missing
 *   - 400 when content missing or empty
 *   - 400 when content exceeds 10000 chars
 *   - 201 with created note on success
 *   - 500 on Supabase error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockFrom = vi.fn();

vi.mock('../../../lib/supabase', () => ({
  getServiceSupabase: () => ({ from: mockFrom }),
}));

vi.mock('../../../lib/auth', () => ({
  verifySessionCookie: vi.fn(),
}));

import { verifySessionCookie } from '../../../lib/auth';

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER_ID = 'user-abc-123';

function makeRequest(
  method: 'GET' | 'POST',
  opts: {
    searchParams?: Record<string, string>;
    body?: unknown;
    withSession?: boolean;
  } = {},
): NextRequest {
  const url = new URL('http://localhost/api/notes');
  if (opts.searchParams) {
    for (const [k, v] of Object.entries(opts.searchParams)) {
      url.searchParams.set(k, v);
    }
  }
  const init: RequestInit = { method };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  const req = new NextRequest(url, init);
  if (opts.withSession !== false) {
    // Attach a fake session cookie
    req.cookies.set('pb_session', 'valid-session');
  }
  return req;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifySessionCookie).mockReturnValue({ valid: true, userId: USER_ID });
});

// ── GET tests ─────────────────────────────────────────────────────────────────

describe('GET /api/notes', () => {
  it('returns 401 when no session cookie', async () => {
    vi.mocked(verifySessionCookie).mockReturnValue({ valid: false });
    const { GET } = await import('./route');
    const req = makeRequest('GET', { searchParams: { arxivId: '2401.00001' }, withSession: false });
    const res = await GET(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/unauthorized/i);
  });

  it('returns 400 when arxivId is missing', async () => {
    const { GET } = await import('./route');
    const req = makeRequest('GET');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/arxivId/i);
  });

  it('returns 200 with notes array on success', async () => {
    const notes = [
      { id: 'n1', content: 'Great paper', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { id: 'n2', content: 'Interesting approach', created_at: '2026-01-02T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' },
    ];

    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: notes, error: null }),
          }),
        }),
      }),
    });

    const { GET } = await import('./route');
    const req = makeRequest('GET', { searchParams: { arxivId: '2401.00001' } });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.notes).toEqual(notes);
  });

  it('returns empty array when no notes exist', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
    });

    const { GET } = await import('./route');
    const req = makeRequest('GET', { searchParams: { arxivId: '2401.99999' } });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.notes).toEqual([]);
  });

  it('returns 500 on Supabase error', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: null, error: new Error('DB error') }),
          }),
        }),
      }),
    });

    const { GET } = await import('./route');
    const req = makeRequest('GET', { searchParams: { arxivId: '2401.00001' } });
    const res = await GET(req);
    expect(res.status).toBe(500);
  });
});

// ── POST tests ────────────────────────────────────────────────────────────────

describe('POST /api/notes', () => {
  it('returns 401 when no session cookie', async () => {
    vi.mocked(verifySessionCookie).mockReturnValue({ valid: false });
    const { POST } = await import('./route');
    const req = makeRequest('POST', { body: { arxivId: '2401.00001', content: 'Note' }, withSession: false });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 when arxivId is missing', async () => {
    const { POST } = await import('./route');
    const req = makeRequest('POST', { body: { content: 'Note' } });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/arxivId/i);
  });

  it('returns 400 when content is missing', async () => {
    const { POST } = await import('./route');
    const req = makeRequest('POST', { body: { arxivId: '2401.00001' } });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/content/i);
  });

  it('returns 400 when content is empty string', async () => {
    const { POST } = await import('./route');
    const req = makeRequest('POST', { body: { arxivId: '2401.00001', content: '   ' } });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when content exceeds 10000 characters', async () => {
    const { POST } = await import('./route');
    const req = makeRequest('POST', { body: { arxivId: '2401.00001', content: 'x'.repeat(10001) } });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/too long/i);
  });

  it('returns 201 with created note on success', async () => {
    const createdNote = {
      id: 'note-xyz',
      content: 'My note',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    mockFrom.mockReturnValue({
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: createdNote, error: null }),
        }),
      }),
    });

    const { POST } = await import('./route');
    const req = makeRequest('POST', { body: { arxivId: '2401.00001', content: 'My note' } });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.note).toEqual(createdNote);
  });

  it('trims whitespace from content before saving', async () => {
    let capturedInsert: unknown;

    mockFrom.mockReturnValue({
      insert: (data: unknown) => {
        capturedInsert = data;
        return {
          select: () => ({
            single: () => Promise.resolve({
              data: { id: 'n1', content: 'trimmed', created_at: '', updated_at: '' },
              error: null,
            }),
          }),
        };
      },
    });

    const { POST } = await import('./route');
    const req = makeRequest('POST', { body: { arxivId: '2401.00001', content: '  trimmed  ' } });
    await POST(req);
    expect((capturedInsert as Record<string, string>).content).toBe('trimmed');
  });

  it('returns 500 on Supabase error', async () => {
    mockFrom.mockReturnValue({
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: null, error: new Error('insert failed') }),
        }),
      }),
    });

    const { POST } = await import('./route');
    const req = makeRequest('POST', { body: { arxivId: '2401.00001', content: 'Note content' } });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
