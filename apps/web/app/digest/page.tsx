import Link from 'next/link';
import { getTodaysPapers, getDigestDates, getAdjacentDigestDates } from '../../lib/arxiv-db';
import PaperCard from '../components/PaperCard';
import AppNav from '../components/AppNav';

export const dynamic = 'force-dynamic';

export default function DigestPage() {
  const papers = getTodaysPapers();
  const today = new Date().toISOString().slice(0, 10);
  const displayDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Get the most recent past digest date for the "← Previous" link
  const { prev } = getAdjacentDigestDates(today);

  // Recent dates for the mini-history strip (up to 5, excluding today)
  const recentDates = getDigestDates(6).filter((d) => d.date !== today).slice(0, 5);

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Nav */}
      <nav className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <a href="/digest" className="text-lg font-bold text-gray-100">📄 PaperBrief</a>
          <div className="flex gap-4 text-sm">
            <a href="/digest" className="text-gray-100 font-medium">Digest</a>
            <a href="/weekly" className="text-gray-500 hover:text-gray-300 transition-colors">Weekly</a>
            <a href="/search" className="text-gray-500 hover:text-gray-300 transition-colors">Search</a>
            <a href="/reading-list" className="text-gray-500 hover:text-gray-300 transition-colors">Reading List</a>
          </div>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <header>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-100">Today&apos;s Digest</h1>
              <p className="text-gray-500 text-sm mt-1">{today} · {papers.length} papers</p>
            </div>
            <a
              href="/rss"
              title="Subscribe via RSS"
              className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 transition-colors border border-orange-800 hover:border-orange-600 rounded-lg px-3 py-1.5 shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19.01 7.38 20 6.18 20C4.98 20 4 19.01 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z"/>
              </svg>
              RSS
            </a>
          </div>
        </header>

        {/* Recent digests strip */}
        {recentDates.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {recentDates.map(({ date }) => (
              <Link
                key={date}
                href={`/digest/${date}`}
                className="px-3 py-1.5 text-xs rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors"
              >
                {date}
              </Link>
            ))}
          </div>
        )}

        {papers.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
            <div className="text-4xl mb-4">📭</div>
            <p className="text-gray-400">No papers yet today. Check back later!</p>
            {prev && (
              <Link
                href={`/digest/${prev}`}
                className="mt-4 inline-block text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                ← View {prev}
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {papers.map((paper) => (
              <PaperCard key={paper.arxiv_id} paper={paper} />
            ))}
          </div>
        )}

        {/* Bottom nav */}
        {prev && (
          <div className="flex justify-start pt-4 border-t border-gray-800">
            <Link
              href={`/digest/${prev}`}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors group"
            >
              <span aria-hidden="true" className="group-hover:-translate-x-0.5 transition-transform">←</span>
              <span>
                <span className="text-gray-600 text-xs block">Previous digest</span>
                {prev}
              </span>
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
