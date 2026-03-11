import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('../../../../lib/auth', () => ({
  verifySessionCookie: vi.fn(),
}));

vi.mock('../../../../lib/supabase', () => ({
  getServiceSupabase: vi.fn(),
}));

import { verifySessionCookie } from '../../../../lib/auth';
import { getServiceSupabase } from '../../../../lib/supabase';
import { GET } from './route';

const mockVerifySession = vi.mocked(verifySessionCookie);
const mockGetSupabase = vi.mocked(getServiceSupabase);

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/quiz/history');
}

describe('GET /api/quiz/history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no session', async () => {
    mockVerifySession.mockReturnValue({ valid: false, userId: undefined } as ReturnType<typeof verifySessionCookie>);
    const req = makeRequest();
    vi.spyOn(req.cookies, 'get').mockReturnValue(undefined);
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns sessions list', async () => {
    mockVerifySession.mockReturnValue({ valid: true, userId: 'user-123' } as ReturnType<typeof verifySessionCookie>);
    const mockSessions = [
      { id: 'sess-1', arxiv_id: '2301.00001', paper_title: 'Test Paper', score: 3, status: 'completed', created_at: new Date().toISOString(), completed_at: new Date().toISOString() },
    ];
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: mockSessions, error: null }),
      }),
    };
    mockGetSupabase.mockReturnValue(supabase as ReturnType<typeof getServiceSupabase>);

    const req = makeRequest();
    vi.spyOn(req.cookies, 'get').mockReturnValue({ value: 'valid-cookie', name: 'pb_session' });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].score).toBe(3);
  });

  it('returns empty array when no history', async () => {
    mockVerifySession.mockReturnValue({ valid: true, userId: 'user-123' } as ReturnType<typeof verifySessionCookie>);
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };
    mockGetSupabase.mockReturnValue(supabase as ReturnType<typeof getServiceSupabase>);

    const req = makeRequest();
    vi.spyOn(req.cookies, 'get').mockReturnValue({ value: 'valid-cookie', name: 'pb_session' });
    const res = await GET(req);
    const body = await res.json();
    expect(body.sessions).toHaveLength(0);
  });
});
