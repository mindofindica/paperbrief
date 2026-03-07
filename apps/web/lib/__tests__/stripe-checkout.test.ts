/**
 * Tests for POST /api/stripe/checkout
 *
 * Mocks: verifySessionCookie, getSubscription, getStripe
 */

import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mock deps ──────────────────────────────────────────────────────────────────

vi.mock('../auth', () => ({
  verifySessionCookie: vi.fn(),
}));

vi.mock('../stripe', () => ({
  getSubscription: vi.fn(),
  getStripe: vi.fn(),
}));

import { verifySessionCookie } from '../auth';
import { getSubscription, getStripe } from '../stripe';
import { POST } from '../../app/api/stripe/checkout/route';

const mockVerify = verifySessionCookie as MockedFunction<typeof verifySessionCookie>;
const mockGetSubscription = getSubscription as MockedFunction<typeof getSubscription>;
const mockGetStripe = getStripe as MockedFunction<typeof getStripe>;

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRequest(hasCookie = true): NextRequest {
  const req = new NextRequest('http://localhost/api/stripe/checkout', {
    method: 'POST',
  });
  if (hasCookie) {
    req.cookies.set('pb_session', 'test-session-token');
  }
  return req;
}

function freeSubscription() {
  return {
    plan: 'free' as const,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    planExpiresAt: null,
    trackLimit: 1,
    digestFrequency: 'weekly',
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('POST /api/stripe/checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_PRICE_ID_PRO = 'price_test_pro';
    process.env.PAPERBRIEF_BASE_URL = 'https://paperbrief.vercel.app';
  });

  it('returns 401 if no session cookie', async () => {
    const res = await POST(makeRequest(false));
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 if session cookie is invalid', async () => {
    mockVerify.mockReturnValue({ valid: false });
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 409 if user is already on Pro plan', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: 'user-123' });
    mockGetSubscription.mockResolvedValue({
      ...freeSubscription(),
      plan: 'pro',
      trackLimit: 5,
      digestFrequency: 'daily',
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('Already on Pro');
  });

  it('returns 503 if STRIPE_PRICE_ID_PRO is not set', async () => {
    delete process.env.STRIPE_PRICE_ID_PRO;
    mockVerify.mockReturnValue({ valid: true, userId: 'user-123' });
    mockGetSubscription.mockResolvedValue(freeSubscription());

    const res = await POST(makeRequest());
    expect(res.status).toBe(503);
  });

  it('returns checkout URL on success', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: 'user-123' });
    mockGetSubscription.mockResolvedValue(freeSubscription());

    const mockCreate = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/test-session' });
    mockGetStripe.mockReturnValue({
      checkout: { sessions: { create: mockCreate } },
    } as unknown as ReturnType<typeof getStripe>);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as { url: string };
    expect(body.url).toBe('https://checkout.stripe.com/test-session');
  });

  it('passes existing stripe customer ID to checkout', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: 'user-123' });
    mockGetSubscription.mockResolvedValue({
      ...freeSubscription(),
      stripeCustomerId: 'cus_existing123',
    });

    const mockCreate = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/session' });
    mockGetStripe.mockReturnValue({
      checkout: { sessions: { create: mockCreate } },
    } as unknown as ReturnType<typeof getStripe>);

    await POST(makeRequest());

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_existing123' }),
    );
  });

  it('includes userId in session metadata', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: 'user-abc' });
    mockGetSubscription.mockResolvedValue(freeSubscription());

    const mockCreate = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/session' });
    mockGetStripe.mockReturnValue({
      checkout: { sessions: { create: mockCreate } },
    } as unknown as ReturnType<typeof getStripe>);

    await POST(makeRequest());

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { userId: 'user-abc' } }),
    );
  });

  it('returns 500 if Stripe throws', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: 'user-123' });
    mockGetSubscription.mockResolvedValue(freeSubscription());

    const mockCreate = vi.fn().mockRejectedValue(new Error('stripe down'));
    mockGetStripe.mockReturnValue({
      checkout: { sessions: { create: mockCreate } },
    } as unknown as ReturnType<typeof getStripe>);

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
  });
});
