/**
 * GET /api/today
 *
 * Returns today's best ML paper from the last 3 days.
 * Public endpoint — no auth required.
 *
 * Response is cached for 1 hour (s-maxage=3600).
 */

import { NextResponse } from 'next/server';
import { getPaperOfTheDay } from '../../../lib/today';

export const revalidate = 3600; // 1 hour

export async function GET(): Promise<NextResponse> {
  try {
    const paper = await getPaperOfTheDay();

    return NextResponse.json(
      { paper },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      }
    );
  } catch (err) {
    console.error('[api/today] unexpected error:', err);
    return NextResponse.json(
      { paper: null },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      }
    );
  }
}
