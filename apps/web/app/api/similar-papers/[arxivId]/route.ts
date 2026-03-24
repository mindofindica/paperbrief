/**
 * GET /api/similar-papers/:arxivId
 *
 * Returns up to 5 papers similar to the given arxiv paper.
 * Similarity is computed from category overlap and title-word overlap.
 *
 * Public endpoint (no auth required) — papers data is public.
 * Cached for 1 hour at the CDN edge; stale-while-revalidate for 24h.
 */

import { NextResponse } from 'next/server';
import { getSimilarPapers } from '../../../../lib/similar-papers';

export const revalidate = 3600; // 1 hour

interface RouteParams {
  params: Promise<{ arxivId: string }>;
}

export async function GET(
  _request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { arxivId } = await params;

    if (!arxivId) {
      return NextResponse.json({ error: 'arxivId is required' }, { status: 400 });
    }

    const papers = await getSimilarPapers(decodeURIComponent(arxivId));

    return NextResponse.json(
      { papers },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      },
    );
  } catch (err) {
    console.error('[api/similar-papers] unexpected error:', err);
    return NextResponse.json(
      { papers: [] },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      },
    );
  }
}
