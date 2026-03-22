/**
 * /daily/[date] — Public daily ML research digest page.
 *
 * Publicly accessible (no auth required). Shows the top 10 scored papers
 * for a given YYYY-MM-DD date, sorted by llm_score descending.
 *
 * Caching strategy:
 *  - Past dates: permanent cache (revalidate: false via ISR — content never changes)
 *  - Today: revalidate every hour so freshly-scored papers appear
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getTopPapersForDate,
  getAdjacentDailyDates,
  formatDailyDate,
  formatDailyDateLong,
  isValidDate,
  getTwitterShareUrl,
  getDailyPageUrl,
  scoreIcon,
  type DailyPaper,
} from '../../../lib/daily-digest';

// ---------------------------------------------------------------------------
// ISR / caching
// ---------------------------------------------------------------------------

export const dynamic = 'force-static';
export const revalidate = 3600; // 1 hour — overridden per-page below for past dates

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

type PageProps = {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ track?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { date } = await params;
  if (!isValidDate(date)) {
    return { title: 'Not Found | PaperBrief' };
  }

  const formatted = formatDailyDate(date);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://paperbrief.ai';

  return {
    title: `ML Research Digest — ${formatted} | PaperBrief`,
    description: `Top ML papers from arXiv on ${formatted}. Ranked by relevance score. Covers cs.AI, cs.LG, cs.CL, cs.CV and more.`,
    openGraph: {
      title: `ML Research Digest — ${formatted}`,
      description: `Top ML papers from arXiv on ${formatted}, ranked by AI relevance score.`,
      url: `${siteUrl}/daily/${date}`,
      siteName: 'PaperBrief',
      type: 'article',
      publishedTime: `${date}T12:00:00Z`,
    },
    twitter: {
      card: 'summary_large_image',
      title: `ML Research Digest — ${formatted} | PaperBrief`,
      description: `Top ML papers from arXiv on ${formatted}, ranked by AI relevance score.`,
    },
    alternates: {
      canonical: `${siteUrl}/daily/${date}`,
    },
  };
}

// ---------------------------------------------------------------------------
// Track colour mapping (mirrors PaperCard)
// ---------------------------------------------------------------------------

const TRACK_COLORS: Record<string, string> = {
  'cs.AI': 'bg-blue-900/60 text-blue-200',
  'cs.LG': 'bg-purple-900/60 text-purple-200',
  'cs.CL': 'bg-green-900/60 text-green-200',
  'cs.CV': 'bg-orange-900/60 text-orange-200',
  'stat.ML': 'bg-pink-900/60 text-pink-200',
};

function trackColor(track: string | null) {
  return track && TRACK_COLORS[track] ? TRACK_COLORS[track] : 'bg-gray-800 text-gray-300';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PublicPaperCard({ paper, rank }: { paper: DailyPaper; rank: number }) {
  const abstract = paper.abstract
    ? paper.abstract.length > 240
      ? paper.abstract.slice(0, 240) + '…'
      : paper.abstract
    : 'No abstract available.';

  const authors = paper.authors
    ? Array.isArray(paper.authors)
      ? paper.authors.slice(0, 3).join(', ') + (paper.authors.length > 3 ? ' et al.' : '')
      : null
    : null;

  const icon = scoreIcon(paper.llm_score);

  return (
    <article className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-3 hover:border-gray-700 transition-colors">
      <div className="flex items-start gap-3">
        {/* Rank badge */}
        <span className="shrink-0 w-7 h-7 rounded-full bg-gray-800 text-gray-500 text-xs font-mono flex items-center justify-center mt-0.5">
          {rank}
        </span>

        <div className="flex-1 min-w-0 space-y-2">
          {/* Title */}
          <h2 className="text-base font-semibold leading-snug">
            <a
              href={`https://arxiv.org/abs/${paper.arxiv_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-100 hover:text-blue-300 transition-colors"
            >
              {paper.title}
            </a>
          </h2>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-lg leading-none" title={`Score: ${paper.llm_score}`}>
              {icon}
            </span>
            <span className="text-gray-500 font-mono">{paper.llm_score.toFixed(1)}</span>
            {paper.track && (
              <span className={`px-2 py-0.5 rounded-full font-medium ${trackColor(paper.track)}`}>
                {paper.track}
              </span>
            )}
            {authors && <span className="text-gray-500 truncate max-w-xs">{authors}</span>}
            <a
              href={`https://arxiv.org/abs/${paper.arxiv_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 transition-colors ml-auto shrink-0"
            >
              arxiv ↗
            </a>
          </div>

          {/* Abstract */}
          <p className="text-sm text-gray-400 leading-relaxed">{abstract}</p>
        </div>
      </div>
    </article>
  );
}

