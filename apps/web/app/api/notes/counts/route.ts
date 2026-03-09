import { NextRequest, NextResponse } from 'next/server';
import { verifySessionCookie } from '../../../../lib/auth';
import { getServiceSupabase } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

// GET /api/notes/counts?arxivIds=id1,id2,id3
// Returns note counts per arxiv_id for the current user
export async function GET(request: NextRequest) {
  const cookie = request.cookies.get('pb_session')?.value;
  if (!cookie) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { valid, userId } = verifySessionCookie(cookie);
  if (!valid || !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const raw = request.nextUrl.searchParams.get('arxivIds') ?? '';
  const arxivIds = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 100); // cap at 100

  if (arxivIds.length === 0) {
    return NextResponse.json({ counts: {} });
  }

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from('paper_notes')
      .select('arxiv_id')
      .eq('user_id', userId)
      .in('arxiv_id', arxivIds);

    if (error) throw error;

    // Aggregate counts
    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      counts[row.arxiv_id] = (counts[row.arxiv_id] ?? 0) + 1;
    }

    return NextResponse.json({ counts });
  } catch (err) {
    console.error('[notes/counts]', err);
    return NextResponse.json({ error: 'Failed to fetch note counts' }, { status: 500 });
  }
}
