import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionCookie } from '../../../lib/auth';
import { getServiceSupabase } from '../../../lib/supabase';
import AppNav from '../../components/AppNav';
import QuizClient from './QuizClient';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function QuizSessionPage({ params }: PageProps) {
  const cookieStore = await cookies();
  const session = cookieStore.get('pb_session')?.value;
  const auth = session ? verifySessionCookie(session) : { valid: false };
  if (!auth.valid) redirect('/login');

  const { id } = await params;
  const userId = (auth as { valid: boolean; userId?: string }).userId;
  const supabase = getServiceSupabase();

  const { data: quizSession, error } = await supabase
    .from('quiz_sessions')
    .select('id, arxiv_id, paper_title, questions, score, status, created_at, completed_at')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error || !quizSession) {
    redirect('/quiz');
  }

  const { data: answers } = await supabase
    .from('quiz_answers')
    .select('question_index, selected_option, is_correct, answered_at')
    .eq('session_id', id)
    .order('question_index', { ascending: true });

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <AppNav />
      <main className="max-w-2xl mx-auto px-4 py-10">
        <QuizClient
          sessionId={id}
          paperTitle={quizSession.paper_title}
          questions={quizSession.questions}
          initialAnswers={answers || []}
          initialStatus={quizSession.status}
          initialScore={quizSession.score}
        />
      </main>
    </div>
  );
}
