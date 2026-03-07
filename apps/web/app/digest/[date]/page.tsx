import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPapersByDate, getAdjacentDigestDates, getDigestDates } from '../../../lib/arxiv-db';
import PaperCard from '../../components/PaperCard';
import AppNav from '../../components/AppNav';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ date: string }>;
};

function formatDisplayDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Returns true if `dateStr` is a valid YYYY-MM-DD that isn't in the future */
function isValidHistoryDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const today = new Date().toISOString().slice(0, 10);
  return dateStr <= today;
}

export default async function DigestDatePage({ params }: PageProps) {
  const { date } = await params;

  if (!isValidHistoryDate(date)) {
    notFound();
  }

  const papers = getPapersByDate(date);
  const { prev, next } = getAdjacentDigestDates(date);
  const today = new Date().toISOString().slice(0, 10);
  const isToday = date === today;

  // 404 only if date is reasonable but has absolutely no papers AND is not a
  // known digest date. Keeps things lenient for dev.
  if (papers.length === 0) {
    // Check if date is in digest history at all
    const allDates = getDigestDates(60);
    const known = allDates.some((d) => d.date === date);
    if (!known) notFound();
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <AppNav />

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <header className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/digest" className="hover:text-gray-300 transition-colors">
              Digest
            </Link>
            <span>›</span>
            <span className="text-gray-400">{date}</span>
            {isToday && (
              <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-blue-900/50 text-blue-300 font-medium">
                Today
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-100">
            {formatDisplayDate(date)}
          </h1>
          <p className="text-gray-500 text-sm">
            {papers.length === 0
              ? 'No scored papers for this date.'
              : `${papers.length} paper${papers.length !== 1 ? 's' : ''} · ranked by relevance`}
          </p>
        </header>

        {/* Papers */}
        {papers.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
            <div className="text-4xl mb-4">📭</div>
            <p className="text-gray-400">No papers were scored for this date.</p>
            <p className="text-gray-500 text-sm mt-2">
              The digest pipeline may not have run, or all papers were below the scoring threshold.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {papers.map((paper) => (
              <PaperCard key={paper.arxiv_id} paper={paper} />
            ))}
          </div>
        )}

        {/* Prev / Next navigation */}
        <nav
          aria-label="Date navigation"
          className="flex items-center justify-between pt-4 border-t border-gray-800"
        >
          {prev ? (
            <Link
              href={`/digest/${prev}`}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors group"
            >
              <span aria-hidden="true" className="group-hover:-translate-x-0.5 transition-transform">←</span>
              <span>
                <span className="text-gray-600 text-xs block">Older</span>
                {prev}
              </span>
            </Link>
          ) : (
            <div />
          )}

          <Link
            href="/digest/archive"
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            Archive
          </Link>

          {next ? (
            <Link
              href={`/digest/${next}`}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors group text-right"
            >
              <span>
                <span className="text-gray-600 text-xs block text-right">Newer</span>
                {next}
              </span>
              <span aria-hidden="true" className="group-hover:translate-x-0.5 transition-transform">→</span>
            </Link>
          ) : (
            <div />
          )}
        </nav>
      </main>
    </div>
  );
}
