import { describe, expect, it, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, DELETE } from './route';
import { getServiceSupabase } from '../../../lib/supabase';
import { verifySessionCookie } from '../../../lib/auth';

vi.mock('../../../lib/supabase', () => ({
  getServiceSupabase: vi.fn(),
}));

vi.mock('../../../lib/auth', () => ({
  verifySessionCookie: vi.fn(),
}));

type QueryMock = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function createQueryMock(): QueryMock {
  const query: QueryMock = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn(),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn(),
    delete: vi.fn().mockReturnThis(),
  };
  return query;
}

const getServiceSupabaseMock = vi.mocked(getServiceSupabase);
const verifySessionCookieMock = vi.mocked(verifySessionCookie);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('tracks api', () => {
  it('returns 401 when no session cookie', async () => {
    verifySessionCookieMock.mockReturnValue({ valid: false });

    const request = new NextRequest('http://localhost/api/tracks');
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('returns user tracks on GET', async () => {
    verifySessionCookieMock.mockReturnValue({ valid: true, userId: 'user-1' });

    const query = createQueryMock();
    query.order.mockResolvedValue({
      data: [
        {
          id: 'track-1',
          name: 'Test Track',
          keywords: ['llm'],
          arxiv_cats: ['cs.AI'],
          min_score: 6,
          active: true,
          created_at: '2026-02-01T00:00:00Z',
        },
      ],
      error: null,
    });

    getServiceSupabaseMock.mockReturnValue({
      from: vi.fn().mockReturnValue(query),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const request = new NextRequest('http://localhost/api/tracks', {
      headers: {
        cookie: 'pb_session=valid',
      },
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.tracks).toHaveLength(1);
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('creates a track on POST', async () => {
    verifySessionCookieMock.mockReturnValue({ valid: true, userId: 'user-1' });

    const query = createQueryMock();
    query.single.mockResolvedValue({
      data: {
        id: 'track-2',
        name: 'New Track',
        keywords: ['kv cache'],
        arxiv_cats: ['cs.LG'],
        min_score: 7,
        active: true,
        created_at: '2026-02-01T00:00:00Z',
      },
      error: null,
    });

    getServiceSupabaseMock.mockReturnValue({
      from: vi.fn().mockReturnValue(query),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const request = new NextRequest('http://localhost/api/tracks', {
      method: 'POST',
      headers: {
        cookie: 'pb_session=valid',
      },
      body: JSON.stringify({
        name: 'New Track',
        keywords: ['kv cache'],
        arxiv_cats: ['cs.LG'],
        min_score: 7,
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.track.name).toBe('New Track');
    expect(query.insert).toHaveBeenCalled();
  });

  it('deletes a track on DELETE', async () => {
    verifySessionCookieMock.mockReturnValue({ valid: true, userId: 'user-1' });

    const query = createQueryMock();
    query.select.mockResolvedValue({
      data: [{ id: 'track-3' }],
      error: null,
    });

    getServiceSupabaseMock.mockReturnValue({
      from: vi.fn().mockReturnValue(query),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const request = new NextRequest('http://localhost/api/tracks?id=track-3', {
      method: 'DELETE',
      headers: {
        cookie: 'pb_session=valid',
      },
    });

    const response = await DELETE(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(query.delete).toHaveBeenCalled();
  });
});
