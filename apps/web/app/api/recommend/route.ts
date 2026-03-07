import { NextRequest, NextResponse } from 'next/server';
import { getRecommendationBasis, getRecommendations } from '../../../lib/arxiv-db';

function parseLimit(raw: string | null): number {
  const parsed = Number(raw ?? '20');
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(Math.max(Math.trunc(parsed), 1), 100);
}

export async function GET(request: NextRequest) {
  try {
    const limit = parseLimit(request.nextUrl.searchParams.get('limit'));
    const basedOn = getRecommendationBasis();
    const papers = getRecommendations(limit);
    return NextResponse.json({ papers, basedOn, count: papers.length });
  } catch (err) {
    console.error('[recommend]', err);
    return NextResponse.json({ error: 'Failed to fetch recommendations' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
