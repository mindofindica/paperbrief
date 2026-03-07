/**
 * Tests for plan-gate enforcement in POST /api/tracks
 *
 * Verifies free plan users are blocked at track limit, upgrade prompt returned.
 */

import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mock deps ──────────────────────────────────────────────────────────────────

vi.mock('../auth', () => ({
  verifySessionCookie: vi.fn(),
}));

vi.mock('../supabase', () => ({
  getServiceSupabase: vi.fn(),
}));

vi.mock('../stripe', () => ({
  getSubscription: vi.fn(),
}));

import { verifySessionCookie } from '../auth';
import { getServiceSupabase } from '../supabase';
import { getSubscription } from '../stripe';
import { POST } from '../../app/api/tracks/route';

const mockVerify = verifySessionCookie as MockedFunction<typeof verifySessionCookie>;
const mockGetSupabase = getServiceSupabase as MockedFunction<typeof getServiceSupabase>;
const mockGetSubscription = getSubscription as MockedFunction<typeof getSubscription>;

// ── Helpers ────────────────────────────────────────────────────────────────────

const VALID_PAYLOAD = {
  name: 'Speculative Decoding',
  keywords: ['speculative decoding', 'draft model'],
  arxiv_cats: ['cs.LG', 'cs.CL'],
  min_score: 3,
};

function makeRequest(body = VALID_PAYLOAD): NextRequest {
  const req = new NextRequest('http://localhost/api/tracks', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  req.cookies.set('pb_session', 'test-session');
  return req;
}

function freeSubscription(trackLimit = 1) {
  return {
    plan: 'free' as const,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    planExpiresAt: null,
    trackLimit,
    digestFrequency: 'weekly',
  };
}

/**
 * Build a Supabase mock where:
 *   - count query (from/select/eq/eq) resolves to { count, error: null }
 *   - insert query (from/insert/select/single) resolves to { data: track, error: null }
 */
function makeSupabaseMock(trackCount: number) {
  const newTrack = { id: 'track-new', ...VALID_PAYLOAD, active: true, created_at: new Date().toISOString() };

  // thenable mock so `await chain` resolves correctly
  function makeChain(resolveValue: unknown) {
    const chain: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: newTrack, error: null }),
      delete: vi.fn().mockReturnThis(),
      // Make the chain thenable so `await chain` resolves to resolveValue
      then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resolveValue).then(onFulfilled),
    };
    return chain;
  }

  // count chain resolves to { count: trackCount, error: null }
  const countChain = makeChain({ count: trackCount, error: null });
  // insert chain resolves to the new track via .single()
  const insertChain = makeChain({ data: newTrack, error: null });

  let callIndex = 0;
  const fromMock = vi.fn().mockImplementation(() => {
    // First call = count query, second call = insert query
    return callIndex++ === 0 ? countChain : insertChain;
  });

  return { from: fromMock };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('POST /api/tracks — plan gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerify.mockReturnValue({ valid: true, userId: 'user-123' });
  });

  it('blocks free user when at track limit (1 track)', async () => {
    mockGetSubscription.mockResolvedValue(freeSubscription(1));
    (mockGetSupabase as unknown as MockedFunction<() => unknown>).mockReturnValue(
      makeSupabaseMock(1), // already has 1 track
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(403);

    const body = await res.json() as { error: string; upgrade: boolean; plan: string; trackLimit: number };
    expect(body.upgrade).toBe(true);
    expect(body.plan).toBe('free');
    expect(body.trackLimit).toBe(1);
    expect(body.error).toContain('Upgrade to Pro');
  });

  it('allows free user with 0 tracks to create their first track', async () => {
    mockGetSubscription.mockResolvedValue(freeSubscription(1));
    (mockGetSupabase as unknown as MockedFunction<() => unknown>).mockReturnValue(
      makeSupabaseMock(0), // no tracks yet
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const body = await res.json() as { track: { name: string } };
    expect(body.track.name).toBe(VALID_PAYLOAD.name);
  });

  it('blocks pro user at 5 tracks with no upgrade prompt', async () => {
    mockGetSubscription.mockResolvedValue({
      plan: 'pro',
      stripeCustomerId: 'cus_test',
      stripeSubscriptionId: 'sub_test',
      planExpiresAt: null,
      trackLimit: 5,
      digestFrequency: 'daily',
    });
    (mockGetSupabase as unknown as MockedFunction<() => unknown>).mockReturnValue(
      makeSupabaseMock(5), // at limit
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(403);

    const body = await res.json() as { upgrade: boolean; error: string };
    expect(body.upgrade).toBe(false); // pro users don't get upgrade prompt
    expect(body.error).toContain('Pro plan limit reached');
  });

  it('allows pro user with 4 tracks to create a 5th', async () => {
    mockGetSubscription.mockResolvedValue({
      plan: 'pro',
      stripeCustomerId: 'cus_test',
      stripeSubscriptionId: 'sub_test',
      planExpiresAt: null,
      trackLimit: 5,
      digestFrequency: 'daily',
    });
    (mockGetSupabase as unknown as MockedFunction<() => unknown>).mockReturnValue(
      makeSupabaseMock(4), // room for one more
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
  });

  it('returns 401 if no session cookie', async () => {
    const req = new NextRequest('http://localhost/api/tracks', {
      method: 'POST',
      body: JSON.stringify(VALID_PAYLOAD),
    });
    mockVerify.mockReturnValue({ valid: false });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
