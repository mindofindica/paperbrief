/**
 * collections.ts
 *
 * Named paper collection operations backed by Supabase.
 * Uses service role key (server-only) — never call from client components.
 *
 * DB schema:
 *   paper_collections: id, user_id, name, description, slug, is_public,
 *                      created_at, updated_at
 *   collection_papers:  collection_id, arxiv_id, title, authors, abstract,
 *                       published_at, added_at
 *
 * Plan tier enforcement:
 *   FREE_COLLECTION_LIMIT  — max collections for free users (3)
 *   Pro users: unlimited (lift limit when Stripe is wired up)
 */

import { getServiceSupabase } from './supabase';

// ── Constants ──────────────────────────────────────────────────────────────────

export const MAX_COLLECTION_NAME_LENGTH = 100;
export const MIN_COLLECTION_NAME_LENGTH = 1;
export const MAX_COLLECTION_DESC_LENGTH = 500;
/** Free tier: max number of collections a user can create. */
export const FREE_COLLECTION_LIMIT = 3;
/** Max papers in a single collection. */
export const MAX_PAPERS_PER_COLLECTION = 500;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Collection {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  slug: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  paper_count?: number;
}

export interface CollectionPaper {
  collection_id: string;
  arxiv_id: string;
  title: string | null;
  authors: string | null;     // JSON array string
  abstract: string | null;
  published_at: string | null;
  added_at: string;
}

export interface PaperInput {
  arxiv_id: string;
  title?: string | null;
  authors?: string | null;
  abstract?: string | null;
  published_at?: string | null;
}

export interface UpdateCollectionInput {
  name?: string;
  description?: string | null;
  is_public?: boolean;
}

// ── Validation ─────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a collection name.
 * Returns { valid: true } or { valid: false, error: "..." }.
 */
export function validateCollectionName(name: unknown): ValidationResult {
  if (typeof name !== 'string') {
    return { valid: false, error: 'Name must be a string' };
  }
  const trimmed = name.trim();
  if (trimmed.length < MIN_COLLECTION_NAME_LENGTH) {
    return { valid: false, error: 'Name cannot be empty' };
  }
  if (trimmed.length > MAX_COLLECTION_NAME_LENGTH) {
    return {
      valid: false,
      error: `Name must be ${MAX_COLLECTION_NAME_LENGTH} characters or fewer`,
    };
  }
  return { valid: true };
}

/**
 * Validate a collection description (optional field).
 */
export function validateCollectionDescription(description: unknown): ValidationResult {
  if (description === null || description === undefined || description === '') {
    return { valid: true };
  }
  if (typeof description !== 'string') {
    return { valid: false, error: 'Description must be a string' };
  }
  if (description.length > MAX_COLLECTION_DESC_LENGTH) {
    return {
      valid: false,
      error: `Description must be ${MAX_COLLECTION_DESC_LENGTH} characters or fewer`,
    };
  }
  return { valid: true };
}

// ── Slug generation ────────────────────────────────────────────────────────────

/**
 * Generate a URL-friendly slug from a collection name + random suffix.
 *
 * Examples:
 *   "My LLM Papers"          → "my-llm-papers-a1b2c3"
 *   "Attention mechanisms!!" → "attention-mechanisms-x9y8z7"
 *
 * The random 6-char suffix ensures uniqueness without a DB round-trip.
 * (Collision probability ~1 in 2 billion — negligible for this scale.)
 */
export function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')   // non-alphanumeric → dash
    .replace(/^-+|-+$/g, '')         // strip leading/trailing dashes
    .slice(0, 50)                     // truncate base
    .replace(/-+$/, '');              // clean up after truncation

  const suffix = Math.random().toString(36).slice(2, 8); // 6 random base36 chars
  const slug = base ? `${base}-${suffix}` : suffix;

  // Ensure slug is at least 3 chars (for the DB CHECK constraint)
  if (slug.length < 3) return `col-${suffix}`;
  return slug;
}

// ── Reads ──────────────────────────────────────────────────────────────────────

/**
 * Get all collections for a user, ordered by created_at desc.
 * Each collection includes a paper_count.
 */
