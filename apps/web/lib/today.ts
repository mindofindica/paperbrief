/**
 * today.ts
 *
 * Data layer for "Paper of the Day" feature.
 * Queries the `papers` table for the top-scoring paper from the last 3 days.
 *
 * Server-only — uses service role key.
 */

import { getServiceSupabase } from './supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PaperOfTheDay {
  arxivId: string;
  title: string;
  authors: string[];
  abstract: string;
  categories: string[];
  submittedDate: string;
  llmScore: number;
  keywordScore: number;
}

// ── Data fetching ─────────────────────────────────────────────────────────────

export async function getPaperOfTheDay(): Promise<PaperOfTheDay | null> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from('papers')
    .select('arxiv_id, title, authors, abstract, categories, submitted_date, llm_score, keyword_score')
    .gte('submitted_date', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
    .not('llm_score', 'is', null)
    .order('llm_score', { ascending: false })
    .order('keyword_score', { ascending: false })
    .limit(1);

  if (error) {
    console.error('[today] Supabase error:', error.message);
    return null;
  }

  if (!data || data.length === 0) return null;

  const row = data[0] as {
    arxiv_id: string;
    title: string;
    authors: string[];
    abstract: string;
    categories: string[];
    submitted_date: string;
    llm_score: number;
    keyword_score: number;
  };

  return {
    arxivId: row.arxiv_id,
    title: row.title,
    authors: row.authors ?? [],
    abstract: row.abstract ?? '',
    categories: row.categories ?? [],
    submittedDate: row.submitted_date,
    llmScore: Number(row.llm_score),
    keywordScore: Number(row.keyword_score),
  };
}

// ── Daily history ─────────────────────────────────────────────────────────────

/**
 * One entry in the paper-of-the-day history.
 * `date` is the paper's `submitted_date` (YYYY-MM-DD).
 */
export interface DailyPaperEntry {
  date: string;
  paper: PaperOfTheDay;
}

/**
 * Return the top-scored paper for each of the last `days` calendar days that
 * have at least one scored paper.  Results are sorted newest-first.
 *
 * Strategy:
 *   1. Query papers from `sinceDate` ordered by (submitted_date DESC, llm_score DESC).
 *   2. Pick the first paper seen per date in JavaScript — avoids a complex SQL
 *      GROUP BY that Supabase's PostgREST doesn't easily support.
 *   3. Cap at `days` distinct dates.
 *
 * The `limit` on the Supabase query is `days * 20` to ensure we have enough
 * rows even on busy days with many high-scoring papers.
 */
export async function getDailyPaperHistory(days: number = 30): Promise<DailyPaperEntry[]> {
  const safedays = Math.max(1, Math.min(days, 90));
  const supabase = getServiceSupabase();

  const sinceDate = new Date(Date.now() - safedays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await supabase
    .from('papers')
    .select(
      'arxiv_id, title, authors, abstract, categories, submitted_date, llm_score, keyword_score',
    )
    .gte('submitted_date', sinceDate)
    .not('llm_score', 'is', null)
    .order('submitted_date', { ascending: false })
    .order('llm_score', { ascending: false })
    .limit(safedays * 20);

  if (error) {
    console.error('[today] getDailyPaperHistory Supabase error:', error.message);
    return [];
  }

  if (!data || data.length === 0) return [];

  const seen = new Set<string>();
  const entries: DailyPaperEntry[] = [];

  for (const row of data as {
    arxiv_id: string;
    title: string;
    authors: string[] | null;
    abstract: string | null;
    categories: string[] | null;
    submitted_date: string;
    llm_score: number | string;
    keyword_score: number | string;
  }[]) {
    if (seen.has(row.submitted_date)) continue;
    seen.add(row.submitted_date);

    entries.push({
      date: row.submitted_date,
      paper: {
        arxivId: row.arxiv_id,
        title: row.title,
        authors: row.authors ?? [],
        abstract: row.abstract ?? '',
        categories: row.categories ?? [],
        submittedDate: row.submitted_date,
        llmScore: Number(row.llm_score),
        keywordScore: Number(row.keyword_score),
      },
    });

    if (entries.length >= safedays) break;
  }

  return entries;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function generateShareText(paper: PaperOfTheDay): string {
  return `Today's top ML paper: ${paper.title}\n\n${paper.abstract.slice(0, 200)}...\n\nhttps://paperbrief.ai/today`;
}

export function getScoreBadge(score: number): { emoji: string; label: string } {
  if (score >= 9) return { emoji: '🌟', label: 'Exceptional' };
  if (score >= 7) return { emoji: '⭐', label: 'Excellent' };
  return { emoji: '✨', label: 'Notable' };
}

export function formatAuthors(authors: string[]): { displayed: string[]; extra: number } {
  if (authors.length <= 3) {
    return { displayed: authors, extra: 0 };
  }
  return { displayed: authors.slice(0, 3), extra: authors.length - 3 };
}
