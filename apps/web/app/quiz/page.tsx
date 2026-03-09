import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionCookie } from '../../lib/auth';
import { getServiceSupabase } from '../../lib/supabase';
import AppNav from '../components/AppNav';
import QuizStartButton from './QuizStartButton';

export const dynamic = 'force-dynamic';

export default async function QuizPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get('pb_session')?.value;
  const auth = session ? verifySessionCookie(session) : { valid: false };
  if (!auth.valid) redirect('/login');

  const supabase = getServiceSupabase();
  const userId = (auth as { valid: boolean; userId?: string }).userId;

  // Get recent quiz history
  const { data: recentSessions } = await supabase
    .from('quiz_sessions')
    .select('id, paper_title, score, status, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);

  const lastSession = recentSessions?.[0] ?? null;
  const hasHistory = (recentSessions?.length ?? 0) > 0;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <AppNav />
      <main className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold mb-3">📝 Knowledge Quiz</h1>
          <p className="text-gray-400 text-lg">
            Test your retention of papers from your reading list
          </p>
        </div>

        {!hasHistory && (
          <div className="bg-gray-900 rounded-xl p-8 text-center mb-8">
            <p className="text-gray-300 mb-6">
              Answer 3 questions generated from a paper you&apos;ve recently read or saved.
              See how much you actually retained!
            </p>
            <QuizStartButton />
          </div>
        )}

        {hasHistory && lastSession && (
          <div className="bg-gray-900 rounded-xl p-8 mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-gray-400 mb-1">Last quiz</p>
                <p className="text-gray-200 font-medium line-clamp-1">{lastSession.paper_title}</p>
              </div>
              {lastSession.status === 'completed' && lastSession.score !== null && (
                <div className={`text-2xl font-bold px-4 py-2 rounded-lg ${
                  lastSession.score === 3 ? 'bg-green-900 text-green-300' :
                  lastSession.score === 2 ? 'bg-blue-900 text-blue-300' :
                  lastSession.score === 1 ? 'bg-yellow-900 text-yellow-300' :
                  'bg-red-900 text-red-300'
                }`}>
                  {lastSession.score}/3
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <QuizStartButton />
              <Link
                href="/quiz/history"
                className="flex-1 text-center py-3 px-6 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
              >
                View History
              </Link>
            </div>
          </div>
        )}

        <div className="text-center text-sm text-gray-500">
          <p>
            No papers? <Link href="/reading-list" className="text-indigo-400 hover:underline">Add some to your reading list</Link> first.
          </p>
        </div>
      </main>
    </div>
  );
}
