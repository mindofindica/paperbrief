import { NextRequest, NextResponse } from 'next/server';
import { getReadingList, removeFromReadingList, updateReadingList } from '../../../lib/arxiv-db';

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

export async function POST(request: NextRequest) {
  try {
    const { arxivId, status } = await request.json();

    if (!arxivId || !status) {
      return NextResponse.json({ error: 'Missing arxivId or status' }, { status: 400 });
    }

    updateReadingList(arxivId, status);
    return NextResponse.json({ ok: true, arxivId, status });
  } catch (err) {
    console.error('[reading-list]', err);
    return NextResponse.json({ error: 'Failed to update reading list' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const arxivId = request.nextUrl.searchParams.get('arxivId');
    if (!arxivId) {
      return NextResponse.json({ error: 'Missing arxivId' }, { status: 400 });
    }

    removeFromReadingList(arxivId);
    return NextResponse.json({ ok: true, arxivId });
  } catch (err) {
    console.error('[reading-list]', err);
    return NextResponse.json({ error: 'Failed to update reading list' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
