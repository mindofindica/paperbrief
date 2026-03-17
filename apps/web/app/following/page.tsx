import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionCookie } from '../../lib/auth';
import { getFollowedAuthors, getPapersByFollowedAuthors } from '../../lib/author-follows';
import AppNav from '../components/AppNav';
import FollowingClient from './FollowingClient';

export const dynamic = 'force-dynamic';

export default async function FollowingPage() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const session = cookieStore.get('pb_session')?.value;
  const auth = session ? verifySessionCookie(session) : { valid: false };
  if (!auth.valid) redirect('/login');

  const userId = (auth as { valid: boolean; userId?: string }).userId!;

  // ── Fetch data ────────────────────────────────────────────────────────────
  let follows: Awaited<ReturnType<typeof getFollowedAuthors>> = [];
  let papers: Awaited<ReturnType<typeof getPapersByFollowedAuthors>> = [];

  try {
    [follows, papers] = await Promise.all([
      getFollowedAuthors(userId),
      getPapersByFollowedAuthors(userId, 30),
    ]);
  } catch (err) {
    console.error('[following][page]', err);
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <AppNav />
      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-gray-100">Following</h1>
          <p className="text-gray-500 text-sm mt-1">
            Track papers from researchers you follow
          </p>
        </header>
        <FollowingClient follows={follows} papers={papers} />
      </main>
    </div>
  );
}
