/**
 * Tests for POST /api/stripe/webhook
 *
 * Mocks: getStripe, upsertSubscription, getUserIdByStripeCustomer
 */

import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest';
import { NextRequest } from 'next/server';
import type Stripe from 'stripe';

// ── Mock deps ──────────────────────────────────────────────────────────────────

vi.mock('../stripe', () => ({
  getStripe: vi.fn(),
  upsertSubscription: vi.fn(),
  getUserIdByStripeCustomer: vi.fn(),
}));

import { getStripe, upsertSubscription, getUserIdByStripeCustomer } from '../stripe';
import { POST } from '../../app/api/stripe/webhook/route';

const mockGetStripe = getStripe as MockedFunction<typeof getStripe>;
const mockUpsert = upsertSubscription as MockedFunction<typeof upsertSubscription>;
const mockGetUserId = getUserIdByStripeCustomer as MockedFunction<typeof getUserIdByStripeCustomer>;

// ── Helpers ────────────────────────────────────────────────────────────────────

const WEBHOOK_SECRET = 'whsec_test_secret';

function makeStripeEvent(type: string, object: Record<string, unknown>): Stripe.Event {
  return {
    id: `evt_test_${Date.now()}`,
    type,
    data: { object },
    object: 'event',
    api_version: '2025-01-27.acacia',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: null,
  } as unknown as Stripe.Event;
}

function makeRequest(body: string, withSignature = true): NextRequest {
  const req = new NextRequest('http://localhost/api/stripe/webhook', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      ...(withSignature ? { 'stripe-signature': 'test-signature' } : {}),
    },
  });
  return req;
}

function mockStripeWithEvent(event: Stripe.Event) {
  mockGetStripe.mockReturnValue({
    webhooks: {
      constructEvent: vi.fn().mockReturnValue(event),
    },
  } as unknown as ReturnType<typeof getStripe>);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('POST /api/stripe/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    mockUpsert.mockResolvedValue(undefined);
  });

  it('returns 503 if STRIPE_WEBHOOK_SECRET is not set', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(503);
  });

  it('returns 400 if stripe-signature header is missing', async () => {
    mockGetStripe.mockReturnValue({
      webhooks: { constructEvent: vi.fn() },
    } as unknown as ReturnType<typeof getStripe>);

    const res = await POST(makeRequest('{}', false));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('Missing stripe-signature');
  });

  it('returns 400 if signature verification fails', async () => {
    mockGetStripe.mockReturnValue({
      webhooks: {
        constructEvent: vi.fn().mockImplementation(() => {
          throw new Error('Invalid signature');
        }),
      },
    } as unknown as ReturnType<typeof getStripe>);

    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('signature verification failed');
  });

  describe('checkout.session.completed', () => {
    it('upserts user subscription to pro', async () => {
      const event = makeStripeEvent('checkout.session.completed', {
        customer: 'cus_test123',
        subscription: 'sub_test123',
        metadata: { userId: 'user-abc' },
      });
      mockStripeWithEvent(event);

      const res = await POST(makeRequest('{}'));
      expect(res.status).toBe(200);
      expect(mockUpsert).toHaveBeenCalledWith('user-abc', {
        plan: 'pro',
        stripeCustomerId: 'cus_test123',
        stripeSubscriptionId: 'sub_test123',
        planExpiresAt: null,
      });
    });

    it('logs error and acks if userId missing from metadata', async () => {
      const event = makeStripeEvent('checkout.session.completed', {
        customer: 'cus_test123',
        subscription: 'sub_test123',
        metadata: {}, // no userId
      });
      mockStripeWithEvent(event);

      const res = await POST(makeRequest('{}'));
      expect(res.status).toBe(200); // still acks
      expect(mockUpsert).not.toHaveBeenCalled();
    });
  });

  describe('customer.subscription.deleted', () => {
    it('downgrades user to free', async () => {
      mockGetUserId.mockResolvedValue('user-xyz');

      const periodEnd = Math.floor(Date.now() / 1000) + 86400;
      const event = makeStripeEvent('customer.subscription.deleted', {
        customer: 'cus_del123',
        current_period_end: periodEnd,
      });
      mockStripeWithEvent(event);

      const res = await POST(makeRequest('{}'));
      expect(res.status).toBe(200);
      expect(mockGetUserId).toHaveBeenCalledWith('cus_del123');
      expect(mockUpsert).toHaveBeenCalledWith('user-xyz', {
        plan: 'free',
        stripeCustomerId: 'cus_del123',
        stripeSubscriptionId: null,
        planExpiresAt: new Date(periodEnd * 1000).toISOString(),
      });
    });

    it('skips upsert if no user found for customer', async () => {
      mockGetUserId.mockResolvedValue(null);

      const event = makeStripeEvent('customer.subscription.deleted', {
        customer: 'cus_unknown',
        current_period_end: 0,
      });
      mockStripeWithEvent(event);

      const res = await POST(makeRequest('{}'));
      expect(res.status).toBe(200);
      expect(mockUpsert).not.toHaveBeenCalled();
    });
  });

  describe('invoice.payment_failed', () => {
    it('acks without calling upsert (log-only)', async () => {
      const event = makeStripeEvent('invoice.payment_failed', {
        customer: 'cus_fail123',
        id: 'inv_123',
      });
      mockStripeWithEvent(event);

      const res = await POST(makeRequest('{}'));
      expect(res.status).toBe(200);
      expect(mockUpsert).not.toHaveBeenCalled();
    });
  });

  it('acks unknown event types gracefully', async () => {
    const event = makeStripeEvent('payment_intent.created', {});
    mockStripeWithEvent(event);

    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    const body = await res.json() as { received: boolean };
    expect(body.received).toBe(true);
  });
});