function SignupCTA() {
  return (
    <div className="bg-gradient-to-br from-indigo-950/60 to-purple-950/60 border border-indigo-800/50 rounded-xl p-6 text-center space-y-3">
      <div className="text-2xl">📬</div>
      <h3 className="text-base font-semibold text-gray-100">Get this in your inbox daily</h3>
      <p className="text-sm text-gray-400">
        PaperBrief ranks 500+ arXiv papers every day and delivers the ones that matter to you —
        free.
      </p>
      <a
        href="/"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
      >
        Start free at paperbrief.ai →
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function DailyDigestPage({ params, searchParams }: PageProps) {
  const { date } = await params;
  const { track } = await searchParams;

  if (!isValidDate(date)) notFound();

  const [papers, adjacent] = await Promise.all([
    getTopPapersForDate(date, 10, track),
    getAdjacentDailyDates(date),
  ]);

  if (papers.length === 0 && !track) {
    // No papers at all for this date — 404
    notFound();
  }

  const today = new Date().toISOString().slice(0, 10);
  const isToday = date === today;
  const tweetUrl = getTwitterShareUrl(date);
  const pageUrl = getDailyPageUrl(date);
  const longDate = formatDailyDateLong(date);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Minimal public nav — no auth required */}
      <nav className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-lg font-bold text-gray-100 hover:text-white transition-colors">
            📄 PaperBrief
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/daily" className="text-indigo-400 font-medium">Daily</Link>
            <Link href="/search" className="text-gray-500 hover:text-gray-300 transition-colors">Search</Link>
            <Link
              href="/auth/login"
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <header className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/daily" className="hover:text-gray-300 transition-colors">Daily Digest</Link>
            <span>›</span>
            <span className="text-gray-400">{date}</span>
            {isToday && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-green-900/50 text-green-300 font-medium">
                Today
              </span>
            )}
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-100">{longDate}</h1>
              <p className="text-gray-500 text-sm mt-1">
                {papers.length === 0
                  ? 'No papers matched this filter.'
                  : `Top ${papers.length} paper${papers.length !== 1 ? 's' : ''} · ranked by AI relevance score`}
                {track && (
                  <span className="ml-2 px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 text-xs">
                    {track}
                    <Link href={`/daily/${date}`} className="ml-1 text-gray-600 hover:text-gray-400">×</Link>
                  </span>
                )}
              </p>
            </div>

            {/* Share button */}
            <a
              href={tweetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200 text-xs transition-colors"
              title="Share on X/Twitter"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              Share
            </a>
          </div>

          {/* Copy link */}
          <div className="flex items-center gap-2 p-3 bg-gray-900 border border-gray-800 rounded-lg text-xs">
            <span className="text-gray-500 flex-1 truncate font-mono">{pageUrl}</span>
            <a
              href={tweetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
            >
              Tweet →
            </a>
          </div>
        </header>

        {/* Papers */}
        {papers.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
            <div className="text-4xl mb-4">📭</div>
            <p className="text-gray-400">No papers matched this filter for {date}.</p>
            <Link href={`/daily/${date}`} className="mt-4 inline-block text-sm text-indigo-400 hover:text-indigo-300">
              View all papers →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {papers.map((paper, i) => (
              <PublicPaperCard key={paper.arxiv_id} paper={paper} rank={i + 1} />
            ))}
          </div>
        )}

        {/* CTA */}
        <SignupCTA />

        {/* Prev / Next navigation */}
        <nav className="flex items-center justify-between pt-4 border-t border-gray-800">
          {adjacent.prev ? (
            <Link
              href={`/daily/${adjacent.prev}`}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
            >
              <span>←</span>
              <span>
                <span className="text-gray-600 text-xs block">Older</span>
                {adjacent.prev}
              </span>
            </Link>
          ) : (
            <div />
          )}

          <Link href="/daily" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
            Archive
          </Link>

          {adjacent.next ? (
            <Link
              href={`/daily/${adjacent.next}`}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors text-right"
            >
              <span>
                <span className="text-gray-600 text-xs block text-right">Newer</span>
                {adjacent.next}
              </span>
              <span>→</span>
            </Link>
          ) : (
            <div />
          )}
        </nav>
      </main>
    </div>
  );
}
