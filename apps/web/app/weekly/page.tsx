import { getWeeklyPapers, getWeeklyStats, getWeeklyKeywordTrends } from '../../lib/arxiv-db';
import PaperCard from '../components/PaperCard';

export const dynamic = 'force-dynamic';

const TRACK_COLORS: Record<string, string> = {
  'cs.AI': 'bg-blue-900/60 text-blue-200 border-blue-800',
  'cs.LG': 'bg-purple-900/60 text-purple-200 border-purple-800',
  'cs.CL': 'bg-green-900/60 text-green-200 border-green-800',
  'cs.CV': 'bg-orange-900/60 text-orange-200 border-orange-800',
  'stat.ML': 'bg-pink-900/60 text-pink-200 border-pink-800',
  default: 'bg-gray-800 text-gray-300 border-gray-700',
};

function getTrackColor(track: string): string {
  return TRACK_COLORS[track] ?? TRACK_COLORS.default;
}

export default function WeeklyPage() {
  const sections = getWeeklyPapers();
  const stats = getWeeklyStats();
  const trends = getWeeklyKeywordTrends(18);

  const risingKeywords = trends.filter(t => t.direction === 'rising');
  const stableKeywords = trends.filter(t => t.direction === 'stable');

  const weekLabel = (() => {
    const from = new Date(stats.fromDate + 'T12:00:00Z');
    const to = new Date(stats.toDate + 'T12:00:00Z');
    const fmt = (d: Date) =>
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${fmt(from)} – ${fmt(to)}`;
  })();

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Nav */}
      <nav className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <a href="/digest" className="text-lg font-bold text-gray-100">📄 PaperBrief</a>
          <div className="flex gap-4 text-sm">
            <a href="/digest" className="text-gray-500 hover:text-gray-300 transition-colors">Digest</a>
            <a href="/weekly" className="text-gray-100 font-medium">Weekly</a>
            <a href="/search" className="text-gray-500 hover:text-gray-300 transition-colors">Search</a>
            <a href="/reading-list" className="text-gray-500 hover:text-gray-300 transition-colors">Reading List</a>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-6 py-8 space-y-10">

        {/* Header */}
        <header className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-100">📅 Weekly Digest</h1>
          </div>
          <p className="text-gray-500 text-sm">{weekLabel}</p>

          {/* Stats row */}
          {stats.totalPapers > 0 && (
            <div className="flex items-center gap-4 pt-2 text-sm">
              <span className="text-gray-400">
                <span className="text-gray-100 font-semibold">{stats.totalPapers}</span> papers
              </span>
              <span className="text-gray-700">·</span>
              <span className="text-gray-400">
                <span className="text-gray-100 font-semibold">{sections.length}</span> tracks
              </span>
              {stats.topTrack && (
                <>
                  <span className="text-gray-700">·</span>
                  <span className="text-gray-400">
                    Top: <span className={`text-xs px-2 py-0.5 rounded-full font-medium ml-1 ${getTrackColor(stats.topTrack)}`}>
                      {stats.topTrack}
                    </span>
                  </span>
                </>
              )}
            </div>
          )}
        </header>

        {/* Trending Keywords */}
        {trends.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              📈 Trending This Week
            </h2>

            {risingKeywords.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-gray-600 uppercase tracking-wide font-medium">Rising</p>
                <div className="flex flex-wrap gap-2">
                  {risingKeywords.map(({ keyword, count, pctChange }) => (
                    <span
                      key={keyword}
                      className="flex items-center gap-1.5 bg-emerald-900/30 border border-emerald-800/50 text-emerald-300 text-xs px-3 py-1 rounded-full"
                      title={pctChange !== null ? `+${pctChange}% vs prior week (${count} papers)` : `New this week (${count} papers)`}
                    >
                      <span>↑</span>
                      <span>{keyword}</span>
                      <span className="text-emerald-500 font-mono">
                        {pctChange !== null ? `+${pctChange}%` : 'new'}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {stableKeywords.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-gray-600 uppercase tracking-wide font-medium">Consistent interests</p>
                <div className="flex flex-wrap gap-2">
                  {stableKeywords.map(({ keyword, count }) => (
                    <span
                      key={keyword}
                      className="bg-gray-800/60 border border-gray-700 text-gray-400 text-xs px-3 py-1 rounded-full"
                      title={`${count} papers this week`}
                    >
                      {keyword}
                      <span className="text-gray-600 ml-1 font-mono">{count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Papers by Track */}
        {sections.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
            <div className="text-4xl mb-4">📭</div>
            <p className="text-gray-400">No papers yet this week. Check back after the next digest run!</p>
          </div>
        ) : (
          <div className="space-y-10">
            {sections.map(({ track, papers }) => (
              <section key={track} className="space-y-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-base font-semibold text-gray-200">{track}</h2>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${getTrackColor(track)}`}>
                    {papers.length} paper{papers.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="space-y-4">
                  {papers.slice(0, 5).map((paper) => (
                    <PaperCard key={paper.arxiv_id} paper={paper} />
                  ))}
                  {papers.length > 5 && (
                    <p className="text-xs text-gray-600 pl-1">
                      + {papers.length - 5} more in this track — use{' '}
                      <a href="/search" className="text-blue-500 hover:text-blue-400">Search</a> to find them
                    </p>
                  )}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Footer */}
        <footer className="pt-4 border-t border-gray-800">
          <div className="flex items-center justify-between text-xs text-gray-600">
            <a href="/digest" className="hover:text-gray-400 transition-colors">← Back to today&apos;s digest</a>
            <span>Updated daily by arxiv-coach</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
