/**
 * Tests for author-follows.ts and related API routes.
 *
 * Covers:
 *  - validateAuthorName: 16 cases
 *  - constants: FREE_FOLLOW_LIMIT, MIN/MAX lengths
 *  - getFollowedAuthors: returns list, throws on error
 *  - isFollowingAuthor: found / not found / error
 *  - getFollowCount: returns count, throws on error
 *  - followAuthor: upsert + return, throws on error
 *  - unfollowAuthor: removed / not found / throws
 *  - getPapersByFollowedAuthors: returns papers, throws on error
 *  - GET  /api/authors: 401, 200 with follows
 *  - POST /api/authors: 401, 400 (validation), 409 (duplicate), 429 (limit), 201 (created)
 *  - DELETE /api/authors/[name]: 401, 404, 200
 *  - GET /api/authors/papers: 401, 200 with pagination
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { MockedFunction } from 'vitest';

// ── Module mocks ───────────────────────────────────────────────────────────────

vi.mock('../supabase', () => ({
  getServiceSupabase: vi.fn(),
}));

vi.mock('../auth', () => ({
  verifySessionCookie: vi.fn(),
}));

import { getServiceSupabase } from '../supabase';
import { verifySessionCookie } from '../auth';
import {
  validateAuthorName,
  getFollowedAuthors,
  isFollowingAuthor,
  getFollowCount,
  followAuthor,
  unfollowAuthor,
  getPapersByFollowedAuthors,
  MAX_AUTHOR_NAME_LENGTH,
  MIN_AUTHOR_NAME_LENGTH,
  FREE_FOLLOW_LIMIT,
} from '../author-follows';

const mockGetSupa = getServiceSupabase as MockedFunction<typeof getServiceSupabase>;
const mockVerify = verifySessionCookie as MockedFunction<typeof verifySessionCookie>;

// ── Supabase chainable mock builder ───────────────────────────────────────────
//
// Supabase PostgREST builders support method chaining + promise resolution.
// This helper creates a mock that can be chained AND awaited.

type SupaResult<T> = { data?: T; error?: { message: string } | null; count?: number };

function chainable<T>(result: SupaResult<T>) {
  const obj: Record<string, unknown> = {};
  const methods = ['select', 'eq', 'ilike', 'order', 'limit', 'delete', 'upsert', 'insert', 'update'];
  for (const m of methods) {
    obj[m] = vi.fn().mockReturnValue(obj);
  }
  // .single() resolves to the result
  obj['single'] = vi.fn().mockResolvedValue(result);
  // Awaitable — resolves to result
  obj['then'] = (
    resolve: (v: SupaResult<T>) => void,
    reject: (e: unknown) => void,
  ) => Promise.resolve(result).then(resolve, reject);
  return obj as Record<string, ReturnType<typeof vi.fn>>;
}

function rpcChainable<T>(result: SupaResult<T>) {
  return {
    rpc: vi.fn().mockResolvedValue(result),
  } as unknown as ReturnType<typeof getServiceSupabase>;
}

function mockSupabase<T>(tableResult: SupaResult<T>) {
  const chain = chainable(tableResult);
  const supa = {
    from: vi.fn().mockReturnValue(chain),
  } as unknown as ReturnType<typeof getServiceSupabase>;
  mockGetSupa.mockReturnValue(supa);
  return { supa, chain };
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

const USER_ID = 'user-abc-123';

const MOCK_FOLLOW = {
  id: 'follow-1',
  author_name: 'Andrej Karpathy',
  created_at: '2026-03-16T00:00:00Z',
};

const MOCK_PAPER = {
  arxiv_id: '2603.12345',
  title: 'Test Paper',
  authors: ['Andrej Karpathy', 'Yann LeCun'],
  abstract: 'A great paper.',
  published_at: '2026-03-15',
  categories: ['cs.AI'],
  llm_score: 9,
  matched_author: 'Andrej Karpathy',
};

// ── validateAuthorName ─────────────────────────────────────────────────────────

describe('validateAuthorName', () => {
  it('accepts a simple name', () => {
    const result = validateAuthorName('Andrej Karpathy');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.name).toBe('Andrej Karpathy');
  });

  it('trims whitespace', () => {
    const result = validateAuthorName('  Yann LeCun  ');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.name).toBe('Yann LeCun');
  });

  it('accepts names with hyphens', () => {
    const result = validateAuthorName('Yoshua Bengio-Smith');
    expect(result.ok).toBe(true);
  });

  it('accepts names with apostrophes', () => {
    const result = validateAuthorName("O'Brien");
    expect(result.ok).toBe(true);
  });

  it('accepts names with periods (initials)', () => {
    const result = validateAuthorName('A. Ng');
    expect(result.ok).toBe(true);
  });

  it('accepts unicode letters (international names)', () => {
    const result = validateAuthorName('Jürgen Schmidhuber');
    expect(result.ok).toBe(true);
  });

  it('rejects name shorter than MIN_AUTHOR_NAME_LENGTH', () => {
    const result = validateAuthorName('A');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/at least/);
  });

  it('rejects empty string', () => {
    const result = validateAuthorName('');
    expect(result.ok).toBe(false);
  });

  it('rejects whitespace-only string', () => {
    const result = validateAuthorName('   ');
    expect(result.ok).toBe(false);
  });

  it('rejects name longer than MAX_AUTHOR_NAME_LENGTH', () => {
    const longName = 'A'.repeat(MAX_AUTHOR_NAME_LENGTH + 1);
    const result = validateAuthorName(longName);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/at most/);
  });

  it('rejects names with numbers', () => {
    const result = validateAuthorName('John123 Smith');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/invalid characters/);
  });

  it('rejects names with special characters like @', () => {
    const result = validateAuthorName('user@example.com');
    expect(result.ok).toBe(false);
  });

  it('rejects SQL injection attempts', () => {
    const result = validateAuthorName("'; DROP TABLE users; --");
    expect(result.ok).toBe(false);
  });

  it('returns the trimmed name when ok', () => {
    const result = validateAuthorName('  Sasha Rush  ');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.name).toBe('Sasha Rush');
  });

  it('accepts exactly MIN_AUTHOR_NAME_LENGTH chars', () => {
    const name = 'Ab';
    expect(MIN_AUTHOR_NAME_LENGTH).toBe(2);
    const result = validateAuthorName(name);
    expect(result.ok).toBe(true);
  });

  it('accepts exactly MAX_AUTHOR_NAME_LENGTH chars', () => {
    const name = 'A'.repeat(MAX_AUTHOR_NAME_LENGTH);
    const result = validateAuthorName(name);
    expect(result.ok).toBe(true);
  });
});

// ── Constants ──────────────────────────────────────────────────────────────────

describe('author-follows constants', () => {
  it('FREE_FOLLOW_LIMIT is a positive number', () => {
    expect(FREE_FOLLOW_LIMIT).toBeGreaterThan(0);
  });

  it('MIN < MAX for name length', () => {
    expect(MIN_AUTHOR_NAME_LENGTH).toBeLessThan(MAX_AUTHOR_NAME_LENGTH);
  });

  it('FREE_FOLLOW_LIMIT is 5 (free plan gate)', () => {
    expect(FREE_FOLLOW_LIMIT).toBe(5);
  });
});

// ── getFollowedAuthors ─────────────────────────────────────────────────────────

describe('getFollowedAuthors', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns list of follows for a user', async () => {
    const { chain } = mockSupabase({ data: [MOCK_FOLLOW], error: null });
    chain['order'].mockReturnValue({
      then: (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: [MOCK_FOLLOW], error: null }).then(resolve),
    });

    // Rebuild a cleaner mock for this case
    const orderResult = { data: [MOCK_FOLLOW], error: null };
    const supaChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue(orderResult),
    };
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(supaChain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const result = await getFollowedAuthors(USER_ID);
    expect(result).toHaveLength(1);
    expect(result[0].author_name).toBe('Andrej Karpathy');
  });

  it('returns empty array when no follows', async () => {
    const supaChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(supaChain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const result = await getFollowedAuthors(USER_ID);
    expect(result).toEqual([]);
  });

  it('throws on Supabase error', async () => {
    const supaChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
    };
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(supaChain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    await expect(getFollowedAuthors(USER_ID)).rejects.toThrow('Failed to fetch followed authors');
  });
});

// ── isFollowingAuthor ──────────────────────────────────────────────────────────

describe('isFollowingAuthor', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns true when follow exists', async () => {
    const supaChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [{ id: 'follow-1' }], error: null }),
    };
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(supaChain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const result = await isFollowingAuthor(USER_ID, 'Andrej Karpathy');
    expect(result).toBe(true);
  });

  it('returns false when not following', async () => {
    const supaChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(supaChain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const result = await isFollowingAuthor(USER_ID, 'Unknown Person');
    expect(result).toBe(false);
  });

  it('throws on Supabase error', async () => {
    const supaChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'Connection failed' } }),
    };
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(supaChain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    await expect(isFollowingAuthor(USER_ID, 'Anyone')).rejects.toThrow('Failed to check author follow');
  });
});

// ── getFollowCount ─────────────────────────────────────────────────────────────

describe('getFollowCount', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the count of followed authors', async () => {
    const supaChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ count: 3, error: null }),
    };
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(supaChain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const result = await getFollowCount(USER_ID);
    expect(result).toBe(3);
  });

  it('returns 0 when count is null', async () => {
    const supaChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ count: null, error: null }),
    };
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(supaChain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const result = await getFollowCount(USER_ID);
    expect(result).toBe(0);
  });

  it('throws on Supabase error', async () => {
    const supaChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ count: null, error: { message: 'Quota exceeded' } }),
    };
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(supaChain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    await expect(getFollowCount(USER_ID)).rejects.toThrow('Failed to count follows');
  });
});

// ── followAuthor ───────────────────────────────────────────────────────────────

describe('followAuthor', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the created follow record', async () => {
    const supaChain = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: MOCK_FOLLOW, error: null }),
    };
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(supaChain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const result = await followAuthor(USER_ID, 'Andrej Karpathy');
    expect(result.author_name).toBe('Andrej Karpathy');
    expect(result.id).toBe('follow-1');
  });

  it('trims whitespace from author name before upsert', async () => {
    const supaChain = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: MOCK_FOLLOW, error: null }),
    };
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(supaChain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    await followAuthor(USER_ID, '  Andrej Karpathy  ');
    const upsertCall = supaChain['upsert'].mock.calls[0][0];
    expect(upsertCall.author_name).toBe('Andrej Karpathy');
  });

  it('throws on Supabase error', async () => {
    const supaChain = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Constraint violation' } }),
    };
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(supaChain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    await expect(followAuthor(USER_ID, 'Andrej Karpathy')).rejects.toThrow('Failed to follow author');
  });
});

// ── unfollowAuthor ─────────────────────────────────────────────────────────────

describe('unfollowAuthor', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns true when author was unfollowed', async () => {
    const supaChain = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockResolvedValue({ count: 1, error: null }),
    };
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(supaChain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const result = await unfollowAuthor(USER_ID, 'Andrej Karpathy');
    expect(result).toBe(true);
  });

  it('returns false when author was not followed', async () => {
    const supaChain = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockResolvedValue({ count: 0, error: null }),
    };
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(supaChain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const result = await unfollowAuthor(USER_ID, 'Nobody');
    expect(result).toBe(false);
  });

  it('throws on Supabase error', async () => {
    const supaChain = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockResolvedValue({ count: null, error: { message: 'Permission denied' } }),
    };
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(supaChain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    await expect(unfollowAuthor(USER_ID, 'Anyone')).rejects.toThrow('Failed to unfollow author');
  });
});

// ── getPapersByFollowedAuthors ─────────────────────────────────────────────────

describe('getPapersByFollowedAuthors', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns papers from followed authors', async () => {
    mockGetSupa.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: [MOCK_PAPER], error: null }),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const result = await getPapersByFollowedAuthors(USER_ID);
    expect(result).toHaveLength(1);
    expect(result[0].arxiv_id).toBe('2603.12345');
    expect(result[0].matched_author).toBe('Andrej Karpathy');
  });

  it('returns empty array when no papers found', async () => {
    mockGetSupa.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const result = await getPapersByFollowedAuthors(USER_ID);
    expect(result).toEqual([]);
  });

  it('passes limit and offset to RPC', async () => {
    const rpcFn = vi.fn().mockResolvedValue({ data: [], error: null });
    mockGetSupa.mockReturnValue({
      rpc: rpcFn,
    } as unknown as ReturnType<typeof getServiceSupabase>);

    await getPapersByFollowedAuthors(USER_ID, 10, 20);
    expect(rpcFn).toHaveBeenCalledWith('get_papers_by_followed_authors', {
      p_user_id: USER_ID,
      p_limit: 10,
      p_offset: 20,
    });
  });

  it('throws on RPC error', async () => {
    mockGetSupa.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'RPC failed' } }),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    await expect(getPapersByFollowedAuthors(USER_ID)).rejects.toThrow('Failed to fetch papers by followed authors');
  });
});

// ── API: GET /api/authors ──────────────────────────────────────────────────────

describe('GET /api/authors', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../app/api/authors/route');
    GET = mod.GET;
  });

  function makeRequest(hasCookie = true) {
    const req = new NextRequest('http://localhost/api/authors');
    if (hasCookie) req.cookies.set('pb_session', 'test-token');
    return req;
  }

  it('returns 401 when no session cookie', async () => {
    mockVerify.mockReturnValue({ valid: false } as ReturnType<typeof verifySessionCookie>);
    const res = await GET(makeRequest(false));
    expect(res.status).toBe(401);
  });

  it('returns 401 when session is invalid', async () => {
    mockVerify.mockImplementation(() => { throw new Error('bad jwt'); });
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 200 with follows list', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: USER_ID } as ReturnType<typeof verifySessionCookie>);
    const supaChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [MOCK_FOLLOW], error: null }),
    };
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(supaChain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.follows).toHaveLength(1);
    expect(body.count).toBe(1);
  });
});

// ── API: POST /api/authors ─────────────────────────────────────────────────────

describe('POST /api/authors', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../app/api/authors/route');
    POST = mod.POST;
  });

  function makeRequest(body: unknown, hasCookie = true) {
    const req = new NextRequest('http://localhost/api/authors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (hasCookie) req.cookies.set('pb_session', 'test-token');
    return req;
  }

  it('returns 401 when no session', async () => {
    mockVerify.mockImplementation(() => { throw new Error('no cookie'); });
    const res = await POST(makeRequest({ authorName: 'Andrej Karpathy' }, false));
    expect(res.status).toBe(401);
  });

  it('returns 400 when authorName is missing', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: USER_ID } as ReturnType<typeof verifySessionCookie>);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 400 when authorName fails validation', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: USER_ID } as ReturnType<typeof verifySessionCookie>);
    const res = await POST(makeRequest({ authorName: 'A' })); // too short
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/at least/);
  });

  it('returns 409 when already following', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: USER_ID } as ReturnType<typeof verifySessionCookie>);
    // isFollowingAuthor returns true
    const isFollowingChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [{ id: 'follow-1' }], error: null }),
    };
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(isFollowingChain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const res = await POST(makeRequest({ authorName: 'Andrej Karpathy' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/Already following/);
  });

  it('returns 429 when free limit reached', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: USER_ID } as ReturnType<typeof verifySessionCookie>);

    let callCount = 0;
    mockGetSupa.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // isFollowingAuthor → not following
        return {
          from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            ilike: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        } as unknown as ReturnType<typeof getServiceSupabase>;
      }
      // getFollowCount → at limit
      return {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ count: FREE_FOLLOW_LIMIT, error: null }),
        }),
      } as unknown as ReturnType<typeof getServiceSupabase>;
    });

    const res = await POST(makeRequest({ authorName: 'New Author' }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.limitReached).toBe(true);
  });

  it('returns 201 when follow is created successfully', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: USER_ID } as ReturnType<typeof verifySessionCookie>);

    let callCount = 0;
    mockGetSupa.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // isFollowingAuthor → not following
        return {
          from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            ilike: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        } as unknown as ReturnType<typeof getServiceSupabase>;
      }
      if (callCount === 2) {
        // getFollowCount → under limit
        return {
          from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ count: 2, error: null }),
          }),
        } as unknown as ReturnType<typeof getServiceSupabase>;
      }
      // followAuthor → success
      return {
        from: vi.fn().mockReturnValue({
          upsert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: MOCK_FOLLOW, error: null }),
        }),
      } as unknown as ReturnType<typeof getServiceSupabase>;
    });

    const res = await POST(makeRequest({ authorName: 'Andrej Karpathy' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.follow.author_name).toBe('Andrej Karpathy');
  });
});

// ── API: DELETE /api/authors/[name] ───────────────────────────────────────────

describe('DELETE /api/authors/[name]', () => {
  let DELETE_ROUTE: (
    req: NextRequest,
    ctx: { params: Promise<{ name: string }> },
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../app/api/authors/[name]/route');
    DELETE_ROUTE = mod.DELETE;
  });

  function makeRequest(name: string, hasCookie = true) {
    const req = new NextRequest(`http://localhost/api/authors/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
    if (hasCookie) req.cookies.set('pb_session', 'test-token');
    return req;
  }

  function makeCtx(name: string) {
    return { params: Promise.resolve({ name: encodeURIComponent(name) }) };
  }

  it('returns 401 when no session', async () => {
    mockVerify.mockImplementation(() => { throw new Error('no cookie'); });
    const res = await DELETE_ROUTE(makeRequest('Andrej Karpathy', false), makeCtx('Andrej Karpathy'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when not following the author', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: USER_ID } as ReturnType<typeof verifySessionCookie>);
    const supaChain = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockResolvedValue({ count: 0, error: null }),
    };
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(supaChain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const res = await DELETE_ROUTE(makeRequest('Nobody'), makeCtx('Nobody'));
    expect(res.status).toBe(404);
  });

  it('returns 200 when author is successfully unfollowed', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: USER_ID } as ReturnType<typeof verifySessionCookie>);
    const supaChain = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockResolvedValue({ count: 1, error: null }),
    };
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(supaChain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const res = await DELETE_ROUTE(makeRequest('Andrej Karpathy'), makeCtx('Andrej Karpathy'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

// ── API: GET /api/authors/papers ───────────────────────────────────────────────

describe('GET /api/authors/papers', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../app/api/authors/papers/route');
    GET = mod.GET;
  });

  function makeRequest(query = '', hasCookie = true) {
    const req = new NextRequest(`http://localhost/api/authors/papers${query}`);
    if (hasCookie) req.cookies.set('pb_session', 'test-token');
    return req;
  }

  it('returns 401 when no session', async () => {
    mockVerify.mockImplementation(() => { throw new Error('no cookie'); });
    const res = await GET(makeRequest('', false));
    expect(res.status).toBe(401);
  });

  it('returns 200 with papers from followed authors', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: USER_ID } as ReturnType<typeof verifySessionCookie>);
    mockGetSupa.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: [MOCK_PAPER], error: null }),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.papers).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('respects limit query param (capped at 50)', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: USER_ID } as ReturnType<typeof verifySessionCookie>);
    const rpcFn = vi.fn().mockResolvedValue({ data: [], error: null });
    mockGetSupa.mockReturnValue({
      rpc: rpcFn,
    } as unknown as ReturnType<typeof getServiceSupabase>);

    await GET(makeRequest('?limit=100'));
    expect(rpcFn).toHaveBeenCalledWith('get_papers_by_followed_authors', expect.objectContaining({
      p_limit: 50, // capped
    }));
  });

  it('respects offset query param', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: USER_ID } as ReturnType<typeof verifySessionCookie>);
    const rpcFn = vi.fn().mockResolvedValue({ data: [], error: null });
    mockGetSupa.mockReturnValue({
      rpc: rpcFn,
    } as unknown as ReturnType<typeof getServiceSupabase>);

    await GET(makeRequest('?offset=20'));
    expect(rpcFn).toHaveBeenCalledWith('get_papers_by_followed_authors', expect.objectContaining({
      p_offset: 20,
    }));
  });

  it('returns empty papers array when no follows exist', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: USER_ID } as ReturnType<typeof verifySessionCookie>);
    mockGetSupa.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.papers).toEqual([]);
    expect(body.total).toBe(0);
  });
});
