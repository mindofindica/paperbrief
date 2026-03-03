/**
 * GET /api/digest/preview
 *
 * Dry-run the weekly digest for the authenticated user.
 * Fetches papers, scores them, builds a digest — but does NOT send any email
 * and does NOT write a delivery record.
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
import {
  fetchRecentPapers,
  prefilterPapers,
  scorePapers,
  buildDigest,
} from '@paperbrief/core';
import type { Track } from '@paperbrief/core';

export const dynamic = 'force-dynamic';

function getWeekOf(): string {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
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
  const maxEntries = Math.min(Number(searchParams.get('maxEntries') ?? '20'), 50);
  const trackFilter = searchParams.get('track')?.toLowerCase() ?? null;

  const supabase = getServiceSupabase();

  // Load active tracks for this user
  let trackQuery = supabase
    .from('tracks')
    .select('id, name, keywords, arxiv_cats, min_score')
    .eq('user_id', userId)
    .eq('active', true);

  const { data: rawTracks, error: tracksError } = await trackQuery;

  if (tracksError) {
    console.error('[digest/preview][tracks]', tracksError);
    return NextResponse.json({ error: 'Failed to load tracks' }, { status: 500 });
  }

  if (!rawTracks?.length) {
    return NextResponse.json({
      digest: null,
      tracksQueried: 0,
      papersScanned: 0,
      durationMs: 0,
      message: 'No active tracks configured. Add a track from your dashboard to get started.',
    });
  }

  // Optionally filter to a single track
  const tracks: Track[] = (rawTracks as Array<{
    id: string;
    name: string;
    keywords: string[];
    arxiv_cats: string[];
    min_score: number;
  }>)
    .filter((t) => !trackFilter || t.name.toLowerCase().includes(trackFilter))
    .map((t) => ({
      id: t.id,
      name: t.name,
      keywords: t.keywords,
      arxivCats: t.arxiv_cats ?? [],
      minScore: t.min_score ?? 0,
    }));

  if (!tracks.length) {
    return NextResponse.json({
      digest: null,
      tracksQueried: 0,
      papersScanned: 0,
      durationMs: 0,
      message: `No active tracks match filter "${trackFilter}".`,
    });
  }

  const llmApiKey = process.env.OPENROUTER_API_KEY;
  if (!llmApiKey) {
    return NextResponse.json({ error: 'LLM not configured (OPENROUTER_API_KEY missing)' }, { status: 500 });
  }

  const llmConfig = { apiKey: llmApiKey };

  const t0 = Date.now();

  try {
    // Collect unique arxiv categories across filtered tracks
    const allCats = [...new Set(tracks.flatMap((t) => t.arxivCats))];
    const papers = await fetchRecentPapers(allCats, 100);
    const papersScanned = papers.length;

    // Score papers for each track; accumulate scored entries
    const allScored: Awaited<ReturnType<typeof scorePapers>> = [];

    for (const track of tracks) {
      const filtered = prefilterPapers(papers, track.keywords);
      const scored = await scorePapers(llmConfig, track, filtered, { concurrency: 2 });
      allScored.push(...scored);
    }

    // Build a single preview digest (no DB writes, no email send)
    const digest = buildDigest(allScored, {
      userId,
      weekOf: getWeekOf(),
      maxEntries,
    });

    const durationMs = Date.now() - t0;

    return NextResponse.json({
      digest,
      tracksQueried: tracks.length,
      papersScanned,
      durationMs,
    });
  } catch (err) {
    console.error('[digest/preview]', err);
    return NextResponse.json({ error: 'Failed to generate preview' }, { status: 500 });
  }
}
