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
        <header className="space-y-3">
          <h1 className="text-2xl font-bold text-gray-100">Today&apos;s Digest</h1>
          <div className="flex items-center justify-between">
            <p className="text-gray-500 text-sm">
              {displayDate} · {papers.length} papers
            </p>
            <Link
              href="/digest/archive"
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Archive →
            </Link>
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
