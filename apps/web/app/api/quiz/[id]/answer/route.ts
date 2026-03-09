import { NextRequest, NextResponse } from 'next/server';
import { verifySessionCookie } from '../../../../../lib/auth';
import { getServiceSupabase } from '../../../../../lib/supabase';

export const dynamic = 'force-dynamic';

function getAuthUserId(request: NextRequest): string | null {
  const cookie = request.cookies.get('pb_session')?.value;
  if (!cookie) return null;
  const { valid, userId } = verifySessionCookie(cookie);
  return valid && userId ? userId : null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { question_index, selected_option } = body;

    if (typeof question_index !== 'number' || question_index < 0 || question_index > 2) {
      return NextResponse.json({ error: 'question_index must be 0, 1, or 2' }, { status: 400 });
    }
    if (typeof selected_option !== 'number' || selected_option < 0 || selected_option > 3) {
      return NextResponse.json({ error: 'selected_option must be 0-3' }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    // Get the session
    const { data: session, error: sessionError } = await supabase
      .from('quiz_sessions')
      .select('id, user_id, questions, status')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Quiz session not found' }, { status: 404 });
    }

    if (session.status === 'completed') {
      return NextResponse.json({ error: 'Quiz already completed' }, { status: 400 });
    }

    const question = session.questions[question_index];
    if (!question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 400 });
    }

    const is_correct = selected_option === question.correct_index;

    // Insert answer (ignore conflict - question already answered)
    const { error: answerError } = await supabase
      .from('quiz_answers')
      .insert({
        session_id: id,
        question_index,
        selected_option,
        is_correct,
      });

    if (answerError) {
      if (answerError.code === '23505') {
        return NextResponse.json({ error: 'Question already answered' }, { status: 400 });
      }
      throw answerError;
    }

    // Check if all questions answered
    const { data: allAnswers } = await supabase
      .from('quiz_answers')
      .select('is_correct')
      .eq('session_id', id);

    const completed = (allAnswers?.length ?? 0) >= 3;
    let score: number | null = null;

    if (completed) {
      score = (allAnswers || []).filter((a: { is_correct: boolean }) => a.is_correct).length;
      await supabase
        .from('quiz_sessions')
        .update({ score, status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', id);
    }

    return NextResponse.json({
      is_correct,
      correct_index: question.correct_index,
      explanation: question.explanation,
      ...(completed ? { score, completed: true } : { completed: false }),
    });
  } catch (err) {
    console.error('[quiz/[id]/answer POST]', err);
    return NextResponse.json({ error: 'Failed to submit answer' }, { status: 500 });
  }
}
