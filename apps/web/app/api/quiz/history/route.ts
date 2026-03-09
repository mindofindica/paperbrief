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

export async function GET(request: NextRequest) {
  const userId = getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from('quiz_sessions')
      .select('id, arxiv_id, paper_title, score, status, created_at, completed_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    return NextResponse.json({ sessions: data ?? [] });
  } catch (err) {
    console.error('[quiz/history GET]', err);
    return NextResponse.json({ error: 'Failed to fetch quiz history' }, { status: 500 });
  }
}
