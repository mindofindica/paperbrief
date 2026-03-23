import Link from 'next/link';
import { getNextDigestTime } from '../../lib/digest-utils';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionCookie } from '../../lib/auth';
import { getServiceSupabase } from '../../lib/supabase';
import PaperCard from '../components/PaperCard';
import AppNav from '../components/AppNav';
import { DigestEmptyState } from './components/DigestEmptyState';

export const dynamic = 'force-dynamic';

interface DigestEntry {
  arxiv_id: string;
  track: string;
  llm_score: number | null;
  papers: {
    title: string;
    abstract: string | null;
    authors: string[] | null;
    published_at: string | null;
  } | null;
}

/**
 * Return the next expected digest delivery time.
 * The pipeline runs daily at 08:30 CET (07:30 UTC).
 *
 * If current UTC time is before 07:30, next run is today at 07:30 UTC.
 * Otherwise next run is tomorrow at 07:30 UTC.
 */
export default async function DigestPage() {
  // Auth check
  const cookieStore = await cookies();
  const session = cookieStore.get('pb_session')?.value;
  const auth = session ? verifySessionCookie(session) : { valid: false };
  if (!auth.valid) redirect('/login');

  const userId = (auth as { valid: true; userId: string }).userId;

  const today = new Date().toISOString().slice(0, 10);
  const displayDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'Europe/Amsterdam',
  });

  const supabase = getServiceSupabase();

  // Fetch digest entries for today
  const { data: entries, error } = await supabase
    .from('paper_digest_entries')
    .select('arxiv_id, track, llm_score, papers(title, abstract, authors, published_at)')
    .eq('date', today)
    .order('llm_score', { ascending: false });

  if (error) console.error('[digest] Supabase error:', error.message);

  const papers = ((entries ?? []) as unknown as DigestEntry[])
    .filter(e => e.papers)
    .map(e => ({
      arxiv_id: e.arxiv_id,
      title: e.papers!.title,
      abstract: e.papers!.abstract,
      published_at: e.papers!.published_at,
      llm_score: e.llm_score,
      track: e.track,
    }));

  // Group by track
  const byTrack = papers.reduce<Record<string, typeof papers>>((acc, p) => {
    const t = p.track ?? 'Other';
    if (!acc[t]) acc[t] = [];
    acc[t].push(p);
    return acc;
  }, {});

  // Get recent dates for nav strip
  const { data: recentEntries } = await supabase
    .from('paper_digest_entries')
    .select('date')
    .lt('date', today)
    .order('date', { ascending: false })
    .limit(10);

  const recentDates = [...new Set((recentEntries ?? []).map(e => e.date))].slice(0, 5);

  // Check track count (needed for context-aware empty state)
  let trackCount = 0;
  if (papers.length === 0 && userId) {
    const { count } = await supabase
      .from('tracks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('active', true);
    trackCount = count ?? 0;
  }

  const nextDigestTime = getNextDigestTime();

  return (
    <div className="min-h-screen bg-gray-950">
      <AppNav />

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-gray-100">{displayDate}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {papers.length === 0
              ? 'Your personalised daily digest'
              : `${papers.length} paper${papers.length !== 1 ? 's' : ''} across ${Object.keys(byTrack).length} track${Object.keys(byTrack).length !== 1 ? 's' : ''}`
            }
          </p>
        </header>

        {/* Date nav strip — only shown when there are past digests */}
        {recentDates.length > 0 && (
          <div className="flex gap-2 text-xs overflow-x-auto pb-1">
            <span className="text-gray-400 self-center shrink-0">Recent:</span>
            {recentDates.map(d => (
              <Link key={d} href={`/digest/${d}`}
                className="px-2 py-1 rounded bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors shrink-0">
                {new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </Link>
            ))}
          </div>
        )}

        {/* Quick links to other features — only when papers are present */}
        {papers.length > 0 && (
          <div className="flex gap-3 flex-wrap text-xs">
            <Link href="/preview" className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors">
              📬 Preview next digest
            </Link>
            <Link href="/gaps" className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors">
              🔍 Find reading gaps
            </Link>
            <Link href="/quiz" className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors">
              🧠 Take a quiz
            </Link>
          </div>
        )}

        {papers.length === 0 ? (
          <DigestEmptyState
            hasNoTracks={trackCount === 0}
            nextDigestTime={nextDigestTime}
          />
        ) : (
          Object.entries(byTrack).map(([track, trackPapers]) => (
            <section key={track} className="space-y-3">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest border-b border-gray-800 pb-2">
                {track}
              </h2>
              {trackPapers.map(p => (
                <PaperCard key={`${p.arxiv_id}-${track}`} paper={p} />
              ))}
            </section>
          ))
        )}
      </main>
    </div>
  );
}
