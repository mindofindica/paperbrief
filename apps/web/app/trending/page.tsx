/**
 * /trending — Public trending papers page (no auth required)
 *
 * Shows the top-20 ML papers from the last 7 days, ranked by:
 *   1. Average LLM relevance score across all user digests
 *   2. Number of appearances (how many digests included this paper)
 *
 * ISR: revalidates every 6 hours.
 * SEO: full Open Graph + structured data for Google.
 * Public: accessible to anyone — shareable, crawlable, linkable.
 */

import { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import TrendingClient from './TrendingClient';
import type { TrendingPaper, TrendingResponse } from '../api/trending/route';

// ── ISR ───────────────────────────────────────────────────────────────────────

export const revalidate = 21600; // 6 hours

// ── SEO ───────────────────────────────────────────────────────────────────────

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://paperbrief.ai';

export const metadata: Metadata = {
  title: 'Trending ML Papers This Week — PaperBrief',
  description:
    'The top machine learning papers trending across all PaperBrief digests this week. Ranked by relevance score and digest appearances. Updated every 6 hours.',
  openGraph: {
    title: 'Trending ML Papers This Week',
    description:
      'See which arXiv papers are scoring highest across ML researchers this week. Updated every 6 hours.',
    type: 'website',
    url: `${SITE_URL}/trending`,
  },
  twitter: {
    card: 'summary',
    title: 'Trending ML Papers This Week — PaperBrief',
    description:
      'Top arXiv papers this week, ranked by relevance score across ML researcher digests.',
  },
  alternates: {
    canonical: `${SITE_URL}/trending`,
  },
  robots: {
    index: true,
    follow: true,
  },
};

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchTrendingPapers(days = 7, limit = 20): Promise<TrendingResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return { papers: [], generated_at: new Date().toISOString(), days };
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase.rpc('get_trending_papers', {
      days_back:   days,
      max_results: limit,
    });

    if (error) {
      console.error('[trending page] RPC error:', error.message);
      return { papers: [], generated_at: new Date().toISOString(), days };
    }

    const papers: TrendingPaper[] = (data ?? []).map(
      (row: Record<string, unknown>) => ({
        arxiv_id:    row.arxiv_id    as string,
        title:       row.title       as string,
        abstract:    row.abstract    as string | null,
        authors:     (row.authors    as string[]) ?? [],
        categories:  (row.categories as string[]) ?? [],
        published_at: row.published_at as string | null,
        avg_score:   parseFloat(row.avg_score as string),
        appearances: Number(row.appearances),
        last_seen:   row.last_seen   as string,
      })
    );

    return { papers, generated_at: new Date().toISOString(), days };
  } catch (err) {
    console.error('[trending page] unexpected error:', err);
    return { papers: [], generated_at: new Date().toISOString(), days };
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function TrendingPage() {
  const { papers, generated_at, days } = await fetchTrendingPapers();

  return (
    <div className="min-h-screen bg-gray-950">
      {/* ── Nav ── */}
      <nav className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <a href="/" className="text-lg font-bold text-gray-100">📄 PaperBrief</a>
          <div className="flex gap-4 text-sm items-center">
            <a href="/trending" className="text-gray-100 font-medium">Trending</a>
            <a href="/login" className="text-gray-500 hover:text-gray-300 transition-colors">Sign in</a>
            <a
              href="/"
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              Get digest →
            </a>
          </div>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-8">
        {/* ── Header ── */}
        <header className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">🔥</span>
            <h1 className="text-2xl font-bold text-gray-100">Trending This Week</h1>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            The ML papers scoring highest across all PaperBrief researcher digests in the last {days} days.
            Rankings are based on LLM relevance scores and how many researchers received each paper.
          </p>
        </header>

        {/* ── Paper list (client component for interactivity) ── */}
        <TrendingClient
          papers={papers}
          generatedAt={generated_at}
          days={days}
        />
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-800 mt-16 px-6 py-8 text-center text-xs text-gray-600">
        <p>
          <a href="/" className="hover:text-gray-400 transition-colors">PaperBrief</a>
          {' · '}
          <a href="/trending" className="hover:text-gray-400 transition-colors">Trending</a>
          {' · '}
          <a href="/rss" className="hover:text-gray-400 transition-colors">RSS</a>
          {' · '}
          Aggregated from user digests · Updated every 6 hours · Papers from{' '}
          <a href="https://arxiv.org" target="_blank" rel="noopener noreferrer" className="hover:text-gray-400 transition-colors">arXiv</a>
        </p>
      </footer>
    </div>
  );
}
