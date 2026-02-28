import { NextRequest, NextResponse } from 'next/server';
import { getReadingList } from '../../../lib/arxiv-db';

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get('status') || undefined;
  try {
    const items = getReadingList(status);
    return NextResponse.json({ items, count: items.length });
  } catch (err) {
    console.error('[reading-list]', err);
    return NextResponse.json({ error: 'Failed to fetch reading list' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
