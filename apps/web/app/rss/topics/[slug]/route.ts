/**
 * Per-topic RSS Feed — /rss/topics/[slug]
 *
 * Returns an RSS 2.0 feed of recent papers for a specific research topic.
 * Backed by the same Supabase queries as the /topics/[slug] landing pages —
 * so the feed stays in sync with what's visible on the site.
 *
 * Examples:
 *   /rss/topics/llm-agents           → LLM Agents papers, last 14 days
 *   /rss/topics/rag-retrieval        → RAG & Retrieval papers
 *   /rss/topics/reasoning?days=7     → Reasoning papers from the last week
 *
 * Query params:
 *   ?days=7     How far back to look (default 14, cap 30)
 *   ?limit=25   Max papers to include (default 50, cap 100)
 *
 * Cache: public, 1 hour (Vercel Edge Cache friendly)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getTopicBySlug,
  getTopicPapers,
  getAllTopics,
  type TopicPaper,
} from '../../../../lib/topics';

// ── Constants ────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://paperbrief.ai';
const FEED_LANGUAGE = 'en-us';
const FEED_TTL = 60; // minutes
const MAX_ABSTRACT_CHARS = 500;
const DEFAULT_DAYS = 14;
const DEFAULT_LIMIT = 50;
const MAX_DAYS = 30;
const MAX_LIMIT = 100;

// ── XML helpers ───────────────────────────────────────────────────────────────

/** Escape characters that are invalid inside XML text nodes / attributes. */
export function xmlEscape(str: string): string {
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
 */
export function toRfc2822(iso: string | null): string {
  const date = iso ? new Date(iso) : new Date();
  if (isNaN(date.getTime())) return new Date().toUTCString().replace('GMT', '+0000');
  return date.toUTCString().replace('GMT', '+0000');
}

/**
 * Truncate abstract to MAX_ABSTRACT_CHARS, appending an ellipsis when clipped.
 * Breaks at a word boundary so we never cut mid-word.
 */
export function truncateAbstract(abstract: string | null): string {
  if (!abstract) return '';
  if (abstract.length <= MAX_ABSTRACT_CHARS) return abstract;
  return abstract.slice(0, MAX_ABSTRACT_CHARS).replace(/\s+\S*$/, '') + '\u2026';
}

/**
 * Format an authors array into a comma-separated byline (max 5 names, then "et al.").
 */
export function formatAuthors(authors: string[] | null | undefined): string {
  if (!authors || authors.length === 0) return '';
  const displayed = authors.slice(0, 5);
  return displayed.join(', ') + (authors.length > 5 ? ' et al.' : '');
}

/**
 * Clamp a parsed integer to [min, max]. Falls back to `fallback` when NaN.
 */
export function clamp(value: number, min: number, max: number, fallback: number): number {
  if (isNaN(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

// ── RSS XML builder ───────────────────────────────────────────────────────────

/** Build a single RSS <item> element for a paper. */
export function buildItem(paper: TopicPaper, siteUrl: string): string {
  const authors = formatAuthors(paper.authors);
  const description = truncateAbstract(paper.abstract);
  const paperUrl = `${siteUrl}/paper/${encodeURIComponent(paper.arxiv_id)}`;
  const primaryCat = paper.categories?.[0] ?? '';

  const lines: string[] = [
    `<title>${xmlEscape(paper.title)}</title>`,
    `<link>${xmlEscape(paperUrl)}</link>`,
    `<guid isPermaLink="true">${xmlEscape(paperUrl)}</guid>`,
    `<pubDate>${toRfc2822(paper.published_at)}</pubDate>`,
  ];

  if (primaryCat) {
    lines.push(`<category>${xmlEscape(primaryCat)}</category>`);
  }
  if (authors) {
    lines.push(`<dc:creator>${xmlEscape(authors)}</dc:creator>`);
  }
  if (description) {
    lines.push(`<description>${xmlEscape(description)}</description>`);
  }

  return `<item>\n      ${lines.join('\n      ')}\n    </item>`;
}

/** Build the full RSS 2.0 document. */
export function buildFeed(opts: {
  feedUrl: string;
  topicPageUrl: string;
  channelTitle: string;
  channelDescription: string;
  lastBuildDate: string;
  items: TopicPaper[];
  siteUrl: string;
}): string {
  const { feedUrl, topicPageUrl, channelTitle, channelDescription, lastBuildDate, items, siteUrl } =
    opts;
  const itemsXml = items.map((p) => buildItem(p, siteUrl)).join('\n    ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${xmlEscape(channelTitle)}</title>
    <link>${xmlEscape(topicPageUrl)}</link>
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await params;

  // Validate slug
  const topic = getTopicBySlug(slug);
  if (!topic) {
    const validSlugs = getAllTopics()
      .map((t) => t.slug)
      .join(', ');
    return new NextResponse(
      `Unknown topic slug "${slug}". Valid slugs: ${validSlugs}`,
      { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }

  // Parse + clamp query params — use new URL() for test compatibility (no nextUrl in plain Request)
  const { searchParams } = new URL(request.url);
  const daysBack = clamp(
    parseInt(searchParams.get('days') ?? String(DEFAULT_DAYS), 10),
    1,
    MAX_DAYS,
    DEFAULT_DAYS,
  );
  const limit = clamp(
    parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10),
    1,
    MAX_LIMIT,
    DEFAULT_LIMIT,
  );

  // Fetch papers from Supabase
  let papers: TopicPaper[] = [];
  try {
    papers = await getTopicPapers(slug, limit, daysBack);
  } catch (err) {
    console.error('[rss/topics] getTopicPapers error:', err);
    return new NextResponse('Internal server error generating RSS feed', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  // Build feed metadata
  const feedUrl = `${SITE_URL}/rss/topics/${slug}`;
  const topicPageUrl = `${SITE_URL}/topics/${slug}`;
  const lastBuildDate = new Date().toUTCString().replace('GMT', '+0000');
  const channelTitle = `${topic.emoji} ${topic.name} Papers — PaperBrief`;
  const channelDescription = `${topic.description} Latest research papers from arXiv, curated daily by PaperBrief.`;

  const xml = buildFeed({
    feedUrl,
    topicPageUrl,
    channelTitle,
    channelDescription,
    lastBuildDate,
    items: papers,
    siteUrl: SITE_URL,
  });

  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control':
        'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
