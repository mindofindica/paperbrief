/**
 * daily-digest.ts — Data helpers for the public /daily/[date] page.
 *
 * All functions are intentionally auth-free: this page is public and
 * indexed by search engines. No PII, no user-specific data.
 */

import { getServiceSupabase } from './supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DailyPaper {
  arxiv_id: string;
  title: string;
  abstract: string | null;
  published_at: string | null;
  llm_score: number;
  track: string | null;
  authors: string[] | null;
}

export interface DailyDigestDate {
  date: string;
  paperCount: number;
}

// Raw shape returned by Supabase join
interface DigestEntryRow {
  arxiv_id: string;
  track: string | null;
  llm_score: number | null;
  date: string;
  papers: {
    title: string;
    abstract: string | null;
    authors: string[] | null;
    published_at: string | null;
  } | null;
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

/**
 * Returns up to `limit` top-scored papers for `date` (YYYY-MM-DD).
 * Optionally filters by `track` if provided.
 *
 * Returns an empty array for invalid dates or dates with no data.
 */
export async function getTopPapersForDate(
  date: string,
  limit = 10,
  track?: string,
): Promise<DailyPaper[]> {
  if (!isValidDate(date)) return [];

  const supabase = getServiceSupabase();
  let query = supabase
    .from('paper_digest_entries')
    .select('arxiv_id, track, llm_score, date, papers(title, abstract, authors, published_at)')
    .eq('date', date)
    .not('llm_score', 'is', null)
    .order('llm_score', { ascending: false })
    .limit(limit);

  if (track) {
    query = query.eq('track', track);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  return (data as unknown as DigestEntryRow[])
    .filter((row) => row.papers)
    .map((row) => ({
      arxiv_id: row.arxiv_id,
      title: row.papers!.title,
      abstract: row.papers!.abstract ?? null,
      published_at: row.papers!.published_at ?? null,
      llm_score: row.llm_score ?? 0,
      track: row.track ?? null,
      authors: row.papers!.authors ?? null,
    }));
}

/**
 * Returns the last `days` calendar dates that have at least one scored paper,
 * newest-first. Used to build the sitemap and the archive index.
 */
export async function getDailyDigestDates(days = 90): Promise<DailyDigestDate[]> {
  const supabase = getServiceSupabase();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const fromDate = cutoff.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('paper_digest_entries')
    .select('date')
    .gte('date', fromDate)
    .order('date', { ascending: false });

  if (error || !data) return [];

  // Count papers per date in memory (avoids a GROUP BY aggregate edge-case)
  const counts = new Map<string, number>();
  for (const row of data as { date: string }[]) {
    counts.set(row.date, (counts.get(row.date) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort(([a], [b]) => (a > b ? -1 : 1))
    .map(([date, paperCount]) => ({ date, paperCount }));
}

/**
 * Returns the nearest digest dates before and after `date` for prev/next nav.
 */
export async function getAdjacentDailyDates(
  date: string,
): Promise<{ prev: string | null; next: string | null }> {
  if (!isValidDate(date)) return { prev: null, next: null };

  // Two separate clients so tests can mock each call independently
  const [{ data: prevData }, { data: nextData }] = await Promise.all([
    getServiceSupabase()
      .from('paper_digest_entries')
      .select('date')
      .lt('date', date)
      .order('date', { ascending: false })
      .limit(1),
    getServiceSupabase()
      .from('paper_digest_entries')
      .select('date')
      .gt('date', date)
      .order('date', { ascending: true })
      .limit(1),
  ]);

  const prevArr = prevData as { date: string }[] | null;
  const nextArr = nextData as { date: string }[] | null;

  return {
    prev: prevArr && prevArr.length > 0 ? prevArr[0].date : null,
    next: nextArr && nextArr.length > 0 ? nextArr[0].date : null,
  };
}

// ---------------------------------------------------------------------------
// Pure helpers (no I/O — easy to unit-test)
// ---------------------------------------------------------------------------

/** Returns true if dateStr is a valid YYYY-MM-DD in the past (or today). */
export function isValidDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const today = new Date().toISOString().slice(0, 10);
  return dateStr <= today;
}

/** Formats "2026-03-22" → "March 22, 2026" */
export function formatDailyDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Formats "2026-03-22" → "March 22, 2026" with weekday. */
export function formatDailyDateLong(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Returns the canonical public URL for a daily page. */
export function getDailyPageUrl(date: string, baseUrl?: string): string {
  const base = baseUrl ?? (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://paperbrief.ai');
  return `${base}/daily/${date}`;
}

/** Returns a pre-filled Twitter share URL for the given date. */
export function getTwitterShareUrl(date: string, baseUrl?: string): string {
  const pageUrl = getDailyPageUrl(date, baseUrl);
  const formatted = formatDailyDate(date);
  const text = `Today's top ML papers from arXiv (${formatted}) → ${pageUrl} via @paperbrief`;
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

/** Score → emoji icon */
export function scoreIcon(score: number): string {
  if (score >= 9) return '🌟';
  if (score >= 7) return '⭐';
  return '✨';
}
