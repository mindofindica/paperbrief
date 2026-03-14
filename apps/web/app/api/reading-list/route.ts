/**
 * /api/reading-list — Per-user reading list, backed by Supabase.
 *
 * GET    /api/reading-list[?status=unread|reading|done]
 *   → { items: ReadingListPaper[], count: number }
 *
 * POST   /api/reading-list
 *   Body: { arxivId: string, status: 'unread'|'reading'|'done', note?: string, priority?: number }
 *   → { ok: true, arxivId, status }
 *
 * DELETE /api/reading-list?arxivId=<id>
 *   → { ok: true, arxivId }
 *
 * Auth: requires valid pb_session cookie — 401 otherwise.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionCookie } from '../../../lib/auth';
import {
  getUserReadingList,
  upsertReadingListItem,
  removeReadingListItem,
  isValidStatus,
  type ReadingStatus,
} from '../../../lib/reading-list-supa';

// ── Auth helper ────────────────────────────────────────────────────────────────

function getAuth(request: NextRequest): { userId: string } | null {
  const cookie = request.cookies.get('pb_session')?.value;
  if (!cookie) return null;
  const session = verifySessionCookie(cookie);
  if (!session.valid || !session.userId) return null;
  return { userId: session.userId };
}

// ── GET ────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const auth = getAuth(request);
  if (!auth) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  }

  const statusParam = request.nextUrl.searchParams.get('status') ?? undefined;
  const status = isValidStatus(statusParam) ? statusParam : undefined;

  try {
    const items = await getUserReadingList(auth.userId, status);
    return NextResponse.json({ items, count: items.length });
  } catch (err) {
    console.error('[reading-list][GET]', err);
    return NextResponse.json({ error: 'Failed to fetch reading list' }, { status: 500 });
  }
}

// ── POST ───────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = getAuth(request);
  if (!auth) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  }

  let body: { arxivId?: unknown; status?: unknown; note?: unknown; priority?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { arxivId, status, note, priority } = body;

  if (typeof arxivId !== 'string' || !arxivId.trim()) {
    return NextResponse.json({ error: 'Missing or invalid arxivId' }, { status: 400 });
  }
  if (!isValidStatus(status)) {
    return NextResponse.json(
      { error: 'Invalid status — must be unread, reading, or done' },
      { status: 400 },
    );
  }

  try {
    await upsertReadingListItem(auth.userId, arxivId.trim(), status as ReadingStatus, {
      note: typeof note === 'string' ? note : undefined,
      priority: typeof priority === 'number' ? priority : 0,
    });
    return NextResponse.json({ ok: true, arxivId, status });
  } catch (err) {
    console.error('[reading-list][POST]', err);
    return NextResponse.json({ error: 'Failed to update reading list' }, { status: 500 });
  }
}

// ── DELETE ─────────────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  const auth = getAuth(request);
  if (!auth) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  }

  const arxivId = request.nextUrl.searchParams.get('arxivId');
  if (!arxivId) {
    return NextResponse.json({ error: 'Missing arxivId' }, { status: 400 });
  }

  try {
    await removeReadingListItem(auth.userId, arxivId);
    return NextResponse.json({ ok: true, arxivId });
  } catch (err) {
    console.error('[reading-list][DELETE]', err);
    return NextResponse.json({ error: 'Failed to remove from reading list' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
