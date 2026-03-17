/**
 * route.test.ts — tests for GET /api/reading-list/markdown
 *
 * Covers:
 *  - 401 when no session cookie
 *  - 200 with Markdown content and correct headers
 *  - Filename includes status suffix when ?status= provided
 *  - Default filename when no status filter
 *  - Passes abstracts=0 to readingListToMarkdown
 *  - Passes notes=0 to readingListToMarkdown
 *  - Passes group=0 to readingListToMarkdown
 *  - Content-Type is text/markdown
 *  - 500 on unexpected error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetUserReadingList = vi.fn();
const mockReadingListToMarkdown = vi.fn();

vi.mock('../../../../lib/auth', () => ({
  verifySessionCookie: vi.fn(),
}));

vi.mock('../../../../lib/reading-list-supa', () => ({
  getUserReadingList: (...args: unknown[]) => mockGetUserReadingList(...args),
  isValidStatus: (s: unknown) => ['unread', 'reading', 'done'].includes(s as string),
}));

vi.mock('../../../../lib/markdown-export', () => ({
  readingListToMarkdown: (...args: unknown[]) => mockReadingListToMarkdown(...args),
}));

import { verifySessionCookie } from '../../../../lib/auth';

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER_ID = 'user-md-export-123';

function makeRequest(searchParams: Record<string, string> = {}, withSession = true): NextRequest {
  const url = new URL('http://localhost/api/reading-list/markdown');
  for (const [k, v] of Object.entries(searchParams)) {
    url.searchParams.set(k, v);
  }
  const req = new NextRequest(url, { method: 'GET' });
  if (withSession) req.cookies.set('pb_session', 'valid');
  return req;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifySessionCookie).mockReturnValue({ valid: true, userId: USER_ID });
  mockGetUserReadingList.mockResolvedValue([]);
  mockReadingListToMarkdown.mockReturnValue('# My Reading List\n\n_0 papers_\n');
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/reading-list/markdown', () => {
  it('returns 401 when no session cookie', async () => {
    vi.mocked(verifySessionCookie).mockReturnValue({ valid: false });
    const { GET } = await import('./route');
    const req = makeRequest({}, false);
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 200 with Markdown content', async () => {
    const { GET } = await import('./route');
    const req = makeRequest();
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('# My Reading List');
  });

  it('Content-Type is text/markdown', async () => {
    const { GET } = await import('./route');
    const req = makeRequest();
    const res = await GET(req);
    expect(res.headers.get('content-type')).toMatch(/text\/markdown/i);
  });

  it('default filename is reading-list.md', async () => {
    const { GET } = await import('./route');
    const req = makeRequest();
    const res = await GET(req);
    const cd = res.headers.get('content-disposition') ?? '';
    expect(cd).toContain('reading-list.md');
    expect(cd).not.toContain('reading-list-');
  });

  it('filename includes status suffix when ?status=done', async () => {
    const { GET } = await import('./route');
    const req = makeRequest({ status: 'done' });
    const res = await GET(req);
    const cd = res.headers.get('content-disposition') ?? '';
    expect(cd).toContain('reading-list-done.md');
  });

  it('filename includes status suffix when ?status=reading', async () => {
    const { GET } = await import('./route');
    const req = makeRequest({ status: 'reading' });
    const res = await GET(req);
    const cd = res.headers.get('content-disposition') ?? '';
    expect(cd).toContain('reading-list-reading.md');
  });

  it('passes status filter to getUserReadingList', async () => {
    const { GET } = await import('./route');
    const req = makeRequest({ status: 'unread' });
    await GET(req);
    expect(mockGetUserReadingList).toHaveBeenCalledWith(USER_ID, 'unread');
  });

  it('calls getUserReadingList with undefined status when no filter', async () => {
    const { GET } = await import('./route');
    const req = makeRequest();
    await GET(req);
    expect(mockGetUserReadingList).toHaveBeenCalledWith(USER_ID, undefined);
  });

  it('passes includeAbstracts=false when abstracts=0', async () => {
    const { GET } = await import('./route');
    const req = makeRequest({ abstracts: '0' });
    await GET(req);
    expect(mockReadingListToMarkdown).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ includeAbstracts: false }),
    );
  });

  it('passes includeNotes=false when notes=0', async () => {
    const { GET } = await import('./route');
    const req = makeRequest({ notes: '0' });
    await GET(req);
    expect(mockReadingListToMarkdown).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ includeNotes: false }),
    );
  });

  it('passes groupByStatus=false when group=0', async () => {
    const { GET } = await import('./route');
    const req = makeRequest({ group: '0' });
    await GET(req);
    expect(mockReadingListToMarkdown).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ groupByStatus: false }),
    );
  });

  it('sets Cache-Control: no-store', async () => {
    const { GET } = await import('./route');
    const req = makeRequest();
    const res = await GET(req);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('returns 500 on unexpected error', async () => {
    mockGetUserReadingList.mockRejectedValueOnce(new Error('DB failure'));
    const { GET } = await import('./route');
    const req = makeRequest();
    const res = await GET(req);
    expect(res.status).toBe(500);
  });
});
