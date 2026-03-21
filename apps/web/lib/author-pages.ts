/**
 * author-pages.ts
 *
 * Data access for public author profile pages (/author/[slug]).
 *
 * Author pages are SEO-targeted landing pages — no auth required.
 * Each page shows papers from PaperBrief's index authored by a specific researcher.
 *
 * Slug format: "yoshua-bengio" ↔ "yoshua bengio" (hyphens ↔ spaces, lowercase)
 *
 * Data source: Supabase (production). SQLite fallback for local dev.
 * Authors are stored as JSONB arrays in Supabase; the query casts to text for ilike matching.
 */

import { createClient } from '@supabase/supabase-js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthorPagePaper {
  arxiv_id: string;
  title: string;
  abstract: string | null;
  authors: string[];
  categories: string[];
  published_at: string | null;
  llm_score: number | null;
}

export interface AuthorPageData {
  /** Normalised display name derived from slug, e.g. "Yoshua Bengio" */
  displayName: string;
  /** The slug that was used to look up this author */
  slug: string;
  papers: AuthorPagePaper[];
  /** Number of distinct arXiv categories present in the paper set */
  categoryCount: number;
  /** ISO timestamp of the most-recently published paper */
  latestPublishedAt: string | null;
}

// ── Slug helpers ──────────────────────────────────────────────────────────────

/**
 * Convert an author display name to a URL slug.
 *
 * "Yoshua Bengio"  → "yoshua-bengio"
 * "Yann LeCun"     → "yann-lecun"
 * "Jürgen Schmidhuber" → "jurgen-schmidhuber"  (ASCII folding)
 */
export function authorNameToSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')                        // decompose accented chars
    .replace(/[\u0300-\u036f]/g, '')         // strip combining marks
    .replace(/[^a-z0-9\s-]/g, '')           // strip punctuation
    .replace(/\s+/g, '-')                   // spaces → hyphens
    .replace(/-{2,}/g, '-')                 // collapse multiple hyphens
    .replace(/^-|-$/g, '');                 // trim leading/trailing
}

/**
 * Convert a slug back to a search string.
 *
 * "yoshua-bengio" → "yoshua bengio"
 */
export function authorSlugToSearch(slug: string): string {
  return slug.replace(/-/g, ' ');
}

/**
 * Convert a slug to a title-cased display name for use in headings.
 * This is a best-effort approximation — real display names come from paper data.
 *
 * "yoshua-bengio" → "Yoshua Bengio"
 */
