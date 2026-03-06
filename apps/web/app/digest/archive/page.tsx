import Link from 'next/link';
import { getDigestDates } from '../../../lib/arxiv-db';
import AppNav from '../../components/AppNav';

export const dynamic = 'force-dynamic';

function formatShortDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function groupByMonth(dates: { date: string; paperCount: number }[]) {
  const groups: Record<string, { date: string; paperCount: number }[]> = {};
  for (const item of dates) {
    const [year, month] = item.date.split('-');
    const key = `${year}-${month}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}

function monthLabel(key: string): string {
  const [year, month] = key.split('-');
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function DigestArchivePage() {
  const dates = getDigestDates(60);
  const today = new Date().toISOString().slice(0, 10);
  const groups = groupByMonth(dates);
  const monthKeys = Object.keys(groups).sort().reverse();

  return (
    <div className="min-h-screen bg-gray-950">
      <AppNav />

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/digest" className="hover:text-gray-300 transition-colors">
              Digest
            </Link>
            <span>›</span>
            <span className="text-gray-400">Archive</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-100">Digest Archive</h1>
          <p className="text-gray-500 text-sm">
            {dates.length} digest{dates.length !== 1 ? 's' : ''} · click any date to read
          </p>
        </header>

        {dates.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
            <div className="text-4xl mb-4">📭</div>
            <p className="text-gray-400">No digest history found yet.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {monthKeys.map((monthKey) => (
              <section key={monthKey}>
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
                  {monthLabel(monthKey)}
                </h2>
                <div className="space-y-1">
                  {groups[monthKey].map(({ date, paperCount }) => {
                    const isToday = date === today;
                    return (
                      <Link
                        key={date}
                        href={`/digest/${date}`}
                        className="flex items-center justify-between px-4 py-3 rounded-lg bg-gray-900 border border-gray-800 hover:border-gray-600 hover:bg-gray-800/60 transition-colors group"
                      >
                        <span className="flex items-center gap-3">
                          <span className="text-sm text-gray-200 group-hover:text-white transition-colors">
                            {formatShortDate(date)}
                          </span>
                          {isToday && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-blue-900/50 text-blue-300 font-medium">
                              Today
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-3">
                          {paperCount > 0 && (
                            <span className="text-xs text-gray-500">
                              {paperCount} paper{paperCount !== 1 ? 's' : ''}
                            </span>
                          )}
                          <span className="text-gray-600 group-hover:text-gray-400 transition-colors text-sm" aria-hidden="true">
                            →
                          </span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
