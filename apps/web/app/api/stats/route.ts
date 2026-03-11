import { NextResponse } from 'next/server';
import { getStats } from '../../../lib/stats';

/**
 * GET /api/stats
 *
 * Returns aggregate user statistics. No auth required — PaperBrief is
 * single-user and stats are non-sensitive reading activity data.
 *
 * Response shape: StatsResult (see lib/stats.ts)
 */
export async function GET() {
  try {
    const stats = getStats();
    return NextResponse.json(stats);
  } catch (err) {
    console.error('[stats]', err);
    return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
