/**
 * POST /api/stripe/checkout
 *
 * Creates a Stripe Checkout session for upgrading to Pro.
 * Returns { url } — the client redirects there.
 *
 * Auth: requires valid pb_session cookie.
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { verifySessionCookie } from '../../../../lib/auth';
import { getStripe, getSubscription } from '../../../../lib/stripe';

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = request.cookies.get('pb_session')?.value;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { valid, userId } = verifySessionCookie(session);
  if (!valid || !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Guard: already pro ───────────────────────────────────────────────────
  const subscription = await getSubscription(userId);
  if (subscription.plan === 'pro') {
    return NextResponse.json({ error: 'Already on Pro plan' }, { status: 409 });
  }

  // ── Env ───────────────────────────────────────────────────────────────────
  const priceId = process.env.STRIPE_PRICE_ID_PRO;
  const baseUrl = process.env.PAPERBRIEF_BASE_URL || 'http://localhost:3000';

  if (!priceId) {
    console.error('[stripe/checkout] STRIPE_PRICE_ID_PRO is not set');
    return NextResponse.json({ error: 'Billing not configured' }, { status: 503 });
  }

  // ── Create Checkout Session ───────────────────────────────────────────────
  try {
    const stripe = getStripe();

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/dashboard?upgrade=success`,
      cancel_url: `${baseUrl}/dashboard?upgrade=cancelled`,
      metadata: { userId },
      subscription_data: {
        metadata: { userId },
      },
    };

    // Pre-fill existing Stripe customer ID if we have one
    if (subscription.stripeCustomerId) {
      sessionParams.customer = subscription.stripeCustomerId;
    }

    const checkoutSession = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    console.error('[stripe/checkout] error:', err);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
