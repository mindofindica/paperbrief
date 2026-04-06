/**
 * trending-archive.ts
 *
 * Data layer for /trending/today/[date] archive pages.
 *
 * Queries paper_digest_entries for a specific date, returning the top-scored
 * papers for that day. Also provides utilities for browsing available dates.
 *
 * Schema:
 *   papers:               arxiv_id, title, abstract, authors, categories, published_at, fetched_at
 *   paper_digest_entries: date, arxiv_id, track, llm_score
 *
 * Server-only — uses service role key via getServiceSupabase().
 */

import { getServiceSupabase } from './supabase';
import type { TodayPaper } from '../app/trending/today/page';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ArchiveDayResult {
  papers: TodayPaper[];
  date: string;           // YYYY-MM-DD
  generatedAt: string;    // ISO timestamp of query
}

export interface AvailableDate {
  date: string;           // YYYY-MM-DD
  paperCount: number;     // distinct papers scored that day
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Validate that a string is a well-formed YYYY-MM-DD date. */
export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return !isNaN(d.getTime());
}

/** Return true if the date is in the future relative to UTC today. */
export function isFutureDate(dateStr: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return dateStr > today;
}

/** Format YYYY-MM-DD for display: "Monday, April 7, 2026" */
export function formatArchiveDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Return the YYYY-MM-DD for yesterday relative to a given date. */
export function prevDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Return the YYYY-MM-DD for tomorrow relative to a given date. */
export function nextDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ── Data fetching ─────────────────────────────────────────────────────────────

/**
 * Fetch the top-scored papers for a specific digest date.
 *
 * Strategy:
 *   1. Query paper_digest_entries for the exact date, join papers, order by llm_score DESC.
 *   2. Deduplicate by arxiv_id (same paper can appear in multiple tracks on the same day).
 *   3. Return the top `limit` unique papers.
 *
 * If the date has no data (pipeline hasn't run yet, or very old), returns an empty array —
 * callers should render an appropriate empty state rather than 404.
 */
export async function getTopPapersForDate(
  date: string,
  limit: number = 10,
): Promise<ArchiveDayResult> {
  const safeLimit = Math.min(Math.max(1, limit), 20);
  const generatedAt = new Date().toISOString();

  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from('paper_digest_entries')
    .select(
      'llm_score, track, papers!inner(arxiv_id, title, abstract, authors, categories, published_at)',
    )
    .eq('date', date)
    .not('llm_score', 'is', null)
    .order('llm_score', { ascending: false })
    .limit(safeLimit * 5); // over-fetch to handle dedup across tracks

  if (error) {
    console.error(`[trending-archive] Supabase error for ${date}:`, error.message);
    return { papers: [], date, generatedAt };
  }

  if (!data || data.length === 0) {
    return { papers: [], date, generatedAt };
  }

  // Supabase types the join as array; cast through unknown to satisfy TS.
  type EntryRow = {
    llm_score: number | string;
    track: string | null;
    papers: {
      arxiv_id: string;
      title: string;
      abstract: string | null;
      authors: string[] | null;
      categories: string[] | null;
      published_at: string | null;
    };
  };

  // Deduplicate by arxiv_id, keeping the highest-scored entry per paper.
  const seen = new Map<string, TodayPaper>();
  for (const row of data as unknown as EntryRow[]) {
    const p = row.papers;
    const score = Number(row.llm_score);
    const existing = seen.get(p.arxiv_id);
    if (!existing || score > existing.avg_score) {
      seen.set(p.arxiv_id, {
        arxiv_id: p.arxiv_id,
        title: p.title,
        abstract: p.abstract ?? null,
        authors: p.authors ?? [],
        categories: p.categories ?? [],
        published_at: p.published_at ?? null,
        avg_score: score,
        appearances: 1, // we don't aggregate appearances here; each date stands alone
      });
    }
  }

  // Sort by score descending, cap at limit.
  const papers = Array.from(seen.values())
    .sort((a, b) => b.avg_score - a.avg_score)
    .slice(0, safeLimit);

  return { papers, date, generatedAt };
}

/**
 * Return a list of dates in the last `days` days that have at least one
 * scored paper in paper_digest_entries.
 *
 * Used by generateStaticParams to pre-render archive pages at build time.
 */
export async function getAvailableArchiveDates(
  days: number = 30,
): Promise<AvailableDate[]> {
  const safeDays = Math.min(Math.max(1, days), 90);
  const supabase = getServiceSupabase();

  const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await supabase
    .from('paper_digest_entries')
    .select('date, arxiv_id')
    .gte('date', since)
    .not('llm_score', 'is', null)
    .order('date', { ascending: false })
    .limit(safeDays * 200); // generous: ~200 entries per day is plenty

  if (error || !data) {
    console.error('[trending-archive] getAvailableArchiveDates error:', error?.message);
    return [];
  }

  // Count distinct papers per date.
  const dateCounts = new Map<string, Set<string>>();
  for (const row of data as { date: string; arxiv_id: string }[]) {
    const set = dateCounts.get(row.date) ?? new Set<string>();
    set.add(row.arxiv_id);
    dateCounts.set(row.date, set);
  }

  return Array.from(dateCounts.entries())
    .map(([date, ids]) => ({ date, paperCount: ids.size }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
