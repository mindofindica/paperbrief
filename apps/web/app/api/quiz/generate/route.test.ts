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

const mockVerifySession = vi.mocked(verifySessionCookie);
const mockGetSupabase = vi.mocked(getServiceSupabase);

function makeRequest(): NextRequest {
  const req = new NextRequest('http://localhost/api/quiz/generate', { method: 'POST' });
  return req;
}

function withCookie(req: NextRequest, cookie?: string) {
  vi.spyOn(req.cookies, 'get').mockImplementation((name: string) =>
    name === 'pb_session' && cookie ? ({ value: cookie } as ReturnType<typeof req.cookies.get>) : undefined
  );
  return req;
}

describe('POST /api/quiz/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = 'test-key';
  });

  it('returns 401 when no session cookie', async () => {
    mockVerifySession.mockReturnValue({ valid: false, userId: undefined } as ReturnType<typeof verifySessionCookie>);
    const { POST } = await import('./route');
    const req = makeRequest();
    vi.spyOn(req.cookies, 'get').mockReturnValue(undefined);
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 when no papers available', async () => {
    mockVerifySession.mockReturnValue({ valid: true, userId: 'user-123' } as ReturnType<typeof verifySessionCookie>);

    const makeChain = (data: unknown[]) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data, error: null }),
    });

    const supabase = {
      from: vi.fn()
        .mockReturnValueOnce(makeChain([]))   // todayQuizzes
        .mockReturnValueOnce(makeChain([]))   // readingListPapers
        .mockReturnValueOnce(makeChain([])),  // actionPapers
    };
    mockGetSupabase.mockReturnValue(supabase as ReturnType<typeof getServiceSupabase>);

    const req = makeRequest();
    withCookie(req, 'valid-cookie');
    const { POST } = await import('./route');
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('No papers available');
  });
});
