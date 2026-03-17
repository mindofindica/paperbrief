/**
 * DELETE /api/collections/[id]/papers/[arxivId]  — remove a paper from a collection
 */

import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '../../../../../../lib/auth';
import {
  removePaperFromCollection,
  CollectionNotFoundError,
} from '../../../../../../lib/collections';

async function getAuthUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('pb_session')?.value;
    if (!session) return null;
    const auth = verifySessionCookie(session);
    return auth.valid ? (auth as { valid: boolean; userId?: string }).userId ?? null : null;
  } catch {
    return null;
  }
}

type RouteContext = { params: Promise<{ id: string; arxivId: string }> };

export async function DELETE(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, arxivId } = await ctx.params;
  const decodedArxivId = decodeURIComponent(arxivId);

  try {
    await removePaperFromCollection(id, userId, decodedArxivId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof CollectionNotFoundError) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }
    console.error('[DELETE /api/collections/[id]/papers/[arxivId]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
