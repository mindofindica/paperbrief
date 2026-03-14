/**
 * GET /api/reading-list/bibtex
 *
 * Export the authenticated user's reading list as a BibTeX (.bib) file.
 * Returns a downloadable file with Content-Disposition: attachment.
 *
 * Query params:
 *   status  — optional, one of "unread" | "reading" | "done"
 *             When omitted, all papers are exported.
 *   abstracts — optional "0" to omit abstract fields (default: include)
 *
 * Auth: requires valid pb_session cookie — 401 otherwise.
 *
 * Example:
 *   GET /api/reading-list/bibtex
 *     → reading-list.bib  (all papers)
 *   GET /api/reading-list/bibtex?status=done
 *     → reading-list-done.bib  (only finished papers)
 *   GET /api/reading-list/bibtex?abstracts=0
 *     → reading-list.bib  (without abstract fields, smaller file)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionCookie } from '../../../../lib/auth';
import { getUserReadingList, isValidStatus, type ReadingStatus } from '../../../../lib/reading-list-supa';
import { readingListToBibtex } from '../../../../lib/bibtex';

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

  const params = request.nextUrl.searchParams;

  // Status filter
  const statusParam = params.get('status') ?? undefined;
  const status = isValidStatus(statusParam) ? (statusParam as ReadingStatus) : undefined;

  // Abstract inclusion (default: yes; pass abstracts=0 to omit)
  const includeAbstracts = params.get('abstracts') !== '0';

  try {
    const papers = await getUserReadingList(auth.userId, status);
    const bibContent = readingListToBibtex(papers, { includeAbstracts });

    // Build a descriptive filename
    const suffix = status ? `-${status}` : '';
    const filename = `reading-list${suffix}.bib`;

    return new NextResponse(bibContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[reading-list/bibtex][GET]', err);
    return NextResponse.json({ error: 'Failed to export reading list' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
