/**
 * GET /api/collections/shared/[slug]  — get a public collection + its papers
 * No auth required — this is the public sharing endpoint.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { getCollectionBySlug, getCollectionPapers } from '../../../../../lib/collections';

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const { slug } = await ctx.params;

  try {
    const collection = await getCollectionBySlug(slug);
    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    const papers = await getCollectionPapers(collection.id);
    return NextResponse.json({ collection, papers });
  } catch (err) {
    console.error('[GET /api/collections/shared/[slug]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
