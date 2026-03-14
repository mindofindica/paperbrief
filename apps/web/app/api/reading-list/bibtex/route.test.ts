/**
 * Tests for GET /api/reading-list/bibtex
 *
 * Covers:
 *  - 401 when no session cookie
 *  - 401 when session cookie is invalid
 *  - Returns .bib content-type for authenticated user
 *  - Content-Disposition: attachment with filename "reading-list.bib"
 *  - Status filter: passes valid status to getUserReadingList
 *  - Status filter: ignores invalid status (calls helper with undefined)
 *  - abstracts=0 strips abstract fields from output
 *  - abstracts param omitted → abstracts included by default
 *  - Filename includes status when status filter is active
 *  - Returns empty bib (with header) when reading list is empty
 *  - Includes paper data in bib content
 *  - Returns 500 on DB error
 *  - Cache-Control: no-store header is present
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Module mocks ───────────────────────────────────────────────────────────────

vi.mock('../../../../lib/auth', () => ({
  verifySessionCookie: vi.fn(),
}));

vi.mock('../../../../lib/reading-list-supa', () => ({
  getUserReadingList: vi.fn(),
  isValidStatus: vi.fn((s: unknown) => ['unread', 'reading', 'done'].includes(s as string)),
}));

import { verifySessionCookie } from '../../../../lib/auth';
import { getUserReadingList } from '../../../../lib/reading-list-supa';
import { GET } from './route';

import type { MockedFunction } from 'vitest';
import type { ReadingListPaper } from '../../../../lib/reading-list-supa';

const mockVerify = verifySessionCookie as MockedFunction<typeof verifySessionCookie>;
const mockGetList = getUserReadingList as MockedFunction<typeof getUserReadingList>;

// ── Test fixtures ──────────────────────────────────────────────────────────────

const BASE_URL = 'http://localhost/api/reading-list/bibtex';

const MOCK_PAPER: ReadingListPaper = {
  arxiv_id: '2401.00001',
  title: 'Attention Is All You Need',
  abstract: 'We propose a new simple network architecture, the Transformer.',
  authors: JSON.stringify(['Ashish Vaswani', 'Noam Shazeer']),
  track: 'cs.LG',
  llm_score: 9,
  published_at: '2017-06-12',
  status: 'unread',
  priority: 0,
  note: null,
  saved_at: '2026-03-14T00:00:00Z',
};

function makeRequest(
  params?: Record<string, string>,
  hasCookie = true,
): NextRequest {
  const url = new URL(BASE_URL);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const req = new NextRequest(url.toString(), { method: 'GET' });
  if (hasCookie) req.cookies.set('pb_session', 'valid-session');
  return req;
}

function validAuth() {
  mockVerify.mockReturnValue({ valid: true, userId: 'user-123' });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/reading-list/bibtex', () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Auth ─────────────────────────────────────────────────────────────────

  it('returns 401 when no session cookie', async () => {
    const req = makeRequest(undefined, false);
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('auth_required');
  });

  it('returns 401 when session cookie is invalid', async () => {
    mockVerify.mockReturnValue({ valid: false });
    const req = makeRequest();
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it('returns 200 for authenticated user', async () => {
    validAuth();
    mockGetList.mockResolvedValue([MOCK_PAPER]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });

  it('returns text/plain content-type', async () => {
    validAuth();
    mockGetList.mockResolvedValue([MOCK_PAPER]);
    const res = await GET(makeRequest());
    expect(res.headers.get('Content-Type')).toContain('text/plain');
  });

  it('sets Content-Disposition attachment with filename "reading-list.bib"', async () => {
    validAuth();
    mockGetList.mockResolvedValue([MOCK_PAPER]);
    const res = await GET(makeRequest());
    const cd = res.headers.get('Content-Disposition') ?? '';
    expect(cd).toContain('attachment');
    expect(cd).toContain('reading-list.bib');
  });

  it('sets Cache-Control: no-store', async () => {
    validAuth();
    mockGetList.mockResolvedValue([MOCK_PAPER]);
    const res = await GET(makeRequest());
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('includes BibTeX content in the response body', async () => {
    validAuth();
    mockGetList.mockResolvedValue([MOCK_PAPER]);
    const res = await GET(makeRequest());
    const text = await res.text();
    expect(text).toContain('@misc');
    expect(text).toContain('arxiv_2401_00001');
    expect(text).toContain('Attention Is All You Need');
  });

  it('includes PaperBrief header comment', async () => {
    validAuth();
    mockGetList.mockResolvedValue([MOCK_PAPER]);
    const res = await GET(makeRequest());
    const text = await res.text();
    expect(text).toContain('% Generated by PaperBrief');
  });

  // ── Status filter ─────────────────────────────────────────────────────────

  it('passes valid status filter to getUserReadingList', async () => {
    validAuth();
    mockGetList.mockResolvedValue([]);
    await GET(makeRequest({ status: 'reading' }));
    expect(mockGetList).toHaveBeenCalledWith('user-123', 'reading');
  });

  it('ignores invalid status filter (calls helper with undefined)', async () => {
    validAuth();
    mockGetList.mockResolvedValue([]);
    await GET(makeRequest({ status: 'invalid' }));
    expect(mockGetList).toHaveBeenCalledWith('user-123', undefined);
  });

  it('includes status in filename when status filter is active', async () => {
    validAuth();
    mockGetList.mockResolvedValue([]);
    const res = await GET(makeRequest({ status: 'done' }));
    const cd = res.headers.get('Content-Disposition') ?? '';
    expect(cd).toContain('reading-list-done.bib');
  });

  it('uses base filename when no status filter', async () => {
    validAuth();
    mockGetList.mockResolvedValue([]);
    const res = await GET(makeRequest());
    const cd = res.headers.get('Content-Disposition') ?? '';
    expect(cd).toContain('reading-list.bib');
    expect(cd).not.toContain('reading-list-');
  });

  // ── abstracts param ───────────────────────────────────────────────────────

  it('includes abstracts by default', async () => {
    validAuth();
    mockGetList.mockResolvedValue([MOCK_PAPER]);
    const res = await GET(makeRequest());
    const text = await res.text();
    expect(text).toContain('abstract');
    expect(text).toContain('Transformer');
  });

  it('omits abstracts when abstracts=0', async () => {
    validAuth();
    mockGetList.mockResolvedValue([MOCK_PAPER]);
    const res = await GET(makeRequest({ abstracts: '0' }));
    const text = await res.text();
    expect(text).not.toContain('abstract');
  });

  it('includes abstracts when abstracts=1', async () => {
    validAuth();
    mockGetList.mockResolvedValue([MOCK_PAPER]);
    const res = await GET(makeRequest({ abstracts: '1' }));
    const text = await res.text();
    expect(text).toContain('abstract');
  });

  // ── Empty list ────────────────────────────────────────────────────────────

  it('returns valid bib with empty-comment when reading list is empty', async () => {
    validAuth();
    mockGetList.mockResolvedValue([]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('% Generated by PaperBrief');
    expect(text).toContain('% (no papers in reading list)');
    expect(text).not.toContain('@misc');
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it('returns 500 when getUserReadingList throws', async () => {
    validAuth();
    mockGetList.mockRejectedValue(new Error('Supabase exploded'));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('export');
  });
});
