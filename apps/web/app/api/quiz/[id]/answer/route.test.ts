import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('../../../../../lib/auth', () => ({
  verifySessionCookie: vi.fn(),
}));

vi.mock('../../../../../lib/supabase', () => ({
  getServiceSupabase: vi.fn(),
}));

import { verifySessionCookie } from '../../../../../lib/auth';
import { getServiceSupabase } from '../../../../../lib/supabase';
import { POST } from './route';

const mockVerifySession = vi.mocked(verifySessionCookie);
const mockGetSupabase = vi.mocked(getServiceSupabase);

const MOCK_SESSION = {
  id: 'session-1',
  user_id: 'user-123',
  status: 'in_progress',
  questions: [
    { question: 'Q1', options: ['A', 'B', 'C', 'D'], correct_index: 2, explanation: 'E1' },
    { question: 'Q2', options: ['A', 'B', 'C', 'D'], correct_index: 0, explanation: 'E2' },
    { question: 'Q3', options: ['A', 'B', 'C', 'D'], correct_index: 1, explanation: 'E3' },
  ],
};

function makeRequest(body: object): NextRequest {
  return new NextRequest('http://localhost/api/quiz/session-1/answer', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/quiz/[id]/answer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifySession.mockReturnValue({ valid: true, userId: 'user-123' } as ReturnType<typeof verifySessionCookie>);
  });

  it('returns 401 when unauthorized', async () => {
    mockVerifySession.mockReturnValue({ valid: false, userId: undefined } as ReturnType<typeof verifySessionCookie>);
    const req = makeRequest({ question_index: 0, selected_option: 0 });
    vi.spyOn(req.cookies, 'get').mockReturnValue(undefined);
    const res = await POST(req, { params: Promise.resolve({ id: 'session-1' }) });
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid question_index', async () => {
    const req = makeRequest({ question_index: 5, selected_option: 0 });
    vi.spyOn(req.cookies, 'get').mockReturnValue({ value: 'valid-cookie', name: 'pb_session' });
    const res = await POST(req, { params: Promise.resolve({ id: 'session-1' }) });
    expect(res.status).toBe(400);
  });

  it('detects correct answer', async () => {
    const req = makeRequest({ question_index: 0, selected_option: 2 }); // correct_index is 2
    vi.spyOn(req.cookies, 'get').mockReturnValue({ value: 'valid-cookie', name: 'pb_session' });

    const mockInsert = vi.fn().mockResolvedValue({ error: null });
    const answersEq = vi.fn().mockResolvedValue({ data: [{ is_correct: true }], error: null });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'quiz_sessions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: MOCK_SESSION, error: null }),
          };
        }
        return {
          insert: mockInsert,
          select: vi.fn().mockReturnThis(),
          eq: answersEq,
        };
      }),
    };
    mockGetSupabase.mockReturnValue(supabase as ReturnType<typeof getServiceSupabase>);

    const res = await POST(req, { params: Promise.resolve({ id: 'session-1' }) });
    const body = await res.json();
    expect(body.is_correct).toBe(true);
    expect(body.correct_index).toBe(2);
  });

  it('marks session as completed when all 3 answers submitted', async () => {
    const req = makeRequest({ question_index: 2, selected_option: 1 }); // correct_index is 1
    vi.spyOn(req.cookies, 'get').mockReturnValue({ value: 'valid-cookie', name: 'pb_session' });

    const mockSessionUpdate = vi.fn().mockReturnThis();
    const mockUpdateEq = vi.fn().mockResolvedValue({ error: null });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'quiz_sessions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: MOCK_SESSION, error: null }),
            update: mockSessionUpdate,
          };
        }
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [{ is_correct: true }, { is_correct: false }, { is_correct: true }],
            error: null,
          }),
          update: vi.fn().mockReturnThis(),
        };
      }),
    };
    mockGetSupabase.mockReturnValue(supabase as ReturnType<typeof getServiceSupabase>);

    const res = await POST(req, { params: Promise.resolve({ id: 'session-1' }) });
    const body = await res.json();
    expect(body.completed).toBe(true);
    expect(body.score).toBe(2);
  });
});
