/**
 * /rss — Feed directory page
 *
 * Lists all available PaperBrief RSS feeds (full digest + per-track).
 * Serves as a human-readable landing page; the actual XML feed is at GET /rss.
 */

import { getAvailableTracks } from '../../lib/arxiv-db';

export const dynamic = 'force-dynamic';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://paperbrief.ai';

function RssIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19.01 7.38 20 6.18 20C4.98 20 4 19.01 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z" />
    </svg>
  );
}

function FeedRow({
  href,
  title,
  description,
  badge,
}: {
  href: string;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-gray-900 border border-gray-800 hover:border-orange-700 transition-colors group">
      <div className="flex items-start gap-3 min-w-0">
        <RssIcon className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-gray-100 font-medium group-hover:text-orange-300 transition-colors">
              {title}
            </span>
            {badge && (
              <span className="text-[10px] font-semibold uppercase tracking-wider bg-orange-900/40 text-orange-400 border border-orange-800 rounded px-1.5 py-0.5">
                {badge}
              </span>
            )}
          </div>
          <p className="text-gray-500 text-sm mt-0.5">{description}</p>
        </div>
      </div>
      <a
        href={href}
        className="shrink-0 text-xs text-orange-400 hover:text-orange-300 border border-orange-800 hover:border-orange-600 rounded-lg px-3 py-1.5 transition-colors font-medium"
      >
        Subscribe
      </a>
    </div>
  );
}

export default function RssIndexPage() {
  let tracks: Array<{ track: string; paperCount: number }> = [];
  try {
    tracks = getAvailableTracks();
  } catch {
    // DB unavailable — still render page with just the full feed
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Nav */}
      <nav className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <a href="/digest" className="text-lg font-bold text-gray-100">
            📄 PaperBrief
          </a>
          <div className="flex gap-4 text-sm">
            <a
              href="/digest"
              className="text-gray-500 hover:text-gray-300 transition-colors"
            >
              Digest
            </a>
            <a
              href="/search"
              className="text-gray-500 hover:text-gray-300 transition-colors"
            >
              Search
            </a>
            <a
              href="/reading-list"
              className="text-gray-500 hover:text-gray-300 transition-colors"
            >
              Reading List
            </a>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-6 py-12 space-y-8">
        {/* Header */}
        <header className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-orange-900/30 border border-orange-800 mb-2">
            <RssIcon className="w-7 h-7 text-orange-400" />
          </div>
          <h1 className="text-3xl font-bold text-gray-100">RSS Feeds</h1>
          <p className="text-gray-400 max-w-md mx-auto">
            Subscribe to PaperBrief in your favourite RSS reader — Feedly,
            NetNewsWire, Inoreader, or any app that supports RSS 2.0.
          </p>
        </header>

        {/* How-to hint */}
        <div className="bg-blue-950/40 border border-blue-800/50 rounded-xl p-4 text-sm text-blue-300 space-y-1">
          <p className="font-medium text-blue-200">How to subscribe</p>
          <p>
            Copy a feed URL below and paste it into your RSS reader&apos;s
            &ldquo;Add feed&rdquo; dialog. Papers update once per day after the
            daily digest runs.
          </p>
        </div>

        {/* Full digest feed */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Full digest
          </h2>
          <FeedRow
            href={`${SITE_URL}/rss`}
            title="All tracks · Last 14 days"
            description="Every high-scored paper across all research tracks, sorted by relevance."
            badge="Recommended"
          />
        </section>

        {/* Per-track feeds */}
        {tracks.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              Per-track feeds
            </h2>
            <p className="text-gray-500 text-sm">
              Only want papers from a specific research area? Subscribe to a
              focused track feed.
            </p>
            <div className="space-y-2">
              {tracks.map(({ track, paperCount }) => {
                const feedUrl = `${SITE_URL}/rss?track=${encodeURIComponent(track)}`;
                return (
                  <FeedRow
                    key={track}
                    href={feedUrl}
                    title={track}
                    description={`${paperCount.toLocaleString()} papers tracked`}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* Advanced usage */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Advanced
          </h2>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4 text-sm font-mono">
            <div>
              <p className="text-gray-500 font-sans text-xs mb-2 font-medium uppercase tracking-wider">
                URL parameters
              </p>
              <table className="w-full text-xs">
                <tbody className="divide-y divide-gray-800">
                  {[
                    ['track', 'Research track name (URL-encoded)', 'all tracks'],
                    ['days', 'Days to look back (1–30)', '14'],
                    ['limit', 'Max papers returned (1–100)', '50'],
                    ['min_score', 'Minimum relevance score (1–5)', '3'],
                  ].map(([param, desc, def]) => (
                    <tr key={param}>
                      <td className="py-2 pr-4 text-orange-400 font-mono">{param}</td>
                      <td className="py-2 pr-4 text-gray-300 font-sans">{desc}</td>
                      <td className="py-2 text-gray-500 font-sans">default: {def}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <p className="text-gray-500 font-sans text-xs mb-2 font-medium uppercase tracking-wider">
                Example
              </p>
              <code className="text-orange-300 break-all">
                {`${SITE_URL}/rss?track=RAG+%26+Grounding&days=7&min_score=4`}
              </code>
              <p className="text-gray-500 font-sans text-xs mt-1">
                → RAG papers from last 7 days, score ≥ 4/5 only
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
