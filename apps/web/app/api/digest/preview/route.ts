/**
 * GET /api/digest/preview
 *
 * Dry-run the weekly digest for the authenticated user.
 * Uses pre-scored papers from Supabase (same pipeline as the real digest cron).
 * No LLM calls, no email sent, nothing saved.
 *
 * Requires: pb_session cookie (auth required).
 * Optional query params:
 *   ?maxEntries=10   — cap digest entries (default 20)
 *   ?track=<name>    — filter to a single track (substring match, case-insensitive)
 *
 * Response: { digest: Digest, tracksQueried: number, papersScanned: number, durationMs: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '../../../../lib/supabase';
import { verifySessionCookie } from '../../../../lib/auth';
import { scoreLabel } from '@paperbrief/core';
import type { Digest, DigestEntry } from '@paperbrief/core';

export const dynamic = 'force-dynamic';

const MIN_SCORE = 3;
const MAX_ENTRIES = 50;

function getWeekOf(): string {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

function formatAuthors(authors: string[]): string {
  if (!authors?.length) return '';
  if (authors.length <= 2) return authors.join(' & ');
  return `${authors[0]} et al.`;
}

function getUserIdFromRequest(request: NextRequest): string | null {
  const session = request.cookies.get('pb_session')?.value;
  if (!session) return null;
  const result = verifySessionCookie(session);
  return result.valid ? (result.userId ?? null) : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const maxEntries = Math.min(Number(searchParams.get('maxEntries') ?? '20'), MAX_ENTRIES);
  const trackFilter = searchParams.get('track')?.toLowerCase() ?? null;

  const supabase = getServiceSupabase();
  const t0 = Date.now();

  // Load active tracks for this user
  const { data: rawTracks, error: tracksError } = await supabase
    .from('tracks')
    .select('id, name, keywords, arxiv_cats, min_score')
    .eq('user_id', userId)
    .eq('active', true);

  if (tracksError) {
    console.error('[digest/preview][tracks]', tracksError);
    return NextResponse.json({ error: 'Failed to load tracks' }, { status: 500 });
  }

  if (!rawTracks?.length) {
    return NextResponse.json({
      digest: null,
      tracksQueried: 0,
      papersScanned: 0,
      durationMs: Date.now() - t0,
      message: 'No active tracks configured. Add a track from your dashboard to get started.',
    });
  }

  // Optionally filter to a single track
  const tracks = rawTracks.filter(
    (t) => !trackFilter || t.name.toLowerCase().includes(trackFilter)
  );

  if (!tracks.length) {
    return NextResponse.json({
      digest: null,
      tracksQueried: 0,
      papersScanned: 0,
      durationMs: Date.now() - t0,
      message: `No active tracks match filter "${trackFilter}".`,
    });
  }

  try {
    const entries: DigestEntry[] = [];
    const seenIds = new Set<string>();

    for (const track of tracks) {
      if (entries.length >= maxEntries) break;

      const keywords: string[] = track.keywords ?? [];
      const cats: string[] = track.arxiv_cats ?? [];
      const minScore = Number(track.min_score ?? MIN_SCORE);

      if (!keywords.length) continue;

      const { data: papers } = await supabase
        .rpc('search_papers_for_digest', {
          p_keywords: keywords,
          p_categories: cats.length ? cats : null,
          p_min_score: minScore,
          p_exclude_ids: seenIds.size ? Array.from(seenIds) : [],
          p_limit: maxEntries - entries.length,
        });

      for (const p of papers ?? []) {
        if (entries.length >= maxEntries) break;
        if (seenIds.has(p.arxiv_id)) continue;
        seenIds.add(p.arxiv_id);
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
      }
    }

    const digest: Digest = {
      userId,
      weekOf: getWeekOf(),
      entries,
      tracksIncluded: [...new Set(entries.map((e) => e.trackName))],
      totalPapersScanned: entries.length,
      totalPapersIncluded: entries.length,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json({
      digest,
      tracksQueried: tracks.length,
      papersScanned: entries.length,
      durationMs: Date.now() - t0,
    });
  } catch (err) {
    console.error('[digest/preview]', err);
    return NextResponse.json({ error: 'Failed to generate preview' }, { status: 500 });
  }
}
