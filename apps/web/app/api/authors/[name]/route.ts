/**
 * /api/authors/[name] — Unfollow a specific author.
 *
 * DELETE /api/authors/[name]
 *   → { ok: true, authorName: string }
 *   Errors: 401 (auth), 404 (not following)
 *
 * The [name] param is URL-encoded (e.g. "Andrej%20Karpathy" → "Andrej Karpathy").
 *
 * Auth: requires valid pb_session cookie — 401 otherwise.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionCookie } from '../../../../lib/auth';
import { unfollowAuthor } from '../../../../lib/author-follows';

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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const auth = getAuth(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name } = await params;
  const authorName = decodeURIComponent(name).trim();

  if (!authorName) {
    return NextResponse.json({ error: 'Author name is required' }, { status: 400 });
  }

  try {
    const removed = await unfollowAuthor(auth.userId, authorName);
    if (!removed) {
      return NextResponse.json({ error: `Not following "${authorName}"` }, { status: 404 });
    }
    return NextResponse.json({ ok: true, authorName });
  } catch (err) {
    console.error('[DELETE /api/authors/[name]]', err);
    return NextResponse.json({ error: 'Failed to unfollow author' }, { status: 500 });
  }
}
