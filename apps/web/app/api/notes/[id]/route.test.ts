/**
 * route.test.ts — tests for PATCH /api/notes/[id] and DELETE /api/notes/[id]
 *
 * Covers:
 *  PATCH /api/notes/[id]
 *   - 401 when not authenticated
 *   - 400 when content is missing / empty
 *   - 400 when content exceeds 10000 chars
 *   - 404 when note does not exist
 *   - 403 when note belongs to another user
 *   - 200 with updated note on success
 *   - 500 on Supabase error
 *
 *  DELETE /api/notes/[id]
 *   - 401 when not authenticated
 *   - 404 when note does not exist
 *   - 403 when note belongs to another user
 *   - 200 with { ok: true } on success
 *   - 500 on Supabase error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockFrom = vi.fn();

vi.mock('../../../../lib/supabase', () => ({
  getServiceSupabase: () => ({ from: mockFrom }),
}));

vi.mock('../../../../lib/auth', () => ({
  verifySessionCookie: vi.fn(),
}));

import { verifySessionCookie } from '../../../../lib/auth';

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER_ID = 'owner-user-id';
const OTHER_USER_ID = 'other-user-id';
const NOTE_ID = 'note-abc-123';

function makeRequest(
  method: 'PATCH' | 'DELETE',
  opts: {
    body?: unknown;
    withSession?: boolean;
  } = {},
): NextRequest {
  const url = new URL(`http://localhost/api/notes/${NOTE_ID}`);
  const init: RequestInit = { method };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  const req = new NextRequest(url, init);
  if (opts.withSession !== false) {
    req.cookies.set('pb_session', 'valid-session');
  }
  return req;
}

function makeParams(id: string = NOTE_ID): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifySessionCookie).mockReturnValue({ valid: true, userId: USER_ID });
});

// ── PATCH tests ───────────────────────────────────────────────────────────────

describe('PATCH /api/notes/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(verifySessionCookie).mockReturnValue({ valid: false });
    const { PATCH } = await import('./route');
    const req = makeRequest('PATCH', { body: { content: 'Updated' }, withSession: false });
    const res = await PATCH(req, makeParams());
    expect(res.status).toBe(401);
  });

  it('returns 400 when content is missing', async () => {
    const { PATCH } = await import('./route');
    const req = makeRequest('PATCH', { body: {} });
    const res = await PATCH(req, makeParams());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/content/i);
  });

  it('returns 400 when content is empty string', async () => {
    const { PATCH } = await import('./route');
    const req = makeRequest('PATCH', { body: { content: '   ' } });
    const res = await PATCH(req, makeParams());
    expect(res.status).toBe(400);
  });

  it('returns 400 when content exceeds 10000 characters', async () => {
    const { PATCH } = await import('./route');
    const req = makeRequest('PATCH', { body: { content: 'a'.repeat(10001) } });
    const res = await PATCH(req, makeParams());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/too long/i);
  });

  it('returns 404 when note does not exist', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    });

    const { PATCH } = await import('./route');
    const req = makeRequest('PATCH', { body: { content: 'Updated note' } });
    const res = await PATCH(req, makeParams());
    expect(res.status).toBe(404);
  });

  it('returns 403 when note belongs to another user', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { user_id: OTHER_USER_ID }, error: null }),
        }),
      }),
    });

    const { PATCH } = await import('./route');
    const req = makeRequest('PATCH', { body: { content: 'Updated note' } });
    const res = await PATCH(req, makeParams());
    expect(res.status).toBe(403);
  });

  it('returns 200 with updated note on success', async () => {
    const updatedNote = {
      id: NOTE_ID,
      content: 'Updated note',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-15T10:00:00Z',
    };

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call: ownership check
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { user_id: USER_ID }, error: null }),
            }),
          }),
        };
      }
      // Second call: update
      return {
        update: () => ({
          eq: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: updatedNote, error: null }),
            }),
          }),
        }),
      };
    });

    const { PATCH } = await import('./route');
    const req = makeRequest('PATCH', { body: { content: 'Updated note' } });
    const res = await PATCH(req, makeParams());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.note).toEqual(updatedNote);
  });

  it('returns 500 on Supabase update error', async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { user_id: USER_ID }, error: null }),
            }),
          }),
        };
      }
      return {
        update: () => ({
          eq: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: null, error: new Error('update failed') }),
            }),
          }),
        }),
      };
    });

    const { PATCH } = await import('./route');
    const req = makeRequest('PATCH', { body: { content: 'Updated' } });
    const res = await PATCH(req, makeParams());
    expect(res.status).toBe(500);
  });
});

// ── DELETE tests ──────────────────────────────────────────────────────────────

describe('DELETE /api/notes/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(verifySessionCookie).mockReturnValue({ valid: false });
    const { DELETE } = await import('./route');
    const req = makeRequest('DELETE', { withSession: false });
    const res = await DELETE(req, makeParams());
    expect(res.status).toBe(401);
  });

  it('returns 404 when note does not exist', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    });

    const { DELETE } = await import('./route');
    const req = makeRequest('DELETE');
    const res = await DELETE(req, makeParams());
    expect(res.status).toBe(404);
  });

  it('returns 403 when note belongs to another user', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { user_id: OTHER_USER_ID }, error: null }),
        }),
      }),
    });

    const { DELETE } = await import('./route');
    const req = makeRequest('DELETE');
    const res = await DELETE(req, makeParams());
    expect(res.status).toBe(403);
  });

  it('returns 200 with ok:true on successful delete', async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { user_id: USER_ID }, error: null }),
            }),
          }),
        };
      }
      return {
        delete: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      };
    });

    const { DELETE } = await import('./route');
    const req = makeRequest('DELETE');
    const res = await DELETE(req, makeParams());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.id).toBe(NOTE_ID);
  });

  it('returns 500 on Supabase delete error', async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { user_id: USER_ID }, error: null }),
            }),
          }),
        };
      }
      return {
        delete: () => ({
          eq: () => Promise.resolve({ error: new Error('delete failed') }),
        }),
      };
    });

    const { DELETE } = await import('./route');
    const req = makeRequest('DELETE');
    const res = await DELETE(req, makeParams());
    expect(res.status).toBe(500);
  });
});
