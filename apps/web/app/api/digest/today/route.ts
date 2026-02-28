import { NextResponse } from 'next/server';
import { getTodaysPapers } from '../../../../lib/arxiv-db';

export async function GET() {
  try {
    const papers = getTodaysPapers();
    return NextResponse.json({ papers, count: papers.length });
  } catch (err) {
    console.error('[digest/today]', err);
    return NextResponse.json({ error: 'Failed to fetch papers' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
