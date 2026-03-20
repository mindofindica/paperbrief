/**
 * /today — Paper of the Day public page
 *
 * Shows today's top ML paper, selected by LLM score from the last 3 days.
 * ISR: revalidates every hour.
 * Public: accessible to anyone — shareable, crawlable, linkable.
 */

import { Metadata } from 'next';
import AppNav from '../components/AppNav';
import { getPaperOfTheDay, generateShareText, getScoreBadge, formatAuthors } from '../../lib/today';

// ── ISR ───────────────────────────────────────────────────────────────────────

export const revalidate = 3600; // 1 hour

// ── SEO ───────────────────────────────────────────────────────────────────────

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://paperbrief.ai';

export async function generateMetadata(): Promise<Metadata> {
  const paper = await getPaperOfTheDay();

  const title = paper
    ? `${paper.title} — Paper of the Day · PaperBrief`
    : 'Paper of the Day — PaperBrief';
  const description = paper
    ? paper.abstract.slice(0, 155)
    : "Today's top ML paper, curated daily from arXiv by PaperBrief.";

  return {
    title,
    description,
    openGraph: {
      title: paper ? paper.title : 'Paper of the Day — PaperBrief',
      description,
      type: 'website',
      url: `${SITE_URL}/today`,
      images: [{ url: `${SITE_URL}/today/opengraph-image` }],
    },
    twitter: {
      card: 'summary_large_image',
      title: paper ? paper.title : 'Paper of the Day — PaperBrief',
      description,
    },
    alternates: {
      canonical: `${SITE_URL}/today`,
      types: {
        'application/rss+xml': `${SITE_URL}/rss/daily`,
      },
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function TodayPage() {
  const paper = await getPaperOfTheDay();

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-gray-950">
      <AppNav />

      <main className="max-w-2xl mx-auto px-6 py-8">
        {/* ── Header badge ── */}
        <div className="flex items-center gap-3 mb-8">
          <span className="text-xs font-semibold bg-blue-600/20 text-blue-400 border border-blue-500/30 px-3 py-1 rounded-full">
            📄 Paper of the Day
          </span>
          <span className="text-xs text-gray-500">{today}</span>
        </div>

        {paper ? (
          <>
            {/* ── Score badge ── */}
            {(() => {
              const badge = getScoreBadge(paper.llmScore);
              return (
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-sm font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-3 py-1 rounded-full">
                    {badge.emoji} {badge.label} · {paper.llmScore.toFixed(1)}
                  </span>
                </div>
              );
            })()}

            {/* ── Title ── */}
            <h1 className="text-2xl font-bold text-gray-100 leading-snug mb-4">
              <a
                href={`/paper/${paper.arxivId}`}
                className="hover:text-blue-400 transition-colors"
              >
                {paper.title}
              </a>
            </h1>

            {/* ── Authors ── */}
            {(() => {
              const { displayed, extra } = formatAuthors(paper.authors);
              return (
                <p className="text-sm text-gray-400 mb-5">
                  {displayed.join(', ')}
                  {extra > 0 && (
                    <span className="text-gray-500"> + {extra} more</span>
                  )}
                </p>
              );
            })()}

            {/* ── Abstract ── */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-5">
              <p className="text-gray-300 text-sm leading-relaxed">
                {paper.abstract.slice(0, 400)}
                {paper.abstract.length > 400 && (
                  <>
                    {'... '}
                    <a
                      href={`/paper/${paper.arxivId}`}
                      className="text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      Read more →
                    </a>
                  </>
                )}
              </p>
            </div>

            {/* ── Categories ── */}
            {paper.categories.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {paper.categories.map((cat) => (
                  <span
                    key={cat}
                    className="text-xs bg-gray-800 text-gray-400 px-2.5 py-1 rounded-full border border-gray-700"
                  >
                    {cat}
                  </span>
                ))}
              </div>
            )}

            {/* ── CTAs ── */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              {/* Twitter share */}
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(generateShareText(paper))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-[#1DA1F2]/10 hover:bg-[#1DA1F2]/20 text-[#1DA1F2] border border-[#1DA1F2]/30 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
              >
                <span>𝕏</span>
                Share on Twitter
              </a>

              {/* Full paper */}
              <a
                href={`/paper/${paper.arxivId}`}
                className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
              >
                Read full paper →
              </a>
            </div>

            {/* ── Signup hook ── */}
            <div className="border border-gray-800 rounded-xl p-5 bg-gray-900/50">
              <p className="text-sm text-gray-400 mb-3">
                Get today's top ML papers delivered to your inbox every morning.
              </p>
              <a
                href="/auth/login"
                className="text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors"
              >
                Get daily papers in your inbox →
              </a>
            </div>
          </>
        ) : (
          /* ── Empty state ── */
          <div className="text-center py-16">
            <p className="text-4xl mb-4">📭</p>
            <h2 className="text-lg font-semibold text-gray-200 mb-2">No paper today yet</h2>
            <p className="text-sm text-gray-500">
              Check back after the daily digest runs at 8am CET.
            </p>
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-800 mt-16 px-6 py-8 text-center text-xs text-gray-600">
        <p>
          <a href="/" className="hover:text-gray-400 transition-colors">PaperBrief</a>
          {' · '}
          <a href="/today" className="hover:text-gray-400 transition-colors">Today</a>
          {' · '}
          <a href="/trending" className="hover:text-gray-400 transition-colors">Trending</a>
          {' · '}
          <a href="/rss" className="hover:text-gray-400 transition-colors">RSS</a>
          {' · '}
          <a href="/rss/daily" className="hover:text-gray-400 transition-colors">Daily RSS</a>
          {' · '}
          Papers from{' '}
          <a href="https://arxiv.org" target="_blank" rel="noopener noreferrer" className="hover:text-gray-400 transition-colors">arXiv</a>
        </p>
      </footer>
    </div>
  );
}
