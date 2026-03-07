/**
 * POST /api/stripe/portal
 *
 * Creates a Stripe Customer Portal session so Pro users can manage their
 * subscription (update card, cancel, view invoices).
 * Returns { url } — the client redirects there.
 *
 * Auth: requires valid pb_session cookie + must have a Stripe customer ID.
 */

import { NextRequest, NextResponse } from 'next/server';
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

  // ── Must be Pro (have a Stripe customer) ─────────────────────────────────
  const subscription = await getSubscription(userId);
  if (!subscription.stripeCustomerId) {
    return NextResponse.json({ error: 'No Stripe customer found' }, { status: 400 });
  }

  // ── Create portal session ─────────────────────────────────────────────────
  const baseUrl = process.env.PAPERBRIEF_BASE_URL || 'http://localhost:3000';

  try {
    const stripe = getStripe();
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${baseUrl}/dashboard`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (err) {
    console.error('[stripe/portal] error:', err);
    return NextResponse.json({ error: 'Failed to create portal session' }, { status: 500 });
  }
}
