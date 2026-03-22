/**
 * Shared RSS helper utilities used by topic and other RSS route handlers.
 * Kept in lib/ so Next.js route files only export HTTP method handlers.
 */

import type { TopicPaper } from './topics';

const MAX_ABSTRACT_CHARS = 500;

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
 */
export function toRfc2822(iso: string | null): string {
  const date = iso ? new Date(iso) : new Date();
  if (isNaN(date.getTime())) return new Date().toUTCString().replace('GMT', '+0000');
  return date.toUTCString().replace('GMT', '+0000');
}

/**
 * Truncate abstract to MAX_ABSTRACT_CHARS at a word boundary.
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

  if (primaryCat) lines.push(`<category>${xmlEscape(primaryCat)}</category>`);
  if (authors) lines.push(`<dc:creator>${xmlEscape(authors)}</dc:creator>`);
  if (description) lines.push(`<description>${xmlEscape(description)}</description>`);

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
  feedLanguage?: string;
  feedTtl?: number;
}): string {
  const {
    feedUrl, topicPageUrl, channelTitle, channelDescription,
    lastBuildDate, items, siteUrl, feedLanguage = 'en-us', feedTtl = 60,
  } = opts;
  const itemsXml = items.map((p) => buildItem(p, siteUrl)).join('\n    ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${xmlEscape(channelTitle)}</title>
    <link>${xmlEscape(topicPageUrl)}</link>
    <description>${xmlEscape(channelDescription)}</description>
    <language>${feedLanguage}</language>
    <ttl>${feedTtl}</ttl>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${xmlEscape(feedUrl)}" rel="self" type="application/rss+xml" />
    ${itemsXml}
  </channel>
</rss>`;
}
