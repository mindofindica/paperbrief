/**
 * Unit tests for /api/notes (GET, POST) and /api/notes/[id] (PATCH, DELETE)
 * and /api/notes/counts (GET).
 *
 * Supabase and auth are mocked so no real DB calls are made.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockVerifySessionCookie = vi.fn();
vi.mock('../../../lib/auth', () => ({
  verifySessionCookie: (...args: unknown[]) => mockVerifySessionCookie(...args),
}));

const mockSupabaseChain = {
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  single: vi.fn(),
  // final resolving value
  _resolve: null as unknown,
};

// Make every method that isn't single() return the chain and resolve via then()
// For non-single returns, we add a custom `.then` on the chain object.
const mockFrom = vi.fn().mockReturnValue(mockSupabaseChain);
vi.mock('../../../lib/supabase', () => ({
  getServiceSupabase: () => ({ from: mockFrom }),
}));

// Helper to simulate a Supabase response for chained queries (non-single)
function resolveChain(data: unknown, error: unknown = null) {
  // Methods that don't end in `.single()` return a promise-like with data/error
  // Attach a .then on the chain so await works
  (mockSupabaseChain as unknown as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    resolve({ data, error });
  mockSupabaseChain.single.mockResolvedValueOnce({ data, error });
}

// ---------------------------------------------------------------------------
// Import handlers (after mocks are hoisted)
// ---------------------------------------------------------------------------
import { GET as getNotesHandler, POST as postNotesHandler } from './route';
import { PATCH as patchNoteHandler, DELETE as deleteNoteHandler } from './[id]/route';
import { GET as getCountsHandler } from './counts/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(
  method: string,
  url: string,
  body?: unknown,
  cookie?: string
): NextRequest {
  const req = new NextRequest(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return req;
}

const VALID_COOKIE = 'pb_session=valid-token';
const VALID_USER_ID = 'user-123';
const NOTE_ID = 'note-uuid-abc';

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifySessionCookie.mockReturnValue({ valid: true, userId: VALID_USER_ID });
  // Reset chain resolution
  delete (mockSupabaseChain as unknown as { then?: unknown }).then;
});

// ===========================================================================
// GET /api/notes
// ===========================================================================
describe('GET /api/notes', () => {
  it('returns 401 when no session cookie', async () => {
    const req = makeRequest('GET', 'http://localhost/api/notes?arxivId=2301.00001');
    const res = await getNotesHandler(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when cookie invalid', async () => {
    mockVerifySessionCookie.mockReturnValueOnce({ valid: false });
    const req = makeRequest('GET', 'http://localhost/api/notes?arxivId=2301.00001', undefined, VALID_COOKIE);
    const res = await getNotesHandler(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 when arxivId missing', async () => {
    const req = makeRequest('GET', 'http://localhost/api/notes', undefined, VALID_COOKIE);
    const res = await getNotesHandler(req);
    expect(res.status).toBe(400);
  });

  it('returns notes for valid user + arxivId', async () => {
    const mockNotes = [
      { id: NOTE_ID, content: 'Great paper!', created_at: '2026-03-09T00:00:00Z', updated_at: '2026-03-09T00:00:00Z' },
    ];
    // The chain ends in .order() (no .single()), so we resolve via the thenable
    (mockSupabaseChain as unknown as { then: unknown }).then = (resolve: (v: unknown) => void) =>
      resolve({ data: mockNotes, error: null });

    const req = makeRequest('GET', 'http://localhost/api/notes?arxivId=2301.00001', undefined, VALID_COOKIE);
    const res = await getNotesHandler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notes).toHaveLength(1);
    expect(body.notes[0].content).toBe('Great paper!');
  });

  it('returns empty array when no notes exist', async () => {
    (mockSupabaseChain as unknown as { then: unknown }).then = (resolve: (v: unknown) => void) =>
      resolve({ data: [], error: null });

    const req = makeRequest('GET', 'http://localhost/api/notes?arxivId=2301.99999', undefined, VALID_COOKIE);
    const res = await getNotesHandler(req);
    const body = await res.json();
    expect(body.notes).toEqual([]);
  });
});

// ===========================================================================
// POST /api/notes
// ===========================================================================
describe('POST /api/notes', () => {
  it('returns 401 when no session cookie', async () => {
    const req = makeRequest('POST', 'http://localhost/api/notes', { arxivId: 'x', content: 'y' });
    const res = await postNotesHandler(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 when content is empty string', async () => {
    const req = makeRequest('POST', 'http://localhost/api/notes', { arxivId: '2301.00001', content: '   ' }, VALID_COOKIE);
    const res = await postNotesHandler(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/empty/i);
  });

  it('returns 400 when arxivId is missing', async () => {
    const req = makeRequest('POST', 'http://localhost/api/notes', { content: 'hello' }, VALID_COOKIE);
    const res = await postNotesHandler(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when content exceeds 10000 chars', async () => {
    const req = makeRequest('POST', 'http://localhost/api/notes', {
      arxivId: '2301.00001',
      content: 'x'.repeat(10001),
    }, VALID_COOKIE);
    const res = await postNotesHandler(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/too long/i);
  });

  it('creates a note and returns 201', async () => {
    const created = {
      id: NOTE_ID,
      content: 'Interesting approach!',
      created_at: '2026-03-09T00:00:00Z',
      updated_at: '2026-03-09T00:00:00Z',
    };
    mockSupabaseChain.single.mockResolvedValueOnce({ data: created, error: null });

    const req = makeRequest('POST', 'http://localhost/api/notes', {
      arxivId: '2301.00001',
      content: 'Interesting approach!',
    }, VALID_COOKIE);
    const res = await postNotesHandler(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.note.content).toBe('Interesting approach!');
    expect(body.note.id).toBe(NOTE_ID);
  });

  it('trims whitespace from content before saving', async () => {
    const created = {
      id: NOTE_ID,
      content: 'Trimmed',
      created_at: '2026-03-09T00:00:00Z',
      updated_at: '2026-03-09T00:00:00Z',
    };
    mockSupabaseChain.single.mockResolvedValueOnce({ data: created, error: null });

    const req = makeRequest('POST', 'http://localhost/api/notes', {
      arxivId: '2301.00001',
      content: '  Trimmed  ',
    }, VALID_COOKIE);
    await postNotesHandler(req);

    // Verify insert was called with trimmed content
    expect(mockSupabaseChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Trimmed' })
    );
  });
});

// ===========================================================================
// PATCH /api/notes/[id]
// ===========================================================================
describe('PATCH /api/notes/[id]', () => {
  const params = Promise.resolve({ id: NOTE_ID });

  it('returns 401 when no session', async () => {
    const req = makeRequest('PATCH', `http://localhost/api/notes/${NOTE_ID}`, { content: 'updated' });
    const res = await patchNoteHandler(req, { params });
    expect(res.status).toBe(401);
  });

  it('returns 404 when note not found', async () => {
    mockSupabaseChain.single.mockResolvedValueOnce({ data: null, error: null });
    const req = makeRequest('PATCH', `http://localhost/api/notes/${NOTE_ID}`, { content: 'updated' }, VALID_COOKIE);
    const res = await patchNoteHandler(req, { params });
    expect(res.status).toBe(404);
  });

  it('returns 403 when note belongs to another user', async () => {
    mockSupabaseChain.single.mockResolvedValueOnce({ data: { user_id: 'other-user' }, error: null });
    const req = makeRequest('PATCH', `http://localhost/api/notes/${NOTE_ID}`, { content: 'updated' }, VALID_COOKIE);
    const res = await patchNoteHandler(req, { params });
    expect(res.status).toBe(403);
  });

  it('returns 400 when content is empty', async () => {
    const req = makeRequest('PATCH', `http://localhost/api/notes/${NOTE_ID}`, { content: '' }, VALID_COOKIE);
    const res = await patchNoteHandler(req, { params });
    expect(res.status).toBe(400);
  });

  it('updates note and returns 200', async () => {
    // First single() = ownership check
    mockSupabaseChain.single.mockResolvedValueOnce({ data: { user_id: VALID_USER_ID }, error: null });
    // Second single() = updated note
    const updated = {
      id: NOTE_ID,
      content: 'Updated content',
      created_at: '2026-03-09T00:00:00Z',
      updated_at: '2026-03-09T01:00:00Z',
    };
    mockSupabaseChain.single.mockResolvedValueOnce({ data: updated, error: null });

    const req = makeRequest('PATCH', `http://localhost/api/notes/${NOTE_ID}`, { content: 'Updated content' }, VALID_COOKIE);
    const res = await patchNoteHandler(req, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.note.content).toBe('Updated content');
  });
});

// ===========================================================================
// DELETE /api/notes/[id]
// ===========================================================================
describe('DELETE /api/notes/[id]', () => {
  const params = Promise.resolve({ id: NOTE_ID });

  it('returns 401 when no session', async () => {
    const req = makeRequest('DELETE', `http://localhost/api/notes/${NOTE_ID}`);
    const res = await deleteNoteHandler(req, { params });
    expect(res.status).toBe(401);
  });

  it('returns 404 when note not found', async () => {
    mockSupabaseChain.single.mockResolvedValueOnce({ data: null, error: null });
    const req = makeRequest('DELETE', `http://localhost/api/notes/${NOTE_ID}`, undefined, VALID_COOKIE);
    const res = await deleteNoteHandler(req, { params });
    expect(res.status).toBe(404);
  });

  it('returns 403 when note belongs to another user', async () => {
    mockSupabaseChain.single.mockResolvedValueOnce({ data: { user_id: 'other-user' }, error: null });
    const req = makeRequest('DELETE', `http://localhost/api/notes/${NOTE_ID}`, undefined, VALID_COOKIE);
    const res = await deleteNoteHandler(req, { params });
    expect(res.status).toBe(403);
  });

  it('deletes note and returns ok', async () => {
    // First single() = ownership check
    mockSupabaseChain.single.mockResolvedValueOnce({ data: { user_id: VALID_USER_ID }, error: null });
    // delete() chain resolves with no error
    (mockSupabaseChain as unknown as { then: unknown }).then = (resolve: (v: unknown) => void) =>
      resolve({ data: null, error: null });

    const req = makeRequest('DELETE', `http://localhost/api/notes/${NOTE_ID}`, undefined, VALID_COOKIE);
    const res = await deleteNoteHandler(req, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.id).toBe(NOTE_ID);
  });
});

// ===========================================================================
// GET /api/notes/counts
// ===========================================================================
describe('GET /api/notes/counts', () => {
  it('returns 401 when no session cookie', async () => {
    const req = makeRequest('GET', 'http://localhost/api/notes/counts?arxivIds=2301.00001');
    const res = await getCountsHandler(req);
    expect(res.status).toBe(401);
  });

  it('returns empty counts when no arxivIds provided', async () => {
    const req = makeRequest('GET', 'http://localhost/api/notes/counts', undefined, VALID_COOKIE);
    const res = await getCountsHandler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.counts).toEqual({});
  });

  it('returns counts correctly aggregated', async () => {
    (mockSupabaseChain as unknown as { then: unknown }).then = (resolve: (v: unknown) => void) =>
      resolve({
        data: [
          { arxiv_id: '2301.00001' },
          { arxiv_id: '2301.00001' },
          { arxiv_id: '2301.00002' },
        ],
        error: null,
      });

    const req = makeRequest('GET', 'http://localhost/api/notes/counts?arxivIds=2301.00001,2301.00002', undefined, VALID_COOKIE);
    const res = await getCountsHandler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.counts['2301.00001']).toBe(2);
    expect(body.counts['2301.00002']).toBe(1);
  });

  it('returns zero counts for papers with no notes', async () => {
    (mockSupabaseChain as unknown as { then: unknown }).then = (resolve: (v: unknown) => void) =>
      resolve({ data: [], error: null });

    const req = makeRequest('GET', 'http://localhost/api/notes/counts?arxivIds=2301.99999', undefined, VALID_COOKIE);
    const res = await getCountsHandler(req);
    const body = await res.json();
    expect(body.counts['2301.99999']).toBeUndefined();
    expect(Object.keys(body.counts)).toHaveLength(0);
  });

  it('caps arxivIds at 100 to prevent abuse', async () => {
    (mockSupabaseChain as unknown as { then: unknown }).then = (resolve: (v: unknown) => void) =>
      resolve({ data: [], error: null });

    const ids = Array.from({ length: 150 }, (_, i) => `2301.${String(i).padStart(5, '0')}`).join(',');
    const req = makeRequest('GET', `http://localhost/api/notes/counts?arxivIds=${ids}`, undefined, VALID_COOKIE);
    await getCountsHandler(req);

    // Verify .in() was called with only 100 ids
    expect(mockSupabaseChain.in).toHaveBeenCalledWith(
      'arxiv_id',
      expect.arrayContaining([expect.any(String)])
    );
    const inCall = mockSupabaseChain.in.mock.calls.at(-1)!;
    expect(inCall[1]).toHaveLength(100);
  });
});
