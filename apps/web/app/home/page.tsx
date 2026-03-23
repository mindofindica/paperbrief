export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { verifySessionCookie } from '../../lib/auth';
import { getGreeting } from '../../lib/greeting';
import { getNextDigestTime } from '../../lib/digest-utils';
import AppNav from '../components/AppNav';
import BottomNav from '../components/BottomNav';

const QUICK_ACTIONS = [
  { href: '/search', icon: '🔍', label: 'Search', sub: 'Find papers' },
  { href: '/reading-list', icon: '📌', label: 'Reading List', sub: 'Saved papers' },
  { href: '/following', icon: '👥', label: 'Following', sub: 'Authors you follow' },
  { href: '/collections', icon: '🗂️', label: 'Collections', sub: 'Your collections' },
  { href: '/stats', icon: '📊', label: 'Stats', sub: 'Reading activity' },
  { href: '/settings', icon: '⚙️', label: 'Settings', sub: 'Delivery & plan' },
];

export default async function HomePage() {
  const cookieStore = await cookies();
  const session = cookieStore.get('pb_session');

  if (!session?.value) {
    redirect('/auth/login');
  }

  const { valid } = verifySessionCookie(session.value);
  if (!valid) {
    redirect('/auth/login');
  }

  const greeting = getGreeting();
  const nextDigest = getNextDigestTime();
  const nextDigestStr = nextDigest.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  });

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <AppNav />
      <main className="max-w-2xl mx-auto px-4 py-8 pb-20 sm:pb-8">
        <h1 className="text-2xl font-bold text-gray-100 mb-6">{greeting} 👋</h1>

        {/* Digest card */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-100">Your Digest</h2>
              <p className="text-sm text-gray-400 mt-1">Next digest: {nextDigestStr} UTC</p>
            </div>
            <Link
              href="/digest"
              className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              View →
            </Link>
          </div>
        </div>

        {/* Quick actions */}
        <h2 className="text-lg font-semibold text-gray-100 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-2 hover:border-gray-700 transition-colors"
            >
              <span className="text-2xl">{action.icon}</span>
              <div>
                <div className="text-sm font-medium text-gray-100">{action.label}</div>
                <div className="text-xs text-gray-400">{action.sub}</div>
              </div>
            </Link>
          ))}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
