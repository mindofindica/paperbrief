import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionCookie } from '../../../lib/auth';
import { getServiceSupabase } from '../../../lib/supabase';
import AppNav from '../../components/AppNav';

export const dynamic = 'force-dynamic';

interface QuizSession {
  id: string;
  arxiv_id: string;
  paper_title: string;
  score: number | null;
  status: string;
  created_at: string;
  completed_at: string | null;
}

function ScoreBadge({ score, status }: { score: number | null; status: string }) {
  if (status !== 'completed' || score === null) {
    return <span className="px-3 py-1 rounded-full bg-gray-700 text-gray-400 text-sm">In progress</span>;
  }
  const colors = ['bg-red-900 text-red-300', 'bg-yellow-900 text-yellow-300', 'bg-blue-900 text-blue-300', 'bg-green-900 text-green-300'];
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${colors[score]}`}>
      {score}/3
    </span>
  );
}

export default async function QuizHistoryPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get('pb_session')?.value;
  const auth = session ? verifySessionCookie(session) : { valid: false };
  if (!auth.valid) redirect('/login');

  const userId = (auth as { valid: boolean; userId?: string }).userId;
  const supabase = getServiceSupabase();

  const { data: sessions } = await supabase
    .from('quiz_sessions')
    .select('id, arxiv_id, paper_title, score, status, created_at, completed_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  const quizSessions: QuizSession[] = sessions ?? [];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <AppNav />
      <main className="max-w-2xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Quiz History</h1>
          <Link href="/quiz" className="text-indigo-400 hover:underline text-sm">
            ← Back to Quiz
          </Link>
        </div>

        {quizSessions.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400 text-lg mb-4">No quizzes taken yet</p>
            <Link
              href="/quiz"
              className="inline-block py-3 px-6 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors"
            >
              Take Your First Quiz
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {quizSessions.map((qs) => {
              const date = new Date(qs.created_at).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              });
              return (
                <Link
                  key={qs.id}
                  href={`/quiz/${qs.id}`}
                  className="flex items-center gap-4 bg-gray-900 hover:bg-gray-800 rounded-xl p-4 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-100 font-medium line-clamp-1">{qs.paper_title}</p>
                    <p className="text-gray-500 text-sm">{date}</p>
                  </div>
                  <ScoreBadge score={qs.score} status={qs.status} />
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
