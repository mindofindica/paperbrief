'use client';

import { useState, useTransition } from 'react';

type DigestFrequencyOverride = 'auto' | 'daily' | 'twice_weekly' | 'weekly';
type DigestFrequencyResolved = 'daily' | 'twice_weekly' | 'weekly';
type Plan = 'free' | 'pro';

interface DigestSettingsProps {
  initialFrequencyOverride: DigestFrequencyOverride;
  initialFrequencyResolved: DigestFrequencyResolved;
  initialDigestHour: number;
  initialPaused: boolean;
  plan: Plan;
}

const FREQUENCY_OPTIONS: { value: DigestFrequencyOverride; label: string; desc: string; proOnly: boolean }[] = [
  {
    value: 'auto',
    label: 'Plan default',
    desc: 'Use your plan default — weekly (Free) or daily (Pro)',
    proOnly: false,
  },
  {
    value: 'daily',
    label: 'Daily',
    desc: 'New digest every morning with the previous day\'s papers',
    proOnly: true,
  },
  {
    value: 'twice_weekly',
    label: 'Twice weekly',
    desc: 'Monday and Thursday — a balanced cadence',
    proOnly: true,
  },
  {
    value: 'weekly',
    label: 'Weekly',
    desc: 'Every Monday — catch-up on the full week\'s papers',
    proOnly: false,
  },
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: `${i.toString().padStart(2, '0')}:00 UTC`,
}));

function FrequencyBadge({ plan, resolved }: { plan: Plan; resolved: DigestFrequencyResolved }) {
  const labelMap = { daily: 'daily', twice_weekly: 'twice weekly', weekly: 'weekly' };
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-800 px-3 py-0.5 text-xs font-medium text-gray-300 ring-1 ring-gray-700/60">
      <span
        className={`h-1.5 w-1.5 rounded-full ${plan === 'pro' ? 'bg-violet-400' : 'bg-gray-400'}`}
      />
      {labelMap[resolved]}
    </span>
  );
}

