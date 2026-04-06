/**
 * today.ts
 *
 * Data layer for "Paper of the Day" feature.
 * Queries paper_digest_entries (which has llm_score) joined with papers
 * to find the top-scoring paper from the last 3 days.
 *
 * Schema notes:
 *   - papers: arxiv_id, title, abstract, authors, categories, published_at, fetched_at
 *   - paper_digest_entries: arxiv_id, date, track, llm_score
 *   - llm_score lives on paper_digest_entries, NOT on papers
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

  // Query paper_digest_entries for recent scored papers, joined with papers.
  // paper_digest_entries.date is the digest date (YYYY-MM-DD);
  // we look back 3 days to handle weekends / pipeline delays.
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await supabase
    .from('paper_digest_entries')
    .select(
      'llm_score, date, papers!inner(arxiv_id, title, authors, abstract, categories, published_at)',
    )
    .gte('date', threeDaysAgo)
    .not('llm_score', 'is', null)
    .order('llm_score', { ascending: false })
    .limit(1);

  if (error) {
    console.error('[today] Supabase error:', error.message);
    return null;
  }

  if (!data || data.length === 0) return null;

  // Supabase types the joined relation as an array, but with !inner and limit(1)
  // it is always a single object at runtime. Cast through unknown to satisfy TS.
  type EntryRow = {
    llm_score: number;
    date: string;
    papers: {
      arxiv_id: string;
      title: string;
      authors: string[] | null;
      abstract: string | null;
      categories: string[] | null;
      published_at: string | null;
    };
  };
  const entry = data[0] as unknown as EntryRow;

  const p = entry.papers;

  return {
    arxivId: p.arxiv_id,
    title: p.title,
    authors: p.authors ?? [],
    abstract: p.abstract ?? '',
    categories: p.categories ?? [],
    submittedDate: p.published_at ?? entry.date,
    llmScore: Number(entry.llm_score),
    keywordScore: 0, // keyword_score is not stored in the current schema
  };
}

// ── Daily history ─────────────────────────────────────────────────────────────

/**
 * One entry in the paper-of-the-day history.
 * `date` is the digest date (YYYY-MM-DD) from paper_digest_entries.
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
 *   1. Query paper_digest_entries from `sinceDate` ordered by (date DESC, llm_score DESC).
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
    .from('paper_digest_entries')
    .select(
      'llm_score, date, papers!inner(arxiv_id, title, authors, abstract, categories, published_at)',
    )
    .gte('date', sinceDate)
    .not('llm_score', 'is', null)
    .order('date', { ascending: false })
    .order('llm_score', { ascending: false })
    .limit(safedays * 20);

  if (error) {
    console.error('[today] getDailyPaperHistory Supabase error:', error.message);
    return [];
  }

  if (!data || data.length === 0) return [];

  const seen = new Set<string>();
  const entries: DailyPaperEntry[] = [];

  // Supabase types the joined relation as array; cast through unknown.
  type HistoryEntryRow = {
    llm_score: number | string;
    date: string;
    papers: {
      arxiv_id: string;
      title: string;
      authors: string[] | null;
      abstract: string | null;
      categories: string[] | null;
      published_at: string | null;
    };
  };

  for (const row of data as unknown as HistoryEntryRow[]) {
    if (seen.has(row.date)) continue;
    seen.add(row.date);

    const p = row.papers;
    entries.push({
      date: row.date,
      paper: {
        arxivId: p.arxiv_id,
        title: p.title,
        authors: p.authors ?? [],
        abstract: p.abstract ?? '',
        categories: p.categories ?? [],
        submittedDate: p.published_at ?? row.date,
        llmScore: Number(row.llm_score),
        keywordScore: 0,
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