export async function getUserCollections(userId: string): Promise<Collection[]> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from('paper_collections')
    .select(`
      id, user_id, name, description, slug, is_public, created_at, updated_at,
      collection_papers(count)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`[collections] getUserCollections error: ${error.message}`);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    user_id: row.user_id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    slug: row.slug as string,
    is_public: row.is_public as boolean,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    paper_count: (row.collection_papers as Array<{ count: number }> | null)?.[0]?.count ?? 0,
  }));
}

/**
 * Get a single collection by id.
 * If userId is provided, enforces ownership (returns null for other users' collections).
 * If userId is omitted, returns public collections only.
 */
export async function getCollection(
  collectionId: string,
  userId?: string,
): Promise<Collection | null> {
  const supabase = getServiceSupabase();

  let query = supabase
    .from('paper_collections')
    .select('id, user_id, name, description, slug, is_public, created_at, updated_at')
    .eq('id', collectionId);

  if (userId) {
    query = query.eq('user_id', userId);
  } else {
    query = query.eq('is_public', true);
  }

  const { data, error } = await query.single();
  if (error) {
    if (error.message.includes('No rows') || error.message.includes('PGRST116')) return null;
    throw new Error(`[collections] getCollection error: ${error.message}`);
  }
  return data as unknown as Collection ?? null;
}

/**
 * Get a public collection by its slug (for the /c/[slug] public page).
 * Returns null if not found or not public.
 */
export async function getCollectionBySlug(slug: string): Promise<Collection | null> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from('paper_collections')
    .select('id, user_id, name, description, slug, is_public, created_at, updated_at')
    .eq('slug', slug)
    .eq('is_public', true)
    .single();

  if (error) {
    if (error.message.includes('No rows') || error.message.includes('PGRST116')) return null;
    throw new Error(`[collections] getCollectionBySlug error: ${error.message}`);
  }
  return data as unknown as Collection ?? null;
}

/**
 * Get the count of collections for a user (for tier enforcement).
 */
export async function getCollectionCount(userId: string): Promise<number> {
  const supabase = getServiceSupabase();

  const { count, error } = await supabase
    .from('paper_collections')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) throw new Error(`[collections] getCollectionCount error: ${error.message}`);
  return count ?? 0;
}

/**
 * Get all papers in a collection, ordered by added_at desc.
 */
export async function getCollectionPapers(collectionId: string): Promise<CollectionPaper[]> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from('collection_papers')
    .select('collection_id, arxiv_id, title, authors, abstract, published_at, added_at')
    .eq('collection_id', collectionId)
    .order('added_at', { ascending: false });

  if (error) throw new Error(`[collections] getCollectionPapers error: ${error.message}`);
  return (data ?? []) as CollectionPaper[];
}

/**
 * Get which of a user's collections contain a given paper.
 * Used to pre-populate "add to collection" UI.
 */
export async function getPaperCollections(
  userId: string,
  arxivId: string,
): Promise<Collection[]> {
  const supabase = getServiceSupabase();

  // Get all user collections that have this paper in collection_papers
  const { data, error } = await supabase
    .from('paper_collections')
    .select(`
      id, user_id, name, description, slug, is_public, created_at, updated_at,
      collection_papers!inner(arxiv_id)
    `)
    .eq('user_id', userId)
    .eq('collection_papers.arxiv_id', arxivId);

  if (error) throw new Error(`[collections] getPaperCollections error: ${error.message}`);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    user_id: row.user_id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    slug: row.slug as string,
    is_public: row.is_public as boolean,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }));
}

// ── Writes ─────────────────────────────────────────────────────────────────────

/**
 * Create a new collection for a user.
 *
 * Enforces FREE_COLLECTION_LIMIT for free-tier users.
 * Throws CollectionLimitError when the limit is reached.
 */
export class CollectionLimitError extends Error {
  constructor() {
    super(`Free plan allows up to ${FREE_COLLECTION_LIMIT} collections. Upgrade to Pro for unlimited.`);
    this.name = 'CollectionLimitError';
  }
}

export class CollectionNotFoundError extends Error {
  constructor(id: string) {
    super(`Collection not found: ${id}`);
    this.name = 'CollectionNotFoundError';
  }
}

export class DuplicatePaperError extends Error {
  constructor(arxivId: string) {
    super(`Paper ${arxivId} is already in this collection`);
    this.name = 'DuplicatePaperError';
  }
}

export async function createCollection(
  userId: string,
  name: string,
  description?: string | null,
  isPublic = false,
  /** Pass true to skip tier check (for Pro users). */
  skipLimitCheck = false,
): Promise<Collection> {
  if (!skipLimitCheck) {
    const count = await getCollectionCount(userId);
    if (count >= FREE_COLLECTION_LIMIT) {
      throw new CollectionLimitError();
    }
  }

  const supabase = getServiceSupabase();
  const slug = generateSlug(name);

  const { data, error } = await supabase
    .from('paper_collections')
    .insert({
      user_id: userId,
      name: name.trim(),
      description: description?.trim() || null,
      slug,
      is_public: isPublic,
    })
    .select()
    .single();

  if (error) throw new Error(`[collections] createCollection error: ${error.message}`);
  return data as unknown as Collection;
}

/**
 * Update a collection's name, description, or visibility.
 * Enforces ownership — throws CollectionNotFoundError if not found/owned.
 */
export async function updateCollection(
  collectionId: string,
  userId: string,
  updates: UpdateCollectionInput,
): Promise<Collection> {
  const supabase = getServiceSupabase();

  const patch: Record<string, unknown> = {};
  if (updates.name !== undefined) patch.name = updates.name.trim();
  if ('description' in updates) patch.description = updates.description?.trim() || null;
  if (updates.is_public !== undefined) patch.is_public = updates.is_public;

  const { data, error } = await supabase
    .from('paper_collections')
    .update(patch)
    .eq('id', collectionId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    if (error.message.includes('No rows') || error.message.includes('PGRST116')) {
      throw new CollectionNotFoundError(collectionId);
    }
    throw new Error(`[collections] updateCollection error: ${error.message}`);
  }
  if (!data) throw new CollectionNotFoundError(collectionId);
  return data as unknown as Collection;
}

/**
 * Delete a collection (and cascade-deletes its papers via FK constraint).
 * Enforces ownership — throws CollectionNotFoundError if not found/owned.
 */
export async function deleteCollection(
  collectionId: string,
  userId: string,
): Promise<void> {
  const supabase = getServiceSupabase();

  const { error, count } = await supabase
    .from('paper_collections')
    .delete({ count: 'exact' })
    .eq('id', collectionId)
    .eq('user_id', userId);

  if (error) throw new Error(`[collections] deleteCollection error: ${error.message}`);
  if ((count ?? 0) === 0) throw new CollectionNotFoundError(collectionId);
}

/**
 * Add a paper to a collection.
 * Enforces ownership of the collection.
 * Throws DuplicatePaperError if paper already in collection.
 * Throws CollectionNotFoundError if collection not found/owned.
 */
export async function addPaperToCollection(
  collectionId: string,
  userId: string,
  paper: PaperInput,
): Promise<CollectionPaper> {
  // Verify ownership
  const supabase = getServiceSupabase();

  const { data: col, error: colErr } = await supabase
    .from('paper_collections')
    .select('id')
    .eq('id', collectionId)
    .eq('user_id', userId)
    .single();

  if (colErr || !col) throw new CollectionNotFoundError(collectionId);

  const { data, error } = await supabase
    .from('collection_papers')
    .insert({
      collection_id: collectionId,
      arxiv_id: paper.arxiv_id,
      title: paper.title ?? null,
      authors: paper.authors ?? null,
      abstract: paper.abstract ?? null,
      published_at: paper.published_at ?? null,
    })
    .select()
    .single();

  if (error) {
    if (error.message.includes('duplicate') || error.message.includes('unique')) {
      throw new DuplicatePaperError(paper.arxiv_id);
    }
    throw new Error(`[collections] addPaperToCollection error: ${error.message}`);
  }
  return data as unknown as CollectionPaper;
}

/**
 * Remove a paper from a collection.
 * Enforces ownership. Silent if paper not in collection.
 */
export async function removePaperFromCollection(
  collectionId: string,
  userId: string,
  arxivId: string,
): Promise<void> {
  const supabase = getServiceSupabase();

  // Verify ownership first
  const { data: col, error: colErr } = await supabase
    .from('paper_collections')
    .select('id')
    .eq('id', collectionId)
    .eq('user_id', userId)
    .single();

  if (colErr || !col) throw new CollectionNotFoundError(collectionId);

  const { error } = await supabase
    .from('collection_papers')
    .delete()
    .eq('collection_id', collectionId)
    .eq('arxiv_id', arxivId);

  if (error) throw new Error(`[collections] removePaperFromCollection error: ${error.message}`);
}
