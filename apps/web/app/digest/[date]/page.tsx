import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '../../../lib/auth';
import { getServiceSupabase } from '../../../lib/supabase';
import PaperCard from '../../components/PaperCard';
import AppNav from '../../components/AppNav';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ date: string }>;
};

function formatDisplayDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return d.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}

function isValidHistoryDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  return dateStr <= new Date().toISOString().slice(0, 10);
}

interface DigestEntry {
  arxiv_id: string;
  track: string;
  llm_score: number | null;
  papers: { title: string; abstract: string | null; authors: string[] | null; published_at: string | null } | null;
}

export default async function DigestDatePage({ params }: PageProps) {
  const { date } = await params;

  if (!isValidHistoryDate(date)) notFound();

  // Auth check
  const cookieStore = await cookies();
  const session = cookieStore.get('pb_session')?.value;
  const auth = session ? verifySessionCookie(session) : { valid: false };
  if (!auth.valid) redirect('/login');

  const supabase = getServiceSupabase();
  const { data: entries } = await supabase
    .from('paper_digest_entries')
    .select('arxiv_id, track, llm_score, papers(title, abstract, authors, published_at)')
    .eq('date', date)
    .order('llm_score', { ascending: false });

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

  if (papers.length === 0) {
    // Check if date exists at all in DB
    const { count } = await supabase
      .from('paper_digest_entries')
      .select('*', { count: 'exact', head: true })
      .eq('date', date);
    if (!count) notFound();
  }

  // Get adjacent dates for navigation
  const { data: prevEntry } = await supabase
    .from('paper_digest_entries')
    .select('date')
    .lt('date', date)
    .order('date', { ascending: false })
    .limit(1)
    .single();

  const { data: nextEntry } = await supabase
    .from('paper_digest_entries')
    .select('date')
    .gt('date', date)
    .order('date', { ascending: true })
    .limit(1)
    .single();

  const today = new Date().toISOString().slice(0, 10);
  const isToday = date === today;

  return (
    <div className="min-h-screen bg-gray-950">
      <AppNav />
      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <header className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/digest" className="hover:text-gray-300 transition-colors">Digest</Link>
            <span>›</span>
            <span className="text-gray-400">{date}</span>
            {isToday && (
              <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-blue-900/50 text-blue-300 font-medium">Today</span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-100">{formatDisplayDate(date)}</h1>
          <p className="text-gray-500 text-sm">
            {papers.length === 0 ? 'No scored papers for this date.' : `${papers.length} paper${papers.length !== 1 ? 's' : ''} · ranked by relevance`}
          </p>
        </header>

        {papers.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
            <div className="text-4xl mb-4">📭</div>
            <p className="text-gray-400">No papers were scored for this date.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {papers.map(p => <PaperCard key={`${p.arxiv_id}-${p.track}`} paper={p} />)}
          </div>
        )}

        <nav className="flex items-center justify-between pt-4 border-t border-gray-800">
          {prevEntry?.date ? (
            <Link href={`/digest/${prevEntry.date}`} className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors">
              <span>←</span>
              <span><span className="text-gray-600 text-xs block">Older</span>{prevEntry.date}</span>
            </Link>
          ) : <div />}
          <Link href="/digest" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">Today</Link>
          {nextEntry?.date ? (
            <Link href={`/digest/${nextEntry.date}`} className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors text-right">
              <span><span className="text-gray-600 text-xs block text-right">Newer</span>{nextEntry.date}</span>
              <span>→</span>
            </Link>
          ) : <div />}
        </nav>
      </main>
    </div>
  );
}
