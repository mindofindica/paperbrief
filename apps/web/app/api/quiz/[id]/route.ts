import { NextRequest, NextResponse } from 'next/server';
import { verifySessionCookie } from '../../../../lib/auth';
import { getServiceSupabase } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

function getAuthUserId(request: NextRequest): string | null {
  const cookie = request.cookies.get('pb_session')?.value;
  if (!cookie) return null;
  const { valid, userId } = verifySessionCookie(cookie);
  return valid && userId ? userId : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = getServiceSupabase();

  try {
    const { data: session, error } = await supabase
      .from('quiz_sessions')
      .select('id, arxiv_id, paper_title, questions, score, status, created_at, completed_at')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !session) {
      return NextResponse.json({ error: 'Quiz session not found' }, { status: 404 });
    }

    const { data: answers } = await supabase
      .from('quiz_answers')
      .select('question_index, selected_option, is_correct, answered_at')
      .eq('session_id', id)
      .order('question_index', { ascending: true });

    const answeredIndices = new Set((answers || []).map((a: { question_index: number }) => a.question_index));

    // Only reveal correct_index for answered questions
    const questions = session.questions.map((q: {
      question: string;
      options: string[];
      correct_index: number;
      explanation: string;
    }, i: number) => {
      if (answeredIndices.has(i)) {
        return q; // full data including correct_index and explanation
      }
      return {
        question: q.question,
        options: q.options,
      };
    });

    return NextResponse.json({ session: { ...session, questions: undefined }, questions, answers: answers || [] });
  } catch (err) {
    console.error('[quiz/[id] GET]', err);
    return NextResponse.json({ error: 'Failed to fetch quiz' }, { status: 500 });
  }
}
