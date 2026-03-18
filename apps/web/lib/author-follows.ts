/**
 * author-follows.ts
 *
 * Per-user author following operations backed by Supabase.
 * Uses service role key (server-only) — never call from client components.
 *
 * DB schema (author_follows):
 *   id UUID, user_id UUID, author_name TEXT, created_at TIMESTAMPTZ
 *   UNIQUE(user_id, author_name)
 *
 * The author_name is stored as entered by the user (display name).
 * Paper lookups use ILIKE to match substrings in the authors array.
 */

import { getServiceSupabase } from './supabase';

export interface AuthorFollow {
  id: string;
  author_name: string;
  created_at: string;
}

export interface AuthorPaper {
  arxiv_id: string;
  title: string;
  authors: string[];
  abstract: string;
  published_at: string;
  categories: string[];
  llm_score: number;
  matched_author: string;
}

// ── Validation ─────────────────────────────────────────────────────────────────

export const MAX_AUTHOR_NAME_LENGTH = 100;
export const MIN_AUTHOR_NAME_LENGTH = 2;
// Free users: up to 5 follows. Pro users: unlimited.
export const FREE_FOLLOW_LIMIT = 5;

export function validateAuthorName(name: string): { ok: true; name: string } | { ok: false; error: string } {
  const trimmed = name.trim();
  if (trimmed.length < MIN_AUTHOR_NAME_LENGTH) {
    return { ok: false, error: `Author name must be at least ${MIN_AUTHOR_NAME_LENGTH} characters` };
  }
  if (trimmed.length > MAX_AUTHOR_NAME_LENGTH) {
    return { ok: false, error: `Author name must be at most ${MAX_AUTHOR_NAME_LENGTH} characters` };
  }
  // Reject obvious junk — only letters, spaces, hyphens, apostrophes, periods allowed
  if (!/^[\p{L}\s'\-\.]+$/u.test(trimmed)) {
    return { ok: false, error: 'Author name contains invalid characters' };
  }
  return { ok: true, name: trimmed };
}

// ── Reads ──────────────────────────────────────────────────────────────────────

/**
 * Get all authors followed by a user, newest first.
 */
export async function getFollowedAuthors(userId: string): Promise<AuthorFollow[]> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from('author_follows')
    .select('id, author_name, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch followed authors: ${error.message}`);
  return data ?? [];
}

/**
 * Check if a user is following a specific author (case-insensitive).
 */
export async function isFollowingAuthor(userId: string, authorName: string): Promise<boolean> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from('author_follows')
    .select('id')
    .eq('user_id', userId)
    .ilike('author_name', authorName.trim())
    .limit(1);

  if (error) throw new Error(`Failed to check author follow: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/**
 * Count how many authors a user is following (for limit enforcement).
 */
export async function getFollowCount(userId: string): Promise<number> {
  const supabase = getServiceSupabase();
  const { count, error } = await supabase
    .from('author_follows')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) throw new Error(`Failed to count follows: ${error.message}`);
  return count ?? 0;
}

// ── Writes ─────────────────────────────────────────────────────────────────────

/**
 * Follow an author. Idempotent — safe to call if already following.
 * Returns the follow record (new or existing).
 */
export async function followAuthor(
  userId: string,
  authorName: string,
): Promise<AuthorFollow> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from('author_follows')
    .upsert(
      { user_id: userId, author_name: authorName.trim() },
      { onConflict: 'user_id,author_name', ignoreDuplicates: false },
    )
    .select('id, author_name, created_at')
    .single();

  if (error) throw new Error(`Failed to follow author: ${error.message}`);
  return data;
}

/**
 * Unfollow an author by exact name match (case-insensitive).
 * Returns true if removed, false if not found.
 */
export async function unfollowAuthor(userId: string, authorName: string): Promise<boolean> {
  const supabase = getServiceSupabase();
  const { error, count } = await supabase
    .from('author_follows')
    .delete({ count: 'exact' })
    .eq('user_id', userId)
    .ilike('author_name', authorName.trim());

  if (error) throw new Error(`Failed to unfollow author: ${error.message}`);
  return (count ?? 0) > 0;
}

// ── Papers by followed authors ─────────────────────────────────────────────────

/**
 * Get recent papers from authors the user is following.
 * Uses the get_papers_by_followed_authors Supabase RPC.
 */
export async function getPapersByFollowedAuthors(
  userId: string,
  limit = 20,
  offset = 0,
): Promise<AuthorPaper[]> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.rpc('get_papers_by_followed_authors', {
    p_user_id: userId,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) throw new Error(`Failed to fetch papers by followed authors: ${error.message}`);
  return (data ?? []) as AuthorPaper[];
}
