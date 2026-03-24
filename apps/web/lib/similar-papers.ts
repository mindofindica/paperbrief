/**
 * similar-papers.ts
 *
 * Finds papers similar to a given arxiv paper using:
 *   - Category overlap (primary signal, weight × 3)
 *   - Significant title-word overlap (secondary signal, weight × 1)
 *
 * No new DB migrations required — uses the existing `papers` table's
 * `categories TEXT[]` column that arxiv-coach populates.
 */

import { getServiceSupabase } from './supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SimilarPaper {
  arxiv_id: string;
  title: string;
  authors: string[];
  published_at: string | null;
  categories: string[];
  /** Composite similarity score (category_overlap×3 + title_word_overlap×1) */
  score: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Words too common to be meaningful for title similarity.
 * Matches the STOPWORDS set in arxiv-db.ts for consistency.
 */
export const TITLE_STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'can', 'shall',
  'this', 'that', 'these', 'those', 'its', 'it', 'we', 'our', 'they',
  'via', 'into', 'towards', 'toward', 'through', 'under', 'over',
  'about', 'up', 'out', 'all', 'you', 'need', 'new', 'large', 'based',
  'approach', 'method', 'methods', 'task', 'tasks', 'paper', 'papers',
  'study', 'work', 'analysis', 'evaluation', 'results', 'using',
]);

/**
 * Extracts significant lowercase words from a title.
 * Filters stopwords, pure numbers, and tokens shorter than 4 chars.
 *
 * Returns a Set so membership checks are O(1).
 */
export function extractTitleWords(title: string): Set<string> {
  const normalized = title.toLowerCase().replace(/[^\w\s]/g, ' ');
  const words = normalized
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !TITLE_STOPWORDS.has(w) && !/^\d+$/.test(w));
  return new Set(words);
}

/**
 * Computes the similarity score between a seed paper and a candidate.
 *
 * Score = (shared_categories × 3) + (shared_title_words × 1)
 *
 * A pure function — safe to test in isolation.
 */
export function computeSimilarityScore(
  seedCategories: string[],
  seedTitleWords: Set<string>,
  candidateCategories: string[],
  candidateTitle: string,
): number {
  const seedCatSet = new Set(seedCategories);
  const sharedCategories = candidateCategories.filter((c) => seedCatSet.has(c)).length;

  const candidateWords = extractTitleWords(candidateTitle);
  let sharedWords = 0;
  for (const word of candidateWords) {
    if (seedTitleWords.has(word)) sharedWords++;
  }

  return sharedCategories * 3 + sharedWords;
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Returns up to `limit` papers similar to the given arxiv paper.
 *
 * Algorithm:
 * 1. Fetch seed paper's categories + title.
 * 2. Query papers from the last `daysBack` days with overlapping categories.
 * 3. Score each candidate (category overlap × 3 + title-word overlap × 1).
 * 4. Sort by score DESC, then published_at DESC for ties.
 * 5. Return the top `limit` results with score > 0.
 *
 * Returns [] on any error (network, missing data, etc.) so callers don't need
 * to handle exceptions.
 *
 * @param arxivId  - The seed paper's arxiv ID
 * @param limit    - Maximum results to return (default 5)
 * @param daysBack - How many days back to search for candidates (default 60)
 */
export async function getSimilarPapers(
  arxivId: string,
  limit = 5,
  daysBack = 60,
): Promise<SimilarPaper[]> {
  if (!arxivId) return [];

  try {
    const supabase = getServiceSupabase();

    // ── Step 1: fetch the seed paper ─────────────────────────────────────────
    const { data: seedData, error: seedError } = await supabase
      .from('papers')
      .select('arxiv_id, title, categories')
      .eq('arxiv_id', arxivId)
      .single();

    if (seedError || !seedData) return [];

    const seedCategories: string[] = Array.isArray(seedData.categories)
      ? (seedData.categories as string[])
      : [];
    const seedTitleWords = extractTitleWords((seedData.title as string) ?? '');

    // No signal at all → bail out early
    if (seedCategories.length === 0 && seedTitleWords.size === 0) return [];

    // ── Step 2: fetch candidate papers ───────────────────────────────────────
    const since = new Date(Date.now() - daysBack * 86_400_000).toISOString().slice(0, 10);

    // Build the query. When there are categories, filter with array overlap so
    // Postgres can use the GIN index. Fall back to a plain date range if not.
    const baseQuery = supabase
      .from('papers')
      .select('arxiv_id, title, authors, published_at, categories')
      .neq('arxiv_id', arxivId)
      .gte('published_at', since)
      .limit(500);

    const candidateQuery =
      seedCategories.length > 0
        ? baseQuery.overlaps('categories', seedCategories)
        : baseQuery;

    const { data: candidates, error: candidatesError } = await candidateQuery;

    if (candidatesError || !candidates || candidates.length === 0) return [];

    // ── Step 3 & 4: score and sort ────────────────────────────────────────────
    type CandidateRow = {
      arxiv_id: string;
      title: string;
      authors: unknown;
      published_at: string | null;
      categories: unknown;
    };

    const scored: SimilarPaper[] = (candidates as CandidateRow[]).map((c) => {
      const cats: string[] = Array.isArray(c.categories) ? (c.categories as string[]) : [];
      return {
        arxiv_id: c.arxiv_id,
        title: c.title,
        authors: Array.isArray(c.authors) ? (c.authors as string[]) : [],
        published_at: c.published_at,
        categories: cats,
        score: computeSimilarityScore(seedCategories, seedTitleWords, cats, c.title),
      };
    });

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Tie-break: prefer more-recent papers
      return (b.published_at ?? '').localeCompare(a.published_at ?? '');
    });

    // ── Step 5: return top results with a meaningful score ────────────────────
    return scored.slice(0, limit).filter((p) => p.score > 0);
  } catch {
    return [];
  }
}
