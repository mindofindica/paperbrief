/**
 * Tests for PLAN_LIMITS constants in lib/stripe.ts
 * This file does NOT mock stripe — it tests the real exports.
 * We use vi.stubEnv to avoid needing a real STRIPE_SECRET_KEY.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

// Provide a dummy key so the Stripe constructor doesn't fail on import
vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_dummy');

// Import after stubbing env
import { PLAN_LIMITS } from '../stripe';

describe('PLAN_LIMITS constants', () => {
  it('free plan allows 1 track', () => {
    expect(PLAN_LIMITS.free.tracks).toBe(1);
  });

  it('pro plan allows 5 tracks', () => {
    expect(PLAN_LIMITS.pro.tracks).toBe(5);
  });

  it('free has weekly digest frequency', () => {
    expect(PLAN_LIMITS.free.digestFrequency).toBe('weekly');
  });

  it('pro has daily digest frequency', () => {
    expect(PLAN_LIMITS.pro.digestFrequency).toBe('daily');
  });

  it('all plan keys are present', () => {
    expect(Object.keys(PLAN_LIMITS)).toEqual(['free', 'pro']);
  });
});
