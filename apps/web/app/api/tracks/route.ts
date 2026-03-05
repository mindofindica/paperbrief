import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '../../../lib/supabase';
import { verifySessionCookie } from '../../../lib/auth';
import { getSubscription } from '../../../lib/stripe';

type TrackInsert = {
  name: string;
  keywords: string[];
  arxiv_cats: string[];
  min_score: number;
};

function getUserIdFromRequest(request: NextRequest): string | null {
  const session = request.cookies.get('pb_session')?.value;
  if (!session) return null;
  const result = verifySessionCookie(session);
  return result.valid ? result.userId ?? null : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from('tracks')
    .select('id, name, keywords, arxiv_cats, min_score, active, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[tracks][GET]', error);
    return NextResponse.json({ error: 'Failed to load tracks' }, { status: 500 });
  }

  return NextResponse.json({ tracks: data ?? [] });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: TrackInsert;
  try {
    payload = (await request.json()) as TrackInsert;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, keywords, arxiv_cats, min_score } = payload;
  if (!name || !Array.isArray(keywords) || !Array.isArray(arxiv_cats) || typeof min_score !== 'number') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  // ── Plan limit check ───────────────────────────────────────────────────────
  // Count active tracks; compare against user's plan limit
  const subscription = await getSubscription(userId);
  const { count: trackCount } = await supabase
    .from('tracks')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('active', true);

  if ((trackCount ?? 0) >= subscription.trackLimit) {
    const isPro = subscription.plan === 'pro';
    return NextResponse.json(
      {
        error: isPro
          ? `Pro plan limit reached (${subscription.trackLimit} tracks)`
          : `Free plan allows ${subscription.trackLimit} track. Upgrade to Pro for up to 5 tracks.`,
        plan: subscription.plan,
        trackLimit: subscription.trackLimit,
        upgrade: !isPro,
      },
      { status: 403 },
    );
  }

  const { data, error } = await supabase
    .from('tracks')
    .insert({
      user_id: userId,
      name,
      keywords,
      arxiv_cats,
      min_score,
      active: true,
    })
    .select('id, name, keywords, arxiv_cats, min_score, active, created_at')
    .single();

  if (error) {
    console.error('[tracks][POST]', error);
    return NextResponse.json({ error: 'Failed to create track' }, { status: 500 });
  }

  return NextResponse.json({ track: data });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from('tracks')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('id');

  if (error) {
    console.error('[tracks][DELETE]', error);
    return NextResponse.json({ error: 'Failed to delete track' }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Track not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, id });
}
