/**
 * GET /api/reading-list/markdown
 *
 * Export the authenticated user's reading list as a Markdown (.md) file.
 * Returns a downloadable file with Content-Disposition: attachment.
 *
 * Designed for import into Obsidian, Notion, Bear, or any Markdown notes app.
 * Papers are grouped by status: Currently Reading → Unread → Done.
 *
 * Query params:
 *   status     — optional, one of "unread" | "reading" | "done"
 *                When omitted, all papers are exported in grouped sections.
 *   abstracts  — "0" to omit abstract text (default: include)
 *   notes      — "0" to omit personal notes (default: include)
 *   group      — "0" to skip status grouping — sorted by saved date instead
 *
 * Auth: requires valid pb_session cookie — 401 otherwise.
 *
 * Examples:
 *   GET /api/reading-list/markdown
 *     → reading-list.md  (all papers, grouped by status)
 *   GET /api/reading-list/markdown?status=done
 *     → reading-list-done.md  (only finished papers)
 *   GET /api/reading-list/markdown?abstracts=0&notes=0
 *     → compact format without abstracts or notes
 *   GET /api/reading-list/markdown?group=0
 *     → flat list sorted by saved date (no sections)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionCookie } from '../../../../lib/auth';
import { getUserReadingList, isValidStatus, type ReadingStatus } from '../../../../lib/reading-list-supa';
import { readingListToMarkdown } from '../../../../lib/markdown-export';

export const dynamic = 'force-dynamic';

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

  // Options
  const includeAbstracts = params.get('abstracts') !== '0';
  const includeNotes     = params.get('notes')     !== '0';
  const groupByStatus    = params.get('group')     !== '0';

  try {
    const papers = await getUserReadingList(auth.userId, status);
    const mdContent = readingListToMarkdown(papers, {
      includeAbstracts,
      includeNotes,
      groupByStatus: status ? false : groupByStatus, // no grouping when status filter applied
    });

    // Build a descriptive filename
    const suffix = status ? `-${status}` : '';
    const filename = `reading-list${suffix}.md`;

    return new NextResponse(mdContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[reading-list/markdown][GET]', err);
    return NextResponse.json({ error: 'Failed to export reading list' }, { status: 500 });
  }
}
