/**
 * GET /api/trending
 *
 * Returns the top papers from the last 7 days, ranked by average LLM score
 * and number of appearances across all user digests.
 *
 * Public endpoint — no auth required.
 * Response is cached for 6 hours via Next.js Route Segment Config.
 *
 * Query params:
 *   days  — lookback window in days (default: 7, max: 30)
 *   limit — max papers to return    (default: 20, max: 50)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ISR-style caching for the Route Handler
export const revalidate = 21600; // 6 hours

export interface TrendingPaper {
  arxiv_id: string;
  title: string;
  abstract: string | null;
  authors: string[];
  categories: string[];
  published_at: string | null;
  avg_score: number;
  appearances: number;
  last_seen: string;
}

export interface TrendingResponse {
  papers: TrendingPaper[];
  generated_at: string;
  days: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function parseIntParam(raw: string | null, defaultValue: number): number {
  if (!raw) return defaultValue;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : defaultValue;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const daysRaw = url.searchParams.get('days');
  const limitRaw = url.searchParams.get('limit');

  const days  = clamp(parseIntParam(daysRaw,  7),  1, 30);
  const limit = clamp(parseIntParam(limitRaw, 20), 1, 50);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??   // server-side (preferred)
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; // anon key also works (function grants anon EXECUTE)

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: 'Server configuration missing' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase.rpc('get_trending_papers', {
    days: days,
    lim: limit,
  });

  if (error) {
    console.error('[trending] Supabase RPC error:', error.message);
    return NextResponse.json(
      { error: 'Failed to fetch trending papers' },
      { status: 500 }
    );
  }

  // Normalise numeric fields that Supabase returns as strings from NUMERIC columns
  const papers: TrendingPaper[] = (data ?? []).map(
    (row: Record<string, unknown>) => ({
      arxiv_id:    row.arxiv_id    as string,
      title:       row.title       as string,
      abstract:    row.abstract    as string | null,
      authors:     (row.authors    as string[]) ?? [],
      categories:  (row.categories as string[]) ?? [],
      published_at: row.published_at as string | null,
      avg_score:   parseFloat(row.avg_score as string),
      appearances: Number(row.appearances),
      last_seen:   row.last_seen as string,
    })
  );

  const body: TrendingResponse = {
    papers,
    generated_at: new Date().toISOString(),
    days,
  };

  return NextResponse.json(body, {
    headers: {
      'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=3600',
    },
  });
}
