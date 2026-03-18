/**
 * /api/authors — Manage followed authors for the authenticated user.
 *
 * GET  /api/authors
 *   → { follows: AuthorFollow[], count: number }
 *
 * POST /api/authors
 *   Body: { authorName: string }
 *   → { ok: true, follow: AuthorFollow }
 *   Errors: 400 (validation), 401 (auth), 409 (already following), 429 (free limit reached)
 *
 * Auth: requires valid pb_session cookie — 401 otherwise.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionCookie } from '../../../lib/auth';
import {
  getFollowedAuthors,
  followAuthor,
  getFollowCount,
  isFollowingAuthor,
  validateAuthorName,
  FREE_FOLLOW_LIMIT,
} from '../../../lib/author-follows';

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

// ── GET /api/authors ───────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const auth = getAuth(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const follows = await getFollowedAuthors(auth.userId);
    return NextResponse.json({ follows, count: follows.length });
  } catch (err) {
    console.error('[GET /api/authors]', err);
    return NextResponse.json({ error: 'Failed to fetch follows' }, { status: 500 });
  }
}

// ── POST /api/authors ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = getAuth(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawName = (body as Record<string, unknown>)?.authorName;
  if (typeof rawName !== 'string') {
    return NextResponse.json({ error: 'authorName (string) is required' }, { status: 400 });
  }

  const validated = validateAuthorName(rawName);
  if (!validated.ok) {
    return NextResponse.json({ error: (validated as { ok: false; error: string }).error }, { status: 400 });
  }
  const authorName = validated.name;

  try {
    // Check if already following
    const alreadyFollowing = await isFollowingAuthor(auth.userId, authorName);
    if (alreadyFollowing) {
      return NextResponse.json({ error: `Already following "${authorName}"` }, { status: 409 });
    }

    // Enforce free tier limit
    const currentCount = await getFollowCount(auth.userId);
    // Note: Pro gate is enforced here. Without Stripe, we gate at FREE_FOLLOW_LIMIT for all users.
    // When Stripe is live, check user plan here and allow unlimited for Pro.
    if (currentCount >= FREE_FOLLOW_LIMIT) {
      return NextResponse.json(
        {
          error: `Free plan supports up to ${FREE_FOLLOW_LIMIT} followed authors. Upgrade to Pro for unlimited.`,
          limitReached: true,
        },
        { status: 429 },
      );
    }

    const follow = await followAuthor(auth.userId, authorName);
    return NextResponse.json({ ok: true, follow }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/authors]', err);
    return NextResponse.json({ error: 'Failed to follow author' }, { status: 500 });
  }
}
