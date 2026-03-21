/**
 * author-pages.test.ts
 *
 * Unit tests for the author-pages data layer.
 * All tests run without a real Supabase connection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  authorNameToSlug,
  authorSlugToSearch,
  authorSlugToDisplayName,
  resolveAuthorDisplayName,
  formatAuthorsShort,
  formatPublishedDate,
  scoreToStars,
  scoreToColor,
  truncateAbstract,
  authorPageJsonLd,
  getAuthorPapers,
  type AuthorPagePaper,
  type AuthorPageData,
} from '../author-pages';

// ── Mock Supabase ─────────────────────────────────────────────────────────────

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '@supabase/supabase-js';

function makeMockSupabase(rows: any[] = [], error: string | null = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: rows, error: error ? { message: error } : null }),
  };
  return {
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

// ── authorNameToSlug ──────────────────────────────────────────────────────────

describe('authorNameToSlug', () => {
  it('lowercases and hyphenates a simple name', () => {
    expect(authorNameToSlug('Yoshua Bengio')).toBe('yoshua-bengio');
  });

  it('handles single names', () => {
    expect(authorNameToSlug('Bengio')).toBe('bengio');
  });

  it('strips accented characters', () => {
    expect(authorNameToSlug('Jürgen Schmidhuber')).toBe('jurgen-schmidhuber');
  });

  it('collapses multiple spaces', () => {
    expect(authorNameToSlug('Yann  LeCun')).toBe('yann-lecun');
  });

  it('trims leading and trailing whitespace', () => {
    expect(authorNameToSlug('  Ian Goodfellow  ')).toBe('ian-goodfellow');
  });

  it('handles names with periods (e.g. initials)', () => {
    // periods stripped, remaining words hyphenated
    expect(authorNameToSlug('Y. Bengio')).toBe('y-bengio');
  });

  it('handles hyphenated names', () => {
    expect(authorNameToSlug('Jean-Baptiste Mouret')).toBe('jean-baptiste-mouret');
  });

  it('collapses duplicate hyphens', () => {
    // Edge: accented + hyphenated → no double hyphens
    expect(authorNameToSlug('Müller-Schmidt')).toBe('muller-schmidt');
  });

  it('returns empty string for empty input', () => {
    expect(authorNameToSlug('')).toBe('');
  });
});

// ── authorSlugToSearch ────────────────────────────────────────────────────────

describe('authorSlugToSearch', () => {
  it('replaces hyphens with spaces', () => {
    expect(authorSlugToSearch('yoshua-bengio')).toBe('yoshua bengio');
  });

  it('handles single-word slugs', () => {
    expect(authorSlugToSearch('bengio')).toBe('bengio');
  });

  it('handles multi-word slugs', () => {
    expect(authorSlugToSearch('yann-le-cun')).toBe('yann le cun');
  });
});

// ── authorSlugToDisplayName ───────────────────────────────────────────────────

describe('authorSlugToDisplayName', () => {
  it('title-cases each word', () => {
    expect(authorSlugToDisplayName('yoshua-bengio')).toBe('Yoshua Bengio');
  });

  it('handles single word', () => {
    expect(authorSlugToDisplayName('bengio')).toBe('Bengio');
  });

  it('handles multiple words', () => {
    expect(authorSlugToDisplayName('yann-le-cun')).toBe('Yann Le Cun');
  });
});

// ── resolveAuthorDisplayName ──────────────────────────────────────────────────

describe('resolveAuthorDisplayName', () => {
  const papers: AuthorPagePaper[] = [
    {
      arxiv_id: '2501.00001',
      title: 'Paper A',
      abstract: null,
      authors: ['Yoshua Bengio', 'Ian Goodfellow'],
      categories: ['cs.LG'],
      published_at: '2025-01-01',
      llm_score: 4.5,
    },
    {
      arxiv_id: '2501.00002',
      title: 'Paper B',
      abstract: null,
      authors: ['Yoshua Bengio', 'Aaron Courville'],
      categories: ['cs.AI'],
      published_at: '2025-01-02',
      llm_score: 3.8,
    },
    {
      arxiv_id: '2501.00003',
      title: 'Paper C',
      abstract: null,
      authors: ['Y. Bengio'],  // alternate form — appears once
      categories: ['cs.LG'],
      published_at: '2025-01-03',
      llm_score: null,
    },
  ];

  it('returns the most-common matching form', () => {
    // "Yoshua Bengio" appears twice, "Y. Bengio" once — pick "Yoshua Bengio"
    expect(resolveAuthorDisplayName(papers, 'yoshua bengio')).toBe('Yoshua Bengio');
  });

  it('falls back to slug display name if no papers match', () => {
    expect(resolveAuthorDisplayName([], 'yoshua bengio')).toBe('Yoshua Bengio');
  });

  it('matches using all words in the search term', () => {
    // "bengio" alone should match all three author forms containing "bengio"
    const result = resolveAuthorDisplayName(papers, 'bengio');
    // Most common is "Yoshua Bengio" (2 appearances)
    expect(result).toBe('Yoshua Bengio');
  });

  it('is case-insensitive', () => {
    expect(resolveAuthorDisplayName(papers, 'YOSHUA BENGIO')).toBe('Yoshua Bengio');
  });
});

// ── formatAuthorsShort ────────────────────────────────────────────────────────

describe('formatAuthorsShort', () => {
  it('returns "Unknown" for empty array', () => {
    expect(formatAuthorsShort([])).toBe('Unknown');
  });

  it('returns single name as-is', () => {
    expect(formatAuthorsShort(['Yoshua Bengio'])).toBe('Yoshua Bengio');
  });

  it('joins two names with comma', () => {
    expect(formatAuthorsShort(['Alice', 'Bob'])).toBe('Alice, Bob');
  });

  it('joins three names with commas', () => {
    expect(formatAuthorsShort(['Alice', 'Bob', 'Carol'])).toBe('Alice, Bob, Carol');
  });

  it('uses et al. for 4+ authors', () => {
    expect(formatAuthorsShort(['Alice', 'Bob', 'Carol', 'Dave'])).toBe('Alice et al.');
  });
});

// ── formatPublishedDate ───────────────────────────────────────────────────────

describe('formatPublishedDate', () => {
  it('returns empty string for null', () => {
    expect(formatPublishedDate(null)).toBe('');
  });

  it('returns empty string for invalid date', () => {
    expect(formatPublishedDate('not-a-date')).toBe('');
  });

  it('formats a valid ISO date string', () => {
    const result = formatPublishedDate('2025-01-15T00:00:00Z');
    expect(result).toMatch(/Jan\s+15,?\s+2025/);
  });

  it('formats a date-only string', () => {
    const result = formatPublishedDate('2025-03-21');
    expect(result).toContain('2025');
    expect(result).toContain('Mar');
  });
});

// ── scoreToStars ──────────────────────────────────────────────────────────────

describe('scoreToStars', () => {
  it('returns empty string for null score', () => {
    expect(scoreToStars(null)).toBe('');
  });

  it('returns 5 filled stars for score 5', () => {
    expect(scoreToStars(5)).toBe('★★★★★');
  });

  it('returns 0 filled stars for score 0', () => {
    expect(scoreToStars(0)).toBe('☆☆☆☆☆');
  });

  it('rounds to nearest star', () => {
    expect(scoreToStars(3.4)).toBe('★★★☆☆');
    expect(scoreToStars(3.6)).toBe('★★★★☆');
  });

  it('clamps to 0-5 range', () => {
    expect(scoreToStars(-1)).toBe('☆☆☆☆☆');
    expect(scoreToStars(10)).toBe('★★★★★');
  });
});

// ── scoreToColor ──────────────────────────────────────────────────────────────

describe('scoreToColor', () => {
  it('returns muted color for null', () => {
    expect(scoreToColor(null)).toBe('text-gray-600');
  });

  it('returns yellow-400 for score >= 4.5', () => {
    expect(scoreToColor(4.5)).toBe('text-yellow-400');
    expect(scoreToColor(5)).toBe('text-yellow-400');
  });

  it('returns yellow-500 for score 3.5–4.4', () => {
    expect(scoreToColor(3.5)).toBe('text-yellow-500');
    expect(scoreToColor(4.4)).toBe('text-yellow-500');
  });

  it('returns amber for score 2.5–3.4', () => {
    expect(scoreToColor(2.5)).toBe('text-amber-500');
    expect(scoreToColor(3.4)).toBe('text-amber-500');
  });

  it('returns gray for low scores', () => {
    expect(scoreToColor(0)).toBe('text-gray-500');
    expect(scoreToColor(2.4)).toBe('text-gray-500');
  });
});

// ── truncateAbstract ──────────────────────────────────────────────────────────

describe('truncateAbstract', () => {
  it('returns the full text if shorter than maxLen', () => {
    expect(truncateAbstract('Hello world', 100)).toBe('Hello world');
  });

  it('truncates at a word boundary', () => {
    const text = 'The quick brown fox jumped over the lazy dog';
    const result = truncateAbstract(text, 20);
    expect(result.endsWith('…')).toBe(true);
    expect(result.length).toBeLessThan(text.length);
    // Should cut at a word boundary — the char before '…' should not be
    // mid-word (i.e. result should end with a complete word then '…')
    // "The quick brown…" is fine; "The quick brow…" is not.
    const withoutEllipsis = result.slice(0, -1); // remove '…'
    expect(withoutEllipsis.at(-1)).not.toBe(' '); // no trailing space
  });

  it('uses default maxLen of 250', () => {
    const longText = 'a'.repeat(300);
    const result = truncateAbstract(longText);
    expect(result.endsWith('…')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(255); // some slack for word boundary
  });

  it('returns full text when exactly maxLen', () => {
    const text = 'a'.repeat(250);
    expect(truncateAbstract(text, 250)).toBe(text);
  });
});

// ── authorPageJsonLd ──────────────────────────────────────────────────────────

describe('authorPageJsonLd', () => {
  const sampleData: AuthorPageData = {
    displayName: 'Yoshua Bengio',
    slug: 'yoshua-bengio',
    papers: [
      {
        arxiv_id: '2501.00001',
        title: 'Deep Learning Advances',
        abstract: 'A groundbreaking paper on deep learning.',
        authors: ['Yoshua Bengio', 'Ian Goodfellow'],
        categories: ['cs.LG', 'cs.AI'],
        published_at: '2025-01-15',
        llm_score: 4.8,
      },
      {
        arxiv_id: '2501.00002',
        title: 'Neural Architecture Search',
        abstract: 'On the automated design of neural networks.',
        authors: ['Yoshua Bengio'],
        categories: ['cs.LG'],
        published_at: '2025-01-10',
        llm_score: 3.5,
      },
    ],
    categoryCount: 2,
    latestPublishedAt: '2025-01-15',
  };

  it('returns an array of two JSON-LD objects', () => {
    const ld = authorPageJsonLd(sampleData, 'https://paperbrief.ai');
    expect(Array.isArray(ld)).toBe(true);
    expect(ld).toHaveLength(2);
  });

  it('first object is a Person', () => {
    const [person] = authorPageJsonLd(sampleData, 'https://paperbrief.ai') as any[];
    expect(person['@type']).toBe('Person');
    expect(person.name).toBe('Yoshua Bengio');
    expect(person.url).toBe('https://paperbrief.ai/author/yoshua-bengio');
  });

  it('Person includes arXiv sameAs link', () => {
    const [person] = authorPageJsonLd(sampleData, 'https://paperbrief.ai') as any[];
    expect(person.sameAs[0]).toContain('arxiv.org/search');
    expect(person.sameAs[0]).toContain('Yoshua%20Bengio');
  });

  it('second object is an ItemList', () => {
    const [, list] = authorPageJsonLd(sampleData, 'https://paperbrief.ai') as any[];
    expect(list['@type']).toBe('ItemList');
    expect(list.numberOfItems).toBe(2);
    expect(list.itemListElement).toHaveLength(2);
  });

  it('ItemList items have correct positions and ScholarlyArticle types', () => {
    const [, list] = authorPageJsonLd(sampleData, 'https://paperbrief.ai') as any[];
    expect(list.itemListElement[0].position).toBe(1);
    expect(list.itemListElement[0].item['@type']).toBe('ScholarlyArticle');
    expect(list.itemListElement[1].position).toBe(2);
  });

  it('ScholarlyArticle includes expected fields', () => {
    const [, list] = authorPageJsonLd(sampleData, 'https://paperbrief.ai') as any[];
    const item = list.itemListElement[0].item;
    expect(item.name).toBe('Deep Learning Advances');
    expect(item.url).toContain('arxiv.org/abs/2501.00001');
    expect(item.datePublished).toBe('2025-01-15');
    expect(item.author[0].name).toBe('Yoshua Bengio');
  });

  it('caps ItemList at 10 papers even with more available', () => {
    const manyPapers = Array.from({ length: 15 }, (_, i) => ({
      arxiv_id: `2501.0000${i}`,
      title: `Paper ${i}`,
      abstract: null,
      authors: ['Yoshua Bengio'],
      categories: ['cs.LG'],
      published_at: '2025-01-01',
      llm_score: null,
    }));
    const data = { ...sampleData, papers: manyPapers };
    const [, list] = authorPageJsonLd(data, 'https://paperbrief.ai') as any[];
    expect(list.itemListElement).toHaveLength(10);
  });

  it('handles empty papers list gracefully', () => {
    const emptyData = { ...sampleData, papers: [], categoryCount: 0, latestPublishedAt: null };
    const [person, list] = authorPageJsonLd(emptyData, 'https://paperbrief.ai') as any[];
    expect(person.name).toBe('Yoshua Bengio');
    expect(list.numberOfItems).toBe(0);
    expect(list.itemListElement).toHaveLength(0);
  });
});

// ── getAuthorPapers ───────────────────────────────────────────────────────────

describe('getAuthorPapers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default: env vars present
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  });

  const mockRow = {
    arxiv_id: '2501.00001',
    title: 'Deep Learning Paper',
    abstract: 'An abstract about deep learning and neural networks.',
    authors: ['Yoshua Bengio', 'Ian Goodfellow'],
    categories: ['cs.LG', 'cs.AI'],
    published_at: '2025-01-15T00:00:00Z',
    llm_score: null,
  };

  it('returns papers from Supabase on success', async () => {
    const mockSupa = makeMockSupabase([mockRow]);
    vi.mocked(createClient).mockReturnValue(mockSupa as any);

    const result = await getAuthorPapers('yoshua-bengio');

    expect(result.slug).toBe('yoshua-bengio');
    expect(result.papers).toHaveLength(1);
    expect(result.papers[0].arxiv_id).toBe('2501.00001');
    expect(result.papers[0].authors).toEqual(['Yoshua Bengio', 'Ian Goodfellow']);
  });

  it('resolves displayName from paper data', async () => {
    const mockSupa = makeMockSupabase([mockRow]);
    vi.mocked(createClient).mockReturnValue(mockSupa as any);

    const result = await getAuthorPapers('yoshua-bengio');
    expect(result.displayName).toBe('Yoshua Bengio');
  });

  it('falls back to slug display name if no papers found', async () => {
    const mockSupa = makeMockSupabase([]);
    vi.mocked(createClient).mockReturnValue(mockSupa as any);

    const result = await getAuthorPapers('yoshua-bengio');
    expect(result.displayName).toBe('Yoshua Bengio');
    expect(result.papers).toHaveLength(0);
  });

  it('returns empty data when Supabase is not configured', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const result = await getAuthorPapers('yoshua-bengio');
    expect(result.papers).toHaveLength(0);
    expect(result.displayName).toBe('Yoshua Bengio');
    expect(result.categoryCount).toBe(0);
  });

  it('returns empty data on Supabase error', async () => {
    const mockSupa = makeMockSupabase([], 'Database connection failed');
    vi.mocked(createClient).mockReturnValue(mockSupa as any);

    const result = await getAuthorPapers('yoshua-bengio');
    expect(result.papers).toHaveLength(0);
  });

  it('clamps limit to 100 max', async () => {
    const mockSupa = makeMockSupabase([mockRow]);
    vi.mocked(createClient).mockReturnValue(mockSupa as any);

    await getAuthorPapers('yoshua-bengio', 999);
    // limit() should be called with 100, not 999
    expect(mockSupa._chain.limit).toHaveBeenCalledWith(100);
  });

  it('clamps limit to 1 min', async () => {
    const mockSupa = makeMockSupabase([mockRow]);
    vi.mocked(createClient).mockReturnValue(mockSupa as any);

    await getAuthorPapers('yoshua-bengio', -5);
    expect(mockSupa._chain.limit).toHaveBeenCalledWith(1);
  });

  it('computes categoryCount from paper categories', async () => {
    const rows = [
      { ...mockRow, categories: ['cs.LG', 'cs.AI'] },
      { ...mockRow, arxiv_id: '2501.00002', categories: ['cs.LG', 'cs.CL'] },
    ];
    const mockSupa = makeMockSupabase(rows);
    vi.mocked(createClient).mockReturnValue(mockSupa as any);

    const result = await getAuthorPapers('yoshua-bengio');
    // Unique categories: cs.LG, cs.AI, cs.CL → 3
    expect(result.categoryCount).toBe(3);
  });

  it('sets latestPublishedAt from the first (most recent) paper', async () => {
    const rows = [
      { ...mockRow, published_at: '2025-03-01T00:00:00Z' },
      { ...mockRow, arxiv_id: '2501.00002', published_at: '2025-01-01T00:00:00Z' },
    ];
    const mockSupa = makeMockSupabase(rows);
    vi.mocked(createClient).mockReturnValue(mockSupa as any);

    const result = await getAuthorPapers('yoshua-bengio');
    expect(result.latestPublishedAt).toBe('2025-03-01T00:00:00Z');
  });

  it('handles non-array authors gracefully', async () => {
    const rowWithStringAuthors = { ...mockRow, authors: null };
    const mockSupa = makeMockSupabase([rowWithStringAuthors]);
    vi.mocked(createClient).mockReturnValue(mockSupa as any);

    const result = await getAuthorPapers('yoshua-bengio');
    expect(result.papers[0].authors).toEqual([]);
  });

  it('queries Supabase with ilike filter on authors::text', async () => {
    const mockSupa = makeMockSupabase([mockRow]);
    vi.mocked(createClient).mockReturnValue(mockSupa as any);

    await getAuthorPapers('yoshua-bengio');
    expect(mockSupa._chain.filter).toHaveBeenCalledWith(
      'authors::text',
      'ilike',
      '%yoshua bengio%',
    );
  });
});
