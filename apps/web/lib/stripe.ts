/**
 * Stripe client + plan gating utilities for PaperBrief
 *
 * Plans:
 *   free - 1 track, weekly digest
 *   pro  - 5 tracks, daily digest + paper chat ($12/mo)
 */

import Stripe from 'stripe';
import { getServiceSupabase } from './supabase';

// ─── Constants ────────────────────────────────────────────────────────────────

export const PLAN_LIMITS = {
  free: { tracks: 1, digestFrequency: 'weekly' },
  pro:  { tracks: 5, digestFrequency: 'daily'  },
} as const;

export type Plan = keyof typeof PLAN_LIMITS;

// ─── Stripe client (lazy-init for edge/test safety) ──────────────────────────

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
    _stripe = new Stripe(key, { apiVersion: '2025-01-27.acacia' });
  }
  return _stripe;
}

// ─── Subscription helpers ─────────────────────────────────────────────────────

export interface UserSubscription {
  plan: Plan;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  planExpiresAt: string | null;
  trackLimit: number;
  digestFrequency: string;
}

/**
 * Get a user's subscription record from Supabase.
 * Returns a free-plan stub if no row exists (new users default to free).
 */
export async function getSubscription(userId: string): Promise<UserSubscription> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from('user_subscriptions')
    .select('plan, stripe_customer_id, stripe_subscription_id, plan_expires_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[stripe][getSubscription]', error);
  }

  const plan: Plan = (data?.plan as Plan) ?? 'free';
  const limits = PLAN_LIMITS[plan];

  return {
    plan,
    stripeCustomerId: data?.stripe_customer_id ?? null,
    stripeSubscriptionId: data?.stripe_subscription_id ?? null,
    planExpiresAt: data?.plan_expires_at ?? null,
    trackLimit: limits.tracks,
    digestFrequency: limits.digestFrequency,
  };
}

/**
 * Upsert a user's subscription record (called by webhook handler).
 */
export async function upsertSubscription(
  userId: string,
  update: {
    plan?: Plan;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    planExpiresAt?: string | null;
  },
): Promise<void> {
  const supabase = getServiceSupabase();

  const { error } = await supabase
    .from('user_subscriptions')
    .upsert(
      {
        user_id: userId,
        plan: update.plan ?? 'free',
        stripe_customer_id: update.stripeCustomerId ?? null,
        stripe_subscription_id: update.stripeSubscriptionId ?? null,
        plan_expires_at: update.planExpiresAt ?? null,
      },
      { onConflict: 'user_id' },
    );

  if (error) {
    console.error('[stripe][upsertSubscription]', error);
    throw new Error(`Failed to upsert subscription: ${error.message}`);
  }
}

/**
 * Look up userId by Stripe customer ID (used in webhook handler).
 */
export async function getUserIdByStripeCustomer(
  stripeCustomerId: string,
): Promise<string | null> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from('user_subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', stripeCustomerId)
    .maybeSingle();

  if (error) {
    console.error('[stripe][getUserIdByStripeCustomer]', error);
    return null;
  }

  return data?.user_id ?? null;
}
