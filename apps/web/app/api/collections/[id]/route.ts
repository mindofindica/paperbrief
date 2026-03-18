/**
 * PATCH  /api/collections/[id]  — update a collection (name, description, is_public)
 * DELETE /api/collections/[id]  — delete a collection
 */

import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '../../../../lib/auth';
import {
  updateCollection,
  deleteCollection,
  validateCollectionName,
  validateCollectionDescription,
  CollectionNotFoundError,
} from '../../../../lib/collections';

// ── Auth helper ────────────────────────────────────────────────────────────────

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

type RouteContext = { params: Promise<{ id: string }> };

// ── PATCH ──────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  const { name, description, is_public } = body as Record<string, unknown>;

  if (name !== undefined) {
    const result = validateCollectionName(name);
    if (!result.valid) return NextResponse.json({ error: result.error }, { status: 400 });
    updates.name = name as string;
  }

  if ('description' in (body as Record<string, unknown>)) {
    const result = validateCollectionDescription(description);
    if (!result.valid) return NextResponse.json({ error: result.error }, { status: 400 });
    updates.description = (description as string | null | undefined) ?? null;
  }

  if (is_public !== undefined) {
    if (typeof is_public !== 'boolean') {
      return NextResponse.json({ error: 'is_public must be a boolean' }, { status: 400 });
    }
    updates.is_public = is_public;
  }

  try {
    const collection = await updateCollection(id, userId, updates);
    return NextResponse.json({ collection });
  } catch (err) {
    if (err instanceof CollectionNotFoundError) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }
    console.error('[PATCH /api/collections/[id]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── DELETE ─────────────────────────────────────────────────────────────────────

export async function DELETE(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;

  try {
    await deleteCollection(id, userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof CollectionNotFoundError) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }
    console.error('[DELETE /api/collections/[id]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
