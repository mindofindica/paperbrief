/**
 * PaperBrief — Paper of the Day RSS Feed
 * GET /rss/daily
 *
 * Returns an RSS 2.0 feed with one item per calendar day: the highest-scored
 * arxiv paper for that date.  Pairs with the public /today page so users can
 * subscribe in any RSS reader and never miss the daily pick.
 *
 * Query params:
 *   ?days=30    How many days of history to include (default 30, max 90)
 *
 * Cache: public, 1 hour (matches /today ISR revalidation window)
 *
 * @see apps/web/app/today/page.tsx
 * @see apps/web/lib/today.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDailyPaperHistory, getScoreBadge, type DailyPaperEntry } from '../../../lib/today';

// ── Constants ─────────────────────────────────────────────────────────────────

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://paperbrief.ai';
const FEED_TITLE = 'PaperBrief — Paper of the Day';
const FEED_DESCRIPTION =
  'One paper per day: the highest-scored ML/AI preprint from arxiv, ' +
  'hand-picked by relevance score. Subscribe to stay sharp without the noise.';
const FEED_LANGUAGE = 'en-us';
const FEED_TTL = 60; // minutes

const DEFAULT_DAYS = 30;
const MAX_DAYS = 90;
const MAX_ABSTRACT_CHARS = 600;

// ── XML helpers ───────────────────────────────────────────────────────────────

/** Escape characters that are unsafe in XML text nodes / attributes. */
function xmlEscape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Convert a YYYY-MM-DD date string to RFC 2822 format required by RSS 2.0.
 * Sets the time to 12:00:00 UTC (midday) so readers display a sensible time.
 */
function dateToRfc2822(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  if (isNaN(d.getTime())) return new Date().toUTCString().replace('GMT', '+0000');
  return d.toUTCString().replace('GMT', '+0000');
}

/** Truncate abstract to MAX_ABSTRACT_CHARS, adding an ellipsis when clipped. */
function truncateAbstract(abstract: string): string {
  if (abstract.length <= MAX_ABSTRACT_CHARS) return abstract;
  return abstract.slice(0, MAX_ABSTRACT_CHARS).replace(/\s+\S*$/, '') + '…';
}

/** Format authors array into a comma-separated byline (max 5 names). */
function formatAuthors(authors: string[]): string {
  if (authors.length === 0) return '';
  const names = authors.slice(0, 5);
  return names.join(', ') + (authors.length > 5 ? ' et al.' : '');
}

// ── RSS item builder ──────────────────────────────────────────────────────────

function buildItem(entry: DailyPaperEntry): string {
  const { date, paper } = entry;
  const { emoji, label } = getScoreBadge(paper.llmScore);
  const authors = formatAuthors(paper.authors);
  const abstract = truncateAbstract(paper.abstract);
  const arxivUrl = `https://arxiv.org/abs/${paper.arxivId}`;
  const todayUrl = `${SITE_URL}/today`;

  // Unique stable guid per (paper, date) — not permalink since /today is shared
  const guid = `${SITE_URL}/rss/daily#${date}-${paper.arxivId}`;

  // Description combines abstract + score badge + link to /today
  const description = [
    abstract,
    '',
    `Score: ${paper.llmScore}/10 ${emoji} ${label}`,
    '',
    `Categories: ${paper.categories.join(', ')}`,
    '',
    `View on PaperBrief: ${todayUrl}`,
    `View on arxiv: ${arxivUrl}`,
  ].join('\n');

  return `
    <item>
      <title>${xmlEscape(`[${date}] ${paper.title}`)}</title>
      <link>${xmlEscape(arxivUrl)}</link>
      <guid isPermaLink="false">${xmlEscape(guid)}</guid>
      <pubDate>${dateToRfc2822(date)}</pubDate>
      ${authors ? `<dc:creator>${xmlEscape(authors)}</dc:creator>` : ''}
      <description>${xmlEscape(description)}</description>
      <source url="${xmlEscape(`${SITE_URL}/rss/daily`)}">${xmlEscape(FEED_TITLE)}</source>
    </item>`.trim();
}

// ── RSS feed builder ──────────────────────────────────────────────────────────

function buildFeed(entries: DailyPaperEntry[], feedUrl: string): string {
  const lastBuildDate = new Date().toUTCString().replace('GMT', '+0000');
  const itemsXml = entries.map(buildItem).join('\n    ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${xmlEscape(FEED_TITLE)}</title>
    <link>${xmlEscape(SITE_URL)}</link>
    <description>${xmlEscape(FEED_DESCRIPTION)}</description>
    <language>${FEED_LANGUAGE}</language>
    <ttl>${FEED_TTL}</ttl>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${xmlEscape(feedUrl)}" rel="self" type="application/rss+xml" />
    <image>
      <url>${xmlEscape(`${SITE_URL}/favicon.ico`)}</url>
      <title>${xmlEscape(FEED_TITLE)}</title>
      <link>${xmlEscape(SITE_URL)}</link>
    </image>
    ${itemsXml}
  </channel>
</rss>`;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Use new URL() for test-compatibility (plain Request objects lack .nextUrl)
  const { searchParams } = new URL(request.url);

  // Parse ?days param
  const rawDays = parseInt(searchParams.get('days') ?? String(DEFAULT_DAYS), 10);
  const days = isNaN(rawDays) ? DEFAULT_DAYS : Math.max(1, Math.min(rawDays, MAX_DAYS));

  // Fetch daily paper history
  let entries: DailyPaperEntry[];
  try {
    entries = await getDailyPaperHistory(days);
  } catch (err) {
    console.error('[rss/daily] getDailyPaperHistory error:', err);
    return new NextResponse('Internal server error generating RSS feed', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Build canonical feed URL (include ?days only when non-default)
  const feedParams = days !== DEFAULT_DAYS ? `?days=${days}` : '';
  const feedUrl = `${SITE_URL}/rss/daily${feedParams}`;

  const xml = buildFeed(entries, feedUrl);

  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
