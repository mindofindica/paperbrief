import { NextRequest, NextResponse } from 'next/server';
import { searchPapers } from '../../../lib/arxiv-db';

function parseLimit(raw: string | null): number {
  const parsed = Number(raw ?? '5');
  if (!Number.isFinite(parsed)) return 5;
  return Math.min(Math.max(Math.trunc(parsed), 1), 20);
}

function parseFromDate(raw: string | null): string | null {
  if (!raw) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('query')?.trim() ?? '';
  const track = request.nextUrl.searchParams.get('track')?.trim() ?? null;
  const from = parseFromDate(request.nextUrl.searchParams.get('from'));
  const limit = parseLimit(request.nextUrl.searchParams.get('limit'));

  if (!query) {
    return NextResponse.json({
      query,
      filters: { track, from, limit },
      count: 0,
      items: [],
    });
  }

  try {
    const items = searchPapers({
      query,
      track,
      fromDate: from,
      limit,
    });

    return NextResponse.json({
      query,
      filters: { track, from, limit },
      count: items.length,
      items,
    });
  } catch (err) {
    console.error('[search]', err);
    return NextResponse.json({ error: 'Failed to search papers' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
