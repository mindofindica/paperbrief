/**
 * GET  /api/collections  — list current user's collections (with paper counts)
 * POST /api/collections  — create a new collection
 */

import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '../../../lib/auth';
import {
  getUserCollections,
  createCollection,
  validateCollectionName,
  validateCollectionDescription,
  CollectionLimitError,
  FREE_COLLECTION_LIMIT,
} from '../../../lib/collections';

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

// ── GET ────────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const collections = await getUserCollections(userId);
    return NextResponse.json({ collections });
  } catch (err) {
    console.error('[GET /api/collections]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── POST ───────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { name, description, is_public } = body as Record<string, unknown>;

  // Validate name
  const nameResult = validateCollectionName(name);
  if (!nameResult.valid) {
    return NextResponse.json({ error: nameResult.error }, { status: 400 });
  }

  // Validate description
  const descResult = validateCollectionDescription(description);
  if (!descResult.valid) {
    return NextResponse.json({ error: descResult.error }, { status: 400 });
  }

  const isPublic = typeof is_public === 'boolean' ? is_public : false;

  try {
    const collection = await createCollection(
      userId,
      name as string,
      (description as string | null | undefined) ?? null,
      isPublic,
    );
    return NextResponse.json({ collection }, { status: 201 });
  } catch (err) {
    if (err instanceof CollectionLimitError) {
      return NextResponse.json(
        {
          error: err.message,
          limit: FREE_COLLECTION_LIMIT,
          upgrade: '/pricing',
        },
        { status: 429 },
      );
    }
    console.error('[POST /api/collections]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
