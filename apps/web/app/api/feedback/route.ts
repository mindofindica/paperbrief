import { NextRequest, NextResponse } from 'next/server';
import { writeFeedback } from '../../../lib/arxiv-db';
import { getServiceSupabase } from '../../../lib/supabase';

const VALID_ACTIONS = ['read', 'save', 'love', 'meh', 'skip'];

export async function POST(request: NextRequest) {
  try {
    const { arxivId, action } = await request.json();

    if (!arxivId || !action) {
      return NextResponse.json({ error: 'Missing arxivId or action' }, { status: 400 });
    }
    if (!VALID_ACTIONS.includes(action)) {
      return NextResponse.json({ error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` }, { status: 400 });
    }

    // Write to SQLite
    writeFeedback(arxivId, action);

    // Log to Supabase user_actions
    const supabase = getServiceSupabase();
    await supabase.from('user_actions').insert({
      arxiv_id: arxivId,
      action,
      source: 'web',
    });

    return NextResponse.json({ ok: true, arxivId, action });
  } catch (err) {
    console.error('[feedback]', err);
    return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 });
  }
}
