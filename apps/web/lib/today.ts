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
