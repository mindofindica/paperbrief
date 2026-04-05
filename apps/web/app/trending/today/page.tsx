/**
 * /trending/today — Top 5 ML papers from the last 24 hours
 *
 * A focused, shareable "today's picks" page — acquisition hook for Twitter.
 * Shows the 5 highest-scoring papers from the last 24h with score bars,
 * a Twitter share button, and a CTA to get personalised digests.
 *
 * ISR: revalidates every hour.
 * Public: no auth required — shareable, crawlable, linkable.
 */

import { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import TrendingTodayClient from './TrendingTodayClient';

// ── ISR ───────────────────────────────────────────────────────────────────────

export const revalidate = 3600; // 1 hour

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TodayPaper {
  arxiv_id: string;
  title: string;
  abstract: string | null;
  authors: string[];
  categories: string[];
  published_at: string | null;
  avg_score: number;
  appearances: number;
}

// ── SEO ───────────────────────────────────────────────────────────────────────

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://paperbrief.ai';

export const metadata: Metadata = {
  title: "Today's Top 5 ML Papers — PaperBrief",
  description:
    "The 5 highest-scoring machine learning papers from the last 24 hours. Ranked by LLM relevance across PaperBrief researcher digests.",
  openGraph: {
    title: "Today's Top 5 ML Papers",
    description:
      "Which arXiv papers are ML researchers talking about today? Updated hourly.",
    type: 'website',
    url: `${SITE_URL}/trending/today`,
    images: [{ url: `${SITE_URL}/trending/today/opengraph-image` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Today's Top 5 ML Papers — PaperBrief",
    description:
      "The highest-scoring arXiv ML papers from the last 24h, ranked by researcher relevance.",
  },
  alternates: {
    canonical: `${SITE_URL}/trending/today`,
  },
  robots: {
    index: true,
    follow: true,
  },
};

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchTodaysPapers(): Promise<{ papers: TodayPaper[]; generatedAt: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return { papers: [], generatedAt: new Date().toISOString() };
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Try get_trending_papers RPC with 1-day window first
    const { data, error } = await supabase.rpc('get_trending_papers', {
      days: 1,
      lim: 5,
    });

    if (!error && data && data.length > 0) {
      const papers: TodayPaper[] = data.map((row: Record<string, unknown>) => ({
        arxiv_id: row.arxiv_id as string,
        title: row.title as string,
        abstract: (row.abstract as string | null) ?? null,
        authors: (row.authors as string[]) ?? [],
        categories: (row.categories as string[]) ?? [],
        published_at: (row.published_at as string | null) ?? null,
        avg_score: parseFloat(row.avg_score as string),
        appearances: Number(row.appearances),
      }));
      return { papers, generatedAt: new Date().toISOString() };
    }

    // Fallback: query paper_digest_entries (which has llm_score) joined with papers.
    // papers.submitted_date does not exist — use papers.published_at.
    // papers.llm_score does not exist — use paper_digest_entries.llm_score.
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('paper_digest_entries')
      .select('llm_score, papers!inner(arxiv_id, title, abstract, authors, categories, published_at)')
      .gte('date', yesterday)
      .not('llm_score', 'is', null)
      .order('llm_score', { ascending: false })
      .limit(5);

    if (fallbackError || !fallbackData || fallbackData.length === 0) {
      // Second fallback: last 3 days
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data: fallback2 } = await supabase
        .from('paper_digest_entries')
        .select('llm_score, papers!inner(arxiv_id, title, abstract, authors, categories, published_at)')
        .gte('date', threeDaysAgo)
        .not('llm_score', 'is', null)
        .order('llm_score', { ascending: false })
        .limit(5);

      type DigestEntryRow = {
        llm_score: number;
        papers: { arxiv_id: string; title: string; abstract: string | null; authors: string[]; categories: string[]; published_at: string | null; };
      };
      const papers: TodayPaper[] = ((fallback2 ?? []) as DigestEntryRow[]).map((row) => ({
        arxiv_id: row.papers.arxiv_id,
        title: row.papers.title,
        abstract: row.papers.abstract ?? null,
        authors: row.papers.authors ?? [],
        categories: row.papers.categories ?? [],
        published_at: row.papers.published_at ?? null,
        avg_score: Number(row.llm_score),
        appearances: 1,
      }));

      return { papers, generatedAt: new Date().toISOString() };
    }

    type DigestEntryRow = {
      llm_score: number;
      papers: { arxiv_id: string; title: string; abstract: string | null; authors: string[]; categories: string[]; published_at: string | null; };
    };
    const papers: TodayPaper[] = (fallbackData as DigestEntryRow[]).map((row) => ({
      arxiv_id: row.papers.arxiv_id,
      title: row.papers.title,
      abstract: row.papers.abstract ?? null,
      authors: row.papers.authors ?? [],
      categories: row.papers.categories ?? [],
      published_at: row.papers.published_at ?? null,
      avg_score: Number(row.llm_score),
      appearances: 1,
    }));

    return { papers, generatedAt: new Date().toISOString() };
  } catch (err) {
    console.error('[trending/today] unexpected error:', err);
    return { papers: [], generatedAt: new Date().toISOString() };
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function TrendingTodayPage() {
  const { papers, generatedAt } = await fetchTodaysPapers();

  return (
    <div className="min-h-screen bg-gray-950">
      {/* ── Nav ── */}
      <nav className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-lg font-bold text-gray-100">📄 PaperBrief</Link>
          <div className="flex gap-4 text-sm items-center">
            <Link href="/trending" className="text-gray-500 hover:text-gray-300 transition-colors">This week</Link>
            <Link href="/trending/today" className="text-gray-100 font-medium">Today</Link>
            <Link href="/auth/login" className="text-gray-500 hover:text-gray-300 transition-colors">Sign in</Link>
            <Link
              href="/"
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              Get digest →
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <TrendingTodayClient papers={papers} generatedAt={generatedAt} />
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-800 mt-16 px-6 py-8 text-center text-xs text-gray-600">
        <p>
          <Link href="/" className="hover:text-gray-400 transition-colors">PaperBrief</Link>
          {' · '}
          <Link href="/trending" className="hover:text-gray-400 transition-colors">Trending This Week</Link>
          {' · '}
          <Link href="/trending/today" className="hover:text-gray-400 transition-colors">Today</Link>
          {' · '}
          <Link href="/today" className="hover:text-gray-400 transition-colors">Paper of the Day</Link>
          {' · '}
          <Link href="/rss" className="hover:text-gray-400 transition-colors">RSS</Link>
        </p>
      </footer>
    </div>
  );
}
