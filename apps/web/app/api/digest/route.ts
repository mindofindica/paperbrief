/**
 * POST /api/digest
 *
 * Trigger digest generation for a user (or all users if called from cron).
 * Called by: Vercel Cron (weekly Sunday 20:00 UTC) or manually.
 *
 * For a production cron, protect with CRON_SECRET.
 * For per-user on-demand, require auth session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  fetchRecentPapers,
  prefilterPapers,
  scorePapers,
  buildDigest,
  renderDigestText,
} from '@paperbrief/core';
import { Resend } from 'resend';

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { userId } = (await req.json()) as { userId?: string };

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;

  if (!supabaseUrl || !supabaseKey || !resendKey) {
    return NextResponse.json({ error: 'Missing server configuration' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const resend = new Resend(resendKey);

  try {
    // Fetch all active tracks (for a user, or all users)
    const trackQuery = supabase
      .from('tracks')
      .select('id, user_id, name, keywords, arxiv_cats, min_score')
      .eq('active', true);

    if (userId) trackQuery.eq('user_id', userId);

    const { data: tracks, error: tracksError } = await trackQuery;
    if (tracksError) throw tracksError;
    if (!tracks?.length) {
      return NextResponse.json({ message: 'No active tracks', processed: 0 });
    }

    // Collect all unique arxiv categories across tracks
    const allCats = [...new Set(tracks.flatMap((t: { arxiv_cats: string[] }) => t.arxiv_cats))];

    // Fetch recent papers once (shared across all tracks)
    const papers = await fetchRecentPapers(allCats, 100);

    // Process each track
    const llmConfig = {
      apiKey: process.env.OPENROUTER_API_KEY!,
    };

    let totalDeliveries = 0;
    const userDigests = new Map<string, ReturnType<typeof buildDigest>>();

    for (const track of tracks) {
      const normalizedTrack = {
        id: track.id,
        name: track.name,
        keywords: track.keywords,
        arxivCats: track.arxiv_cats ?? [],
        minScore: track.min_score ?? 0,
      };

      const filtered = prefilterPapers(papers, normalizedTrack.keywords);
      const scored = await scorePapers(llmConfig, normalizedTrack, filtered, { concurrency: 2 });

      // Accumulate into per-user digest
      const existing = userDigests.get(track.user_id);
      if (existing) {
        existing.entries.push(
          ...buildDigest(scored, {
            userId: track.user_id,
            weekOf: getWeekOf(),
            maxEntries: 5,
          }).entries,
        );
      } else {
        userDigests.set(
          track.user_id,
          buildDigest(scored, {
            userId: track.user_id,
            weekOf: getWeekOf(),
            maxEntries: 5,
          }),
        );
      }
    }

    // Deliver each user's digest
    for (const [uid, digest] of userDigests.entries()) {
      if (digest.entries.length === 0) continue;

      // Get user email
      const { data: user } = await supabase.auth.admin.getUserById(uid);
      const email = user?.user?.email;
      if (!email) continue;

      const text = renderDigestText(digest);

      await resend.emails.send({
        from: 'PaperBrief <digest@paperbrief.io>',
        to: email,
        subject: `📄 Your PaperBrief digest — week of ${digest.weekOf}`,
        text,
      });

      // Record delivery
      await supabase.from('deliveries').upsert({
        user_id: uid,
        week_of: digest.weekOf,
        papers_sent: digest.entries.length,
        channels: ['email'],
      });

      totalDeliveries++;
    }

    return NextResponse.json({
      success: true,
      processed: totalDeliveries,
      weekOf: getWeekOf(),
    });
  } catch (err) {
    console.error('[digest] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function getWeekOf(): string {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
}
