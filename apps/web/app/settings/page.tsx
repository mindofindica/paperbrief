import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { getServiceSupabase } from '../../lib/supabase';
import { verifySessionCookie } from '../../lib/auth';
import { getSubscription } from '../../lib/stripe';
import DigestSettings from './components/DigestSettings';
import BillingPortalButton from './components/BillingPortalButton';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Settings — PaperBrief',
};

type DigestFrequencyOverride = 'auto' | 'daily' | 'twice_weekly' | 'weekly';
type DigestFrequencyResolved = 'daily' | 'twice_weekly' | 'weekly';

function resolveFrequency(
  override: DigestFrequencyOverride,
  plan: 'free' | 'pro',
): DigestFrequencyResolved {
  if (override === 'auto') return plan === 'pro' ? 'daily' : 'weekly';
  if (plan === 'free' && (override === 'daily' || override === 'twice_weekly')) return 'weekly';
  return override;
}

export default async function SettingsPage() {
  const session = (await cookies()).get('pb_session')?.value;
  if (!session) redirect('/auth/login');

  const { valid, userId } = verifySessionCookie(session);
  if (!valid || !userId) redirect('/auth/login');

  const supabase = getServiceSupabase();
  const [sub, settingsResult] = await Promise.all([
    getSubscription(userId),
    supabase
      .from('user_settings')
      .select('digest_frequency_override, digest_hour, digest_paused')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const row = settingsResult.data;
  const override: DigestFrequencyOverride =
    (row?.digest_frequency_override as DigestFrequencyOverride) ?? 'auto';
  const digestHour: number = row?.digest_hour ?? 7;
  const digestPaused: boolean = row?.digest_paused ?? false;
  const resolved = resolveFrequency(override, sub.plan);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 px-6 py-12">
      <div className="max-w-2xl mx-auto space-y-10">

        {/* Header */}
        <div className="space-y-2">
          <Link
            href="/dashboard"
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            ← Back to dashboard
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-gray-400 text-sm">
            Manage your digest preferences and account.
          </p>
        </div>

        {/* Digest settings card */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-100">Digest delivery</h2>
            <span
              className={`rounded-full px-3 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                sub.plan === 'pro'
                  ? 'bg-violet-900/50 text-violet-300 ring-1 ring-violet-700/50'
                  : 'bg-gray-800 text-gray-400 ring-1 ring-gray-700/50'
              }`}
            >
              {sub.plan}
            </span>
          </div>
          <p className="text-sm text-gray-500">
            {sub.plan === 'pro'
              ? 'Choose how often you want to receive your digest and what time it arrives.'
              : 'Free plan includes weekly digests. Upgrade to Pro for daily or twice-weekly delivery.'}
          </p>

          <DigestSettings
            initialFrequencyOverride={override}
            initialFrequencyResolved={resolved}
            initialDigestHour={digestHour}
            initialPaused={digestPaused}
            plan={sub.plan}
          />
        </section>

        {/* Divider */}
        <hr className="border-gray-800" />

        {/* Account section */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-100">Account</h2>

          <div className="rounded-xl border border-gray-800 bg-gray-900/40 divide-y divide-gray-800">
            {/* Plan row */}
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm font-medium text-gray-200">Current plan</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {sub.plan === 'pro'
                    ? `Pro · ${sub.planExpiresAt ? `renews ${new Date(sub.planExpiresAt).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' })}` : 'active'}`
                    : 'Free — 1 track, weekly digest'}
                </p>
              </div>
              {sub.plan === 'free' ? (
                <Link
                  href="/pricing"
                  className="rounded-lg bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 transition-colors"
                >
                  Upgrade →
                </Link>
              ) : (
                <BillingPortalButton />
              )}
            </div>

            {/* Tracks row */}
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm font-medium text-gray-200">Research tracks</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Manage what topics PaperBrief watches for you
                </p>
              </div>
              <Link
                href="/dashboard"
                className="text-xs text-violet-400 hover:text-violet-300 underline underline-offset-2 transition-colors"
              >
                Manage tracks
              </Link>
            </div>

            {/* Unsubscribe row */}
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm font-medium text-gray-200">Unsubscribe</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Stop all digest emails (you can re-subscribe anytime)
                </p>
              </div>
              <Link
                href="/unsubscribe"
                className="text-xs text-gray-500 hover:text-red-400 underline underline-offset-2 transition-colors"
              >
                Unsubscribe
              </Link>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}


