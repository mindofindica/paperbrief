/**
 * route.test.ts — tests for POST /api/feedback
 *
 * Covers:
 *  - 400 when arxivId is missing
 *  - 400 when action is missing
 *  - 400 when action is invalid
 *  - 200 with ok:true for each valid action
 *  - Writes to Supabase user_actions
 *  - 500 on unexpected error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockFrom = vi.fn();

vi.mock('../../../lib/supabase', () => ({
  getServiceSupabase: () => ({ from: mockFrom }),
}));

// writeFeedback writes to SQLite — mock it
vi.mock('../../../lib/arxiv-db', () => ({
  writeFeedback: vi.fn(),
}));

import { writeFeedback } from '../../../lib/arxiv-db';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/feedback', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReturnValue({ insert: mockInsert });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/feedback', () => {
  it('returns 400 when arxivId is missing', async () => {
    const { POST } = await import('./route');
    const req = makeRequest({ action: 'read' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/missing/i);
  });

  it('returns 400 when action is missing', async () => {
    const { POST } = await import('./route');
    const req = makeRequest({ arxivId: '2401.00001' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/missing/i);
  });

  it('returns 400 for an invalid action', async () => {
    const { POST } = await import('./route');
    const req = makeRequest({ arxivId: '2401.00001', action: 'dislike' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid action/i);
  });

  it('returns 200 ok:true for action=read', async () => {
    const { POST } = await import('./route');
    const req = makeRequest({ arxivId: '2401.00001', action: 'read' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.arxivId).toBe('2401.00001');
    expect(json.action).toBe('read');
  });

  it('returns 200 ok:true for action=save', async () => {
    const { POST } = await import('./route');
    const req = makeRequest({ arxivId: '2401.00001', action: 'save' });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('returns 200 ok:true for action=love', async () => {
    const { POST } = await import('./route');
    const req = makeRequest({ arxivId: '2401.00001', action: 'love' });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('returns 200 ok:true for action=meh', async () => {
    const { POST } = await import('./route');
    const req = makeRequest({ arxivId: '2401.00001', action: 'meh' });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('returns 200 ok:true for action=skip', async () => {
    const { POST } = await import('./route');
    const req = makeRequest({ arxivId: '2401.00001', action: 'skip' });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('calls writeFeedback with arxivId and action', async () => {
    const { POST } = await import('./route');
    const req = makeRequest({ arxivId: '2401.00001', action: 'love' });
    await POST(req);
    expect(writeFeedback).toHaveBeenCalledWith('2401.00001', 'love');
  });

  it('inserts into Supabase user_actions', async () => {
    const { POST } = await import('./route');
    const req = makeRequest({ arxivId: '2401.00001', action: 'save' });
    await POST(req);
    expect(mockFrom).toHaveBeenCalledWith('user_actions');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ arxiv_id: '2401.00001', action: 'save', source: 'web' }),
    );
  });

  it('returns 500 on unexpected error', async () => {
    vi.mocked(writeFeedback).mockImplementationOnce(() => { throw new Error('SQLite failure'); });
    const { POST } = await import('./route');
    const req = makeRequest({ arxivId: '2401.00001', action: 'read' });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
