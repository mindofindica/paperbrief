import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '../../../lib/auth';
import { getServiceSupabase } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

function getAuthUserId(request: NextRequest): string | null {
  const cookie = request.cookies.get('pb_session')?.value;
  if (!cookie) return null;
  const { valid, userId } = verifySessionCookie(cookie);
  return valid && userId ? userId : null;
}

// GET /api/notes?arxivId=xxx  — list notes for current user + paper
export async function GET(request: NextRequest) {
  const userId = getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const arxivId = request.nextUrl.searchParams.get('arxivId');
  if (!arxivId) {
    return NextResponse.json({ error: 'Missing arxivId' }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from('paper_notes')
      .select('id, content, created_at, updated_at')
      .eq('user_id', userId)
      .eq('arxiv_id', arxivId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ notes: data ?? [] });
  } catch (err) {
    console.error('[notes GET]', err);
    return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
  }
}

// POST /api/notes  — create a new note
export async function POST(request: NextRequest) {
  const userId = getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { arxivId, content } = await request.json();

    if (!arxivId || typeof arxivId !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid arxivId' }, { status: 400 });
    }
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ error: 'Note content cannot be empty' }, { status: 400 });
    }
    if (content.length > 10000) {
      return NextResponse.json({ error: 'Note too long (max 10000 characters)' }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from('paper_notes')
      .insert({ user_id: userId, arxiv_id: arxivId, content: content.trim() })
      .select('id, content, created_at, updated_at')
      .single();

    if (error) throw error;
    return NextResponse.json({ note: data }, { status: 201 });
  } catch (err) {
    console.error('[notes POST]', err);
    return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
  }
}
