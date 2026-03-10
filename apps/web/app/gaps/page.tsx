import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionCookie } from '../../lib/auth';
import AppNav from '../components/AppNav';
import GapsClient from './GapsClient';

export const dynamic = 'force-dynamic';

export default async function GapsPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get('pb_session')?.value;
  const auth = session ? verifySessionCookie(session) : { valid: false };
  if (!auth.valid) redirect('/login');

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <AppNav />
      <main className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold mb-3">🔭 Reading Gaps</h1>
          <p className="text-gray-400 text-lg">
            Discover what you&apos;re missing in your research coverage
          </p>
        </div>

        <div className="mb-8 bg-gray-900 rounded-xl p-5 text-sm text-gray-400 space-y-2">
          <p>
            <span className="text-gray-200 font-medium">How it works:</span> We analyze your
            research tracks and recent digest papers, then use AI to identify important topic
            areas you&apos;re not covering — with paper suggestions to fill each gap.
          </p>
          <p className="text-gray-500">
            Results are generated fresh each time and are specific to your reading history.
          </p>
        </div>

        <GapsClient />
      </main>
    </div>
  );
}
