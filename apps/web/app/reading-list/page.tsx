import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionCookie } from '../../lib/auth';
import { getUserReadingList } from '../../lib/reading-list-supa';
import ReadingListClient from './ReadingListClient';
import AppNav from '../components/AppNav';

export const dynamic = 'force-dynamic';

export default async function ReadingListPage() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const session = cookieStore.get('pb_session')?.value;
  const auth = session ? verifySessionCookie(session) : { valid: false };
  if (!auth.valid) redirect('/login');

  const userId = (auth as { valid: boolean; userId?: string }).userId!;

  // ── Fetch from Supabase (per-user) ────────────────────────────────────────
  let allItems, unread, reading, done;
  try {
    [allItems, unread, reading, done] = await Promise.all([
      getUserReadingList(userId),
      getUserReadingList(userId, 'unread'),
      getUserReadingList(userId, 'reading'),
      getUserReadingList(userId, 'done'),
    ]);
  } catch (err) {
    console.error('[reading-list][page]', err);
    allItems = unread = reading = done = [];
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <AppNav />

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-gray-100">Reading List</h1>
          <p className="text-gray-500 text-sm mt-1">{allItems.length} papers saved</p>
        </header>

        <ReadingListClient
          all={allItems}
          unread={unread}
          reading={reading}
          done={done}
        />
      </main>
    </div>
  );
}
