/**
 * reading-list-supa.ts
 *
 * Per-user reading list operations backed by Supabase.
 * Uses service role key (server-only) — never call from client components.
 *
 * DB schema (reading_list):
 *   id UUID, user_id UUID, arxiv_id TEXT (unique per user), status TEXT,
 *   priority INT, note TEXT, saved_at TIMESTAMPTZ
 *
 * Paper metadata (title, abstract, track, score, published_at) is joined
 * from the local SQLite DB at read time via getPaper().
 */

import { getServiceSupabase } from './supabase';
import { getPaper } from './arxiv-db';

export type ReadingStatus = 'unread' | 'reading' | 'done';

export interface ReadingListPaper {
  arxiv_id: string;
  title: string;
  abstract: string | null;
  track: string | null;
  llm_score: number | null;
  published_at: string | null;
  status: ReadingStatus;
  priority: number;
  note: string | null;
  saved_at: string;
}

// ── Reads ──────────────────────────────────────────────────────────────────────

/**
 * Get all reading list entries for a user, optionally filtered by status.
 * Joins with local SQLite for paper metadata.
 */
export async function getUserReadingList(
  userId: string,
  status?: ReadingStatus,
): Promise<ReadingListPaper[]> {
  const supabase = getServiceSupabase();

  let query = supabase
    .from('reading_list')
    .select('arxiv_id, status, priority, note, saved_at')
    .eq('user_id', userId)
    .not('arxiv_id', 'is', null)
    .order('saved_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw new Error(`[reading-list-supa] fetch error: ${error.message}`);

  return (data ?? []).map((row) => {
    const paper = row.arxiv_id ? getPaper(row.arxiv_id) : null;
    return {
      arxiv_id: row.arxiv_id as string,
      title: paper?.title ?? row.arxiv_id ?? 'Unknown paper',
      abstract: paper?.abstract ?? null,
      track: paper?.track ?? null,
      llm_score: paper?.llm_score ?? null,
      published_at: paper?.published_at ?? null,
      status: (row.status ?? 'unread') as ReadingStatus,
      priority: row.priority ?? 0,
      note: row.note ?? null,
      saved_at: row.saved_at as string,
    };
  });
}

/**
 * Check if a specific paper is in the user's reading list.
 * Returns null if not saved, or the entry's status.
 */
export async function getReadingListEntry(
  userId: string,
  arxivId: string,
): Promise<{ status: ReadingStatus; priority: number; note: string | null } | null> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from('reading_list')
    .select('status, priority, note')
    .eq('user_id', userId)
    .eq('arxiv_id', arxivId)
    .single();

  if (error) return null; // Not found or DB error — treat as not saved
  if (!data) return null;

  return {
    status: (data.status ?? 'unread') as ReadingStatus,
    priority: data.priority ?? 0,
    note: data.note ?? null,
  };
}

// ── Writes ─────────────────────────────────────────────────────────────────────

const VALID_STATUSES: ReadingStatus[] = ['unread', 'reading', 'done'];

export function isValidStatus(s: unknown): s is ReadingStatus {
  return typeof s === 'string' && (VALID_STATUSES as string[]).includes(s);
}

/**
 * Add or update a paper in the user's reading list.
 * Uses upsert on (user_id, arxiv_id).
 */
export async function upsertReadingListItem(
  userId: string,
  arxivId: string,
  status: ReadingStatus,
  options?: { note?: string; priority?: number },
): Promise<void> {
  const supabase = getServiceSupabase();

  const { error } = await supabase.from('reading_list').upsert(
    {
      user_id: userId,
      arxiv_id: arxivId,
      status,
      note: options?.note ?? null,
      priority: options?.priority ?? 0,
      // paper_id is nullable in v2 — omit it for new-style entries
    },
    { onConflict: 'user_id,arxiv_id' },
  );

  if (error) throw new Error(`[reading-list-supa] upsert error: ${error.message}`);
}

/**
 * Remove a paper from the user's reading list.
 */
export async function removeReadingListItem(userId: string, arxivId: string): Promise<void> {
  const supabase = getServiceSupabase();

  const { error } = await supabase
    .from('reading_list')
    .delete()
    .eq('user_id', userId)
    .eq('arxiv_id', arxivId);

  if (error) throw new Error(`[reading-list-supa] delete error: ${error.message}`);
}