export function authorSlugToDisplayName(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Extract the best matching display name from a list of paper authors.
 * Picks the author entry whose lowercase form most closely matches the search term.
 */
export function resolveAuthorDisplayName(
  papers: AuthorPagePaper[],
  searchTerm: string,
): string {
  const term = searchTerm.toLowerCase();
  const names: Map<string, number> = new Map();

  for (const paper of papers) {
    for (const author of paper.authors) {
      const key = author.toLowerCase();
      if (key.includes(term) || term.split(' ').every((t) => key.includes(t))) {
        names.set(author, (names.get(author) ?? 0) + 1);
      }
    }
  }

  if (names.size === 0) return authorSlugToDisplayName(searchTerm.replace(/\s+/g, '-'));

  // Return the most frequently occurring matching form (most canonical)
  return [...names.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// ── Data fetching ─────────────────────────────────────────────────────────────

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Fetch papers for an author profile page from Supabase.
 *
 * Matches any paper where the authors JSONB array (cast to text) contains
 * the search term. Case-insensitive. Returns up to `limit` papers, most-
 * recently published first.
 *
 * @param slug   - URL slug, e.g. "yoshua-bengio"
 * @param limit  - max papers to return (default 40, max 100)
 */
export async function getAuthorPapers(
  slug: string,
  limit = 40,
): Promise<AuthorPageData> {
  const clampedLimit = Math.min(Math.max(1, limit), 100);
  const searchTerm = authorSlugToSearch(slug);
  const displayNameFallback = authorSlugToDisplayName(slug);

  const supabase = getSupabaseClient();

  if (!supabase) {
    return {
      displayName: displayNameFallback,
      slug,
      papers: [],
      categoryCount: 0,
      latestPublishedAt: null,
    };
  }

  try {
    // Cast the JSONB authors array to text for ilike substring matching.
    // Example: authors::text → '["Yoshua Bengio","Ian Goodfellow"]'
    // The search term "yoshua bengio" will match because the text contains it.
    const { data, error } = await supabase
      .from('papers')
      .select('arxiv_id, title, abstract, authors, categories, published_at')
      .filter('authors::text', 'ilike', `%${searchTerm}%`)
      .order('published_at', { ascending: false })
      .limit(clampedLimit);

    if (error) {
      console.error('[author-pages] Supabase error:', error.message);
      return { displayName: displayNameFallback, slug, papers: [], categoryCount: 0, latestPublishedAt: null };
    }

    const papers: AuthorPagePaper[] = (data ?? []).map((row: any) => ({
      arxiv_id: row.arxiv_id,
      title: row.title ?? 'Untitled',
      abstract: row.abstract ?? null,
      authors: Array.isArray(row.authors) ? row.authors : [],
      categories: Array.isArray(row.categories) ? row.categories : [],
      published_at: row.published_at ?? null,
      llm_score: row.llm_score ?? null,
    }));

    // Determine the best display name from actual paper data
    const displayName = resolveAuthorDisplayName(papers, searchTerm) || displayNameFallback;

    // Aggregate category count
    const allCategories = new Set(papers.flatMap((p) => p.categories));

    // Most recent publication
    const latestPublishedAt =
      papers.length > 0 ? (papers[0].published_at ?? null) : null;

    return {
      displayName,
      slug,
      papers,
      categoryCount: allCategories.size,
      latestPublishedAt,
    };
  } catch (err) {
    console.error('[author-pages] Unexpected error:', err);
    return { displayName: displayNameFallback, slug, papers: [], categoryCount: 0, latestPublishedAt: null };
  }
}

// ── Paper formatting helpers (used by page + client) ─────────────────────────

export function formatAuthorsShort(authors: string[]): string {
  if (authors.length === 0) return 'Unknown';
  if (authors.length === 1) return authors[0];
  if (authors.length <= 3) return authors.join(', ');
  return `${authors[0]} et al.`;
}

export function formatPublishedDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function scoreToStars(score: number | null): string {
  if (score === null) return '';
  const filled = Math.max(0, Math.min(5, Math.round(score)));
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}

export function scoreToColor(score: number | null): string {
  if (score === null) return 'text-gray-600';
  if (score >= 4.5) return 'text-yellow-400';
  if (score >= 3.5) return 'text-yellow-500';
  if (score >= 2.5) return 'text-amber-500';
  return 'text-gray-500';
}

export function truncateAbstract(text: string, maxLen = 250): string {
  if (text.length <= maxLen) return text;
  const cut = text.lastIndexOf(' ', maxLen);
  return text.slice(0, cut > 0 ? cut : maxLen) + '…';
}

/**
 * Build Schema.org JSON-LD for an author profile page.
 * Uses Person + ItemList structured data.
 */
export function authorPageJsonLd(data: AuthorPageData, siteUrl: string): object[] {
  const pageUrl = `${siteUrl}/author/${data.slug}`;

  const person = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: data.displayName,
    url: pageUrl,
    sameAs: [
      `https://arxiv.org/search/?searchtype=author&query=${encodeURIComponent(data.displayName)}`,
    ],
    description: `${data.displayName} — ${data.papers.length} paper${data.papers.length === 1 ? '' : 's'} indexed on PaperBrief`,
  };

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Papers by ${data.displayName}`,
    url: pageUrl,
    numberOfItems: data.papers.length,
    itemListElement: data.papers.slice(0, 10).map((paper, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      item: {
        '@type': 'ScholarlyArticle',
        name: paper.title,
        url: `https://arxiv.org/abs/${paper.arxiv_id}`,
        author: paper.authors.map((a) => ({ '@type': 'Person', name: a })),
        datePublished: paper.published_at?.slice(0, 10) ?? undefined,
        abstract: paper.abstract ? paper.abstract.slice(0, 500) : undefined,
      },
    })),
  };

  return [person, itemList];
}
