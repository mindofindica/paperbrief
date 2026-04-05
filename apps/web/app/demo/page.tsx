/**
 * /demo — Public sample digest page
 *
 * Shows a curated set of top-scoring papers from the last 7 days, grouped by
 * track — like a real PaperBrief digest but public and unauthenticated.
 *
 * Goal: Let anyone (e.g. Dhruv, Twitter visitors) see the actual product
 *       experience before signing up.
 *
 * ISR: revalidates every 3 hours.
 * Public: no auth, crawlable, shareable.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { getWeeklyPapers, getWeeklyStats } from '../../lib/arxiv-db';
import DemoDigestClient from './DemoDigestClient';

export const revalidate = 10800; // 3 hours

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DemoPaper {
  arxiv_id: string;
  title: string;
  abstract: string | null;
  authors: string[];
  published_at: string | null;
  score: number;
  track: string;
}

export interface DemoTrack {
  name: string;
  papers: DemoPaper[];
}

// ── SEO ───────────────────────────────────────────────────────────────────────

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://paperbrief.ai';

export const metadata: Metadata = {
  title: 'Sample ML Research Digest — PaperBrief',
  description:
    'See what a PaperBrief digest looks like — top ML papers from this week, ranked by AI relevance score across LLM agents, reasoning, and fine-tuning research tracks.',
  openGraph: {
    title: 'Sample ML Research Digest — PaperBrief',
    description:
      'A live preview of the weekly digest PaperBrief sends to ML researchers. Real papers, real scores, zero noise.',
    type: 'website',
    url: `${SITE_URL}/demo`,
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sample ML Research Digest — PaperBrief',
    description:
      'Real papers, real AI relevance scores. This is what a personalised PaperBrief digest looks like.',
  },
  alternates: {
    canonical: `${SITE_URL}/demo`,
  },
  robots: {
    index: true,
    follow: true,
  },
};

// ── Demo profile ──────────────────────────────────────────────────────────────

const DEMO_PROFILE = {
  name: 'Sample Researcher',
  tracks: ['LLM Agents / Tool Use', 'Reasoning & Planning', 'Fine-tuning & Alignment'],
  note: 'This is a live sample digest based on real papers scored this week.',
};

// ── Data fetching ─────────────────────────────────────────────────────────────

function getDemoData(): { tracks: DemoTrack[]; stats: { totalPapers: number; weekRange: string } } {
  try {
    const weeklyPapers = getWeeklyPapers();
    const weeklyStats = getWeeklyStats();

    // Take top 3 tracks, up to 4 papers each — enough to show the product
    const tracks: DemoTrack[] = weeklyPapers
      .slice(0, 4)
      .map(({ track, papers }) => ({
        name: track,
        papers: papers.slice(0, 4).map((p) => {
          let authors: string[] = [];
          try {
            const parsed = JSON.parse(p.authors ?? '[]');
            authors = Array.isArray(parsed) ? parsed : [];
          } catch {
            authors = p.authors ? [p.authors] : [];
          }
          return {
            arxiv_id: p.arxiv_id,
            title: p.title,
            abstract: p.abstract,
            authors,
            published_at: p.published_at ?? null,
            score: p.llm_score ?? 0,
            track,
          };
        }),
      }))
      .filter((t) => t.papers.length > 0);

    const weekRange = weeklyStats.fromDate && weeklyStats.toDate
      ? `${weeklyStats.fromDate} – ${weeklyStats.toDate}`
      : new Date().toISOString().slice(0, 10);

    return {
      tracks,
      stats: {
        totalPapers: weeklyStats.totalPapers,
        weekRange,
      },
    };
  } catch {
    return { tracks: [], stats: { totalPapers: 0, weekRange: '' } };
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DemoPage() {
  const { tracks, stats } = getDemoData();

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* ── Nav ── */}
      <nav className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-lg font-bold text-gray-100">📄 PaperBrief</Link>
          <div className="flex gap-3 text-sm items-center">
            <Link href="/trending" className="text-gray-500 hover:text-gray-300 transition-colors">Trending</Link>
            <Link href="/pricing" className="text-gray-500 hover:text-gray-300 transition-colors">Pricing</Link>
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
        {/* ── Demo banner ── */}
        <div className="bg-blue-950/50 border border-blue-800/60 rounded-xl px-5 py-4 mb-8 flex items-start gap-3">
          <span className="text-blue-400 text-lg mt-0.5">👀</span>
          <div>
            <p className="text-blue-300 text-sm font-medium">This is a live sample digest</p>
            <p className="text-blue-400/70 text-xs mt-0.5">
              Real papers, real AI scores — updated every 3 hours from this week&apos;s arXiv submissions.
              {' '}
              <Link href="/" className="underline hover:text-blue-300 transition-colors">
                Join the waitlist
              </Link>
              {' '}to get yours personalised to your research tracks.
            </p>
          </div>
        </div>

        {/* ── Digest header ── */}
        <header className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">📬</span>
            <h1 className="text-2xl font-bold">Weekly ML Research Digest</h1>
          </div>
          <p className="text-gray-500 text-sm">
            {stats.weekRange ? `Week of ${stats.weekRange}` : 'This week'} ·{' '}
            {tracks.reduce((n, t) => n + t.papers.length, 0)} papers selected from{' '}
            {stats.totalPapers > 0 ? `${stats.totalPapers.toLocaleString()} scored this week` : 'this week\'s submissions'}
          </p>

          {/* Sample profile */}
          <div className="mt-4 flex items-center gap-2 text-xs text-gray-600">
            <span>🎯</span>
            <span>
              Research tracks:{' '}
              {DEMO_PROFILE.tracks.map((t, i) => (
                <span key={t}>
                  <span className="text-gray-500">{t}</span>
                  {i < DEMO_PROFILE.tracks.length - 1 && (
                    <span className="mx-1 text-gray-700">·</span>
                  )}
                </span>
              ))}
            </span>
          </div>
        </header>

        {/* ── Digest body ── */}
        {tracks.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-4">🔍</div>
            <p className="text-gray-400 font-medium">No papers scored this week yet</p>
            <p className="text-gray-600 text-sm mt-2">
              The scoring pipeline runs daily — check back later.
            </p>
          </div>
        ) : (
          <DemoDigestClient tracks={tracks} />
        )}

        {/* ── CTA ── */}
        <div className="mt-12 p-6 bg-gray-900 border border-gray-800 rounded-xl text-center">
          <p className="text-lg font-semibold text-gray-100 mb-1">
            Want this for your research?
          </p>
          <p className="text-gray-400 text-sm mb-5 max-w-sm mx-auto">
            Set your own research tracks and get a personalised weekly digest of the papers
            that actually matter to your work — ranked, scored, and ready to read.
          </p>
          <Link
            href="/"
            className="inline-block bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm px-6 py-2.5 rounded-lg transition-colors"
          >
            Join the waitlist — free →
          </Link>
          <p className="text-gray-600 text-xs mt-3">No credit card. 2 minutes to set up.</p>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-800 mt-16 px-6 py-8 text-center text-xs text-gray-600">
        <p>
          <Link href="/" className="hover:text-gray-400 transition-colors">PaperBrief</Link>
          {' · '}
          <Link href="/trending" className="hover:text-gray-400 transition-colors">Trending</Link>
          {' · '}
          <Link href="/rss" className="hover:text-gray-400 transition-colors">RSS</Link>
          {' · '}
          Papers from{' '}
          <a href="https://arxiv.org" target="_blank" rel="noopener noreferrer" className="hover:text-gray-400 transition-colors">
            arXiv
          </a>
          {' · '}
          Ranked by AI relevance scoring
        </p>
      </footer>
    </div>
  );
}
