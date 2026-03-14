/**
 * Tests for GET/POST/DELETE /api/reading-list
 *
 * Covers:
 *  - GET: 401 when no session cookie
 *  - GET: 401 when invalid cookie
 *  - GET: returns items for authenticated user
 *  - GET: passes status filter to helper
 *  - GET: ignores invalid status filter (returns all)
 *  - GET: returns 500 on DB error
 *  - POST: 401 when unauthenticated
 *  - POST: 400 when arxivId missing
 *  - POST: 400 when status is invalid
 *  - POST: 400 when arxivId is not a string
 *  - POST: adds item and returns ok
 *  - POST: returns 500 on DB error
 *  - DELETE: 401 when unauthenticated
 *  - DELETE: 400 when arxivId missing
 *  - DELETE: removes item and returns ok
 *  - DELETE: returns 500 on DB error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Module mocks ───────────────────────────────────────────────────────────────

vi.mock('../../../lib/auth', () => ({
  verifySessionCookie: vi.fn(),
}));

vi.mock('../../../lib/reading-list-supa', () => ({
  getUserReadingList: vi.fn(),
  upsertReadingListItem: vi.fn(),
  removeReadingListItem: vi.fn(),
  isValidStatus: vi.fn((s: unknown) => ['unread', 'reading', 'done'].includes(s as string)),
}));

import { verifySessionCookie } from '../../../lib/auth';
import {
  getUserReadingList,
  upsertReadingListItem,
  removeReadingListItem,
} from '../../../lib/reading-list-supa';
import { GET, POST, DELETE } from './route';

import type { MockedFunction } from 'vitest';
const mockVerify = verifySessionCookie as MockedFunction<typeof verifySessionCookie>;
const mockGetList = getUserReadingList as MockedFunction<typeof getUserReadingList>;
const mockUpsert = upsertReadingListItem as MockedFunction<typeof upsertReadingListItem>;
const mockRemove = removeReadingListItem as MockedFunction<typeof removeReadingListItem>;

// ── Helpers ────────────────────────────────────────────────────────────────────

const BASE_URL = 'http://localhost/api/reading-list';

function makeRequest(
  method: 'GET' | 'POST' | 'DELETE',
  {
    body,
    params,
    hasCookie = true,
  }: { body?: object; params?: Record<string, string>; hasCookie?: boolean } = {},
): NextRequest {
  const url = new URL(BASE_URL);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const req = new NextRequest(url.toString(), {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}),
  });

  if (hasCookie) req.cookies.set('pb_session', 'valid-session');
  return req;
}

function validAuth() {
  mockVerify.mockReturnValue({ valid: true, userId: 'user-123' });
}

const MOCK_ITEM = {
  arxiv_id: '2401.00001',
  title: 'Test Paper',
  abstract: 'Abstract text',
  track: 'cs.LG',
  llm_score: 7,
  published_at: '2024-01-01',
  status: 'unread' as const,
  priority: 0,
  note: null,
  saved_at: '2026-03-14T00:00:00Z',
};

// ── GET ────────────────────────────────────────────────────────────────────────

describe('GET /api/reading-list', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no session cookie', async () => {
    const req = makeRequest('GET', { hasCookie: false });
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('auth_required');
  });

  it('returns 401 when session cookie is invalid', async () => {
    mockVerify.mockReturnValue({ valid: false });
    const req = makeRequest('GET');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns items for authenticated user', async () => {
    validAuth();
    mockGetList.mockResolvedValue([MOCK_ITEM]);

    const req = makeRequest('GET');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].arxiv_id).toBe('2401.00001');
    expect(body.count).toBe(1);
  });

  it('passes status filter to helper', async () => {
    validAuth();
    mockGetList.mockResolvedValue([]);

    const req = makeRequest('GET', { params: { status: 'reading' } });
    await GET(req);

    expect(mockGetList).toHaveBeenCalledWith('user-123', 'reading');
  });

  it('ignores invalid status filter (calls helper without status)', async () => {
    validAuth();
    mockGetList.mockResolvedValue([]);

    const req = makeRequest('GET', { params: { status: 'invalid' } });
    await GET(req);

    // isValidStatus('invalid') returns false → status passed as undefined
    expect(mockGetList).toHaveBeenCalledWith('user-123', undefined);
  });

  it('returns 500 on DB error', async () => {
    validAuth();
    mockGetList.mockRejectedValue(new Error('db gone'));

    const req = makeRequest('GET');
    const res = await GET(req);
    expect(res.status).toBe(500);
  });
});

// ── POST ───────────────────────────────────────────────────────────────────────

describe('POST /api/reading-list', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    const req = makeRequest('POST', { hasCookie: false, body: {} });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 when arxivId is missing', async () => {
    validAuth();
    const req = makeRequest('POST', { body: { status: 'unread' } });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/arxivId/i);
  });

  it('returns 400 when arxivId is not a string', async () => {
    validAuth();
    const req = makeRequest('POST', { body: { arxivId: 123, status: 'unread' } });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when status is invalid', async () => {
    validAuth();
    const req = makeRequest('POST', { body: { arxivId: '2401.00001', status: 'saved' } });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/status/i);
  });

  it('upserts item and returns ok', async () => {
    validAuth();
    mockUpsert.mockResolvedValue();

    const req = makeRequest('POST', {
      body: { arxivId: '2401.00001', status: 'reading' },
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.arxivId).toBe('2401.00001');
    expect(body.status).toBe('reading');
    expect(mockUpsert).toHaveBeenCalledWith('user-123', '2401.00001', 'reading', {
      note: undefined,
      priority: 0,
    });
  });

  it('passes optional note and priority when provided', async () => {
    validAuth();
    mockUpsert.mockResolvedValue();

    const req = makeRequest('POST', {
      body: { arxivId: '2401.00001', status: 'done', note: 'Great!', priority: 2 },
    });
    await POST(req);

    expect(mockUpsert).toHaveBeenCalledWith('user-123', '2401.00001', 'done', {
      note: 'Great!',
      priority: 2,
    });
  });

  it('returns 500 on DB error', async () => {
    validAuth();
    mockUpsert.mockRejectedValue(new Error('upsert failed'));

    const req = makeRequest('POST', { body: { arxivId: '2401.00001', status: 'unread' } });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});

// ── DELETE ─────────────────────────────────────────────────────────────────────

describe('DELETE /api/reading-list', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    const req = makeRequest('DELETE', { hasCookie: false, params: { arxivId: '2401.00001' } });
    const res = await DELETE(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 when arxivId is missing', async () => {
    validAuth();
    const req = makeRequest('DELETE');
    const res = await DELETE(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/arxivId/i);
  });

  it('removes item and returns ok', async () => {
    validAuth();
    mockRemove.mockResolvedValue();

    const req = makeRequest('DELETE', { params: { arxivId: '2401.00001' } });
    const res = await DELETE(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.arxivId).toBe('2401.00001');
    expect(mockRemove).toHaveBeenCalledWith('user-123', '2401.00001');
  });

  it('returns 500 on DB error', async () => {
    validAuth();
    mockRemove.mockRejectedValue(new Error('delete failed'));

    const req = makeRequest('DELETE', { params: { arxivId: '2401.00001' } });
    const res = await DELETE(req);
    expect(res.status).toBe(500);
  });
});
