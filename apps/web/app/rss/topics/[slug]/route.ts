/**
 * Per-topic RSS Feed — /rss/topics/[slug]
 *
 * Returns an RSS 2.0 feed of recent papers for a specific research topic.
 *
 * Query params:
 *   ?days=7     How far back to look (default 14, cap 30)
 *   ?limit=25   Max papers to include (default 50, cap 100)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTopicBySlug, getTopicPapers, getAllTopics, type TopicPaper } from '../../../../lib/topics';
import { buildFeed, clamp } from '../../../../lib/rss-helpers';

export const dynamic = 'force-dynamic';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://paperbrief.ai';
const DEFAULT_DAYS = 14;
const DEFAULT_LIMIT = 50;
const MAX_DAYS = 30;
const MAX_LIMIT = 100;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await params;

  const topic = getTopicBySlug(slug);
  if (!topic) {
    const validSlugs = getAllTopics().map((t) => t.slug).join(', ');
    return new NextResponse(
      `Unknown topic slug "${slug}". Valid slugs: ${validSlugs}`,
      { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }

  const { searchParams } = new URL(request.url);
  const daysBack = clamp(parseInt(searchParams.get('days') ?? String(DEFAULT_DAYS), 10), 1, MAX_DAYS, DEFAULT_DAYS);
  const limit = clamp(parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10), 1, MAX_LIMIT, DEFAULT_LIMIT);

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

  const feedUrl = `${SITE_URL}/rss/topics/${slug}`;
  const topicPageUrl = `${SITE_URL}/topics/${slug}`;
  const lastBuildDate = new Date().toUTCString().replace('GMT', '+0000');
  const channelTitle = `${topic.emoji} ${topic.name} Papers — PaperBrief`;
  const channelDescription = `${topic.description} Latest research papers from arXiv, curated daily by PaperBrief.`;

  const xml = buildFeed({ feedUrl, topicPageUrl, channelTitle, channelDescription, lastBuildDate, items: papers, siteUrl: SITE_URL });

  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
