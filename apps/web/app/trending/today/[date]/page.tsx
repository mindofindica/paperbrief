/**
 * /trending/today/[date] — Archive page for a specific day's top ML papers
 *
 * Shows the top-10 highest-scoring arXiv papers for any given digest date.
 * Every past day becomes a permanent, crawlable, linkable SEO page.
 *
 * Strategy:
 * - generateStaticParams: pre-render the last 30 days at build time
 * - ISR (revalidate: 3600): today's page refreshes hourly; past days effectively never
 * - Renders today → redirect to /trending/today via canonical link
 * - Handles invalid dates, future dates, and empty days gracefully
 *
 * Public: no auth required — shareable, crawlable, permanent.
 */

import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  getTopPapersForDate,
  getAvailableArchiveDates,
  isValidDateString,
  isFutureDate,
  formatArchiveDate,
  prevDate,
  nextDate,
} from '../../../../lib/trending-archive';
import TrendingTodayClient from '../TrendingTodayClient';

// ── ISR ───────────────────────────────────────────────────────────────────────

export const revalidate = 3600; // 1 hour — today's page stays fresh; past pages effectively static

// ── Static params (pre-render last 30 days) ───────────────────────────────────

export async function generateStaticParams(): Promise<{ date: string }[]> {
  try {
    const available = await getAvailableArchiveDates(30);
    return available.map(({ date }) => ({ date }));
  } catch {
    return [];
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type PageProps = {
  params: Promise<{ date: string }>;
};

// ── SEO ───────────────────────────────────────────────────────────────────────

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://paperbrief.ai';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { date } = await params;

  if (!isValidDateString(date) || isFutureDate(date)) {
    return { title: 'Not Found — PaperBrief' };
  }

  const displayDate = formatArchiveDate(date);
  const title = `Top ML Papers — ${displayDate} · PaperBrief`;
  const description = `The highest-scoring arXiv machine learning papers from ${displayDate}. Ranked by LLM relevance across PaperBrief researcher digests.`;

  return {
    title,
    description,
    openGraph: {
      title: `Top ML Papers — ${displayDate}`,
      description,
      type: 'website',
      url: `${SITE_URL}/trending/today/${date}`,
    },
    twitter: {
      card: 'summary',
      title: `Top ML Papers — ${displayDate} · PaperBrief`,
      description,
    },
    alternates: {
      canonical: `${SITE_URL}/trending/today/${date}`,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function TrendingArchivePage({ params }: PageProps) {
  const { date } = await params;

  // Validate date format
  if (!isValidDateString(date)) {
    notFound();
  }

  // Future dates → 404
  if (isFutureDate(date)) {
    notFound();
  }

  const today = new Date().toISOString().slice(0, 10);
  const isToday = date === today;

  const { papers, generatedAt } = await getTopPapersForDate(date, 10);

  const displayDate = formatArchiveDate(date);
  const prev = prevDate(date);
  const next = nextDate(date);
  const hasNext = next <= today;

  return (
    <div className="min-h-screen bg-gray-950">
      {/* ── Nav ── */}
      <nav className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-lg font-bold text-gray-100">📄 PaperBrief</Link>
          <div className="flex gap-4 text-sm items-center">
            <Link href="/trending" className="text-gray-500 hover:text-gray-300 transition-colors">This week</Link>
            <Link href="/trending/today" className={isToday ? 'text-gray-100 font-medium' : 'text-gray-500 hover:text-gray-300 transition-colors'}>
              Today
            </Link>
            <Link href="/auth/login" className="text-gray-500 hover:text-gray-300 transition-colors">Sign in</Link>
            <Link
              href="/"
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              Get digest →
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-8">
        {/* ── Date heading ── */}
        {!isToday && (
          <div className="mb-6">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
              <Link href="/trending/today" className="hover:text-gray-300 transition-colors">
                ← Today
              </Link>
              <span>/</span>
              <span className="text-gray-300">{date}</span>
            </div>
            <h1 className="text-xl font-bold text-gray-100">
              📅 {displayDate}
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Top ML papers scored in PaperBrief digests on this day.
            </p>
          </div>
        )}

        {/* ── The paper list (reuses /trending/today client) ── */}
        <TrendingTodayClient
          papers={papers}
          generatedAt={generatedAt}
          archiveDate={isToday ? undefined : date}
        />

        {/* ── Day navigation ── */}
        {!isToday && (
          <nav className="flex items-center justify-between mt-8 pt-6 border-t border-gray-800 text-sm">
            <Link
              href={`/trending/today/${prev}`}
              className="flex items-center gap-1 text-gray-500 hover:text-gray-300 transition-colors"
            >
              ← {prevDate(date).slice(5)} {/* MM-DD */}
            </Link>

            <Link
              href="/trending/today"
              className="text-gray-600 hover:text-gray-400 transition-colors text-xs"
            >
              Today's picks
            </Link>

            {hasNext ? (
              <Link
                href={`/trending/today/${next}`}
                className="flex items-center gap-1 text-gray-500 hover:text-gray-300 transition-colors"
              >
                {nextDate(date).slice(5)} → {/* MM-DD */}
              </Link>
            ) : (
              <span className="text-gray-700 text-xs">Latest</span>
            )}
          </nav>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-800 mt-16 px-6 py-8 text-center text-xs text-gray-600">
        <p>
          <Link href="/" className="hover:text-gray-400 transition-colors">PaperBrief</Link>
          {' · '}
          <Link href="/trending" className="hover:text-gray-400 transition-colors">Trending This Week</Link>
          {' · '}
          <Link href="/trending/today" className="hover:text-gray-400 transition-colors">Today</Link>
          {' · '}
          <Link href="/today" className="hover:text-gray-400 transition-colors">Paper of the Day</Link>
          {' · '}
          <Link href="/rss" className="hover:text-gray-400 transition-colors">RSS</Link>
        </p>
      </footer>
    </div>
  );
}
