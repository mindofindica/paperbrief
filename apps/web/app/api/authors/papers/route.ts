/**
 * /api/authors/papers — Get recent papers from authors the user follows.
 *
 * GET /api/authors/papers[?limit=20&offset=0]
 *   → { papers: AuthorPaper[], total: number }
 *
 * Returns papers sorted by published_at DESC from the papers table,
 * where any of the user's followed authors appears in the paper's authors array.
 *
 * Auth: requires valid pb_session cookie — 401 otherwise.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionCookie } from '../../../../lib/auth';
import { getPapersByFollowedAuthors } from '../../../../lib/author-follows';

function getAuth(request: NextRequest): { userId: string } | null {
  const cookie = request.cookies.get('pb_session')?.value;
  if (!cookie) return null;
  try {
    const payload = verifySessionCookie(cookie);
    if (!payload?.userId) return null;
    return { userId: payload.userId };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const auth = getAuth(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? 20)));
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0));

  try {
    const papers = await getPapersByFollowedAuthors(auth.userId, limit, offset);
    return NextResponse.json({ papers, total: papers.length });
  } catch (err) {
    console.error('[GET /api/authors/papers]', err);
    return NextResponse.json({ error: 'Failed to fetch papers' }, { status: 500 });
  }
}
