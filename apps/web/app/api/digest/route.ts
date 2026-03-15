/**
 * POST /api/digest
 *
 * Daily digest delivery — called by Vercel Cron (every day at 08:00 UTC).
 * Selects papers from Supabase matching each user's tracks, skips papers
 * already sent in the last 21 days, and emails each user their digest.
 *
 * No LLM calls — papers are pre-scored by arxiv-coach ingestion pipeline.
 *
 * Auth: requires Authorization: Bearer <CRON_SECRET> header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '../../../lib/supabase';
import { sendDigestEmail } from '../../../lib/email/send-digest';
import { buildUnsubscribeUrl } from '../../../lib/unsubscribe-token';
import { scoreLabel } from '@paperbrief/core';
import type { Digest, DigestEntry } from '@paperbrief/core';

const DEDUP_DAYS = 21;
const MAX_PAPERS_PER_DIGEST = 10;
const MIN_LLM_SCORE = 3; // papers below this are filtered out

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as { userId?: string };
  const targetUserId = body.userId ?? null;

  const supabase = getServiceSupabase();

  try {
    // 1. Fetch active tracks (all users, or one specific user)
    let trackQuery = supabase
      .from('tracks')
      .select('id, user_id, name, keywords, arxiv_cats, min_score')
      .eq('active', true);
    if (targetUserId) trackQuery = trackQuery.eq('user_id', targetUserId);

    const { data: tracks, error: tracksError } = await trackQuery;
    if (tracksError) throw tracksError;
    if (!tracks?.length) {
      return NextResponse.json({ message: 'No active tracks', processed: 0 });
    }

    // 2. Group tracks by user
    const byUser = new Map<string, typeof tracks>();
    for (const track of tracks) {
      if (!byUser.has(track.user_id)) byUser.set(track.user_id, []);
      byUser.get(track.user_id)!.push(track);
    }

    // 3. Process each user
    let totalDeliveries = 0;
    const errors: string[] = [];

    for (const [userId, userTracks] of byUser.entries()) {
      try {
        // Check unsubscribe preference
        const { data: prefs } = await supabase
          .from('user_email_prefs')
          .select('digest_subscribed')
          .eq('user_id', userId)
          .maybeSingle();
        if (prefs?.digest_subscribed === false) continue;

        // Get user email via SQL RPC (auth.admin API is unreliable on free tier)
        const { data: email } = await supabase
          .rpc('get_user_email_by_id', { p_user_id: userId });
        if (!email) {
          console.warn('[digest] No email for user', userId);
          continue;
        }

        // Collect papers already sent to this user in the last DEDUP_DAYS days
        const { data: recentlySent } = await supabase
          .from('paper_digest_entries')
          .select('arxiv_id')
          .eq('track', userId) // we'll use track column to store user_id for per-user dedup
          .gte('date', new Date(Date.now() - DEDUP_DAYS * 86400_000).toISOString().slice(0, 10));
        const sentIds = new Set((recentlySent ?? []).map((r: { arxiv_id: string }) => r.arxiv_id));

        // Select papers for each track from Supabase
        const entries: DigestEntry[] = [];

        for (const track of userTracks) {
          if (entries.length >= MAX_PAPERS_PER_DIGEST) break;

          const keywords: string[] = track.keywords ?? [];
          const cats: string[] = track.arxiv_cats ?? [];
          const minScore = Number(track.min_score ?? MIN_LLM_SCORE);

          if (!keywords.length) continue;

          // Build keyword filter: title or abstract contains any keyword (case-insensitive)
          // Supabase doesn't support full-text OR natively via .or() across columns easily,
          // so we use a raw RPC for this.
          const { data: papers } = await supabase
            .rpc('search_papers_for_digest', {
              p_keywords: keywords,
              p_categories: cats.length ? cats : null,
              p_min_score: minScore,
              p_exclude_ids: sentIds.size ? Array.from(sentIds) : [],
              p_limit: MAX_PAPERS_PER_DIGEST - entries.length,
            });

          for (const p of papers ?? []) {
            if (entries.length >= MAX_PAPERS_PER_DIGEST) break;
            entries.push({
              arxivId: p.arxiv_id,
              title: p.title,
              authors: formatAuthors(p.authors ?? []),
              score: p.llm_score ?? minScore,
              scoreLabel: scoreLabel(p.llm_score ?? minScore),
              summary: p.abstract.slice(0, 300) + (p.abstract.length > 300 ? '…' : ''),
              reason: `Matched track: ${track.name}`,
              absUrl: `https://arxiv.org/abs/${p.arxiv_id}`,
              trackName: track.name,
            });
            sentIds.add(p.arxiv_id); // prevent cross-track dupes in same digest
          }
        }

        if (!entries.length) continue;

        // Build digest object
        const digest: Digest = {
          userId,
          weekOf: todayIso(),
          entries,
          tracksIncluded: [...new Set(entries.map((e) => e.trackName))],
          totalPapersScanned: entries.length,
          totalPapersIncluded: entries.length,
          generatedAt: new Date().toISOString(),
        };

        // Send email
        const unsubscribeUrl = buildUnsubscribeUrl(userId, email as string);
        const sendResult = await sendDigestEmail({ to: email as string, digest, unsubscribeUrl });
        if (!sendResult.ok && !('skipped' in sendResult && sendResult.skipped)) {
          console.error('[digest] Email failed for', email, ':', (sendResult as any).error);
          errors.push(`${email}: ${(sendResult as any).error}`);
          continue;
        }

        // Record delivery + dedup entries
        const today = todayIso();
        await supabase.from('deliveries').insert({
          user_id: userId,
          week_of: today,
          papers_sent: entries.length,
          channels: ['email'],
        });

        // Record each sent paper for dedup (using track column to store userId)
        await supabase.from('paper_digest_entries').insert(
          entries.map((e) => ({
            date: today,
            arxiv_id: e.arxivId,
            track: userId,
            llm_score: e.score,
          }))
        );

        totalDeliveries++;
      } catch (userErr) {
        console.error('[digest] Error processing user', userId, userErr);
        errors.push(String(userId));
      }
    }

    return NextResponse.json({
      success: true,
      processed: totalDeliveries,
      date: todayIso(),
      errors: errors.length ? errors : undefined,
    });
  } catch (err) {
    console.error('[digest] Fatal error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Also support GET for Vercel Cron (which sends GET requests)
export async function GET(req: NextRequest): Promise<NextResponse> {
  // Vercel cron sends Authorization header
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return POST(new NextRequest(req.url, {
    method: 'POST',
    headers: req.headers,
    body: JSON.stringify({}),
  }));
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatAuthors(authors: string[]): string {
  if (!authors.length) return '';
  if (authors.length === 1) return authors[0]!;
  if (authors.length === 2) return authors.join(' & ');
  return `${authors[0]} et al.`;
}
