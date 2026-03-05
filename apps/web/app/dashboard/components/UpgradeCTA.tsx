'use client';

import { useState } from 'react';

interface UpgradeCTAProps {
  plan: 'free' | 'pro';
  trackCount: number;
  trackLimit: number;
}

/**
 * UpgradeCTA — shown on the dashboard when a user is on the free plan.
 * Triggers Stripe Checkout via /api/stripe/checkout.
 * Hidden for pro users unless they want to manage their subscription.
 */
export default function UpgradeCTA({ plan, trackCount, trackLimit }: UpgradeCTAProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpgrade() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? 'Failed to start checkout');
        return;
      }
      window.location.href = data.url;
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  async function handleManage() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? 'Failed to open billing portal');
        return;
      }
      window.location.href = data.url;
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  if (plan === 'pro') {
    return (
      <div className="rounded-xl border border-violet-700/40 bg-violet-950/30 px-5 py-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-violet-300">✦ Pro Plan</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {trackCount} / {trackLimit} tracks · daily digest
          </p>
        </div>
        <button
          onClick={handleManage}
          disabled={loading}
          className="text-xs text-violet-400 underline underline-offset-2 hover:text-violet-300 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Manage billing'}
        </button>
      </div>
    );
  }

  // Free plan CTA
  const atLimit = trackCount >= trackLimit;

  return (
    <div
      className={`rounded-xl border ${atLimit ? 'border-amber-600/60 bg-amber-950/30' : 'border-gray-700/60 bg-gray-900/40'} px-5 py-4`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-gray-200">
            {atLimit ? '⚠️ Track limit reached' : '⬆ Upgrade to Pro'}
          </p>
          <p className="text-xs text-gray-400">
            Free plan: {trackCount} / {trackLimit} track · weekly digest
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Pro unlocks 5 tracks, daily digests, and paper chat — $12 / mo.
          </p>
        </div>
        <button
          onClick={handleUpgrade}
          disabled={loading}
          className="shrink-0 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 active:bg-violet-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Redirecting…' : 'Upgrade →'}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
