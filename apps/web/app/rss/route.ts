/**
 * PaperBrief RSS Feed — /rss
 *
 * Returns an RSS 2.0 feed of recent, high-scored arxiv papers from the
 * PaperBrief database. Supports per-track filtering via query params.
 *
 * Query params:
 *   ?track=RAG+%26+Grounding   Filter to a specific research track
 *   ?limit=25                  Max items (default 50, cap 100)
 *   ?days=7                    How far back to look (default 14, cap 30)
 *   ?min_score=4               Minimum relevance score (default 3, 1–5)
 *
 * Examples:
 *   /rss                           → all tracks, last 14 days
 *   /rss?track=RAG+%26+Grounding   → RAG papers only
 *   /rss?track=Agents+%2F+Memory&days=30&limit=100  → memory papers, 30 days
 *
 * Cache: public, 1 hour (Vercel Edge Cache friendly)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRssPapers, getAvailableTracks, type RssPaper } from '../../lib/arxiv-db';

// ── Constants ────────────────────────────────────────────────────────────────

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://paperbrief.ai';
const FEED_TITLE = 'PaperBrief — AI Research Digest';
const FEED_DESCRIPTION =
  'Top ML/AI papers from arxiv, curated daily by relevance score. ' +
  'Subscribe to stay current without drowning in the firehose.';
const FEED_LANGUAGE = 'en-us';
const FEED_TTL = 60; // minutes — hints to RSS readers how often to refresh
const MAX_ABSTRACT_CHARS = 500;

// ── XML helpers ───────────────────────────────────────────────────────────────

/** Escape characters that are invalid inside XML text nodes / attributes. */
function xmlEscape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Convert an ISO 8601 timestamp to RFC 2822 format required by RSS 2.0.
 * Falls back to the current time when the input is missing or unparseable.
 *
 * Example output: "Mon, 03 Mar 2026 17:59:35 +0000"
 */
function toRfc2822(iso: string | null): string {
  const date = iso ? new Date(iso) : new Date();
  if (isNaN(date.getTime())) return new Date().toUTCString();
  return date.toUTCString().replace('GMT', '+0000');
}

/** Format authors from JSON array string into a comma-separated byline. */
function formatAuthors(authorsJson: string | null): string {
  if (!authorsJson) return '';
  try {
    const parsed = JSON.parse(authorsJson);
    if (Array.isArray(parsed)) {
      return (parsed as string[]).slice(0, 5).join(', ') + (parsed.length > 5 ? ' et al.' : '');
    }
  } catch {
    // authorsJson might already be a plain string
    return authorsJson;
  }
  return '';
}

/** Truncate abstract to MAX_ABSTRACT_CHARS, adding an ellipsis when clipped. */
function truncateAbstract(abstract: string | null): string {
  if (!abstract) return '';
  if (abstract.length <= MAX_ABSTRACT_CHARS) return abstract;
  return abstract.slice(0, MAX_ABSTRACT_CHARS).replace(/\s+\S*$/, '') + '…';
}

// ── RSS XML builder ───────────────────────────────────────────────────────────

function buildItem(paper: RssPaper): string {
  const authors = formatAuthors(paper.authors);
  const description = truncateAbstract(paper.abstract);
  const scoreLabel = paper.llm_score !== null ? ` [score: ${paper.llm_score}/5]` : '';
  const trackLabel = paper.track ? ` · ${paper.track}` : '';

  return `
    <item>
      <title>${xmlEscape(paper.title)}${xmlEscape(scoreLabel)}</title>
      <link>${xmlEscape(paper.url)}</link>
      <guid isPermaLink="true">${xmlEscape(paper.url)}</guid>
      <pubDate>${toRfc2822(paper.published_at)}</pubDate>
      ${paper.track ? `<category>${xmlEscape(paper.track)}</category>` : ''}
      ${authors ? `<dc:creator>${xmlEscape(authors)}</dc:creator>` : ''}
      <description>${xmlEscape(description + trackLabel)}</description>
    </item>`.trim();
}

function buildFeed(opts: {
  feedUrl: string;
  channelTitle: string;
  channelDescription: string;
  lastBuildDate: string;
  items: RssPaper[];
}): string {
  const { feedUrl, channelTitle, channelDescription, lastBuildDate, items } = opts;
  const itemsXml = items.map(buildItem).join('\n    ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${xmlEscape(channelTitle)}</title>
    <link>${xmlEscape(SITE_URL)}</link>
    <description>${xmlEscape(channelDescription)}</description>
    <language>${FEED_LANGUAGE}</language>
    <ttl>${FEED_TTL}</ttl>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${xmlEscape(feedUrl)}" rel="self" type="application/rss+xml" />
    ${itemsXml}
  </channel>
</rss>`;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;

  // Parse and validate query params
  const track = searchParams.get('track') ?? undefined;
  const rawLimit = parseInt(searchParams.get('limit') ?? '50', 10);
  const rawDays = parseInt(searchParams.get('days') ?? '14', 10);
  const rawMinScore = parseInt(searchParams.get('min_score') ?? '3', 10);

  const limit = isNaN(rawLimit) ? 50 : Math.max(1, Math.min(rawLimit, 100));
  const daysBack = isNaN(rawDays) ? 14 : Math.max(1, Math.min(rawDays, 30));
  const minScore = isNaN(rawMinScore) ? 3 : Math.max(1, Math.min(rawMinScore, 5));

  // Validate track against known tracks (prevent injection / typo confusion)
  let resolvedTrack: string | undefined;
  if (track) {
    try {
      const available = getAvailableTracks().map((t) => t.track);
      const matched = available.find(
        (t) => t.toLowerCase() === track.toLowerCase()
      );
      if (!matched) {
        return NextResponse.json(
          {
            error: `Unknown track "${track}". Available: ${available.join(', ')}`,
          },
          { status: 400 }
        );
      }
      resolvedTrack = matched; // use canonical casing
    } catch (err) {
      console.error('[rss] getAvailableTracks error:', err);
      // Non-fatal — proceed without validation
      resolvedTrack = track;
    }
  }

  // Fetch papers
  let papers: RssPaper[];
  try {
    papers = getRssPapers({ track: resolvedTrack, limit, daysBack, minScore });
  } catch (err) {
    console.error('[rss] getRssPapers error:', err);
    return new NextResponse('Internal server error generating RSS feed', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Build feed metadata
  const trackSuffix = resolvedTrack ? ` · ${resolvedTrack}` : '';
  const channelTitle = `${FEED_TITLE}${trackSuffix}`;
  const channelDescription = resolvedTrack
    ? `Top ${resolvedTrack} papers from arxiv, curated by relevance score — via PaperBrief`
    : FEED_DESCRIPTION;

  const feedParams = new URLSearchParams();
  if (resolvedTrack) feedParams.set('track', resolvedTrack);
  if (limit !== 50) feedParams.set('limit', String(limit));
  if (daysBack !== 14) feedParams.set('days', String(daysBack));
  if (minScore !== 3) feedParams.set('min_score', String(minScore));
  const qs = feedParams.toString();
  const feedUrl = `${SITE_URL}/rss${qs ? `?${qs}` : ''}`;

  const lastBuildDate = new Date().toUTCString().replace('GMT', '+0000');

  const xml = buildFeed({ feedUrl, channelTitle, channelDescription, lastBuildDate, items: papers });

  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
