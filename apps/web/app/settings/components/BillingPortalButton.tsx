'use client';

import { useState } from 'react';

/**
 * BillingPortalButton — opens the Stripe billing portal for Pro users.
 * Separate client component so the settings page can stay server-rendered.
 */
export default function BillingPortalButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
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

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={loading}
        className="text-xs text-violet-400 underline underline-offset-2 hover:text-violet-300 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Loading…' : 'Manage billing'}
      </button>
      {error && <p className="text-[10px] text-red-400">{error}</p>}
    </div>
  );
}
