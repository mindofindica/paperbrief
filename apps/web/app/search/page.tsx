import { searchPapers } from '../../lib/arxiv-db';
import PaperCard from '../components/PaperCard';
import AppNav from '../components/AppNav';

export const dynamic = 'force-dynamic';

type SearchPageProps = {
  searchParams: Promise<{
    query?: string;
    track?: string;
    from?: string;
    limit?: string;
  }>;
};

function parseLimit(raw: string | undefined): number {
  const parsed = Number(raw ?? '10');
  if (!Number.isFinite(parsed)) return 10;
  return Math.min(Math.max(Math.trunc(parsed), 1), 20);
}

function parseFromDate(raw: string | undefined): string | null {
  if (!raw) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const query = params.query?.trim() ?? '';
  const track = params.track?.trim() ?? '';
  const from = parseFromDate(params.from);
  const limit = parseLimit(params.limit);

  const papers = query
    ? searchPapers({
        query,
        track: track || null,
        fromDate: from,
        limit,
      })
    : [];

  return (
    <div className="min-h-screen bg-gray-950">
      <nav className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <a href="/digest" className="text-lg font-bold text-gray-100">📄 PaperBrief</a>
          <div className="flex gap-4 text-sm">
            <a href="/digest" className="text-gray-500 hover:text-gray-300 transition-colors">Digest</a>
            <a href="/weekly" className="text-gray-500 hover:text-gray-300 transition-colors">Weekly</a>
            <a href="/search" className="text-gray-100 font-medium">Search</a>
            <a href="/reading-list" className="text-gray-500 hover:text-gray-300 transition-colors">Reading List</a>
          </div>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-gray-100">Search Papers</h1>
          <p className="text-gray-500 text-sm mt-1">FTS over title + abstract from your arxiv-coach database</p>
        </header>

        <form className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4" method="GET" action="/search">
          <div>
            <label htmlFor="query" className="block text-sm text-gray-300 mb-1">Query</label>
            <input
              id="query"
              name="query"
              type="text"
              defaultValue={query}
              placeholder="speculative decoding"
              className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-gray-100 placeholder:text-gray-500 focus:border-blue-600 focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="track" className="block text-sm text-gray-300 mb-1">Track</label>
              <input
                id="track"
                name="track"
                type="text"
                defaultValue={track}
                placeholder="LLM Efficiency"
                className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-gray-100 placeholder:text-gray-500 focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="from" className="block text-sm text-gray-300 mb-1">From Date</label>
              <input
                id="from"
                name="from"
                type="date"
                defaultValue={from ?? ''}
                className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-gray-100 focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="limit" className="block text-sm text-gray-300 mb-1">Limit</label>
              <input
                id="limit"
                name="limit"
                type="number"
                min={1}
                max={20}
                defaultValue={limit}
                className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-gray-100 focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-lg bg-blue-700 hover:bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors"
            >
              Search
            </button>
            <a
              href="/search"
              className="rounded-lg border border-gray-700 hover:border-gray-600 px-4 py-2 text-sm text-gray-300 transition-colors"
            >
              Reset
            </a>
          </div>
        </form>

        {query && (
          <p className="text-sm text-gray-500">
            {papers.length} result{papers.length === 1 ? '' : 's'} for "{query}"
          </p>
        )}

        {!query ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
            <div className="text-4xl mb-4">🔎</div>
            <p className="text-gray-400">Enter a query to search papers.</p>
          </div>
        ) : papers.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
            <div className="text-4xl mb-4">📭</div>
            <p className="text-gray-400">No papers matched your filters.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {papers.map((paper) => (
              <PaperCard key={paper.arxiv_id} paper={paper} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