export default function DigestSettings({
  initialFrequencyOverride,
  initialFrequencyResolved,
  initialDigestHour,
  initialPaused,
  plan,
}: DigestSettingsProps) {
  const [frequency, setFrequency] = useState<DigestFrequencyOverride>(initialFrequencyOverride);
  const [digestHour, setDigestHour] = useState(initialDigestHour);
  const [paused, setPaused] = useState(initialPaused);
  const [resolved, setResolved] = useState<DigestFrequencyResolved>(initialFrequencyResolved);

  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradePrompt, setUpgradePrompt] = useState(false);

  const isDirty =
    frequency !== initialFrequencyOverride ||
    digestHour !== initialDigestHour ||
    paused !== initialPaused;

  // Local resolution preview (mirrors server logic)
  function resolveLocal(override: DigestFrequencyOverride): DigestFrequencyResolved {
    if (override === 'auto') return plan === 'pro' ? 'daily' : 'weekly';
    if (plan === 'free' && (override === 'daily' || override === 'twice_weekly')) return 'weekly';
    return override;
  }

  function handleFrequencyChange(val: DigestFrequencyOverride) {
    if (plan === 'free' && (val === 'daily' || val === 'twice_weekly')) {
      setUpgradePrompt(true);
      return;
    }
    setUpgradePrompt(false);
    setFrequency(val);
    setResolved(resolveLocal(val));
  }

  async function handleSave() {
    setError(null);
    setSaved(false);

    startTransition(async () => {
      try {
        const res = await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            digestFrequencyOverride: frequency,
            digestHour,
            digestPaused: paused,
          }),
        });

        const data = (await res.json()) as {
          settings?: { digestFrequencyResolved: DigestFrequencyResolved };
          error?: string;
          upgrade?: boolean;
        };

        if (!res.ok) {
          if (data.upgrade) setUpgradePrompt(true);
          setError(data.error ?? 'Failed to save settings');
          return;
        }

        if (data.settings?.digestFrequencyResolved) {
          setResolved(data.settings.digestFrequencyResolved);
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch {
        setError('Network error — please try again');
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Pause toggle */}
      <div className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900/50 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-gray-200">Pause digests</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Stop receiving email digests temporarily. Resume anytime.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={paused}
          onClick={() => setPaused((p) => !p)}
          className={`relative inline-flex h-6 w-11 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-gray-950 ${
            paused ? 'bg-amber-500' : 'bg-gray-700'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              paused ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Current frequency badge */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-400">Current schedule:</span>
        <FrequencyBadge plan={plan} resolved={resolved} />
        {paused && (
          <span className="rounded-full bg-amber-900/40 px-2.5 py-0.5 text-xs text-amber-400 ring-1 ring-amber-700/50">
            paused
          </span>
        )}
      </div>

      {/* Frequency selector */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-300">Delivery frequency</p>
        <div className="space-y-2">
          {FREQUENCY_OPTIONS.map((opt) => {
            const locked = plan === 'free' && opt.proOnly;
            const isSelected = frequency === opt.value;

            return (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors ${
                  locked
                    ? 'cursor-not-allowed border-gray-800 bg-gray-900/30 opacity-50'
                    : isSelected
                    ? 'border-violet-600/60 bg-violet-950/30'
                    : 'border-gray-800 bg-gray-900/40 hover:border-gray-700'
                }`}
                onClick={() => !locked && handleFrequencyChange(opt.value)}
              >
                <input
                  type="radio"
                  name="digest_frequency"
                  value={opt.value}
                  checked={isSelected}
                  disabled={locked}
                  onChange={() => !locked && handleFrequencyChange(opt.value)}
                  className="mt-0.5 accent-violet-500"
                />
                <div className="flex-1 min-w-0">
                  <span className="flex items-center gap-2 text-sm font-medium text-gray-200">
                    {opt.label}
                    {opt.proOnly && (
                      <span className="rounded-full bg-violet-900/50 px-2 py-0 text-[10px] font-semibold uppercase tracking-wide text-violet-400 ring-1 ring-violet-700/50">
                        Pro
                      </span>
                    )}
                  </span>
                  <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Upgrade prompt */}
      {upgradePrompt && (
        <div className="rounded-xl border border-violet-700/50 bg-violet-950/30 px-4 py-3 text-sm">
          <p className="font-semibold text-violet-300">Daily and twice-weekly digests are a Pro feature.</p>
          <p className="text-xs text-gray-400 mt-1">
            Upgrade to Pro for $12/mo — 5 tracks, daily digests, paper chat.
          </p>
          <a
            href="/pricing"
            className="mt-2 inline-block rounded-lg bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 transition-colors"
          >
            View plans →
          </a>
        </div>
      )}

      {/* Delivery hour */}
      <div className="space-y-2">
        <label htmlFor="digest-hour" className="text-sm font-medium text-gray-300">
          Delivery time
        </label>
        <p className="text-xs text-gray-500">
          What time should your digest land in your inbox? (UTC)
        </p>
        <select
          id="digest-hour"
          value={digestHour}
          onChange={(e) => setDigestHour(Number(e.target.value))}
          className="w-full max-w-[200px] rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
        >
          {HOURS.map((h) => (
            <option key={h.value} value={h.value}>
              {h.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-600">
          💡 CET is UTC+1 in winter, UTC+2 in summer. 07:00 UTC = 08:00 / 09:00 CET.
        </p>
      </div>

      {/* Save button + feedback */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={!isDirty || isPending}
          className="rounded-lg bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-500 active:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
        >
          {isPending ? 'Saving…' : 'Save changes'}
        </button>

        {saved && (
          <span className="text-sm text-green-400">✓ Saved</span>
        )}
        {error && (
          <span className="text-sm text-red-400">{error}</span>
        )}
      </div>
    </div>
  );
}
