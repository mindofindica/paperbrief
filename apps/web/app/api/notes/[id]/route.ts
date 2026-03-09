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

// PATCH /api/notes/[id]  — update note content
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const { content } = await request.json();

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ error: 'Note content cannot be empty' }, { status: 400 });
    }
    if (content.length > 10000) {
      return NextResponse.json({ error: 'Note too long (max 10000 characters)' }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    // Verify ownership before updating
    const { data: existing } = await supabase
      .from('paper_notes')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }
    if (existing.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('paper_notes')
      .update({ content: content.trim(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, content, created_at, updated_at')
      .single();

    if (error) throw error;
    return NextResponse.json({ note: data });
  } catch (err) {
    console.error('[notes PATCH]', err);
    return NextResponse.json({ error: 'Failed to update note' }, { status: 500 });
  }
}

// DELETE /api/notes/[id]  — delete a note
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const supabase = getServiceSupabase();

    // Verify ownership before deleting
    const { data: existing } = await supabase
      .from('paper_notes')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }
    if (existing.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabase
      .from('paper_notes')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error('[notes DELETE]', err);
    return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 });
  }
}
