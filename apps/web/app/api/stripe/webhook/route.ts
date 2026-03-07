/**
 * POST /api/stripe/webhook
 *
 * Handles Stripe events to keep user_subscriptions in sync.
 *
 * Events handled:
 *   checkout.session.completed       → upgrade user to Pro
 *   customer.subscription.deleted    → downgrade user to Free
 *   invoice.payment_failed           → log (no immediate downgrade — Stripe
 *                                       retries; we downgrade on deletion)
 *
 * Auth: Stripe-Signature header verified with STRIPE_WEBHOOK_SECRET.
 * This route must NOT be wrapped by Next.js body parsing — raw body required.
 */

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe, upsertSubscription, getUserIdByStripeCustomer } from '../../../../lib/stripe';

// Next.js 15: opt out of body parsing for raw access
export const config = { api: { bodyParser: false } };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[stripe/webhook] STRIPE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  // ── Get raw body ──────────────────────────────────────────────────────────
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  // ── Verify signature ──────────────────────────────────────────────────────
  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[stripe/webhook] signature verification failed:', message);
    return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
  }

  // ── Route event ───────────────────────────────────────────────────────────
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        // Unhandled event types are OK — just log and ack
        console.log(`[stripe/webhook] unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[stripe/webhook] handler error:', err);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}

// ─── Event handlers ───────────────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  // userId is set in checkout metadata
  const userId = session.metadata?.userId;
  if (!userId) {
    console.error('[stripe/webhook] checkout.session.completed: missing userId in metadata', session.id);
    return;
  }

  const stripeCustomerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;
  const stripeSubscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;

  await upsertSubscription(userId, {
    plan: 'pro',
    stripeCustomerId,
    stripeSubscriptionId,
    planExpiresAt: null, // active subscription, no expiry
  });

  console.log(`[stripe/webhook] upgraded userId=${userId} to pro (customer=${stripeCustomerId})`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const stripeCustomerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer?.id ?? null;

  if (!stripeCustomerId) {
    console.error('[stripe/webhook] subscription.deleted: missing customer ID');
    return;
  }

  const userId = await getUserIdByStripeCustomer(stripeCustomerId);
  if (!userId) {
    console.warn('[stripe/webhook] subscription.deleted: no user found for customer', stripeCustomerId);
    return;
  }

  // Subscription ends at period end — store that as expiry
  const planExpiresAt = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;

  await upsertSubscription(userId, {
    plan: 'free',
    stripeCustomerId,
    stripeSubscriptionId: null,
    planExpiresAt,
  });

  console.log(`[stripe/webhook] downgraded userId=${userId} to free (customer=${stripeCustomerId})`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const stripeCustomerId = typeof invoice.customer === 'string'
    ? invoice.customer
    : invoice.customer?.id ?? null;

  // Log only — Stripe retries payment; downgrade happens on subscription.deleted
  console.warn(
    `[stripe/webhook] invoice.payment_failed for customer=${stripeCustomerId}, invoice=${invoice.id}`,
  );
}
