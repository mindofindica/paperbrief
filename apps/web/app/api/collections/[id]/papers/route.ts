/**
 * GET  /api/collections/[id]/papers  — list papers in a collection
 * POST /api/collections/[id]/papers  — add a paper to a collection
 */

import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '../../../../../lib/auth';
import {
  getCollectionPapers,
  getCollection,
  addPaperToCollection,
  CollectionNotFoundError,
  DuplicatePaperError,
  MAX_PAPERS_PER_COLLECTION,
} from '../../../../../lib/collections';

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

// ── GET ────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const { id } = await ctx.params;

  // Allow unauthenticated reads for public collections
  const userId = await getAuthUserId();

  try {
    // For authenticated users, allow access to their own collections (public or private).
    // For unauthenticated, only allow public.
    const collection = await getCollection(id, userId ?? undefined);
    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    const papers = await getCollectionPapers(id);
    return NextResponse.json({ collection, papers });
  } catch (err) {
    console.error('[GET /api/collections/[id]/papers]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── POST ───────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { arxiv_id, title, authors, abstract, published_at } =
    body as Record<string, unknown>;

  if (!arxiv_id || typeof arxiv_id !== 'string' || arxiv_id.trim() === '') {
    return NextResponse.json({ error: 'arxiv_id is required' }, { status: 400 });
  }

  // Enforce per-collection paper limit
  try {
    const existing = await getCollectionPapers(id);
    if (existing.length >= MAX_PAPERS_PER_COLLECTION) {
      return NextResponse.json(
        {
          error: `Collections are limited to ${MAX_PAPERS_PER_COLLECTION} papers`,
        },
        { status: 429 },
      );
    }
  } catch {
    // getCollectionPapers throws if collection not found — handled below
  }

  try {
    const paper = await addPaperToCollection(id, userId, {
      arxiv_id: arxiv_id.trim(),
      title: (title as string | null) ?? null,
      authors: (authors as string | null) ?? null,
      abstract: (abstract as string | null) ?? null,
      published_at: (published_at as string | null) ?? null,
    });
    return NextResponse.json({ paper }, { status: 201 });
  } catch (err) {
    if (err instanceof CollectionNotFoundError) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }
    if (err instanceof DuplicatePaperError) {
      return NextResponse.json({ error: 'Paper already in collection' }, { status: 409 });
    }
    console.error('[POST /api/collections/[id]/papers]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
